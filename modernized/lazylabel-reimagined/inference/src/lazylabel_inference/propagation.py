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
        with torch.inference_mode(), torch.autocast("cuda" if torch.cuda.is_available() else "cpu", dtype=torch.bfloat16):
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
