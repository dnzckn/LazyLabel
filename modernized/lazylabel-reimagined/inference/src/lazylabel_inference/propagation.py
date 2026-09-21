"""Carrying masks through a sequence with SAM 2 — Phase 3's exit criterion 2.

Three things from the rule cards, and each replaces something legacy does that loses work quietly.

RULE-017: STAGING. SAM 2's video loader collects the JPEGs in a folder, sorts them with
`int(os.path.splitext(name)[0])`, and then addresses frames by their POSITION in that sorted list.
Legacy names each staged frame after its position in the app's own list and SKIPS one it cannot
read, without renumbering -- so a sequence whose third image is corrupt stages as 00000, 00001,
00003, and every frame after the gap comes back attributed to the image before it. The masks land
on the wrong pictures and auto-save writes them to the wrong sidecars.

The fix is not to renumber more carefully. It is to stop encoding identity in the name at all:
frames are staged under dense indices and an explicit map says which source image each one is, so
every result is resolved through the map rather than by arithmetic on an index.

RULE-016: CONFIDENCE. The propagated mask is the pixels whose logit exceeds 0, and the confidence
is `sigmoid(mean(positive logits))`, with 0 when there are none. The guard matters: `mean` over an
empty selection is NaN, and a NaN confidence compares false against every threshold, so an object
that vanished would never be flagged for review.

AND THE ERROR HANDLING. `Sam2Model.propagate_in_video` wraps the whole loop in
`except Exception: return`. A propagation that fails on frame 40 of 200 therefore ends quietly,
having yielded 39 frames, and the caller cannot tell that from a sequence that was 39 frames long.
Here a failure is raised with the frame it happened on, and the frames already produced are kept.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

from .prompts import InferenceError, InvalidPromptError, ModelNotLoadedError


class PropagationError(InferenceError):
    """Propagation failed part-way. Carries the frame it reached, never a silent short result."""

    def __init__(self, message: str, *, completed: int) -> None:
        super().__init__(message)
        self.completed = completed


@dataclass(frozen=True)
class StagedFrame:
    """One frame as SAM 2 will see it, and what it actually is."""

    index: int
    """The dataset key of the image this frame came from. The map RULE-017 turns on."""
    source: str


@dataclass
class StagedSequence:
    """A sequence prepared for SAM 2, with identity kept outside the file names."""

    directory: Path
    frames: list[StagedFrame] = field(default_factory=list)
    """Images that could not be staged, with the reason. Never silently dropped."""
    skipped: list[tuple[str, str]] = field(default_factory=list)

    def source_of(self, index: int) -> str:
        """Which image SAM 2's frame `index` came from.

        The whole point. Resolving through the map rather than by arithmetic is what makes a gap
        impossible to turn into a misattribution.
        """
        if not 0 <= index < len(self.frames):
            raise PropagationError(
                f"SAM 2 returned frame {index}, which is outside the {len(self.frames)} staged",
                completed=0,
            )
        return self.frames[index].source


def stage_sequence(images: list[tuple[str, Any]], directory: Path) -> StagedSequence:
    """Write each image as a JPEG under a DENSE index, and record what it is.

    `images` is (dataset key, RGB array) in the order the user's timeline holds them. An image that
    cannot be written is skipped -- and because the staged indices stay dense, skipping one shifts
    nothing: the map simply has one fewer entry, and every entry still says which image it is.
    """
    import cv2

    directory.mkdir(parents=True, exist_ok=True)
    staged = StagedSequence(directory=directory)

    for key, array in images:
        index = len(staged.frames)
        path = directory / f"{index:05d}.jpg"
        try:
            # SAM 2's loader wants JPEG. cv2 writes BGR, so RGB is reversed on the way out, which
            # is what legacy does too -- the model sees the same pixels either way.
            if not cv2.imwrite(str(path), array[:, :, ::-1], [cv2.IMWRITE_JPEG_QUALITY, 95]):
                raise OSError("cv2.imwrite reported failure")
        except Exception as cause:  # noqa: BLE001 - one bad frame must not end the staging
            staged.skipped.append((key, str(cause)))
            path.unlink(missing_ok=True)
            continue

        staged.frames.append(StagedFrame(index=index, source=key))

    if not staged.frames:
        raise InvalidPromptError("no frame in this sequence could be staged")
    return staged


@dataclass(frozen=True)
class FrameResult:
    """One object's mask on one frame."""

    source: str
    object_id: int
    """Boolean mask over the frame, as a numpy array."""
    mask: Any
    """sigmoid(mean(positive logits)), or 0.0 when the object has no positive pixels."""
    confidence: float


