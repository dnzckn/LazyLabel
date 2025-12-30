"""Mode manager for UI mode switching and cursor management."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import Qt

if TYPE_CHECKING:
    from ..main_window import MainWindow


class ModeManager:
    """Manages UI mode switching and related state.

    This manager handles:
    - Mode switching (AI, polygon, bbox, selection, pan, edit)
    - Cursor management per mode
    - Drag mode configuration
    - Mode toggle logic
    """

    def __init__(self, main_window: MainWindow):
        self.main_window = main_window

    def set_sam_mode(self) -> None:
        """Set mode to AI (combines SAM points and bounding box)."""
        # Allow entering AI mode even without a loaded model (lazy loading)
        self.set_mode("ai")

    def set_polygon_mode(self) -> None:
        """Set polygon drawing mode."""
        self.set_mode("polygon")

    def set_bbox_mode(self) -> None:
        """Set bounding box drawing mode."""
        self.set_mode("bbox")

    def toggle_selection_mode(self) -> None:
        """Toggle selection mode."""
        self.toggle_mode("selection")

    def toggle_pan_mode(self) -> None:
        """Toggle pan mode."""
        self.toggle_mode("pan")

    def toggle_edit_mode(self) -> None:
        """Toggle edit mode."""
        self.toggle_mode("edit")

    def handle_edit_mode_request(self) -> None:
        """Handle edit mode request with validation."""
        mw = self.main_window

        if mw.view_mode == "multi":
            # Multi-view: check multi-view segment managers and tables
            has_selected_polygon = False
            for viewer_idx in range(len(mw.multi_view_segment_managers)):
                segment_manager = mw.multi_view_segment_managers[viewer_idx]
                table = mw.multi_view_segment_tables[viewer_idx]

                # Get selected indices from table
                selected_rows = {item.row() for item in table.selectedItems()}
                for row in selected_rows:
                    item = table.item(row, 0)
                    if item:
                        try:
                            seg_idx = int(item.text())
                            if seg_idx < len(segment_manager.segments):
                                seg = segment_manager.segments[seg_idx]
                                if seg.get("type") == "Polygon":
                                    has_selected_polygon = True
                                    break
                        except ValueError:
                            continue
                if has_selected_polygon:
                    break

            if not has_selected_polygon:
                mw._show_error_notification("No polygons selected!")
                return
        else:
            # Single-view: check main segment manager
            polygon_segments = [
                seg
                for seg in mw.segment_manager.segments
                if seg.get("type") == "Polygon"
            ]

            if not polygon_segments:
                mw._show_error_notification("No polygons selected!")
                return

            # Check if any polygons are actually selected
            selected_indices = mw.right_panel.get_selected_segment_indices()
            selected_polygons = [
                i
                for i in selected_indices
                if mw.segment_manager.segments[i].get("type") == "Polygon"
            ]

            if not selected_polygons:
                mw._show_error_notification("No polygons selected!")
                return

        # Enter edit mode if validation passes
        self.toggle_edit_mode()

    def set_mode(self, mode_name: str, is_toggle: bool = False) -> None:
        """Set the current mode.

        Args:
            mode_name: Name of the mode to set
            is_toggle: Whether this is a toggle operation
        """
        mw = self.main_window

        if not is_toggle and mw.mode not in ["selection", "edit"]:
            mw.previous_mode = mw.mode

        mw.mode = mode_name
        mw.control_panel.set_mode_text(mode_name)
        mw.clear_all_points()

        # Set cursor based on mode
        cursor_map = {
            "sam_points": Qt.CursorShape.CrossCursor,
            "ai": Qt.CursorShape.CrossCursor,
            "polygon": Qt.CursorShape.CrossCursor,
            "bbox": Qt.CursorShape.CrossCursor,
            "selection": Qt.CursorShape.ArrowCursor,
            "edit": Qt.CursorShape.SizeAllCursor,
            "pan": Qt.CursorShape.OpenHandCursor,
        }
        mw.viewer.set_cursor(cursor_map.get(mw.mode, Qt.CursorShape.ArrowCursor))

        # Set drag mode
        drag_mode = (
            mw.viewer.DragMode.ScrollHandDrag
            if mw.mode == "pan"
            else mw.viewer.DragMode.NoDrag
        )
        mw.viewer.setDragMode(drag_mode)

        # Also set drag mode for multi-view viewers
        if mw.view_mode == "multi" and hasattr(mw, "multi_view_viewers"):
            for viewer in mw.multi_view_viewers:
                if viewer:
                    viewer.setDragMode(drag_mode)

        # Update highlights and handles based on the new mode
        mw._highlight_selected_segments()
        if mode_name == "edit":
            if mw.view_mode == "multi":
                mw._display_multi_view_edit_handles()
            else:
                mw._display_edit_handles()
        else:
            if mw.view_mode == "multi":
                mw._clear_multi_view_edit_handles()
            else:
                mw._clear_edit_handles()

    def toggle_mode(self, new_mode: str) -> None:
        """Toggle between modes.

        Args:
            new_mode: The mode to toggle to/from
        """
        mw = self.main_window

        if mw.mode == new_mode:
            self.set_mode(mw.previous_mode, is_toggle=True)
        else:
            if mw.mode not in ["selection", "edit"]:
                mw.previous_mode = mw.mode
            self.set_mode(new_mode, is_toggle=True)
