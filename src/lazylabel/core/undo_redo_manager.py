"""Undo/Redo action history manager for LazyLabel."""

from typing import TYPE_CHECKING, Any

from PyQt6.QtCore import QObject, QPointF, pyqtSignal

if TYPE_CHECKING:
    from lazylabel.ui.main_window import MainWindow


class UndoRedoManager(QObject):
    """Manages undo/redo action history and execution.

    This class handles recording actions and executing undo/redo operations.
    It maintains references to MainWindow for UI updates after undo/redo.
    """

    # Signals emitted after undo/redo operations
    undo_performed = pyqtSignal(dict)  # Emits the action that was undone
    redo_performed = pyqtSignal(dict)  # Emits the action that was redone

    def __init__(self, main_window: "MainWindow"):
        super().__init__()
        self.main_window = main_window
        self.action_history: list[dict[str, Any]] = []
        self.redo_history: list[dict[str, Any]] = []

    def record_action(self, action: dict[str, Any]) -> None:
        """Record an action to the history.

        Args:
            action: Dictionary describing the action with at least a 'type' key.
        """
        self.action_history.append(action)
        # Clear redo history when a new action is recorded
        self.redo_history.clear()

    def clear_history(self) -> None:
        """Clear both undo and redo history."""
        self.action_history.clear()
        self.redo_history.clear()

    def can_undo(self) -> bool:
        """Check if there are actions to undo."""
        return len(self.action_history) > 0

    def can_redo(self) -> bool:
        """Check if there are actions to redo."""
        return len(self.redo_history) > 0

    def undo(self) -> None:
        """Undo the last action recorded in the history."""
        mw = self.main_window  # Shorthand for readability

        if not self.action_history:
            mw._show_notification("Nothing to undo.")
            return

        last_action = self.action_history.pop()
        action_type = last_action.get("type")

        # Save to redo history before undoing
        self.redo_history.append(last_action)

        if action_type == "add_segment":
            self._undo_add_segment(last_action)
        elif action_type == "add_point":
            self._undo_add_point(last_action)
        elif action_type == "add_polygon_point":
            self._undo_add_polygon_point(last_action)
        elif action_type == "move_polygon":
            self._undo_move_polygon(last_action)
        elif action_type == "move_vertex":
            self._undo_move_vertex(last_action)
        elif action_type == "multi_view_polygon_point":
            self._undo_multi_view_polygon_point(last_action)
        elif action_type == "erase_segments":
            self._undo_erase_segments(last_action)
        elif action_type == "delete_segments":
            self._undo_delete_segments(last_action)
        else:
            mw._show_warning_notification(
                f"Undo for action '{action_type}' not implemented."
            )
            # Remove from redo history if we couldn't undo it
            self.redo_history.pop()

        self.undo_performed.emit(last_action)

    def redo(self) -> None:
        """Redo the last undone action."""
        mw = self.main_window  # Shorthand for readability

        if not self.redo_history:
            mw._show_notification("Nothing to redo.")
            return

        last_action = self.redo_history.pop()
        action_type = last_action.get("type")

        # Add back to action history for potential future undo
        self.action_history.append(last_action)

        if action_type == "add_segment":
            self._redo_add_segment(last_action)
        elif action_type == "add_point":
            self._redo_add_point(last_action)
        elif action_type == "add_polygon_point":
            self._redo_add_polygon_point(last_action)
        elif action_type == "move_polygon":
            self._redo_move_polygon(last_action)
        elif action_type == "move_vertex":
            self._redo_move_vertex(last_action)
        elif action_type == "multi_view_polygon_point":
            self._redo_multi_view_polygon_point(last_action)
        elif action_type == "erase_segments":
            self._redo_erase_segments(last_action)
        elif action_type == "delete_segments":
            self._redo_delete_segments(last_action)
        else:
            mw._show_warning_notification(
                f"Redo for action '{action_type}' not implemented."
            )
            # Remove from action history if we couldn't redo it
            self.action_history.pop()

        self.redo_performed.emit(last_action)

    # --- Undo helpers ---

    def _undo_add_segment(self, action: dict) -> None:
        """Undo adding a segment."""
        mw = self.main_window
        segment_index = action.get("segment_index")
        viewer_mode = action.get("viewer_mode", "single")
        viewer_index = action.get("viewer_index")

        if viewer_mode == "multi" and viewer_index is not None:
            # Multi-view mode
            if hasattr(mw, "multi_view_segment_managers"):
                segment_manager = mw.multi_view_segment_managers[viewer_index]
                if segment_index is not None and 0 <= segment_index < len(
                    segment_manager.segments
                ):
                    action["segment_data"] = segment_manager.segments[
                        segment_index
                    ].copy()
                    segment_manager.delete_segments([segment_index])
                    mw._update_multi_view_segment_table(viewer_index)
                    mw._display_multi_view_segments(viewer_index)
                    mw._show_notification("Undid: Add Segment")
        else:
            # Single-view mode
            if segment_index is not None and 0 <= segment_index < len(
                mw.segment_manager.segments
            ):
                # Store the segment data for redo
                action["segment_data"] = mw.segment_manager.segments[
                    segment_index
                ].copy()

                # Remove the segment that was added
                mw.segment_manager.delete_segments([segment_index])
                mw.right_panel.clear_selections()

                # Use incremental update with cache shifting for performance
                mw._update_lists_incremental(removed_indices=[segment_index])
                mw._show_notification("Undid: Add Segment")

    def _undo_add_point(self, action: dict) -> None:
        """Undo adding a point."""
        point_type = action.get("point_type")
        point_item = action.get("point_item")
        viewer_mode = action.get("viewer_mode", "single")

        if viewer_mode == "multi":
            self._undo_add_point_multi_view(action, point_type, point_item)
        else:
            self._undo_add_point_single_view(point_type, point_item)

    def _undo_add_point_single_view(self, point_type: str, point_item: Any) -> None:
        """Undo adding a point in single view."""
        mw = self.main_window
        point_list = (
            mw.positive_points if point_type == "positive" else mw.negative_points
        )
        if point_list:
            point_list.pop()
            if point_item in mw.point_items:
                mw.point_items.remove(point_item)
                mw.viewer.scene().removeItem(point_item)
            mw._update_segmentation()
            mw._show_notification("Undid: Add Point")

    def _undo_add_point_multi_view(
        self, action: dict, point_type: str, point_item: Any
    ) -> None:
        """Undo adding a point in multi-view mode."""
        mw = self.main_window
        viewer_idx = action.get("viewer_index", 0)

        if not hasattr(mw, "multi_view_positive_points"):
            mw._show_warning_notification("Cannot undo: Not in multi-view mode")
            return

        point_list = (
            mw.multi_view_positive_points[viewer_idx]
            if point_type == "positive"
            else mw.multi_view_negative_points[viewer_idx]
        )

        if point_list:
            point_list.pop()
            # Remove point item from scene
            if (
                hasattr(mw, "multi_view_point_items")
                and viewer_idx in mw.multi_view_point_items
            ):
                items = mw.multi_view_point_items[viewer_idx]
                if point_item in items:
                    items.remove(point_item)
                    if point_item.scene():
                        point_item.scene().removeItem(point_item)

            # Update preview
            if hasattr(mw, "_update_multi_view_ai_preview"):
                mw._update_multi_view_ai_preview(viewer_idx)
            mw._show_notification("Undid: Add Point")

    def _undo_add_polygon_point(self, action: dict) -> None:
        """Undo adding a polygon point."""
        mw = self.main_window
        dot_item = action.get("dot_item")

        if mw.polygon_points:
            mw.polygon_points.pop()
            if dot_item in mw.polygon_preview_items:
                mw.polygon_preview_items.remove(dot_item)
                mw.viewer.scene().removeItem(dot_item)
            mw._draw_polygon_preview()
        mw._show_notification("Undid: Add Polygon Point")

    def _undo_multi_view_polygon_point(self, action: dict) -> None:
        """Undo adding a polygon point in multi-view mode."""
        mw = self.main_window
        viewer_idx = action.get("viewer_index", 0)
        dot_item = action.get("dot_item")

        if not hasattr(mw, "multi_view_polygon_points"):
            mw._show_warning_notification("Cannot undo: Not in multi-view mode")
            return

        points = mw.multi_view_polygon_points[viewer_idx]
        if points:
            points.pop()

            # Remove dot item from scene
            if (
                hasattr(mw, "multi_view_polygon_preview_items")
                and viewer_idx in mw.multi_view_polygon_preview_items
            ):
                items = mw.multi_view_polygon_preview_items[viewer_idx]
                if dot_item in items:
                    items.remove(dot_item)
                    if dot_item.scene():
                        dot_item.scene().removeItem(dot_item)

            # Update polygon preview
            if hasattr(mw, "_draw_multi_view_polygon_preview"):
                mw._draw_multi_view_polygon_preview(viewer_idx)
            mw._show_notification("Undid: Add Polygon Point")

    def _undo_move_polygon(self, action: dict) -> None:
        """Undo moving a polygon."""
        mw = self.main_window
        initial_vertices = action.get("initial_vertices")

        for i, vertices in initial_vertices.items():
            mw.segment_manager.segments[i]["vertices"] = [
                [p[0], p[1]] for p in vertices
            ]
            mw._update_polygon_item(i)
        mw._display_edit_handles()
        mw._highlight_selected_segments()
        mw._show_notification("Undid: Move Polygon")

    def _undo_move_vertex(self, action: dict) -> None:
        """Undo moving a vertex."""
        mw = self.main_window
        segment_index = action.get("segment_index")
        vertex_index = action.get("vertex_index")
        old_pos = action.get("old_pos")
        viewer_mode = action.get("viewer_mode", "single")
        viewer_index = action.get("viewer_index")

        if segment_index is None or vertex_index is None or old_pos is None:
            mw._show_warning_notification("Cannot undo: Missing vertex data")
            self.redo_history.pop()
            return

        if segment_index >= len(mw.segment_manager.segments):
            mw._show_warning_notification("Cannot undo: Segment no longer exists")
            self.redo_history.pop()
            return

        if viewer_mode == "multi" and viewer_index is not None:
            # Multi-view vertex undo
            seg = mw.segment_manager.segments[segment_index]
            if "views" in seg and viewer_index in seg["views"]:
                seg["views"][viewer_index]["vertices"][vertex_index] = old_pos
            else:
                seg["vertices"][vertex_index] = old_pos

            mw._update_multi_view_polygon_item(segment_index, viewer_index)
            mw._display_multi_view_edit_handles()
            mw._highlight_multi_view_selected_segments()
        else:
            # Single-view vertex undo
            mw.segment_manager.segments[segment_index]["vertices"][vertex_index] = (
                old_pos
            )
            mw._update_polygon_item(segment_index)
            mw._display_edit_handles()
            mw._highlight_selected_segments()

        mw._show_notification("Undid: Move Vertex")

    def _redo_add_segment(self, action: dict) -> None:
        """Redo adding a segment."""
        mw = self.main_window
        viewer_mode = action.get("viewer_mode", "single")
        viewer_index = action.get("viewer_index")

        if "segment_data" not in action:
            mw._show_warning_notification("Cannot redo: Missing segment data")
            self.action_history.pop()
            return

        segment_data = action["segment_data"]

        if viewer_mode == "multi" and viewer_index is not None:
            # Multi-view mode
            if hasattr(mw, "multi_view_segment_managers"):
                segment_manager = mw.multi_view_segment_managers[viewer_index]
                segment_manager.add_segment(segment_data)
                mw._update_multi_view_segment_table(viewer_index)
                mw._display_multi_view_segments(viewer_index)
                mw._show_notification("Redid: Add Segment")
        else:
            # Single-view mode
            mw.segment_manager.add_segment(segment_data)
            mw._update_lists_incremental(
                added_segment_index=len(mw.segment_manager.segments) - 1
            )
            mw._show_notification("Redid: Add Segment")

    def _redo_add_point(self, action: dict) -> None:
        """Redo adding a point."""
        mw = self.main_window
        point_type = action.get("point_type")
        point_coords = action.get("point_coords")
        viewer_mode = action.get("viewer_mode", "single")

        if not point_coords:
            mw._show_warning_notification("Cannot redo: Missing point coordinates")
            self.action_history.pop()
            return

        pos = QPointF(point_coords[0], point_coords[1])

        if viewer_mode == "multi":
            self._redo_add_point_multi_view(action, point_type, pos)
        else:
            mw._add_point(pos, positive=(point_type == "positive"))
            mw._update_segmentation()
            mw._show_notification("Redid: Add Point")

    def _redo_add_point_multi_view(
        self, action: dict, point_type: str, pos: QPointF
    ) -> None:
        """Redo adding a point in multi-view mode."""
        mw = self.main_window
        viewer_idx = action.get("viewer_index", 0)

        if not hasattr(mw, "_add_multi_view_point"):
            mw._show_warning_notification("Cannot redo: Not in multi-view mode")
            self.action_history.pop()
            return

        positive = point_type == "positive"
        mw._add_multi_view_point(viewer_idx, pos, positive)
        mw._show_notification("Redid: Add Point")

    def _redo_add_polygon_point(self, action: dict) -> None:
        """Redo adding a polygon point."""
        mw = self.main_window
        point_coords = action.get("point_coords")

        if point_coords:
            mw._handle_polygon_click(point_coords)
            mw._show_notification("Redid: Add Polygon Point")
        else:
            mw._show_warning_notification(
                "Cannot redo: Missing polygon point coordinates"
            )
            self.action_history.pop()

    def _redo_multi_view_polygon_point(self, action: dict) -> None:
        """Redo adding a polygon point in multi-view mode."""
        mw = self.main_window
        viewer_idx = action.get("viewer_index", 0)
        point_coords = action.get("point_coords")

        if not point_coords:
            mw._show_warning_notification(
                "Cannot redo: Missing polygon point coordinates"
            )
            self.action_history.pop()
            return

        if not hasattr(mw, "_handle_multi_view_polygon_click"):
            mw._show_warning_notification("Cannot redo: Not in multi-view mode")
            self.action_history.pop()
            return

        mw._handle_multi_view_polygon_click(viewer_idx, point_coords)
        mw._show_notification("Redid: Add Polygon Point")

    def _redo_move_polygon(self, action: dict) -> None:
        """Redo moving a polygon."""
        mw = self.main_window
        final_vertices = action.get("final_vertices")

        if final_vertices:
            for i, vertices in final_vertices.items():
                if i < len(mw.segment_manager.segments):
                    mw.segment_manager.segments[i]["vertices"] = [
                        [p[0], p[1]] for p in vertices
                    ]
                    mw._update_polygon_item(i)
            mw._display_edit_handles()
            mw._highlight_selected_segments()
            mw._show_notification("Redid: Move Polygon")
        else:
            mw._show_warning_notification("Cannot redo: Missing final vertices")
            self.action_history.pop()

    def _redo_move_vertex(self, action: dict) -> None:
        """Redo moving a vertex."""
        mw = self.main_window
        segment_index = action.get("segment_index")
        vertex_index = action.get("vertex_index")
        new_pos = action.get("new_pos")
        viewer_mode = action.get("viewer_mode", "single")
        viewer_index = action.get("viewer_index")

        if segment_index is None or vertex_index is None or new_pos is None:
            mw._show_warning_notification("Cannot redo: Missing vertex data")
            self.action_history.pop()
            return

        if segment_index >= len(mw.segment_manager.segments):
            mw._show_warning_notification("Cannot redo: Segment no longer exists")
            self.action_history.pop()
            return

        if viewer_mode == "multi" and viewer_index is not None:
            # Multi-view vertex redo
            seg = mw.segment_manager.segments[segment_index]
            if "views" in seg and viewer_index in seg["views"]:
                seg["views"][viewer_index]["vertices"][vertex_index] = new_pos
            else:
                seg["vertices"][vertex_index] = new_pos

            mw._update_multi_view_polygon_item(segment_index, viewer_index)
            mw._display_multi_view_edit_handles()
            mw._highlight_multi_view_selected_segments()
        else:
            # Single-view vertex redo
            mw.segment_manager.segments[segment_index]["vertices"][vertex_index] = (
                new_pos
            )
            mw._update_polygon_item(segment_index)
            mw._display_edit_handles()
            mw._highlight_selected_segments()

        mw._show_notification("Redid: Move Vertex")

    # --- Erase/Delete Segments ---

    def _undo_erase_segments(self, action: dict) -> None:
        """Undo erasing segments (restore removed segments)."""
        mw = self.main_window
        removed_segments = action.get("removed_segments", [])
        viewer_mode = action.get("viewer_mode", "single")
        viewer_index = action.get("viewer_index")

        if not removed_segments:
            mw._show_warning_notification("Cannot undo: No segment data")
            self.redo_history.pop()
            return

        if viewer_mode == "multi" and viewer_index is not None:
            # Multi-view: restore to specific viewer's segment manager
            if hasattr(mw, "multi_view_segment_managers"):
                segment_manager = mw.multi_view_segment_managers[viewer_index]
                for seg_data in removed_segments:
                    segment_manager.add_segment(seg_data)
                mw._update_multi_view_segment_table(viewer_index)
                mw._display_multi_view_segments(viewer_index)
        else:
            # Single-view: restore to main segment manager
            for seg_data in removed_segments:
                mw.segment_manager.add_segment(seg_data)
            mw._update_all_lists()

        mw._show_notification(f"Undid: Erase {len(removed_segments)} segment(s)")

    def _redo_erase_segments(self, action: dict) -> None:
        """Redo erasing segments (remove them again)."""
        mw = self.main_window
        removed_segments = action.get("removed_segments", [])
        viewer_mode = action.get("viewer_mode", "single")
        viewer_index = action.get("viewer_index")

        if not removed_segments:
            mw._show_warning_notification("Cannot redo: No segment data")
            self.action_history.pop()
            return

        # Get indices to delete (last N segments that were re-added during undo)
        if viewer_mode == "multi" and viewer_index is not None:
            if hasattr(mw, "multi_view_segment_managers"):
                segment_manager = mw.multi_view_segment_managers[viewer_index]
                num_segs = len(segment_manager.segments)
                indices = list(range(num_segs - len(removed_segments), num_segs))
                segment_manager.delete_segments(indices)
                mw._update_multi_view_segment_table(viewer_index)
                mw._display_multi_view_segments(viewer_index)
        else:
            num_segs = len(mw.segment_manager.segments)
            indices = list(range(num_segs - len(removed_segments), num_segs))
            mw.segment_manager.delete_segments(indices)
            mw._update_all_lists()

        mw._show_notification(f"Redid: Erase {len(removed_segments)} segment(s)")

    def _undo_delete_segments(self, action: dict) -> None:
        """Undo deleting segments (restore them)."""
        mw = self.main_window
        deleted_segments = action.get("deleted_segments", [])
        viewer_mode = action.get("viewer_mode", "single")
        viewer_index = action.get("viewer_index")

        if not deleted_segments:
            mw._show_warning_notification("Cannot undo: No segment data")
            self.redo_history.pop()
            return

        if viewer_mode == "multi" and viewer_index is not None:
            if hasattr(mw, "multi_view_segment_managers"):
                segment_manager = mw.multi_view_segment_managers[viewer_index]
                for seg_data in deleted_segments:
                    segment_manager.add_segment(seg_data)
                mw._update_multi_view_segment_table(viewer_index)
                mw._display_multi_view_segments(viewer_index)
        else:
            for seg_data in deleted_segments:
                mw.segment_manager.add_segment(seg_data)
            mw._update_all_lists()

        mw._show_notification(f"Undid: Delete {len(deleted_segments)} segment(s)")

    def _redo_delete_segments(self, action: dict) -> None:
        """Redo deleting segments (delete them again)."""
        mw = self.main_window
        deleted_segments = action.get("deleted_segments", [])
        viewer_mode = action.get("viewer_mode", "single")
        viewer_index = action.get("viewer_index")

        if not deleted_segments:
            mw._show_warning_notification("Cannot redo: No segment data")
            self.action_history.pop()
            return

        if viewer_mode == "multi" and viewer_index is not None:
            if hasattr(mw, "multi_view_segment_managers"):
                segment_manager = mw.multi_view_segment_managers[viewer_index]
                num_segs = len(segment_manager.segments)
                indices = list(range(num_segs - len(deleted_segments), num_segs))
                segment_manager.delete_segments(indices)
                mw._update_multi_view_segment_table(viewer_index)
                mw._display_multi_view_segments(viewer_index)
        else:
            num_segs = len(mw.segment_manager.segments)
            indices = list(range(num_segs - len(deleted_segments), num_segs))
            mw.segment_manager.delete_segments(indices)
            mw._update_all_lists()

        mw._show_notification(f"Redid: Delete {len(deleted_segments)} segment(s)")