def confidence_of(logits: Any) -> float:
    """RULE-016's confidence, with the empty-selection guard legacy also has.

    `mean` over an empty selection is NaN, and NaN compares false against every threshold -- so an
    object that vanished from a frame would never be flagged for review. The specified 0.0 is what
    makes it flag immediately instead.
    """
    import torch

    positive = logits[logits > 0]
    if positive.numel() == 0:
        return 0.0
    return float(torch.sigmoid(positive.mean()).item())


def initialise_state(predictor: Any, staged: StagedSequence, *, offload_video_to_cpu: bool = True) -> Any:
    """Build SAM 2's inference state over a staged sequence, with legacy's memory posture.

    This exists because the flags are a real decision and not a default worth inheriting. SAM 2's
    own default is `offload_video_to_cpu=False`, which keeps every decoded frame on the GPU; legacy
    passes True (`sam2_model.py:831-835`) and is right to -- a long sequence is exactly the case
    this feature is for, and holding a thousand frames of video in VRAM alongside the weights is
    how a propagation turns into an out-of-memory error on the hosted deployment.

    It also removes a way for callers to drift apart. The flag changes where tensors live, which
    under bfloat16 autocast changes the fifth decimal of a confidence -- so a caller taking the
    default here and legacy taking True disagree slightly for a reason that has nothing to do with
    propagation. Better one place with the reason attached than the same choice made twice.

    `offload_state_to_cpu` stays False, as in legacy: it is the setting that trades speed for memory
    on the state rather than the frames, and nothing has shown it is needed.
    """
    if predictor is None:
        raise ModelNotLoadedError("no SAM 2 video predictor is initialised")

    import torch

    try:
        with torch.inference_mode(), torch.autocast(_autocast_device(predictor), dtype=torch.bfloat16):
            return predictor.init_state(
                video_path=str(staged.directory),
                offload_video_to_cpu=offload_video_to_cpu,
                offload_state_to_cpu=False,
            )
    except Exception as cause:
        raise PropagationError(
            f"the staged sequence could not be loaded for propagation: {cause}", completed=0
        ) from cause


def seed_points(
    predictor: Any,
    state: Any,
    staged: StagedSequence,
    *,
    frame_index: int,
    object_id: int,
    points: Any,
    labels: Any,
) -> FrameResult:
    """Put the reference prompt on one frame, under the same autocast the propagation runs in.

    The third thing the port owns rather than leaving to callers, and the one that actually bit.
    Legacy wraps this call in `inference_mode` and `autocast(bfloat16)` exactly as it wraps
    propagation (`sam2_model.py:938-956`). A caller that seeds OUTSIDE autocast computes the
    reference frame's logits in float32, and since every later frame is conditioned on that
    reference, the whole sequence then differs from legacy by a small, systematic amount -- which is
    precisely what this port did before, disagreeing in the fifth decimal for a reason that had
    nothing to do with propagation. It is not a tolerance problem; it is a missing context manager.

    One deliberate difference from legacy: when the prompt selects nothing, legacy reports
    confidence 0.5 here while reporting 0.0 for the same condition during propagation
    (`sam2_model.py:905` against `:1037`). 0.5 is the worse of the two -- a click that selected
    nothing is not a middling result, and a user shown 0.5 has been told something false. This uses
    `confidence_of`, so both paths say 0.0.
    """
    if predictor is None or state is None:
        raise ModelNotLoadedError("no SAM 2 video predictor is initialised")

    import torch

    try:
        with torch.inference_mode(), torch.autocast(_autocast_device(predictor), dtype=torch.bfloat16):
            _frame, object_ids, mask_logits = predictor.add_new_points_or_box(
                inference_state=state,
                frame_idx=frame_index,
                obj_id=object_id,
                points=points,
                labels=labels,
                clear_old_points=True,
            )
    except Exception as cause:
        raise PropagationError(
            f"the reference prompt was refused on frame {frame_index}: {cause}", completed=0
        ) from cause

    if mask_logits is None or len(mask_logits) == 0:
        raise PropagationError(
            f"the reference prompt on frame {frame_index} produced no mask", completed=0
        )

    ids = [int(candidate) for candidate in object_ids]
    position = ids.index(object_id) if object_id in ids else 0
    logits = mask_logits[position]

    return FrameResult(
        # Resolved through the map, exactly as in `propagate`. A seed result that named its frame by
        # number would be the one place in this module where a caller had to do the lookup itself,
        # which is the lookup the whole design exists to remove.
        source=staged.source_of(frame_index),
        object_id=object_id,
        mask=(logits > 0).cpu().numpy().squeeze().astype("uint8"),
        confidence=confidence_of(logits),
    )


