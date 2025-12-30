"""SAM worker manager - facade for SAM operations.

This manager serves as a unified interface for all SAM model operations,
delegating to the single-view manager.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .sam_single_view_manager import SAMSingleViewManager

if TYPE_CHECKING:
    from ..main_window import MainWindow
    from ..workers import (
        SAMUpdateWorker,
        SingleViewSAMInitWorker,
    )


class SAMWorkerManager:
    """Facade for SAM operations.

    This class provides a unified interface for SAM worker management,
    delegating to the single-view manager.

    Attributes:
        single_view: Manager for single-view SAM operations
    """

    def __init__(self, main_window: MainWindow):
        """Initialize the SAM worker manager.

        Args:
            main_window: Parent MainWindow instance
        """
        self.mw = main_window

        # Create specialized manager
        self.single_view = SAMSingleViewManager(main_window)

    # ========== Combined State Accessors ==========

    def is_single_view_busy(self) -> bool:
        """Check if single-view SAM is busy (updating or initializing)."""
        return self.single_view.is_busy()

    def is_any_busy(self) -> bool:
        """Check if any SAM operation is in progress."""
        return self.is_single_view_busy()

    def can_preload(self) -> bool:
        """Check if SAM preloading can proceed."""
        return self.single_view.can_preload()

    # ========== Single-View State Property Accessors ==========
    # These provide backwards compatibility with existing MainWindow code

    @property
    def sam_is_dirty(self) -> bool:
        """Get SAM dirty state."""
        return self.single_view.sam_is_dirty

    @sam_is_dirty.setter
    def sam_is_dirty(self, value: bool) -> None:
        """Set SAM dirty state."""
        self.single_view.sam_is_dirty = value

    @property
    def sam_is_updating(self) -> bool:
        """Get SAM updating state."""
        return self.single_view.sam_is_updating

    @sam_is_updating.setter
    def sam_is_updating(self, value: bool) -> None:
        """Set SAM updating state."""
        self.single_view.sam_is_updating = value

    @property
    def sam_worker_thread(self) -> SAMUpdateWorker | None:
        """Get SAM worker thread."""
        return self.single_view.sam_worker_thread

    @sam_worker_thread.setter
    def sam_worker_thread(self, value: SAMUpdateWorker | None) -> None:
        """Set SAM worker thread."""
        self.single_view.sam_worker_thread = value

    @property
    def sam_scale_factor(self) -> float:
        """Get SAM scale factor."""
        return self.single_view.sam_scale_factor

    @sam_scale_factor.setter
    def sam_scale_factor(self, value: float) -> None:
        """Set SAM scale factor."""
        self.single_view.sam_scale_factor = value

    @property
    def current_sam_hash(self) -> str | None:
        """Get current SAM hash."""
        return self.single_view.current_sam_hash

    @current_sam_hash.setter
    def current_sam_hash(self, value: str | None) -> None:
        """Set current SAM hash."""
        self.single_view.current_sam_hash = value

    @property
    def single_view_init_worker(self) -> SingleViewSAMInitWorker | None:
        """Get single-view init worker."""
        return self.single_view.init_worker

    @single_view_init_worker.setter
    def single_view_init_worker(self, value: SingleViewSAMInitWorker | None) -> None:
        """Set single-view init worker."""
        self.single_view.init_worker = value

    @property
    def single_view_model_initializing(self) -> bool:
        """Get model initializing state."""
        return self.single_view.model_initializing

    @single_view_model_initializing.setter
    def single_view_model_initializing(self, value: bool) -> None:
        """Set model initializing state."""
        self.single_view.model_initializing = value

    # ========== Single-View State Mutation ==========

    def mark_dirty(self) -> None:
        """Mark SAM as needing update."""
        self.single_view.mark_dirty()

    def invalidate_hash(self) -> None:
        """Invalidate the current SAM hash."""
        self.single_view.invalidate_hash()

    def start_single_view_initialization(self) -> bool:
        """Start single-view model initialization.

        Returns:
            True if initialization started, False if already initializing
        """
        return self.single_view.start_initialization()

    def ensure_sam_updated(self) -> None:
        """Ensure SAM model is up-to-date (lazy update with threading)."""
        self.single_view.ensure_sam_updated()

    def reset_for_model_switch(self) -> None:
        """Reset SAM state when switching models."""
        self.single_view.reset_for_model_switch()

    def cleanup(self) -> None:
        """Clean up all workers and resources."""
        self.single_view.cleanup()
