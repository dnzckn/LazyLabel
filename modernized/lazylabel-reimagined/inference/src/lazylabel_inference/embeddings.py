"""The embedding cache — RULE-091, with the key the rule card's answer settled on.

Encoding an image is the expensive half of interactive segmentation: about 3 seconds for SAM 2.1
large on the development GPU, against under 2 for the prompt itself. Caching it is what makes the
second click on an image feel immediate, and RULE-074's latency budget assumes it.

THE KEY IS THE WHOLE DESIGN. Legacy keys on a hash of the image PATH, which is wrong three ways at
once, and the middle one is not a near miss:

  - Change the model and the stale features are reused. Every SAM 1 variant emits a 256 x 64 x 64
    embedding, so vit_b features handed to a vit_h decoder are SHAPE-COMPATIBLE. No exception, no
    warning, just a mask derived from features the decoder was never trained against.
  - Edit or replace the image and the old features are reused; the path has not moved.
  - Turn on Operate On View (RULE-089) and the pixels SAM encodes are the ADJUSTED ones, so changing
    brightness changes what should be encoded while the path stays exactly the same.

So the key is (image identity, model identity, adjustment identity), and a key that cannot be
computed is a cache miss rather than a guess. Making invalidation part of the key rather than a
separate step is deliberate: a step can be forgotten, a key cannot.
"""

from __future__ import annotations

import hashlib
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_CAPACITY = 10
"""Thirty minutes idle, from AI_NATIVE_SPEC.md section 3. The cache now lives in a service rather
than in a process the user closes, so entries have to expire as well as be evicted."""
DEFAULT_TTL_SECONDS = 30 * 60


@dataclass(frozen=True)
class EmbeddingKey:
    """What makes two encodings the same encoding."""

    image: str
    model: str
    adjustments: str

    def as_handle(self) -> str:
        """A short opaque token the client passes back. Never parsed by anything."""
        return hashlib.sha256(f"{self.image}|{self.model}|{self.adjustments}".encode()).hexdigest()[:32]


def image_identity(path: Path) -> str:
    """Identity of the image bytes.

    Size and modification time, not the path. A path is a name for wherever the bytes currently
    are; it says nothing about whether they are the same bytes as last time. When the pipeline has
    already read the file, prefer `content_identity` - this is the cheap form for a file on disk
    that has not been opened yet.
    """
    stat = path.stat()
    return f"{path.as_posix()}:{stat.st_size}:{stat.st_mtime_ns}"


def content_identity(data: bytes) -> str:
    """Identity of bytes already in hand. Exact, and worth it when the read has happened anyway."""
    return "sha256:" + hashlib.sha256(data).hexdigest()


def model_identity(sha256: str) -> str:
    """Identity of the model.

    The checkpoint's SHA-256, not its name or its declared variant. The manifest already pins it, so
    this is free, and it means a fine-tune cannot share a cache entry with the base model it was
    trained from even though both call themselves `large`.
    """
    return f"model:{sha256}"


def adjustment_identity(adjustments: dict[str, float] | None) -> str:
    """Identity of the display pipeline that produced the pixels.

    A constant when Operate On View is off, because the model then sees the original file and the
    adjustments cannot matter. A hash of the parameters when it is on, because they decide the
    pixels (RULE-089).
    """
    if not adjustments:
        return "original"
    parts = ",".join(f"{name}={value!r}" for name, value in sorted(adjustments.items()))
    return "view:" + hashlib.sha256(parts.encode()).hexdigest()[:16]


@dataclass
class _Entry:
    value: Any
    stored_at: float


class EmbeddingCache:
    """A least-recently-used cache of encoded images, bounded by count and by age.

    `now` is injected so expiry is testable without sleeping, which is the only way a 30-minute TTL
    gets tested at all.
    """

    def __init__(
        self,
        capacity: int = DEFAULT_CAPACITY,
        ttl_seconds: float = DEFAULT_TTL_SECONDS,
        now: Any = None,
    ) -> None:
        if capacity < 1:
            raise ValueError("an embedding cache with no capacity is not a cache")
        self._capacity = capacity
        self._ttl = ttl_seconds
        self._entries: OrderedDict[EmbeddingKey, _Entry] = OrderedDict()
        if now is None:
            import time

            now = time.monotonic
        self._now = now
        self.hits = 0
        self.misses = 0
        self.evictions = 0
        self.expirations = 0

    def get(self, key: EmbeddingKey) -> Any | None:
        """The cached value, or None. A miss is an ordinary outcome, not an error."""
        entry = self._entries.get(key)
        if entry is None:
            self.misses += 1
            return None

        if self._now() - entry.stored_at >= self._ttl:
            del self._entries[key]
            self.expirations += 1
            self.misses += 1
            return None

        self._entries.move_to_end(key)
        self.hits += 1
        return entry.value

    def put(self, key: EmbeddingKey, value: Any) -> None:
        if key in self._entries:
            del self._entries[key]
        self._entries[key] = _Entry(value, self._now())

        while len(self._entries) > self._capacity:
            self._entries.popitem(last=False)
            self.evictions += 1

    def invalidate_model(self, model: str) -> int:
        """Drop every entry for one model. Returns how many went.

        Not strictly required - the key already keeps models apart - but a deployment that swaps a
        checkpoint should not hold its predecessor's features until they age out of a ten-entry LRU.
        """
        doomed = [key for key in self._entries if key.model == model]
        for key in doomed:
            del self._entries[key]
        return len(doomed)

    def clear(self) -> None:
        self._entries.clear()

    def __len__(self) -> int:
        return len(self._entries)

    @property
    def keys(self) -> tuple[EmbeddingKey, ...]:
        """Current keys, oldest first. For tests and for the models route's diagnostics."""
        return tuple(self._entries)
