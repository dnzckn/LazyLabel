"""Loading a checkpoint and running a prompt against it.

This module is the only one that imports PyTorch, and it does so LAZILY, inside the functions that
need it. That keeps the rest of the service - the manifest, the availability check, the routes -
importable and testable on a machine with no model stack at all, which is what lets the test suite
run in seconds against no checkpoint.

Two legacy behaviours are deliberately not reproduced.

`Sam2Model.predict` catches every exception, logs it and returns None. The caller then cannot
distinguish "the model raised", "no positive points were given" and "the object has no pixels".
Here each is a different typed error, per Phase 3 exit criterion 4.

`Sam2Model.set_image_from_path` does `cv2.imread` and then `cvtColor`, and `cv2.imread` returns
None for an unreadable file, so `cvtColor` raises inside the same catch-all and the method returns
False. An unreadable image is reported here instead.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .manifest import ModelEntry
from .prompts import (
    ImageNotSetError,
    InvalidPromptError,
    ModelNotLoadedError,
    PredictionFailedError,
    Prediction,
    Prompt,
)

SAM1_VARIANTS: frozenset[str] = frozenset({"vit_b", "vit_l", "vit_h"})
"""SAM 1's sizes, which are also the keys of `segment_anything.sam_model_registry`.

There is no config file: the variant selects a builder in code. That is the whole difference
between the two families at load time -- after which both predictors expose the same `set_image`
and `predict`, so one backend serves both.
"""

# The config each SAM 2 size needs, from the configs shipped inside the installed sam2 package.
# Recorded here rather than derived from the file name, which is the whole of RULE-085.
SAM2_CONFIGS: dict[str, str] = {
    "tiny": "configs/sam2.1/sam2.1_hiera_t.yaml",
    "small": "configs/sam2.1/sam2.1_hiera_s.yaml",
    "base_plus": "configs/sam2.1/sam2.1_hiera_b+.yaml",
    "large": "configs/sam2.1/sam2.1_hiera_l.yaml",
}


class Backend(Protocol):
    """What the service needs from a model, and nothing about how it works."""

    @property
    def entry(self) -> ModelEntry: ...

    def set_image(self, image: Any) -> None:
        """Encode an RGB uint8 array of shape (H, W, 3). Expensive; cache the result."""

    def predict(self, prompt: Prompt) -> Prediction:
        """Run one prompt against the encoded image."""

    def export_state(self) -> Any:
        """The encoded image, detached, so another can be encoded and this one put back."""

    def restore_state(self, state: Any) -> None:
        """Put back an encoding `export_state` returned, without running the encoder."""


# What `set_image` leaves on each family's predictor, and all a prediction reads back. The same fields
# legacy's `get_embeddings` saves, plus SAM 2's batch flag, which `set_image` also resets.
_SAM1_STATE = ("features", "original_size", "input_size", "is_image_set")
_SAM2_STATE = ("_features", "_orig_hw", "_is_image_set", "_is_batch")


def _state_fields(predictor: Any) -> tuple[str, ...]:
    return _SAM2_STATE if hasattr(predictor, "_features") else _SAM1_STATE


def _moved(value: Any, device: Any) -> Any:
    """Tensors -- alone, or in a list, tuple or dict -- cloned to the CPU, or moved to `device`."""
    if hasattr(value, "detach"):
        return value.detach().cpu().clone() if device is None else value.to(device)
    if isinstance(value, dict):
        return {key: _moved(item, device) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return type(value)(_moved(item, device) for item in value)
    return value


@dataclass
class PredictorBackend:
    """A loaded SAM model, of either family.

    `SamPredictor` and `SAM2ImagePredictor` expose the same two methods with the same arguments and
    the same three return values, and legacy's two wrappers build the same call from the same
    prompt. So this is one class rather than two that would have to be kept in step -- the family
    is a property of the manifest entry, not of the code path.
    """

    _entry: ModelEntry
    _predictor: Any
    _image_shape: tuple[int, int] | None = None

    @property
    def entry(self) -> ModelEntry:
        return self._entry

    def set_image(self, image: Any) -> None:
        if self._predictor is None:
            raise ModelNotLoadedError("no predictor is loaded")
        if getattr(image, "ndim", 0) != 3 or image.shape[2] != 3:
            raise InvalidPromptError(
                f"an image must be (height, width, 3) RGB; got shape {getattr(image, 'shape', None)}"
            )
        try:
            self._predictor.set_image(image)
        except Exception as cause:
            raise PredictionFailedError(f"the image could not be encoded: {cause}") from cause
        self._image_shape = (int(image.shape[0]), int(image.shape[1]))

    def export_state(self) -> Any:
        """The encoded image, detached from the predictor.

        A predictor holds ONE image. The service caches several -- RULE-091 encodes the neighbours
        before anyone asks -- so a click on the open image must be answered from ITS encoding, not
        from whichever neighbour was encoded last. Until 2026-09-23 the cache held a marker and the
        predictor held the last image, and the only check was the image's SIZE: in a folder of
        same-sized images a click on one was answered from another's encoding, with no error.

        Legacy caches exactly this -- `get_embeddings` in both of its model wrappers -- and puts it
        back on a hit. Held on the CPU, as legacy holds it: ten SAM 2 encodings are ~160 MB of RAM,
        and would be the same again of GPU memory beside the model.
        """
        if self._image_shape is None:
            raise ImageNotSetError("no image has been encoded; call set_image first")
        fields = _state_fields(self._predictor)
        return (self._image_shape, {name: _moved(getattr(self._predictor, name), None) for name in fields})

    def restore_state(self, state: Any) -> None:
        shape, values = state
        device = self._predictor.device
        for name, value in values.items():
            setattr(self._predictor, name, _moved(value, device))
        self._image_shape = shape

    def predict(self, prompt: Prompt) -> Prediction:
        if self._image_shape is None:
            raise ImageNotSetError("no image has been encoded; call set_image first")

        height, width = self._image_shape
        prompt.validate(height, width)

        import numpy as np

        kwargs: dict[str, Any] = {"multimask_output": True}
        if prompt.points:
            # Positive points first, then negative, matching the legacy ordering exactly: it builds
            # `positive_points + negative_points` with labels `[1]*n + [0]*m`. The order is not
            # arbitrary to SAM, so a port that sorts differently is a port that predicts differently.
            ordered = [p for p in prompt.points if p.positive] + [p for p in prompt.points if not p.positive]
            kwargs["point_coords"] = np.array([[p.x, p.y] for p in ordered], dtype=np.float32)
            kwargs["point_labels"] = np.array([1 if p.positive else 0 for p in ordered], dtype=np.int32)
        if prompt.box is not None:
            box = prompt.box.normalized()
            kwargs["box"] = np.array([box.x1, box.y1, box.x2, box.y2], dtype=np.float32)

        try:
            masks, scores, _logits = self._predictor.predict(**kwargs)
        except Exception as cause:
            raise PredictionFailedError(f"the model raised during prediction: {cause}") from cause

        if len(scores) == 0:
            raise PredictionFailedError("the model returned no candidate masks")

        # RULE-020: of the three candidates, the highest-scoring one wins. np.argmax takes the FIRST
        # maximum on a tie, which is what legacy does and what a port must not quietly change.
        best = int(np.argmax(scores))
        return Prediction(
            mask=masks[best].astype(np.uint8),
            score=float(scores[best]),
            chosen=best,
            alternatives=tuple(float(s) for s in scores),
        )


def load_backend(entry: ModelEntry, model_dir: Path, *, device: str | None = None) -> Backend:
    """Build a backend for one manifest entry.

    The caller is expected to have verified the checkpoint against the manifest first
    (`check_checkpoint`); this refuses to guess and will not silently load an unverified file.

    WEIGHTS-ONLY LOADING, Phase 3 exit criterion 3. `sam2.build_sam` passes `weights_only=True`
    explicitly. `segment_anything.build_sam` does NOT - it calls plain `torch.load(f)` - and is safe
    only because PyTorch 2.6 changed that default to True and RULE-084 sets the floor at 2.7.1. So
    the version minimum is doing security work beyond feature availability, and
    `assert_weights_only_loading` below is what keeps that true rather than assumed.
    """
    _refuse_unbuildable(entry)

    checkpoint = model_dir / entry.filename
    if not checkpoint.is_file():
        raise ModelNotLoadedError(f"{entry.filename} is not in {model_dir}")

    try:
        import torch
    except ImportError as cause:
        raise ModelNotLoadedError(
            f"the AI stack is not installed: {cause}. "
            "Install the AI extra: pip install lazylabel-inference[ai]"
        ) from cause

    resolved = device or ("cuda" if torch.cuda.is_available() else "cpu")
    ensure_weights_only_loading()

    if entry.family == "sam1":
        return PredictorBackend(_entry=entry, _predictor=_load_sam1(entry, checkpoint, resolved))
    if entry.family == "sam2":
        return PredictorBackend(_entry=entry, _predictor=_load_sam2(entry, checkpoint, resolved))

    raise ModelNotLoadedError(f"no backend for family {entry.family!r}")


def _refuse_unbuildable(entry: ModelEntry) -> None:
    """Refuse an entry no backend can build, before anything heavy is imported.

    A configuration mistake is the same mistake whether or not PyTorch is installed, and should be
    reported as itself. Checked after the import, as it was, a machine without the AI stack was told
    to install it -- and after installing gigabytes, was told the entry was wrong anyway.
    """
    if entry.family == "sam1":
        if entry.size not in SAM1_VARIANTS:
            raise ModelNotLoadedError(
                f"{entry.size!r} is not a SAM 1 variant ({', '.join(sorted(SAM1_VARIANTS))})"
            )
    elif entry.family == "sam2":
        if entry.size not in SAM2_CONFIGS:
            raise ModelNotLoadedError(f"no SAM 2 config is known for size {entry.size!r}")
    else:
        raise ModelNotLoadedError(f"no backend for family {entry.family!r}")


def _load_sam1(entry: ModelEntry, checkpoint: Path, device: str) -> Any:
    """Build a SAM 1 predictor.

    No config file: the variant names a builder in `sam_model_registry`. Note that
    `segment_anything.build_sam` calls plain `torch.load(f)` with no `weights_only`, so this is safe
    only because PyTorch 2.6 changed that default and RULE-084 floors us at 2.7.1 --
    `assert_weights_only_loading` is what keeps that true rather than assumed.
    """
    if entry.size not in SAM1_VARIANTS:
        raise ModelNotLoadedError(
            f"{entry.size!r} is not a SAM 1 variant ({', '.join(sorted(SAM1_VARIANTS))})"
        )

    try:
        from segment_anything import SamPredictor, sam_model_registry
    except ImportError as cause:
        raise ModelNotLoadedError(f"segment-anything is not installed: {cause}") from cause

    try:
        model = sam_model_registry[entry.size](checkpoint=str(checkpoint))
        model.to(device)
    except Exception as cause:
        raise ModelNotLoadedError(
            f"{entry.name} could not be loaded from {entry.filename}: {cause}"
        ) from cause

    return SamPredictor(model)


def _load_sam2(entry: ModelEntry, checkpoint: Path, device: str) -> Any:
    """Build a SAM 2 predictor. The size selects a config that ships inside the `sam2` package."""
    config = SAM2_CONFIGS.get(entry.size)
    if config is None:
        raise ModelNotLoadedError(f"no SAM 2 config is known for size {entry.size!r}")

    try:
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor
    except ImportError as cause:
        raise ModelNotLoadedError(f"the sam2 package is not installed: {cause}") from cause

    try:
        model = build_sam2(config, str(checkpoint), device=device)
    except Exception as cause:
        raise ModelNotLoadedError(
            f"{entry.name} could not be loaded from {entry.filename}: {cause}"
        ) from cause

    return SAM2ImagePredictor(model)


def assert_weights_only_loading() -> None:
    """Fail loudly if this PyTorch would execute code from a checkpoint.

    A hash check and weights-only loading defend against different mistakes: the hash says these are
    the bytes we expected, weights-only says that even unexpected bytes cannot run code. Phase 3
    exit criterion 3 needs both, and this is the second one, checked rather than trusted.
    """
    import io
    import torch

    class _Payload:
        def __reduce__(self):  # pragma: no cover - never actually executed if the check passes
            return (print, ("a checkpoint executed code during loading",))

    buffer = io.BytesIO()
    torch.save({"payload": _Payload()}, buffer)
    buffer.seek(0)
    try:
        torch.load(buffer)
    except Exception:
        return  # refused, which is what we want
    raise RuntimeError(
        "this PyTorch loads checkpoints without weights_only, so a checkpoint can execute code. "
        "RULE-084 sets the minimum at 2.7.1 partly for this reason."
    )


_WEIGHTS_ONLY_VERIFIED = False


def ensure_weights_only_loading() -> None:
    """Run `assert_weights_only_loading` once per process, before the first checkpoint loads.

    THE GUARD EXISTED AND NOTHING RAN IT. Two docstrings in this module called it "what keeps that
    true rather than assumed", and its only caller was a test -- so it proved the torch in CI was
    safe, and production trusted whatever torch it was handed. SEC-03 names the exact case that
    breaks: `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=1` in the environment turns every `torch.load` into a
    full pickle load at CALL time, and segment_anything's builder calls a bare `torch.load`. With
    that variable set, a SAM 1 checkpoint executes whatever it carries.

    Once rather than per load: the check is a tiny in-memory round trip, but it is a round trip on
    the path of every model switch, and the answer cannot change inside one process.
    """
    global _WEIGHTS_ONLY_VERIFIED
    if _WEIGHTS_ONLY_VERIFIED:
        return
    try:
        assert_weights_only_loading()
    except RuntimeError as cause:
        # A ModelNotLoadedError, so the route answers with a reason rather than a 500 -- and so the
        # operator is told what to change, which is the environment rather than the checkpoint.
        raise ModelNotLoadedError(
            f"refusing to load any checkpoint: {cause} Check that TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD "
            "is not set in this service's environment."
        ) from cause
    _WEIGHTS_ONLY_VERIFIED = True


# The class was called Sam2Backend when SAM 2 was the only family it served.
Sam2Backend = PredictorBackend


def load_video_predictor(entry: ModelEntry, model_dir: Path, *, device: str | None = None) -> Any:
    """Build the SAM 2 VIDEO predictor — a different object from the image one.

    `load_backend` builds `SAM2ImagePredictor`, which answers a prompt on one picture and has no
    notion of a sequence. Propagation needs `build_sam2_video_predictor`, and nothing built one:
    the propagation module, its windows and its job API were all complete while the predictor they
    run on could not be constructed at all. The same built-but-unreachable shape this project keeps
    finding, one layer further down again.

    As with `load_backend`, the caller verifies the checkpoint against the manifest first; this
    refuses to guess and will not silently load an unverified file. `sam2.build_sam` passes
    `weights_only=True` explicitly, which is Phase 3 exit criterion 3 and applies here identically.

    SAM 1 is refused by name rather than by a failure deep inside `sam2`: "this model cannot
    propagate" is something a user can act on, and "config not found" is not.
    """
    if not entry.is_video_capable:
        raise ModelNotLoadedError(
            f"{entry.name} cannot propagate through a sequence; only SAM 2 has a video predictor"
        )

    config = SAM2_CONFIGS.get(entry.size)
    if config is None:
        raise ModelNotLoadedError(f"no SAM 2 config is known for size {entry.size!r}")

    checkpoint = model_dir / entry.filename
    if not checkpoint.is_file():
        raise ModelNotLoadedError(f"{entry.filename} is not in {model_dir}")

    try:
        import torch

        from sam2.build_sam import build_sam2_video_predictor
    except ImportError as cause:
        raise ModelNotLoadedError(
            f"the AI stack is not installed: {cause}. "
            "Install the AI extra: pip install lazylabel-inference[ai]"
        ) from cause

    resolved = device or ("cuda" if torch.cuda.is_available() else "cpu")
    ensure_weights_only_loading()
    try:
        return build_sam2_video_predictor(config, str(checkpoint), device=resolved)
    except Exception as cause:
        raise ModelNotLoadedError(
            f"{entry.name}'s video predictor could not be loaded from {entry.filename}: {cause}"
        ) from cause
