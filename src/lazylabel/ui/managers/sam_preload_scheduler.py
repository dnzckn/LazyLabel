"""SAM embedding preload scheduler for lazy loading optimization."""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from typing import TYPE_CHECKING

from PyQt6.QtCore import QTimer

if TYPE_CHECKING:
    from .embedding_cache_manager import EmbeddingCacheManager


class SAMPreloadScheduler:
    """Schedules preloading of SAM embeddings for adjacent images.

    This manager handles:
    - Timer-based delayed preload scheduling
    - Debouncing of preload requests
    - Path tracking for pending preloads
    """

    def __init__(
        self,
        embedding_cache: EmbeddingCacheManager,
        preload_callback: Callable[[str], None],
        get_next_path_callback: Callable[[], str | None],
        should_preload_callback: Callable[[], bool],
        preload_delay_ms: int = 200,
    ):
        """Initialize the preload scheduler.

        Args:
            embedding_cache: Cache manager to check for existing embeddings
            preload_callback: Callback to execute actual preload (path -> None)
            get_next_path_callback: Callback to get next image path
            should_preload_callback: Callback to check if preload should proceed
            preload_delay_ms: Delay before starting preload
        """
        self._embedding_cache = embedding_cache
        self._preload_callback = preload_callback
        self._get_next_path = get_next_path_callback
        self._should_preload = should_preload_callback
        self._pending_path: str | None = None

        # Timer for delayed preload
        self._timer = QTimer()
        self._timer.setSingleShot(True)
        self._timer.timeout.connect(self._on_timer_timeout)
        self._preload_delay_ms = preload_delay_ms

    def schedule_preload(self) -> None:
        """Schedule preloading of next image's SAM embeddings."""
        next_path = self._get_next_path()
        if not next_path:
            return

        # Check if already cached
        next_hash = hashlib.md5(next_path.encode()).hexdigest()
        if next_hash not in self._embedding_cache:
            self._pending_path = next_path
            # Start preload after delay (let UI settle first)
            self._timer.start(self._preload_delay_ms)

    def cancel_preload(self) -> None:
        """Cancel any pending preload."""
        self._timer.stop()
        self._pending_path = None

    def _on_timer_timeout(self) -> None:
        """Handle timer timeout - execute preload if conditions allow."""
        if not self._pending_path:
            return

        # Check if preload should proceed
        if not self._should_preload():
            # Retry later with longer delay
            self._timer.start(500)
            return

        path = self._pending_path
        self._pending_path = None

        # Double-check it's not already cached
        image_hash = hashlib.md5(path.encode()).hexdigest()
        if image_hash in self._embedding_cache:
            return

        # Execute actual preload
        self._preload_callback(path)

    @property
    def is_pending(self) -> bool:
        """Check if a preload is pending."""
        return self._pending_path is not None
