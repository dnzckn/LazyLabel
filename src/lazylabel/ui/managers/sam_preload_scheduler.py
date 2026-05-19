"""SAM embedding preload scheduler for lazy loading optimization."""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from typing import TYPE_CHECKING

from PyQt6.QtCore import QTimer

if TYPE_CHECKING:
    from .embedding_cache_manager import EmbeddingCacheManager


class SAMPreloadScheduler:
    """Schedules preloading of SAM embeddings for upcoming images.

    Maintains a priority FIFO queue (e.g. archetype frames) plus a set of
    default paths (computed from the current frame's neighbors). After each
    preload completes, the scheduler chains forward to the next uncached path
    so the LRU cache fills out without further prompting.
    """

    def __init__(
        self,
        embedding_cache: EmbeddingCacheManager,
        preload_callback: Callable[[str], None],
        get_default_paths_callback: Callable[[], list[str]],
        should_preload_callback: Callable[[], bool],
        preload_delay_ms: int = 200,
    ):
        """Initialize the preload scheduler.

        Args:
            embedding_cache: Cache to check before scheduling a path
            preload_callback: Performs the actual preload for a single path
            get_default_paths_callback: Returns adjacency paths around the
                current frame, in preferred-order (e.g. [N+1, N+2, N-1]).
                Called fresh on every scheduling pass so the list tracks
                navigation.
            should_preload_callback: Returns False to defer (e.g. while the
                current frame's SAM update is still running)
            preload_delay_ms: Delay before starting preload (debounce)
        """
        self._embedding_cache = embedding_cache
        self._preload_callback = preload_callback
        self._get_default_paths = get_default_paths_callback
        self._should_preload = should_preload_callback
        self._pending_path: str | None = None
        self._priority_queue: list[str] = []

        self._timer = QTimer()
        self._timer.setSingleShot(True)
        self._timer.timeout.connect(self._on_timer_timeout)
        self._preload_delay_ms = preload_delay_ms

    def schedule_preload(self) -> None:
        """Pick the next uncached path and start the debounce timer."""
        next_path = self._next_uncached_path()
        if not next_path:
            self._pending_path = None
            return

        self._pending_path = next_path
        self._timer.start(self._preload_delay_ms)

    def enqueue_priority(self, paths: list[str]) -> None:
        """Prepend high-priority paths (e.g. archetype frames).

        Deduplicates against existing queue entries and the LRU cache, then
        kicks the scheduler so cache-fill begins right away.
        """
        for p in paths:
            if not p:
                continue
            if p in self._priority_queue:
                continue
            key = hashlib.md5(p.encode()).hexdigest()
            if key in self._embedding_cache:
                continue
            self._priority_queue.append(p)

        if self._priority_queue and not self._timer.isActive():
            self.schedule_preload()

    def clear_priority(self) -> None:
        """Drop all priority paths (e.g. when archetypes are cleared)."""
        self._priority_queue.clear()

    def cancel_preload(self) -> None:
        """Cancel the pending timer (priority queue is preserved)."""
        self._timer.stop()
        self._pending_path = None

    def _next_uncached_path(self) -> str | None:
        """First path across priority + defaults that isn't already cached."""
        seen: set[str] = set()
        for path in list(self._priority_queue) + self._get_default_paths():
            if not path or path in seen:
                continue
            seen.add(path)
            key = hashlib.md5(path.encode()).hexdigest()
            if key not in self._embedding_cache:
                return path
        return None

    def _on_timer_timeout(self) -> None:
        """Execute the pending preload if conditions still allow."""
        if not self._pending_path:
            return

        if not self._should_preload():
            # Defer — current frame's SAM update probably still running.
            self._timer.start(500)
            return

        path = self._pending_path
        self._pending_path = None

        # Drop from priority queue if present (preload consumes the slot).
        if path in self._priority_queue:
            self._priority_queue.remove(path)

        # Re-check cache in case it was filled while we waited.
        key = hashlib.md5(path.encode()).hexdigest()
        if key in self._embedding_cache:
            self.schedule_preload()
            return

        self._preload_callback(path)

        # Chain to the next uncached path so the LRU fills out.
        self.schedule_preload()

    @property
    def is_pending(self) -> bool:
        """True while a preload is scheduled or in-flight."""
        return self._pending_path is not None