def _autocast_device(predictor: Any) -> str:
    """Which device type to autocast for: the one the MODEL is on, not the best one available.

    Legacy reads `str(self.device)`, the device it loaded onto. Asking `torch.cuda.is_available()`
    instead -- which this did at first -- is a different question with a usually-identical answer,
    and the case where they differ is a model deliberately loaded on the CPU of a machine that has
    a GPU. Autocasting cuda around cpu tensors there does nothing useful and is not what legacy
    does, so the comparison would drift for a reason having nothing to do with propagation.
    """
    device = getattr(predictor, "device", None)
    if device is None:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    # torch.device -> its type ("cuda", "cpu"); a plain string like "cuda:0" -> "cuda".
    return str(getattr(device, "type", device)).split(":")[0]


def propagate(
    predictor: Any,
    state: Any,
    staged: StagedSequence,
    *,
    start_frame: int | None = None,
    max_frames: int | None = None,
    reverse: bool = False,
) -> Iterator[FrameResult]:
    """Run SAM 2 through the sequence, yielding each object on each frame.

    A generator so the caller can stream progress and stop early; the frames already yielded are
    the frames already done, which is what makes cancellation keep committed work (RULE-063).
    """
    if predictor is None or state is None:
        raise ModelNotLoadedError("no SAM 2 video predictor is initialised")

    import torch

    completed = 0
    try:
        with torch.inference_mode(), torch.autocast(_autocast_device(predictor), dtype=torch.bfloat16):
            for frame_index, object_ids, mask_logits in predictor.propagate_in_video(
                inference_state=state,
                start_frame_idx=start_frame,
                max_frame_num_to_track=max_frames,
                reverse=reverse,
            ):
                # Resolved through the map, never by arithmetic on the index.
                source = staged.source_of(frame_index)

                for position, object_id in enumerate(object_ids):
                    logits = mask_logits[position]
                    yield FrameResult(
                        source=source,
                        object_id=int(object_id),
                        mask=(logits > 0).cpu().numpy().squeeze().astype("uint8"),
                        confidence=confidence_of(logits),
                    )
                completed += 1
    except PropagationError:
        raise
    except Exception as cause:  # noqa: BLE001 - the boundary, and it reports rather than returns
        raise PropagationError(
            f"propagation failed after {completed} frames: {cause}", completed=completed
        ) from cause


@dataclass(frozen=True)
class PropagationRequest:
    """What a caller asked for, parsed and validated, before any model is involved.

    A separate type from the HTTP body so the job routes can be tested without a checkpoint and so
    the propagator receives something already checked. Frame indices are 0-based POSITIONS in
    `sequence`, never file names -- RULE-017's whole point is that identity does not live in a name.
    """

    #: Dataset keys in timeline order. The map every result is resolved through.
    sequence: tuple[str, ...]
    #: Frames carrying prompts, as positions in `sequence`. Propagation moves away from the lowest.
    references: tuple[int, ...]
    #: Inclusive range of positions to cover, or None for the whole timeline.
    start: int | None = None
    end: int | None = None
    streaming: bool = True
    window: int = 250
    model: str | None = None

    @property
    def lowest_reference(self) -> int:
        """Where both passes begin. RULE-025: forward and backward both leave the EARLIEST one."""
        return min(self.references)
