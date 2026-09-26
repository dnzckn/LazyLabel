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
pixels inside it, packed one bit each and base64-encoded. Two implementations of a binary layout is exactly what that shared
package exists to prevent, so this one is checked against it by a fixture the TypeScript suite
decodes (`contracts/test/pythonFixture.test.ts`).
"""

from __future__ import annotations

import base64
import threading
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
from .propagation import JPEG_SUFFIXES, SourceImage
from .prompts import (
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
    # Which encoding each backend's predictor holds right now, by model name.
    _holding: dict[str, EmbeddingKey] = field(default_factory=dict)
    # The server is threaded, and a predictor is ONE mutable image: loading a model, encoding and
    # predicting are serialised. Two first requests loading the same model at once failed on
    # 2026-09-23 inside torch; an encode landing between another request's restore and its predict
    # would answer that click from the wrong image. One GPU does one of these at a time regardless.
    _lock: threading.RLock = field(default_factory=threading.RLock, repr=False)

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
        with self._lock:
            if name in self._backends:
                return self._backends[name]

            entry = self.verified(self.model(name))
            backend = load_backend(entry, self.model_dir, device=self.device)
            self._backends[name] = backend
            return backend

    def verified(self, entry: ModelEntry) -> ModelEntry:
        """The entry back, once its checkpoint is proven to be the file the manifest vouches for.

        EVERY path that loads a checkpoint calls this first, and `test_checkpoint_paths.py` holds
        the whole source to that. It used to be inline in `backend`, and the two load paths written
        after it -- the video predictor a propagation builds and the embedder Find Archetypes
        builds -- went straight to their loaders: the manifest's full SHA-256 was carried on all
        three paths and checked on one (SEC-17).

        Hashing a multi-gigabyte file takes seconds, and it is paid once per model per process,
        because every caller keeps what it loads.
        """
        status = check_checkpoint(entry, self.model_dir)
        if not status.usable:
            raise ModelNotLoadedError(f"{entry.name} cannot be used: {status.detail}")
        return entry

    def embed(
        self,
        image_key: str,
        model_name: str,
        adjustments: dict[str, float] | None = None,
        pixels: str | None = None,
        processing: str | None = None,
    ) -> tuple[str, bool]:
        """Encode an image, or recognise that it is already encoded.

        Returns the handle and whether it was a cache hit. The handle is derived from the key, so
        asking twice for the same (image, model, adjustments) yields the same handle - a client that
        loses one can ask again rather than leaking a session.
        """
        entry = self.model(model_name)
        if not entry.is_segmenter:
            # Said plainly: "no backend for family 'embedder'" was what a user got for choosing it.
            raise InvalidPromptError(
                f"{entry.name} cannot segment -- it is the embedder Find Archetypes uses; choose a SAM model"
            )
        path = self._resolve(image_key)

        key = EmbeddingKey(
            image=image_identity(path),
            model=model_identity(entry.sha256),
            adjustments=adjustment_identity(adjustments, processing),
        )
        handle = key.as_handle()

        with self._lock:
            if self.cache.get(key) is not None and handle in self._sessions:
                return handle, True

            backend = self.backend(model_name)
            image = self._read_image(path, pixels)
            # Forgotten BEFORE encoding: an encode that fails partway has already reset the
            # predictor, and a record still naming the previous image would skip its restore.
            self._holding.pop(model_name, None)
            backend.set_image(image)

            # The cached value is the ENCODING, detached from the predictor, which holds only the
            # image encoded last. Until 2026-09-23 it was a marker, and a click on one image was
            # answered from whichever image RULE-091's prefetch had encoded after it.
            self.cache.put(key, backend.export_state())
            self._holding[model_name] = key
            self._sessions[handle] = _Session(key=key, backend=backend, shape=(image.shape[0], image.shape[1]))
            self._prune_sessions()
            return handle, False

    def segment(self, handle: str, prompt: Prompt) -> Prediction:
        with self._lock:
            session = self._sessions.get(handle)
            encoded = None if session is None else self.cache.get(session.key)
            if session is None or encoded is None:
                # Expiry and an invented handle are the same answer to the client: ask for an
                # embedding again. Distinguishing them would leak which handles once existed.
                self._sessions.pop(handle, None)
                raise UnknownHandleError(
                    "that embedding handle is unknown or has expired; request an embedding again"
                )

            # A predictor holds one image, so a handle for another has its encoding PUT BACK first,
            # from the cache -- no encoder run. This was a check on the image's SIZE until
            # 2026-09-23, which every same-sized neighbour passed: the click was answered from the
            # neighbour's encoding, silently.
            name = session.backend.entry.name
            if self._holding.get(name) != session.key:
                session.backend.restore_state(encoded)
                self._holding[name] = session.key
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

    def read_frame(self, image_key: str) -> SourceImage:
        """One frame of a propagation: its RGB pixels, and its own bytes when it is a JPEG.

        SEQUENCE_PARITY.md SP-08. Legacy hands SAM 2 a JPEG's own file -- linked into the staging
        folder, or copied where the link is refused -- and decodes and writes again at quality 95
        only what is not a JPEG (`sam2_model.py:788-803`). The runner stages what this returns.

        A JPEG by NAME, which is legacy's test (`img_path.suffix.lower() in {".jpg", ".jpeg"}`), and
        by CONTENT, which is SEC-02's: the bytes handed on are the bytes sniffed and decoded here,
        read once. So a file named `.jpg` that holds another format is written again like any other
        frame, where legacy would give it to SAM 2's Pillow as it is.

        The pixels are decoded all the same: RULE-071 measures every frame against the reference's
        size, and legacy measures a JPEG with `cv2.imread` as well (`propagation_manager.py:229-236`).
        """
        path = self._resolve(image_key)
        blob, found = self._read_file(path)
        pixels = self._decode(blob, found, path.name)
        jpeg = blob if found == "jpeg" and path.suffix.lower() in JPEG_SUFFIXES else None
        return SourceImage(pixels=pixels, jpeg=jpeg)

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

        import numpy as np

        if pixels is not None:
            posted = base64.b64decode(pixels)
            # The API renders PNG, so anything else arriving here is not the API's output -- and is
            # refused on the same terms a file on disk would be.
            if sniff_image_format(posted) != "png":
                raise ImageUnreadableError("the rendered pixels are not the PNG the API sends")
            raw = np.frombuffer(posted, dtype=np.uint8)
            decoded = cv2.imdecode(raw, cv2.IMREAD_COLOR)
            if decoded is None:
                raise ImageUnreadableError("the rendered pixels could not be decoded as an image")
            return cv2.cvtColor(decoded, cv2.COLOR_BGR2RGB)

        blob, found = self._read_file(path)
        return self._decode(blob, found, path.name)

    def _read_file(self, path: Path) -> tuple[bytes, str]:
        """The file's bytes and the format they START with, refused unless LazyLabel opens it.

        SEC-02. `cv2.imread` picks its decoder from the file's CONTENT, and OpenCV's wheels bundle
        codecs pip-audit does not track -- OpenEXR 2.3.0 and OpenJPEG among them. The API refuses
        any format outside its allow-list, but this service reads the dataset DIRECTLY, so a
        file named `x.png` holding EXR bytes went straight past that check to whatever decoder
        cv2 chose. Same list as the API's, checked on the bytes rather than the name.

        Read ONCE and decoded from memory, so what was checked is exactly what is decoded -- and,
        for a JPEG in a propagation, exactly what is staged. Sniffing the head and then letting
        `imread` open the file again would leave a window in which the file on disk could be
        swapped for something else.
        """
        if not path.is_file():
            raise ImageUnreadableError(f"{path.name} is not in the dataset folder")
        blob = path.read_bytes()
        found = sniff_image_format(blob)
        if found is None:
            raise ImageUnreadableError(
                f"{path.name} is not an image type LazyLabel opens (JPEG, PNG, WebP, TIFF, GIF or BMP)"
            )
        return blob, found

    @staticmethod
    def _decode(blob: bytes, found: str, name: str) -> Any:
        """Checked bytes decoded as RGB uint8, with `cv2.imread`'s decoder and flags."""
        try:
            import cv2
        except ImportError as cause:  # pragma: no cover - cv2 ships with the AI extra
            raise ImageUnreadableError(f"OpenCV is not installed: {cause}") from cause
        import numpy as np

        # cv2.imdecode returns None rather than raising, which is how legacy's failure becomes a
        # cvtColor exception inside a catch-all and then a bare False.
        data = cv2.imdecode(np.frombuffer(blob, dtype=np.uint8), cv2.IMREAD_COLOR)
        if data is None:
            raise ImageUnreadableError(f"{name} could not be decoded as a {found} image")
        return cv2.cvtColor(data, cv2.COLOR_BGR2RGB)

    def _prune_sessions(self) -> None:
        """Forget sessions whose cache entry has gone, so the two cannot drift apart."""
        for handle in [h for h, s in self._sessions.items() if self.cache.get(s.key) is None]:
            del self._sessions[handle]


