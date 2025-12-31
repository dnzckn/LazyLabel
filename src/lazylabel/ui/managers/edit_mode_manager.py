"""Edit mode manager for vertex editing operations.

This manager handles:
- Display of editable vertex handles
- Single-view vertex position updates
- Multi-view vertex position updates with syncing
- Polygon item visual updates
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import QPointF

from ..editable_vertex import EditableVertexItem
from ..hoverable_polygon_item import HoverablePolygonItem

if TYPE_CHECKING:
    from PyQt6.QtWidgets import QGraphicsItem

    from ...core.segment_manager import SegmentManager
    from ...core.undo_redo_manager import UndoRedoManager
    from ..main_window import MainWindow
    from ..photo_viewer import PhotoViewer
    from ..right_panel import RightPanel


class EditModeManager:
    """Manages edit mode operations for vertex editing.

    This class consolidates all edit mode handling including:
    - Display of draggable vertex handles
    - Single-view vertex updates
    - Multi-view vertex updates with syncing
    - Polygon visual updates
    """

    def __init__(self, main_window: MainWindow):
        """Initialize the edit mode manager.

        Args:
            main_window: Parent MainWindow instance
        """
        self.mw = main_window

    # ========== Property Accessors ==========

    @property
    def viewer(self) -> PhotoViewer:
        """Get the active viewer (supports sequence mode)."""
        return self.mw.active_viewer

    @property
    def segment_manager(self) -> SegmentManager:
        """Get segment manager from main window."""
        return self.mw.segment_manager

    @property
    def undo_redo_manager(self) -> UndoRedoManager:
        """Get undo/redo manager from main window."""
        return self.mw.undo_redo_manager

    @property
    def right_panel(self) -> RightPanel:
        """Get right panel from main window."""
        return self.mw.right_panel

    @property
    def mode(self) -> str:
        """Get current mode from main window."""
        return self.mw.mode

    @property
    def segment_items(self) -> dict[int, list[QGraphicsItem]]:
        """Get segment items from main window (handles sequence mode)."""
        # In sequence mode, segment items are tracked in _sequence_segment_items
        if (
            hasattr(self.mw, "_current_view_mode")
            and self.mw._current_view_mode == "sequence"
            and hasattr(self.mw, "_sequence_segment_items")
        ):
            return self.mw._sequence_segment_items
        return self.mw.segment_items

    @property
    def edit_handles(self) -> list[EditableVertexItem]:
        """Get edit handles from main window."""
        return self.mw.edit_handles

    # ========== Edit Handle Display ==========

    def display_edit_handles(self) -> None:
        """Display draggable vertex handles for selected polygons in edit mode."""
        self.clear_edit_handles()
        if self.mode != "edit":
            return

        selected_indices = self.right_panel.get_selected_segment_indices()
        handle_radius = self.mw.point_radius
        handle_diam = handle_radius * 2
        max_editable_vertices = 200  # Performance limit for edit handles

        for seg_idx in selected_indices:
            seg = self.segment_manager.segments[seg_idx]
            if seg.get("type") == "Polygon" and seg.get("vertices"):
                vertices = seg["vertices"]

                # Skip complex polygons - too many handles is slow and unusable
                if len(vertices) > max_editable_vertices:
                    self.mw._show_warning_notification(
                        f"Polygon has {len(vertices)} vertices (max {max_editable_vertices} for editing). "
                        "Use lower resolution setting when creating polygons."
                    )
                    continue

                for v_idx, pt_list in enumerate(vertices):
                    pt = QPointF(pt_list[0], pt_list[1])  # Convert list to QPointF
                    handle = EditableVertexItem(
                        self.mw,
                        seg_idx,
                        v_idx,
                        -handle_radius,
                        -handle_radius,
                        handle_diam,
                        handle_diam,
                    )
                    handle.setPos(pt)  # Use setPos to handle zoom correctly
                    handle.setZValue(200)  # Ensure handles are on top
                    # Make sure the handle can receive mouse events
                    handle.setAcceptHoverEvents(True)
                    self.viewer.scene().addItem(handle)
                    self.mw.edit_handles.append(handle)

    def clear_edit_handles(self) -> None:
        """Remove all editable vertex handles from the scene."""
        if hasattr(self.mw, "edit_handles"):
            for h in self.mw.edit_handles:
                if h.scene():
                    self.viewer.scene().removeItem(h)
            self.mw.edit_handles = []

    # ========== Single-View Vertex Updates ==========

    def update_vertex_pos(
        self,
        segment_index: int,
        vertex_index: int,
        new_pos: QPointF,
        record_undo: bool = True,
    ) -> None:
        """Update the position of a vertex in a polygon segment.

        Args:
            segment_index: Index of the segment
            vertex_index: Index of the vertex in the segment
            new_pos: New position as QPointF
            record_undo: Whether to record for undo
        """
        seg = self.segment_manager.segments[segment_index]
        if seg.get("type") == "Polygon":
            old_pos = seg["vertices"][vertex_index]
            if record_undo:
                self.undo_redo_manager.record_action(
                    {
                        "type": "move_vertex",
                        "segment_index": segment_index,
                        "vertex_index": vertex_index,
                        "old_pos": [old_pos[0], old_pos[1]],  # Store as list
                        "new_pos": [new_pos.x(), new_pos.y()],  # Store as list
                    }
                )
            seg["vertices"][vertex_index] = [
                new_pos.x(),
                new_pos.y(),  # Store as list
            ]
            self.update_polygon_item(segment_index)
            # Note: Highlight update is done on mouse release to avoid performance issues
            # during continuous drag with high-detail polygons

    # ========== Multi-View Vertex Updates ==========

    def update_polygon_item(self, segment_index: int) -> None:
        """Efficiently update the visual polygon item for a given segment.

        Args:
            segment_index: Index of the segment to update
        """
        from PyQt6.QtGui import QPolygonF

        items = self.segment_items.get(segment_index, [])
        for item in items:
            if isinstance(item, HoverablePolygonItem):
                # Convert stored list of lists back to QPointF objects
                qpoints = [
                    QPointF(p[0], p[1])
                    for p in self.segment_manager.segments[segment_index]["vertices"]
                ]
                item.setPolygon(QPolygonF(qpoints))
                return
