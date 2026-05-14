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
from ..hoverable_ellipse_item import HoverableEllipseItem
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
            seg_type = seg.get("type")
            if seg_type in ("Polygon", "Circle") and seg.get("vertices"):
                vertices = seg["vertices"]

                # Skip complex polygons - too many handles is slow and unusable
                if seg_type == "Polygon" and len(vertices) > max_editable_vertices:
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
        """Update the position of a vertex in a polygon or circle segment.

        Args:
            segment_index: Index of the segment
            vertex_index: Index of the vertex in the segment
            new_pos: New position as QPointF
            record_undo: Whether to record for undo
        """
        seg = self.segment_manager.segments[segment_index]
        seg_type = seg.get("type")
        if seg_type == "Polygon":
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
        elif seg_type == "Circle":
            self._update_circle_vertex_pos(
                seg, segment_index, vertex_index, new_pos, record_undo
            )

    def _update_circle_vertex_pos(
        self,
        seg: dict,
        segment_index: int,
        vertex_index: int,
        new_pos: QPointF,
        record_undo: bool,
    ) -> None:
        """Update a Circle segment vertex.

        Vertex 0 (center) drags the radius point along with it so the circle
        translates without resizing. Vertex 1 (radius point) resizes only.
        """
        vertices = seg.get("vertices") or []
        if len(vertices) < 2:
            return

        center = list(vertices[0])
        radius_pt = list(vertices[1])
        old_center = [center[0], center[1]]
        old_radius_pt = [radius_pt[0], radius_pt[1]]

        if vertex_index == 0:
            dx = new_pos.x() - center[0]
            dy = new_pos.y() - center[1]
            new_center = [new_pos.x(), new_pos.y()]
            new_radius_pt = [radius_pt[0] + dx, radius_pt[1] + dy]
        elif vertex_index == 1:
            new_center = center
            new_radius_pt = [new_pos.x(), new_pos.y()]
        else:
            return

        if record_undo:
            self.undo_redo_manager.record_action(
                {
                    "type": "move_circle",
                    "segment_index": segment_index,
                    "old_center": old_center,
                    "old_radius_pt": old_radius_pt,
                    "new_center": new_center,
                    "new_radius_pt": new_radius_pt,
                }
            )

        seg["vertices"] = [new_center, new_radius_pt]

        # When the center moves, sync the radius handle on screen too
        if vertex_index == 0:
            self._sync_partner_handle(segment_index, partner_idx=1, pos=new_radius_pt)

        self.update_polygon_item(segment_index)

    # ========== Multi-View Vertex Updates ==========

    def update_polygon_item(self, segment_index: int) -> None:
        """Efficiently update the visual polygon/circle item for a given segment.

        Args:
            segment_index: Index of the segment to update
        """
        from PyQt6.QtGui import QPolygonF

        seg = self.segment_manager.segments[segment_index]
        seg_type = seg.get("type")
        items = self.segment_items.get(segment_index, [])
        for item in items:
            if seg_type == "Polygon" and isinstance(item, HoverablePolygonItem):
                qpoints = [QPointF(p[0], p[1]) for p in seg["vertices"]]
                item.setPolygon(QPolygonF(qpoints))
                return
            if seg_type == "Circle" and isinstance(item, HoverableEllipseItem):
                rect = HoverableEllipseItem.bounding_rect_from_vertices(seg["vertices"])
                item.setRect(rect)
                return

    def _sync_partner_handle(
        self, segment_index: int, partner_idx: int, pos: list
    ) -> None:
        """Move the partner edit handle to match new vertex position.

        Used when dragging the circle's center handle to keep the radius
        handle pinned to its updated coordinate. Toggling
        ItemSendsGeometryChanges prevents the partner's itemChange from
        re-entering update_vertex_pos during this programmatic setPos.
        """
        from PyQt6.QtWidgets import QGraphicsItem

        flag = QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges
        for h in self.mw.edit_handles:
            if (
                getattr(h, "segment_index", None) == segment_index
                and getattr(h, "vertex_index", None) == partner_idx
            ):
                h.setFlag(flag, False)
                try:
                    h.setPos(QPointF(pos[0], pos[1]))
                finally:
                    h.setFlag(flag, True)
                return