def encode_mask(mask: Any) -> dict[str, Any]:
    """A mask in the bounded wire form `@lazylabel/contracts` defines.

    A bounding box plus the bytes inside it. The obvious encoding - a full-image plane - is what the
    memory NFR forbids: 500 objects on a 50-megapixel image is 25 GB of mostly zeros.

    ONE BIT PER PIXEL, `packing: "bits"`, since 2026-09-23. The spec's interactive budget -- p95 of
    150 ms from click to mask on a 12-megapixel image, warm -- was measured that day for the first
    time and missed at 213 ms, and the tail was this function and the JSON after it: a large mask
    at a byte per pixel was megabytes of base64 per click. `np.packbits` writes the first pixel into
    the most significant bit, which is the order `@lazylabel/contracts` reads.
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
    packed = np.packbits(array[y0:y1, x0:x1] != 0, axis=None)

    return {
        "height": height,
        "width": width,
        "box": [x0, y0, x1, y1],
        "data": base64.b64encode(packed.tobytes()).decode("ascii"),
        "packing": "bits",
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

    # Absent is one byte per pixel, which every mask written before bit packing used and which is
    # still accepted, so an older client's payload still reads.
    packing = wire.get("packing")
    if packing not in (None, "bits"):
        raise InvalidPromptError(f"the mask is packed as {packing!r}, which no decoder knows")

    pixels = (y1 - y0) * (x1 - x0)
    expected = (pixels + 7) // 8 if packing == "bits" else pixels
    if len(raw) != expected:
        # Length is the only check that catches a box and a payload describing different regions,
        # and without it numpy would either throw somewhere unhelpful or silently reshape.
        raise InvalidPromptError(
            f"the mask data is {len(raw)} bytes but its box {list(box)} needs {expected}"
        )

    if pixels:
        region = np.frombuffer(raw, dtype=np.uint8)
        if packing == "bits":
            region = np.unpackbits(region, count=pixels)
        mask[y0:y1, x0:x1] = (region.reshape(y1 - y0, x1 - x0) != 0).astype(np.uint8)
    return mask


def sniff_image_format(head: bytes) -> str | None:
    """The image format these bytes START with, if it is one LazyLabel opens; else None.

    The same set as the API's `DECODABLE` plus BMP, which the API decodes itself -- one allow-list
    in two languages, because the two services read the same files and a format one refuses must
    not be decodable through the other.

    By signature, never by extension. A name says what someone called the file; the first bytes
    say which decoder will run.
    """
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head.startswith((b"II*\x00", b"MM\x00*")):
        return "tiff"
    if head.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    if head.startswith(b"BM"):
        return "bmp"
    return None
