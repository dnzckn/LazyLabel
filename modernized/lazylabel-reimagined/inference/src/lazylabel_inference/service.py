"""Tying a checkpoint, an image and a prompt together.

This is the layer the routes call. It owns three things the pieces below it deliberately do not: a
lazily-loaded backend per model, the embedding cache, and the translation between a mask and the
bytes that go on the wire.

WHERE THE PIXELS COME FROM, and why that is temporary. The architecture gives the image pipeline to
the API: it decodes 16-bit TIFF, applies the display adjustments, and hands the model exactly the
pixels the user is looking at, which is what makes Operate On View (RULE-089) implementable at all.
That pipeline is Phase 5. Until it exists this service reads the original file from the mounted
dataset folder itself - which the container diagram already sanctions - using cv2 with a BGR to RGB
conversion, matching the legacy loader byte for byte so equivalence is not confounded by a
different JPEG decoder. The `adjustments` argument already flows into the cache key, so when the
API starts posting rendered pixels, only `_read_image` changes.

THE MASK ON THE WIRE is the bounded form `@lazylabel/contracts` defines: a bounding box plus the
bytes inside it, base64-encoded. Two implementations of a binary layout is exactly what that shared
package exists to prevent, so this one is checked against it by a fixture the TypeScript suite
decodes (`contracts/test/pythonFixture.test.ts`).
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .backends import Backend, load_backend
from .embeddings import (
    EmbeddingCache,
    EmbeddingKey,
    adjustment_identity,
    image_identity,
    model_identity,
)
from .manifest import ModelEntry, check_checkpoint
from .prompts import (
    ImageNotSetError,
    InferenceError,
    InvalidPromptError,
    ModelNotLoadedError,
    Prediction,
    Prompt,
)


class UnknownHandleError(InferenceError):
    """The embedding handle is not one this service issued, or it has expired."""


class ImageUnreadableError(InferenceError):
    """The image could not be read or decoded.

    Legacy catches this inside `set_image_from_path` and returns False, because `cv2.imread` gives
    None for an unreadable file and `cvtColor` then raises into the same catch-all. A caller cannot
    tell that from a model that was not loaded.
    """


@dataclass
class _Session:
    """One encoded image, held against its handle."""

    key: EmbeddingKey
    backend: Backend
    shape: tuple[int, int]


@dataclass
class InferenceService:
    models: list[ModelEntry]
    model_dir: Path
    dataset_root: Path
    cache: EmbeddingCache = field(default_factory=EmbeddingCache)
    device: str | None = None
    _backends: dict[str, Backend] = field(default_factory=dict)
    _sessions: dict[str, _Session] = field(default_factory=dict)

    def model(self, name: str) -> ModelEntry:
        for entry in self.models:
            if entry.name == name:
                return entry
        known = ", ".join(entry.name for entry in self.models) or "none"
        raise ModelNotLoadedError(f"no model called {name!r} in the manifest (it lists: {known})")

    def backend(self, name: str) -> Backend:
        """The backend for a model, loading it on first use.

        The checkpoint is verified against the manifest BEFORE it is loaded, every time a backend is
        created. Verifying after loading would be checking the lock after walking through the door.
        """
        if name in self._backends:
            return self._backends[name]

        entry = self.model(name)
        status = check_checkpoint(entry, self.model_dir)
        if not status.usable:
            raise ModelNotLoadedError(f"{entry.name} cannot be used: {status.detail}")

        backend = load_backend(entry, self.model_dir, device=self.device)
        self._backends[name] = backend
        return backend

    def embed(
        self,
        image_key: str,
        model_name: str,
        adjustments: dict[str, float] | None = None,
        pixels: str | None = None,
    ) -> tuple[str, bool]:
        """Encode an image, or recognise that it is already encoded.

        Returns the handle and whether it was a cache hit. The handle is derived from the key, so
        asking twice for the same (image, model, adjustments) yields the same handle - a client that
        loses one can ask again rather than leaking a session.
        """
        entry = self.model(model_name)
        path = self._resolve(image_key)

        key = EmbeddingKey(
            image=image_identity(path),
            model=model_identity(entry.sha256),
            adjustments=adjustment_identity(adjustments),
        )
        handle = key.as_handle()

        if self.cache.get(key) is not None and handle in self._sessions:
            return handle, True

        backend = self.backend(model_name)
        image = self._read_image(path, pixels)
        backend.set_image(image)

        # The cached value is a marker, not the tensor: the predictor holds the encoded state
        # internally, and copying it out would double the memory for no benefit while this service
        # runs one image at a time. The KEY is what does the work - it is what decides that a
        # different model or different pixels are a different encoding.
        self.cache.put(key, True)
        self._sessions[handle] = _Session(key=key, backend=backend, shape=(image.shape[0], image.shape[1]))
        self._prune_sessions()
        return handle, False

    def segment(self, handle: str, prompt: Prompt) -> Prediction:
        session = self._sessions.get(handle)
        if session is None or self.cache.get(session.key) is None:
            # Expiry and an invented handle are the same answer to the client: ask for an embedding
            # again. Distinguishing them would leak which handles once existed.
            self._sessions.pop(handle, None)
            raise UnknownHandleError(
                "that embedding handle is unknown or has expired; request an embedding again"
            )

        # A backend serves one image at a time, so a handle for an image it is no longer holding has
        # to re-encode. Without this, two clients alternating between images would silently prompt
        # against each other's pixels.
        if getattr(session.backend, "_image_shape", None) != session.shape:
            raise ImageNotSetError(
                "the model is holding a different image; request an embedding again"
            )
        return session.backend.predict(prompt)

    def read_image(self, image_key: str) -> Any:
        """One image by its dataset key, decoded as RGB uint8.

        Public because a propagation reads a whole SEQUENCE and the runner that does it is
        deliberately not given this service -- it takes a reader, so its index arithmetic can be
        tested against a fake instead of against a folder of pictures.

        The same `_resolve` guard as every other path in: a key that escapes the dataset root is
        refused here rather than by whatever the filesystem happens to do with it.
        """
        return self._read_image(self._resolve(image_key))

    def _resolve(self, image_key: str) -> Path:
        """Turn a dataset-relative key into a path, refusing anything that escapes the root."""
        if not image_key or "\0" in image_key or "\\" in image_key:
            raise InvalidPromptError(f"refusing the image path {image_key!r}")
        parts = [p for p in image_key.split("/") if p]
        if any(p in (".", "..") for p in parts):
            raise InvalidPromptError(f"refusing the image path {image_key!r}: it walks the tree")

        full = (self.dataset_root / Path(*parts)).resolve()
        try:
            full.relative_to(self.dataset_root.resolve())
        except ValueError:
            raise InvalidPromptError(
                f"refusing the image path {image_key!r}: it resolves outside the dataset root"
            ) from None
        return full

    def _read_image(self, path: Path, pixels: str | None = None) -> Any:
        """Decode as RGB uint8, the way the legacy loader does.

        `pixels` is a base64 PNG the API has already rendered -- RULE-089's Operate On View, where
        the model must segment what the USER SEES rather than the file. When it is present the file
        on disk is not read at all: the API owns the image pipeline, so it has applied the 16-bit
        decoding, RULE-032's chain and RULE-028's display adjustments, and reading the file here
        would undo every one of them.

        Applying the adjustments on this side instead was the alternative, and it is worse: a third
        implementation of arithmetic the browser and the API already share, and the only one that
        could not be compared against them without a running model.
        """
        try:
            import cv2
        except ImportError as cause:  # pragma: no cover - cv2 ships with the AI extra
            raise ImageUnreadableError(f"OpenCV is not installed: {cause}") from cause

        if pixels is not None:
            import numpy as np

            raw = np.frombuffer(base64.b64decode(pixels), dtype=np.uint8)
            decoded = cv2.imdecode(raw, cv2.IMREAD_COLOR)
            if decoded is None:
                raise ImageUnreadableError("the rendered pixels could not be decoded as an image")
            return cv2.cvtColor(decoded, cv2.COLOR_BGR2RGB)

        if not path.is_file():
            raise ImageUnreadableError(f"{path.name} is not in the dataset folder")

        # cv2.imread returns None rather than raising, which is how legacy's failure becomes a
        # cvtColor exception inside a catch-all and then a bare False.
        data = cv2.imread(str(path))
        if data is None:
            raise ImageUnreadableError(f"{path.name} could not be decoded as an image")
        return cv2.cvtColor(data, cv2.COLOR_BGR2RGB)

    def _prune_sessions(self) -> None:
        """Forget sessions whose cache entry has gone, so the two cannot drift apart."""
        for handle in [h for h, s in self._sessions.items() if self.cache.get(s.key) is None]:
            del self._sessions[handle]


def encode_mask(mask: Any) -> dict[str, Any]:
    """A mask in the bounded wire form `@lazylabel/contracts` defines.

    A bounding box plus the bytes inside it. The obvious encoding - a full-image plane - is what the
    memory NFR forbids: 500 objects on a 50-megapixel image is 25 GB of mostly zeros.
    """
    import numpy as np

    array = np.asarray(mask)
    height, width = int(array.shape[0]), int(array.shape[1])
    rows = np.any(array, axis=1)
    cols = np.any(array, axis=0)

    if not rows.any():
        return {"height": height, "width": width, "box": None, "data": ""}

    y0, y1 = int(np.argmax(rows)), height - int(np.argmax(rows[::-1]))
    x0, x1 = int(np.argmax(cols)), width - int(np.argmax(cols[::-1]))
    region = (array[y0:y1, x0:x1] != 0).astype(np.uint8)

    return {
        "height": height,
        "width": width,
        "box": [x0, y0, x1, y1],
        "data": base64.b64encode(region.tobytes()).decode("ascii"),
    }


def decode_mask(wire: Any) -> Any:
    """The exact inverse of {@link encode_mask}: a bounded wire mask back to a full array.

    Needed the moment a mask travels TOWARDS this service rather than away from it, which is what a
    propagation reference is -- the user's own annotation, seeding the run.

    THE BOX IS HALF-OPEN, `[x0, y0, x1, y1]` with the far edges exclusive, because `encode_mask`
    computes them as `width - argmax(...)`. Reading them as inclusive loses the last row and column
    of every reference mask, which is the kind of error that survives a visual check and shows up
    as a mask that shrinks by a pixel on every round trip.
    """
    import numpy as np

    if not isinstance(wire, dict):
        raise InvalidPromptError(f"a mask must be an object, got {type(wire).__name__}")

    height, width = wire.get("height"), wire.get("width")
    if not isinstance(height, int) or not isinstance(width, int) or height <= 0 or width <= 0:
        raise InvalidPromptError("a mask needs a positive integer 'height' and 'width'")

    mask = np.zeros((height, width), dtype=np.uint8)

    box = wire.get("box")
    if box is None:
        # An empty mask is a legal ENCODING -- `encode_mask` produces it for an all-zero array --
        # so decoding one is not an error here. Whether an empty mask may be USED is the caller's
        # question, and `seed_mask` refuses it with a message about references.
        return mask

    if not isinstance(box, (list, tuple)) or len(box) != 4 or not all(
        isinstance(value, int) for value in box
    ):
        raise InvalidPromptError(f"a mask box must be four integers, got {box!r}")

    x0, y0, x1, y1 = box
    if not (0 <= x0 <= x1 <= width and 0 <= y0 <= y1 <= height):
        raise InvalidPromptError(
            f"the mask box {list(box)} does not fit inside {width}x{height}"
        )

    data = wire.get("data")
    if not isinstance(data, str):
        raise InvalidPromptError("a mask needs its 'data' as a base64 string")

    try:
        raw = base64.b64decode(data, validate=True)
    except Exception as cause:  # noqa: BLE001 - any decode failure means the same thing
        raise InvalidPromptError(f"the mask data is not valid base64: {cause}") from cause

    expected = (y1 - y0) * (x1 - x0)
    if len(raw) != expected:
        # Length is the only check that catches a box and a payload describing different regions,
        # and without it numpy would either throw somewhere unhelpful or silently reshape.
        raise InvalidPromptError(
            f"the mask data is {len(raw)} bytes but its box {list(box)} needs {expected}"
        )

    if expected:
        mask[y0:y1, x0:x1] = np.frombuffer(raw, dtype=np.uint8).reshape(y1 - y0, x1 - x0)
    return mask
