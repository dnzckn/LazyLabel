"""SAM single-view manager for handling single-view SAM model operations.

This manager handles:
- Single-view SAM model initialization
- Single-view image updates with hash-based caching
- Worker cleanup and error recovery
"""

from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING, Any

from ...utils.logger import logger
from ..utils.worker_utils import cleanup_worker_thread, stop_worker
from ..workers import SAMUpdateWorker, SingleViewSAMInitWorker

if TYPE_CHECKING:
    from ..main_window import MainWindow


class SAMSingleViewManager:
    """Manages single-view SAM model operations.

    Handles model initialization, image updates, and embedding caching
    for single-view mode.
    """

    def __init__(self, main_window: MainWindow):
        """Initialize the single-view SAM manager.

        Args:
            main_window: Parent MainWindow instance
        """
        self.mw = main_window

        # Model state
        self.sam_is_dirty = False
        self.sam_is_updating = False
        self.sam_scale_factor = 1.0
        self.current_sam_hash: str | None = None

        # Worker references
        self.sam_worker_thread: SAMUpdateWorker | None = None
        self.init_worker: SingleViewSAMInitWorker | None = None
        self.model_initializing = False

    @property
    def viewer(self):
        """Get the active viewer (supports sequence mode)."""
        return self.mw.active_viewer

    # ========== State Accessors ==========

    def is_busy(self) -> bool:
        """Check if single-view SAM is busy (updating or initializing)."""
        return self.sam_is_updating or self.model_initializing

    def can_preload(self) -> bool:
        """Check if SAM preloading can proceed."""
        return not (self.sam_is_dirty or self.sam_is_updating)

    def mark_dirty(self) -> None:
        """Mark SAM as needing update."""
        self.sam_is_dirty = True
        # Cancel any pending SAM updates
        self.mw.sam_update_timer.stop()

    def invalidate_hash(self) -> None:
        """Invalidate the current SAM hash."""
        self.current_sam_hash = None

    # ========== Model Initialization ==========

    def start_initialization(self) -> bool:
        """Start single-view model initialization.

        Returns:
            True if initialization started, False if already initializing
        """
        if self.model_initializing:
            return False

        # Clean up existing worker
        if self.init_worker:
            stop_worker(self.init_worker)
            self.init_worker.deleteLater()
            self.init_worker = None

        # Show status message
        self.mw._show_notification("Initializing AI model...")

        # Mark as initializing
        self.model_initializing = True

        # Create and start worker (use pending custom model if available)
        self.init_worker = SingleViewSAMInitWorker(
            self.mw.model_manager,
            self.mw.settings.default_model_type,
            self.mw.pending_custom_model_path,
        )

        # Connect signals
        self.init_worker.model_initialized.connect(self._on_model_initialized)
        self.init_worker.error.connect(self._on_model_error)
        self.init_worker.progress.connect(self._on_model_progress)

        self.init_worker.start()
        return True

    def _on_model_initialized(self, sam_model: Any) -> None:
        """Handle model initialization completion."""
        self.model_initializing = False

        # Clear pending custom model path since it's now loaded
        self.mw.pending_custom_model_path = None

        # Update model manager
        self.mw.model_manager.sam_model = sam_model

        # Get model name for display
        model_name = "Default SAM Model"
        if hasattr(sam_model, "model_name"):
            model_name = sam_model.model_name

        # Update control panel
        if hasattr(self.mw, "control_panel"):
            self.mw.control_panel.set_current_model(f"Current: {model_name}")

        self.mw._show_success_notification(
            "AI model ready for prompting", duration=3000
        )

        # Clean up worker
        if self.init_worker:
            self.init_worker.deleteLater()
            self.init_worker = None

        # Trigger SAM update for current image
        self.mark_dirty()
        self.ensure_sam_updated()

    def _on_model_error(self, error_msg: str) -> None:
        """Handle model initialization error."""
        self.model_initializing = False
        logger.error(f"Single-view model initialization error: {error_msg}")

        # Show error
        if hasattr(self.mw, "status_bar"):
            self.mw.status_bar.show_message(f"AI model failed: {error_msg}", 5000)

        # Clean up worker
        if self.init_worker:
            self.init_worker.deleteLater()
            self.init_worker = None

    def _on_model_progress(self, progress_msg: str) -> None:
        """Handle model initialization progress."""
        self.mw._show_notification(progress_msg)

    # ========== Image Update ==========

    def ensure_sam_updated(self) -> None:
        """Ensure SAM model has current image loaded (lazy update with threading)."""
        if not self.sam_is_dirty or self.sam_is_updating:
            return

        if not self.mw.current_image_path:
            return

        # Check if we need to load a different model
        model_available = self.mw.model_manager.is_model_available()
        pending_model = getattr(self.mw, "pending_custom_model_path", None)

        # If no model is available OR we have a pending custom model, start async loading
        if not model_available or pending_model:
            self.start_initialization()
            return

        # Get current image (with modifications if operate_on_view is enabled)
        current_image = None
        image_hash = None

        if (
            self.mw.settings.operate_on_view
            and hasattr(self.mw, "_cached_original_image")
            and self.mw._cached_original_image is not None
        ):
            # Apply current modifications to get the view image
            current_image = self.mw._get_current_modified_image()
            image_hash = self.mw._get_image_hash(current_image)
        else:
            # Use original image path as hash for non-modified images
            image_hash = hashlib.md5(self.mw.current_image_path.encode()).hexdigest()

        # Check if this exact image state is already loaded in SAM
        if image_hash and image_hash == self.current_sam_hash:
            # SAM already has this exact image state - no update needed
            self.sam_is_dirty = False
            return

        # Stop and cleanup existing worker
        self._stop_update_worker()

        # Show status message
        if hasattr(self.mw, "status_bar"):
            self.mw.status_bar.show_message("Loading image into AI model...", 0)

        # Mark as updating
        self.sam_is_updating = True
        self.sam_is_dirty = False

        # Create and start worker thread
        self.sam_worker_thread = SAMUpdateWorker(
            self.mw.model_manager,
            self.mw.current_image_path,
            self.mw.settings.operate_on_view,
            current_image,
            self.mw,
        )
        self.sam_worker_thread.finished.connect(
            lambda: self._on_update_finished(image_hash)
        )
        self.sam_worker_thread.error.connect(self._on_update_error)

        self.sam_worker_thread.start()

    def _stop_update_worker(self) -> None:
        """Stop and cleanup the update worker."""
        if self.sam_worker_thread and self.sam_worker_thread.isRunning():
            stop_worker(self.sam_worker_thread)
            self.sam_worker_thread.terminate()
            # Wait longer for proper cleanup
            self.sam_worker_thread.wait(5000)
            if self.sam_worker_thread.isRunning():
                # Force kill if still running
                self.sam_worker_thread.quit()
                self.sam_worker_thread.wait(2000)

        # Clean up old worker thread
        if self.sam_worker_thread:
            self.sam_worker_thread.deleteLater()
            self.sam_worker_thread = None

    def _on_update_finished(self, image_hash: str) -> None:
        """Handle SAM update completion."""
        self.sam_is_updating = False

        # Show completion message consistent with multi-view
        self.mw._show_success_notification(
            "AI model ready for prompting", duration=3000
        )

        # Update scale factor from worker thread
        if self.sam_worker_thread:
            self.sam_scale_factor = self.sam_worker_thread.get_scale_factor()

        # Clean up worker thread
        if self.sam_worker_thread:
            self.sam_worker_thread.deleteLater()
            self.sam_worker_thread = None

        # Update current_sam_hash after successful update
        self.current_sam_hash = image_hash

        # Cache embeddings for future use
        self._cache_embeddings(image_hash)

    def _on_update_error(self, error_msg: str) -> None:
        """Handle SAM update error."""
        self.sam_is_updating = False

        # Show error in status bar
        if hasattr(self.mw, "status_bar"):
            self.mw.status_bar.show_message(
                f"Error loading AI model: {error_msg}", 5000
            )

        # Clean up worker thread
        if self.sam_worker_thread:
            self.sam_worker_thread.deleteLater()
            self.sam_worker_thread = None

    def _cache_embeddings(self, image_hash: str) -> None:
        """Cache SAM embeddings for the given hash."""
        if not self.mw.model_manager.sam_model:
            return

        embeddings = self.mw.model_manager.sam_model.get_embeddings()
        if embeddings is not None:
            self.mw.embedding_cache.put(image_hash, embeddings)

            # Schedule preloading of next image
            if self.mw.sam_preload_scheduler:
                self.mw.sam_preload_scheduler.schedule_preload()

    # ========== Reset/Cleanup ==========

    def reset_for_model_switch(self) -> None:
        """Reset SAM state when switching models.

        Forcefully terminates any running workers and resets all state.
        """
        # Force terminate running worker
        if self.sam_worker_thread and self.sam_worker_thread.isRunning():
            stop_worker(self.sam_worker_thread)
            self.sam_worker_thread.terminate()
            self.sam_worker_thread.wait(3000)
            if self.sam_worker_thread.isRunning():
                logger.warning("Worker still running after terminate, forcing quit")
                self.sam_worker_thread.quit()
                self.sam_worker_thread.wait(1000)

        # Clean up worker reference
        if self.sam_worker_thread:
            self.sam_worker_thread.deleteLater()
            self.sam_worker_thread = None

        # Reset state
        self.sam_is_updating = False
        self.sam_is_dirty = True
        self.current_sam_hash = None
        self.sam_scale_factor = 1.0

        # Clear points and preview
        self.mw.clear_all_points()
        self.mw.undo_redo_manager.clear()

        # Clear preview items
        if hasattr(self.mw, "preview_mask_item") and self.mw.preview_mask_item:
            self.viewer.scene().removeItem(self.mw.preview_mask_item)
            self.mw.preview_mask_item = None

        # Clear AI bbox preview state
        self.mw.ai_bbox_preview_mask = None
        self.mw.ai_bbox_preview_rect = None

        # Clear status bar
        if hasattr(self.mw, "status_bar"):
            self.mw.status_bar.clear_message()

        # Redisplay segments
        self.mw._display_all_segments()

    def cleanup(self) -> None:
        """Clean up all workers and resources."""
        # Stop and cleanup update worker
        if self.sam_worker_thread:
            cleanup_worker_thread(self.sam_worker_thread, timeout_ms=3000)
            self.sam_worker_thread = None

        # Stop and cleanup init worker
        if self.init_worker:
            stop_worker(self.init_worker)
            self.init_worker.deleteLater()
            self.init_worker = None

        # Reset state
        self.sam_is_updating = False
        self.model_initializing = False
