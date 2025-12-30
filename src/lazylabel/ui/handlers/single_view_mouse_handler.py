"""Single-view mouse event handler.

This handler manages mouse events for single-view mode, including:
- Point-based SAM interactions
- Polygon drawing
- Bounding box creation
- Selection mode
- Edit mode (polygon dragging)
- Crop mode
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import QPointF, QRectF, Qt
from PyQt6.QtGui import QPen
from PyQt6.QtWidgets import QApplication, QGraphicsRectItem

from ...utils.logger import logger
from ..editable_vertex import EditableVertexItem

if TYPE_CHECKING:
    from PyQt6.QtWidgets import QGraphicsSceneMouseEvent

    from ..main_window import MainWindow


class SingleViewMouseHandler:
    """Handles mouse events for single-view mode.

    This class encapsulates the mouse event handling logic that was previously
    in main_window.py, providing cleaner separation of concerns.
    """

    def __init__(self, main_window: MainWindow):
        """Initialize the single-view mouse handler.

        Args:
            main_window: Parent MainWindow instance
        """
        self.mw = main_window

    # ========== Property Accessors ==========

    @property
    def viewer(self):
        """Get the viewer from main window."""
        return self.mw.viewer

    @property
    def mode(self) -> str:
        """Get current mode from main window."""
        return self.mw.mode

    @property
    def segment_manager(self):
        """Get segment manager from main window."""
        return self.mw.segment_manager

    # ========== Mouse Event Handlers ==========

    def handle_mouse_press(self, event: QGraphicsSceneMouseEvent) -> None:
        """Handle mouse press events in the scene.

        Args:
            event: The mouse press event
        """
        # Map scene coordinates to the view so items() works correctly
        view_pos = self.viewer.mapFromScene(event.scenePos())
        items_at_pos = self.viewer.items(view_pos)
        is_handle_click = any(
            isinstance(item, EditableVertexItem) for item in items_at_pos
        )

        # Allow vertex handles to process their own mouse events
        if is_handle_click:
            self.mw._original_mouse_press(event)
            return

        if self.mode == "edit" and event.button() == Qt.MouseButton.LeftButton:
            pos = event.scenePos()
            if self.viewer._pixmap_item.pixmap().rect().contains(pos.toPoint()):
                self.mw.is_dragging_polygon = True
                self.mw.drag_start_pos = pos
                selected_indices = self.mw.right_panel.get_selected_segment_indices()
                self.mw.drag_initial_vertices = {
                    i: [
                        [p.x(), p.y()] if isinstance(p, QPointF) else p
                        for p in self.segment_manager.segments[i]["vertices"]
                    ]
                    for i in selected_indices
                    if self.segment_manager.segments[i].get("type") == "Polygon"
                }
                event.accept()
                return

        # Call the original scene handler
        self.mw._original_mouse_press(event)

        if self.mw.is_dragging_polygon:
            return

        pos = event.scenePos()
        if (
            self.viewer._pixmap_item.pixmap().isNull()
            or not self.viewer._pixmap_item.pixmap().rect().contains(pos.toPoint())
        ):
            return

        self._handle_mode_specific_press(event, pos)

    def _handle_mode_specific_press(
        self, event: QGraphicsSceneMouseEvent, pos: QPointF
    ) -> None:
        """Handle mode-specific mouse press logic.

        Args:
            event: The mouse event
            pos: Scene position of the click
        """
        if self.mode == "pan":
            self.viewer.set_cursor(Qt.CursorShape.ClosedHandCursor)
        elif self.mode == "sam_points":
            if event.button() == Qt.MouseButton.LeftButton:
                self.mw._add_point(pos, positive=True)
            elif event.button() == Qt.MouseButton.RightButton:
                self.mw._add_point(pos, positive=False)
        elif self.mode == "ai":
            if event.button() == Qt.MouseButton.LeftButton:
                # AI mode: single click adds point, drag creates bounding box
                self.mw.ai_click_start_pos = pos
                self.mw.ai_click_time = (
                    event.timestamp() if hasattr(event, "timestamp") else 0
                )
            elif event.button() == Qt.MouseButton.RightButton:
                # Right-click adds negative point in AI mode
                self.mw._add_point(pos, positive=False, update_segmentation=True)
        elif self.mode == "polygon":
            if event.button() == Qt.MouseButton.LeftButton:
                self.mw._handle_polygon_click(pos)
        elif self.mode == "bbox":
            if event.button() == Qt.MouseButton.LeftButton:
                self.mw.drag_start_pos = pos
                self.mw.rubber_band_rect = QGraphicsRectItem()
                self.mw.rubber_band_rect.setPen(
                    QPen(
                        Qt.GlobalColor.red,
                        self.mw.line_thickness,
                        Qt.PenStyle.DashLine,
                    )
                )
                self.viewer.scene().addItem(self.mw.rubber_band_rect)
        elif self.mode == "selection" and event.button() == Qt.MouseButton.LeftButton:
            self.mw._handle_segment_selection_click(pos)
        elif self.mode == "crop" and event.button() == Qt.MouseButton.LeftButton:
            self.mw.crop_manager.crop_start_pos = pos
            self.mw.crop_manager.crop_rect_item = QGraphicsRectItem()
            self.mw.crop_manager.crop_rect_item.setPen(
                QPen(Qt.GlobalColor.blue, 2, Qt.PenStyle.DashLine)
            )
            self.viewer.scene().addItem(self.mw.crop_manager.crop_rect_item)

    def handle_mouse_move(self, event: QGraphicsSceneMouseEvent) -> None:
        """Handle mouse move events in the scene.

        Args:
            event: The mouse move event
        """
        if self.mode == "edit" and self.mw.is_dragging_polygon:
            delta = event.scenePos() - self.mw.drag_start_pos
            for i, initial_verts in self.mw.drag_initial_vertices.items():
                self.segment_manager.segments[i]["vertices"] = [
                    [
                        (QPointF(p[0], p[1]) + delta).x(),
                        (QPointF(p[0], p[1]) + delta).y(),
                    ]
                    for p in initial_verts
                ]
                self.mw._update_polygon_item(i)
            self.mw._display_edit_handles()
            self.mw._highlight_selected_segments()
            event.accept()
            return

        self.mw._original_mouse_move(event)

        # Handle bbox mode drag
        if self.mode == "bbox" and self.mw.rubber_band_rect and self.mw.drag_start_pos:
            current_pos = event.scenePos()
            rect = QRectF(self.mw.drag_start_pos, current_pos).normalized()
            self.mw.rubber_band_rect.setRect(rect)
            event.accept()
            return

        # Handle AI mode drag
        if (
            self.mode == "ai"
            and hasattr(self.mw, "ai_click_start_pos")
            and self.mw.ai_click_start_pos
        ):
            current_pos = event.scenePos()
            drag_distance = (
                (current_pos.x() - self.mw.ai_click_start_pos.x()) ** 2
                + (current_pos.y() - self.mw.ai_click_start_pos.y()) ** 2
            ) ** 0.5

            if drag_distance > 5:  # Minimum drag distance
                if (
                    not hasattr(self.mw, "ai_rubber_band_rect")
                    or not self.mw.ai_rubber_band_rect
                ):
                    self.mw.ai_rubber_band_rect = QGraphicsRectItem()
                    self.mw.ai_rubber_band_rect.setPen(
                        QPen(
                            Qt.GlobalColor.cyan,
                            self.mw.line_thickness,
                            Qt.PenStyle.DashLine,
                        )
                    )
                    self.viewer.scene().addItem(self.mw.ai_rubber_band_rect)

                rect = QRectF(self.mw.ai_click_start_pos, current_pos).normalized()
                self.mw.ai_rubber_band_rect.setRect(rect)
                event.accept()
                return

        # Handle crop mode drag
        if (
            self.mode == "crop"
            and self.mw.crop_manager.crop_rect_item
            and self.mw.crop_manager.crop_start_pos
        ):
            current_pos = event.scenePos()
            rect = QRectF(self.mw.crop_manager.crop_start_pos, current_pos).normalized()
            self.mw.crop_manager.crop_rect_item.setRect(rect)
            event.accept()
            return

    def handle_mouse_release(self, event: QGraphicsSceneMouseEvent) -> None:
        """Handle mouse release events in the scene.

        Args:
            event: The mouse release event
        """
        # Delegate to multi-view handler if in multi-view mode
        if self.mw.view_mode == "multi":
            for i, viewer in enumerate(self.mw.multi_view_viewers):
                if (
                    hasattr(viewer, "scene")
                    and viewer.scene() == event.widget().scene()
                ):
                    self.mw._multi_view_mouse_release(event, i)
                    return
            self.mw._multi_view_mouse_release(event, 0)
            return

        # Handle edit mode polygon drag release
        if self.mode == "edit" and self.mw.is_dragging_polygon:
            self._handle_edit_drag_release(event)
            return

        if self.mode == "pan":
            self.viewer.set_cursor(Qt.CursorShape.OpenHandCursor)
        elif (
            self._handle_ai_release(event)
            or self._handle_bbox_release(event)
            or self._handle_crop_release(event)
        ):
            return

        self.mw._original_mouse_release(event)

    def _handle_edit_drag_release(self, event: QGraphicsSceneMouseEvent) -> None:
        """Handle polygon drag release in edit mode."""
        final_vertices = {
            i: [
                [p.x(), p.y()] if isinstance(p, QPointF) else p
                for p in self.segment_manager.segments[i]["vertices"]
            ]
            for i in self.mw.drag_initial_vertices
        }
        self.mw.undo_redo_manager.record_action(
            {
                "type": "move_polygon",
                "initial_vertices": {
                    k: list(v) for k, v in self.mw.drag_initial_vertices.items()
                },
                "final_vertices": final_vertices,
            }
        )
        self.mw.is_dragging_polygon = False
        self.mw.drag_initial_vertices.clear()
        event.accept()

    def _handle_ai_release(self, event: QGraphicsSceneMouseEvent) -> bool:
        """Handle AI mode mouse release.

        Returns:
            True if event was handled, False otherwise
        """
        if not (
            self.mode == "ai"
            and hasattr(self.mw, "ai_click_start_pos")
            and self.mw.ai_click_start_pos
        ):
            return False

        current_pos = event.scenePos()
        drag_distance = (
            (current_pos.x() - self.mw.ai_click_start_pos.x()) ** 2
            + (current_pos.y() - self.mw.ai_click_start_pos.y()) ** 2
        ) ** 0.5

        if (
            hasattr(self.mw, "ai_rubber_band_rect")
            and self.mw.ai_rubber_band_rect
            and drag_distance > 5
        ):
            # This was a drag - use SAM bounding box prediction
            rect = self.mw.ai_rubber_band_rect.rect()
            self.viewer.scene().removeItem(self.mw.ai_rubber_band_rect)
            self.mw.ai_rubber_band_rect = None
            self.mw.ai_click_start_pos = None

            if rect.width() > 10 and rect.height() > 10:
                self.mw._handle_ai_bounding_box(rect)
        else:
            # This was a click - add positive point
            self.mw.ai_click_start_pos = None
            if hasattr(self.mw, "ai_rubber_band_rect") and self.mw.ai_rubber_band_rect:
                self.viewer.scene().removeItem(self.mw.ai_rubber_band_rect)
                self.mw.ai_rubber_band_rect = None

            self.mw._add_point(current_pos, positive=True, update_segmentation=True)

        event.accept()
        return True

    def _handle_bbox_release(self, event: QGraphicsSceneMouseEvent) -> bool:
        """Handle bbox mode mouse release.

        Returns:
            True if event was handled, False otherwise
        """
        if not (self.mode == "bbox" and self.mw.rubber_band_rect):
            return False

        self.viewer.scene().removeItem(self.mw.rubber_band_rect)
        rect = self.mw.rubber_band_rect.rect()
        self.mw.rubber_band_rect = None
        self.mw.drag_start_pos = None

        if rect.width() >= 2 and rect.height() >= 2:
            modifiers = QApplication.keyboardModifiers()
            shift_pressed = bool(modifiers & Qt.KeyboardModifier.ShiftModifier)

            if shift_pressed:
                logger.debug("Shift+bbox release - activating erase mode")

            # Convert QRectF to polygon vertices
            from PyQt6.QtGui import QPolygonF

            polygon = QPolygonF()
            polygon.append(rect.topLeft())
            polygon.append(rect.topRight())
            polygon.append(rect.bottomRight())
            polygon.append(rect.bottomLeft())

            polygon_vertices = [QPointF(p.x(), p.y()) for p in list(polygon)]

            if shift_pressed:
                # Erase overlapping segments
                image_height = self.viewer._pixmap_item.pixmap().height()
                image_width = self.viewer._pixmap_item.pixmap().width()
                image_size = (image_height, image_width)
                removed_indices, removed_segments_data = (
                    self.segment_manager.erase_segments_with_shape(
                        polygon_vertices, image_size
                    )
                )

                if removed_indices:
                    self.mw.undo_redo_manager.record_action(
                        {
                            "type": "erase_segments",
                            "removed_segments": removed_segments_data,
                        }
                    )
                    self.mw._show_notification(
                        f"Applied eraser to {len(removed_indices)} segment(s)"
                    )
                else:
                    self.mw._show_notification("No segments to erase")
            else:
                # Create new bbox segment
                new_segment = {
                    "vertices": [[p.x(), p.y()] for p in polygon_vertices],
                    "type": "Polygon",
                    "mask": None,
                }
                self.segment_manager.add_segment(new_segment)
                self.mw.undo_redo_manager.record_action(
                    {
                        "type": "add_segment",
                        "segment_index": len(self.segment_manager.segments) - 1,
                    }
                )

            # Update display
            if shift_pressed:
                self.mw._update_all_lists()
            else:
                self.mw._update_lists_incremental(
                    added_segment_index=len(self.segment_manager.segments) - 1
                )

        event.accept()
        return True

    def _handle_crop_release(self, event: QGraphicsSceneMouseEvent) -> bool:
        """Handle crop mode mouse release.

        Returns:
            True if event was handled, False otherwise
        """
        if not (self.mode == "crop" and self.mw.crop_manager.crop_rect_item):
            return False

        rect = self.mw.crop_manager.crop_rect_item.rect()
        self.viewer.scene().removeItem(self.mw.crop_manager.crop_rect_item)
        self.mw.crop_manager.crop_rect_item = None
        self.mw.crop_manager.crop_start_pos = None

        if rect.width() > 5 and rect.height() > 5:
            x1, y1 = int(rect.left()), int(rect.top())
            x2, y2 = int(rect.right()), int(rect.bottom())
            self.mw.crop_manager.apply_crop_coordinates(x1, y1, x2, y2)
            self.mw.crop_manager.crop_mode = False
            self.mw._set_mode("sam_points")

        event.accept()
        return True
