"""Multi-View Coordinator for managing dual-viewer operations.

This coordinator manages:
- Link state between viewers
- Active viewer tracking
- Coordinated operations (clicks, class creation, saves) when linked
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import QObject, pyqtSignal

if TYPE_CHECKING:
    from ..main_window import MainWindow


class MultiViewCoordinator(QObject):
    """Coordinates operations between two viewers in multi-view mode.

    When linked:
    - Clicks in one viewer generate predictions in both
    - Class creation/rename mirrors to both
    - Spacebar saves predictions to both

    When unlinked:
    - Each viewer operates independently
    """

    # Signals
    link_state_changed = pyqtSignal(bool)  # Emits new link state
    active_viewer_changed = pyqtSignal(int)  # Emits new active viewer index

    def __init__(self, main_window: MainWindow, parent: QObject | None = None):
        """Initialize the multi-view coordinator.

        Args:
            main_window: Parent MainWindow instance
            parent: Optional parent QObject
        """
        super().__init__(parent)
        self.mw = main_window

        # State
        self._is_linked = True  # Default: linked
        self._active_viewer_idx = 0  # Currently active viewer (0 or 1)

        # Per-viewer state tracking for SAM predictions
        self._positive_points: dict[int, list] = {0: [], 1: []}
        self._negative_points: dict[int, list] = {0: [], 1: []}
        self._preview_masks: dict[int, any] = {0: None, 1: None}
        self._preview_items: dict[int, any] = {0: None, 1: None}
        self._point_items: dict[int, list] = {0: [], 1: []}

    # ========== Properties ==========

    @property
    def is_linked(self) -> bool:
        """Check if viewers are linked."""
        return self._is_linked

    @property
    def active_viewer_idx(self) -> int:
        """Get the active viewer index."""
        return self._active_viewer_idx

    # ========== Link State ==========

    def toggle_link(self) -> bool:
        """Toggle the link state.

        Returns:
            New link state (True if now linked, False if unlinked)
        """
        self._is_linked = not self._is_linked
        self.link_state_changed.emit(self._is_linked)
        return self._is_linked

    def set_linked(self, linked: bool) -> None:
        """Set the link state.

        Args:
            linked: True to link viewers, False to unlink
        """
        if self._is_linked != linked:
            self._is_linked = linked
            self.link_state_changed.emit(self._is_linked)

    # ========== Active Viewer ==========

    def set_active_viewer(self, viewer_idx: int) -> None:
        """Set the active viewer.

        Args:
            viewer_idx: Index of viewer to make active (0 or 1)
        """
        if viewer_idx not in (0, 1):
            return

        if self._active_viewer_idx != viewer_idx:
            self._active_viewer_idx = viewer_idx
            self.active_viewer_changed.emit(viewer_idx)

    def get_other_viewer_idx(self) -> int:
        """Get the index of the non-active viewer."""
        return 1 if self._active_viewer_idx == 0 else 0

    # ========== Points State ==========

    def get_positive_points(self, viewer_idx: int) -> list:
        """Get positive points for a viewer."""
        return self._positive_points.get(viewer_idx, [])

    def get_negative_points(self, viewer_idx: int) -> list:
        """Get negative points for a viewer."""
        return self._negative_points.get(viewer_idx, [])

    def add_point(self, viewer_idx: int, point: list, positive: bool = True) -> None:
        """Add a point to a viewer's point list.

        Args:
            viewer_idx: Viewer index (0 or 1)
            point: [x, y] coordinates in SAM space
            positive: True for positive point, False for negative
        """
        if viewer_idx not in (0, 1):
            return

        if positive:
            self._positive_points[viewer_idx].append(point)
        else:
            self._negative_points[viewer_idx].append(point)

    def clear_points(self, viewer_idx: int) -> None:
        """Clear all points for a viewer.

        Args:
            viewer_idx: Viewer index (0 or 1)
        """
        if viewer_idx not in (0, 1):
            return

        self._positive_points[viewer_idx].clear()
        self._negative_points[viewer_idx].clear()

    def clear_all_points(self) -> None:
        """Clear all points for all viewers."""
        self.clear_points(0)
        self.clear_points(1)

    # ========== Preview State ==========

    def set_preview_mask(self, viewer_idx: int, mask) -> None:
        """Set the preview mask for a viewer."""
        if viewer_idx in (0, 1):
            self._preview_masks[viewer_idx] = mask

    def get_preview_mask(self, viewer_idx: int):
        """Get the preview mask for a viewer."""
        return self._preview_masks.get(viewer_idx)

    def set_preview_item(self, viewer_idx: int, item) -> None:
        """Set the preview graphics item for a viewer."""
        if viewer_idx in (0, 1):
            self._preview_items[viewer_idx] = item

    def get_preview_item(self, viewer_idx: int):
        """Get the preview graphics item for a viewer."""
        return self._preview_items.get(viewer_idx)

    def get_point_items(self, viewer_idx: int) -> list:
        """Get the point graphics items for a viewer."""
        return self._point_items.get(viewer_idx, [])

    def add_point_item(self, viewer_idx: int, item) -> None:
        """Add a point graphics item to a viewer."""
        if viewer_idx in (0, 1):
            self._point_items[viewer_idx].append(item)

    def clear_point_items(self, viewer_idx: int) -> None:
        """Clear all point graphics items for a viewer."""
        if viewer_idx in (0, 1):
            self._point_items[viewer_idx].clear()

    def clear_all_preview_state(self) -> None:
        """Clear all preview state for all viewers."""
        for i in (0, 1):
            self._preview_masks[i] = None
            self._preview_items[i] = None
            self._point_items[i].clear()
            self._positive_points[i].clear()
            self._negative_points[i].clear()

    # ========== Linked Operations ==========

    def get_target_viewers(self) -> list[int]:
        """Get the list of viewer indices that should be affected by an operation.

        Returns:
            [active_viewer_idx] if unlinked, [0, 1] if linked
        """
        if self._is_linked:
            return [0, 1]
        else:
            return [self._active_viewer_idx]

    def should_mirror_operation(self) -> bool:
        """Check if operations should be mirrored to both viewers.

        Returns:
            True if linked and should mirror, False otherwise
        """
        return self._is_linked
