"""Embedding cache manager for SAM model embeddings."""

from __future__ import annotations

from collections import OrderedDict
from typing import Any


class EmbeddingCacheManager:
    """Manages LRU caching for SAM embeddings.

    This manager handles:
    - Storing embeddings with LRU eviction
    - Cache lookup and hit/miss tracking
    - Moving accessed items to end for LRU ordering
    """

    def __init__(self, max_size: int = 10):
        """Initialize the cache.

        Args:
            max_size: Maximum number of embeddings to cache
        """
        self._cache: OrderedDict = OrderedDict()
        self._max_size = max_size

    @property
    def max_size(self) -> int:
        """Get the maximum cache size."""
        return self._max_size

    def __contains__(self, key: str) -> bool:
        """Check if key is in cache."""
        return key in self._cache

    def __len__(self) -> int:
        """Get number of items in cache."""
        return len(self._cache)

    def get(self, key: str, update_lru: bool = True) -> Any | None:
        """Get embeddings from cache.

        Args:
            key: Cache key (typically image hash)
            update_lru: Whether to update LRU ordering

        Returns:
            Cached embeddings or None if not found
        """
        if key not in self._cache:
            return None

        if update_lru:
            self._cache.move_to_end(key)

        return self._cache[key]

    def put(self, key: str, embeddings: Any) -> None:
        """Store embeddings in cache with LRU eviction.

        Args:
            key: Cache key (typically image hash)
            embeddings: SAM embeddings to cache
        """
        if embeddings is None:
            return

        self._cache[key] = embeddings

        # LRU eviction - remove oldest entries if over capacity
        while len(self._cache) > self._max_size:
            self._cache.popitem(last=False)

    def clear(self) -> None:
        """Clear all cached embeddings."""
        self._cache.clear()

    def invalidate(self, key: str) -> bool:
        """Remove a specific key from cache.

        Args:
            key: Cache key to remove

        Returns:
            True if key was found and removed
        """
        if key in self._cache:
            del self._cache[key]
            return True
        return False
