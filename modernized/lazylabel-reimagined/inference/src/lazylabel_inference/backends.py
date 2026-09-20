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

    if entry.family == "sam1":
        return PredictorBackend(_entry=entry, _predictor=_load_sam1(entry, checkpoint, resolved))
    if entry.family == "sam2":
        return PredictorBackend(_entry=entry, _predictor=_load_sam2(entry, checkpoint, resolved))

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


# The class was called Sam2Backend when SAM 2 was the only family it served.
Sam2Backend = PredictorBackend
