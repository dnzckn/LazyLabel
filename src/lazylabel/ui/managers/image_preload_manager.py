"""Image preload manager for instant navigation."""

from __future__ import annotations

from collections import OrderedDict
from typing import TYPE_CHECKING

from ..workers import ImagePreloadWorker

if TYPE_CHECKING:
    from PyQt6.QtGui import QPixmap

    from ..main_window import MainWindow


class ImagePreloadManager:
    """Manages preloading of adjacent images for instant navigation.

    This manager handles:
    - Background preloading of next/previous images
    - LRU caching of preloaded pixmaps
    - Worker lifecycle management
    """

    def __init__(self, main_window: MainWindow, max_cache_size: int = 5):
        """Initialize the preload manager.

        Args:
            main_window: Parent MainWindow instance
            max_cache_size: Maximum number of preloaded images to cache
        """
        self.main_window = main_window
        self._cache: OrderedDict = OrderedDict()  # path -> QPixmap
        self._max_cache_size = max_cache_size
        self._workers: list = []  # Active preload workers

    def preload_adjacent_images(self) -> None:
        """Preload next and previous images in background for instant navigation."""
        mw = self.main_window

        if not mw.cached_image_paths or not mw.current_image_path:
            return

        try:
            current_index = mw.cached_image_paths.index(mw.current_image_path)
        except ValueError:
            return

        # Determine which images to preload (next 2 and previous 1)
        paths_to_preload = []
        for offset in [1, 2, -1]:  # Next, next+1, previous
            target_index = current_index + offset
            if 0 <= target_index < len(mw.cached_image_paths):
                path = mw.cached_image_paths[target_index]
                # Skip if already in cache
                if path not in self._cache:
                    paths_to_preload.append(path)

        self._start_preload_workers(paths_to_preload)

    def preload_multi_view_adjacent(self) -> None:
        """Preload next and previous image pairs for multi-view instant navigation.

        Uses file manager's sort order to determine which images to preload.
        In multi-view mode, images are displayed in pairs (viewer 0 and 1).
        Navigation advances by 2 images at a time, so we preload:
        - Next pair: 2 files after current position
        - Previous pair: 2 files before current position
        """
        from pathlib import Path

        mw = self.main_window

        # Get current viewer 0's image path
        if not hasattr(mw, "multi_view_image_paths"):
            return

        current_path = mw.multi_view_image_paths[0]
        if not current_path:
            return

        current_path = Path(current_path)

        # Get next and previous pairs from file manager (respects sort order)
        paths_to_preload = []

        # Get next pair
        next_file1, next_file2 = mw.right_panel.get_next_file_pair(current_path)
        if next_file1 and str(next_file1) not in self._cache:
            paths_to_preload.append(str(next_file1))
        if next_file2 and str(next_file2) not in self._cache:
            paths_to_preload.append(str(next_file2))

        # Get previous pair
        prev_file1, prev_file2 = mw.right_panel.get_previous_file_pair(current_path)
        if prev_file1 and str(prev_file1) not in self._cache:
            paths_to_preload.append(str(prev_file1))
        if prev_file2 and str(prev_file2) not in self._cache:
            paths_to_preload.append(str(prev_file2))

        self._start_preload_workers(paths_to_preload)

    def _start_preload_workers(self, paths: list) -> None:
        """Start preload workers for the given paths.

        Args:
            paths: List of image paths to preload
        """
        if not paths:
            return

        # Cancel any existing workers
        self.cleanup_workers()

        # Start preload workers for new paths
        for path in paths:
            worker = ImagePreloadWorker(path, self.main_window)
            worker.image_loaded.connect(self._on_image_preloaded)
            worker.finished.connect(lambda w=worker: self._remove_worker(w))
            self._workers.append(worker)
            worker.start()

    def _on_image_preloaded(self, path: str, pixmap: QPixmap) -> None:
        """Handle preloaded image completion."""
        # LRU eviction if cache is full
        while len(self._cache) >= self._max_cache_size:
            self._cache.popitem(last=False)

        # Add to cache
        self._cache[path] = pixmap

    def get_preloaded_pixmap(self, path: str) -> QPixmap | None:
        """Get preloaded pixmap if available.

        Args:
            path: Image path to retrieve

        Returns:
            Cached QPixmap or None if not preloaded
        """
        if path in self._cache:
            # Move to end for LRU
            self._cache.move_to_end(path)
            return self._cache[path]
        return None

    def cleanup_workers(self) -> None:
        """Stop and clean up preload workers."""
        for worker in self._workers[:]:
            if worker.isRunning():
                worker.stop()
                worker.wait(100)  # Wait up to 100ms
            self._workers.remove(worker)

    def _remove_worker(self, worker) -> None:
        """Remove a finished preload worker from the list."""
        if worker in self._workers:
            self._workers.remove(worker)

    def clear_cache(self) -> None:
        """Clear all cached preloaded images."""
        self._cache.clear()

    def __contains__(self, path: str) -> bool:
        """Check if path is in preload cache."""
        return path in self._cache
