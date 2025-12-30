"""Viewport manager for zoom, pan, and fit operations."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..main_window import MainWindow
    from ..photo_viewer import PhotoViewer


class ViewportManager:
    """Manages viewport operations (zoom, pan, fit) for single and multi-view modes.

    This manager provides a unified interface for viewport control that works
    seamlessly in both single-view and multi-view modes.
    """

    def __init__(self, main_window: MainWindow):
        self.main_window = main_window

    def zoom_in(self) -> None:
        """Zoom in by increasing annotation size."""
        mw = self.main_window
        current_val = mw.control_panel.get_annotation_size()
        mw.control_panel.set_annotation_size(min(current_val + 1, 50))

    def zoom_out(self) -> None:
        """Zoom out by decreasing annotation size."""
        mw = self.main_window
        current_val = mw.control_panel.get_annotation_size()
        mw.control_panel.set_annotation_size(max(current_val - 1, 1))

    def pan(self, direction: str) -> None:
        """Pan the viewport in the specified direction.

        Works in both single and multi-view mode. In multi-view mode,
        all viewers are panned together.

        Args:
            direction: One of "up", "down", "left", "right"
        """
        mw = self.main_window

        if mw.view_mode == "single" and hasattr(mw, "viewer"):
            self._pan_viewer(mw.viewer, direction)
        elif mw.view_mode == "multi" and hasattr(mw, "multi_view_viewers"):
            for viewer in mw.multi_view_viewers:
                if viewer:
                    self._pan_viewer(viewer, direction)

    def _pan_viewer(self, viewer: PhotoViewer, direction: str) -> None:
        """Pan a specific viewer in the given direction.

        Args:
            viewer: The PhotoViewer to pan
            direction: One of "up", "down", "left", "right"
        """
        mw = self.main_window
        amount = int(viewer.height() * 0.1 * mw.pan_multiplier)

        if direction == "up":
            viewer.verticalScrollBar().setValue(
                viewer.verticalScrollBar().value() - amount
            )
        elif direction == "down":
            viewer.verticalScrollBar().setValue(
                viewer.verticalScrollBar().value() + amount
            )
        elif direction == "left":
            amount = int(viewer.width() * 0.1 * mw.pan_multiplier)
            viewer.horizontalScrollBar().setValue(
                viewer.horizontalScrollBar().value() - amount
            )
        elif direction == "right":
            amount = int(viewer.width() * 0.1 * mw.pan_multiplier)
            viewer.horizontalScrollBar().setValue(
                viewer.horizontalScrollBar().value() + amount
            )

    def fit_view(self) -> None:
        """Fit the view to show the entire image.

        Works in both single and multi-view mode. In multi-view mode,
        all viewers are fitted.
        """
        mw = self.main_window

        if mw.view_mode == "single":
            if hasattr(mw, "viewer"):
                mw.viewer.fitInView()
        elif mw.view_mode == "multi" and hasattr(mw, "multi_view_viewers"):
            for viewer in mw.multi_view_viewers:
                if viewer:
                    viewer.fitInView()
