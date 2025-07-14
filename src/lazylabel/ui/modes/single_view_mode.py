"""Single view mode handler."""

from PyQt6.QtCore import QPointF, Qt
from PyQt6.QtGui import QBrush, QColor, QPen, QPolygonF
from PyQt6.QtWidgets import QGraphicsEllipseItem

from ...utils import mask_to_pixmap
from ..hoverable_pixelmap_item import HoverablePixmapItem
from ..hoverable_polygon_item import HoverablePolygonItem
from .base_mode import BaseModeHandler


class SingleViewModeHandler(BaseModeHandler):
    """Handler for single view mode operations."""

    def handle_ai_click(self, pos, event):
        """Handle AI mode click in single view."""
        # Implementation moved from main_window._add_point
        positive = event.button() == Qt.MouseButton.LeftButton

        # Check if SAM model is updating
        if self.main_window.sam_is_updating:
            self.main_window._show_warning_notification(
                "AI model is updating, please wait..."
            )
            return

        # Ensure SAM model is updated
        self.main_window._ensure_sam_updated()

        # Check again if model is now updating
        if self.main_window.sam_is_updating:
            self.main_window._show_warning_notification(
                "AI model is loading, please wait..."
            )
            return

        # Transform coordinates and add point
        sam_x, sam_y = self.main_window._transform_display_coords_to_sam_coords(pos)

        point_list = (
            self.main_window.positive_points
            if positive
            else self.main_window.negative_points
        )
        point_list.append([sam_x, sam_y])

        # Add visual point
        point_color = (
            QColor(Qt.GlobalColor.green) if positive else QColor(Qt.GlobalColor.red)
        )
        point_color.setAlpha(150)
        point_diameter = self.main_window.point_radius * 2

        point_item = QGraphicsEllipseItem(
            pos.x() - self.main_window.point_radius,
            pos.y() - self.main_window.point_radius,
            point_diameter,
            point_diameter,
        )
        point_item.setBrush(QBrush(point_color))
        point_item.setPen(QPen(Qt.PenStyle.NoPen))
        self.main_window.viewer.scene().addItem(point_item)
        self.main_window.point_items.append(point_item)

        # Record the action for undo
        self.main_window.action_history.append(
            {
                "type": "add_point",
                "point_type": "positive" if positive else "negative",
                "point_coords": [int(pos.x()), int(pos.y())],
                "sam_coords": [sam_x, sam_y],
                "point_item": point_item,
                "viewer_mode": "single",
            }
        )
        # Clear redo history when a new action is performed
        self.main_window.redo_history.clear()

        # Generate prediction
        self.main_window._update_segmentation()

    def handle_polygon_click(self, pos):
        """Handle polygon mode click in single view."""
        # Check if clicking near first point to close polygon
        if self.main_window.polygon_points and len(self.main_window.polygon_points) > 2:
            first_point = self.main_window.polygon_points[0]
            distance_squared = (pos.x() - first_point.x()) ** 2 + (
                pos.y() - first_point.y()
            ) ** 2
            if distance_squared < self.main_window.polygon_join_threshold**2:
                self._finalize_polygon()
                return

        # Add point to polygon
        self.main_window.polygon_points.append(pos)

        # Add visual point
        point_item = QGraphicsEllipseItem(pos.x() - 3, pos.y() - 3, 6, 6)
        point_item.setBrush(QBrush(QColor(0, 255, 255)))  # Cyan
        point_item.setPen(QPen(Qt.PenStyle.NoPen))
        self.main_window.viewer.scene().addItem(point_item)
        self.main_window.polygon_preview_items.append(point_item)

    def handle_bbox_start(self, pos):
        """Handle bbox mode start in single view."""
        from PyQt6.QtWidgets import QGraphicsRectItem

        self.main_window.drag_start_pos = pos

        # Create rubber band rectangle
        self.main_window.rubber_band_rect = QGraphicsRectItem()
        self.main_window.rubber_band_rect.setPen(
            QPen(QColor(255, 0, 0), 2, Qt.PenStyle.DashLine)
        )
        self.main_window.viewer.scene().addItem(self.main_window.rubber_band_rect)

    def handle_bbox_drag(self, pos):
        """Handle bbox mode drag in single view."""
        if (
            hasattr(self.main_window, "drag_start_pos")
            and self.main_window.drag_start_pos
            and hasattr(self.main_window, "rubber_band_rect")
            and self.main_window.rubber_band_rect
        ):
            from PyQt6.QtCore import QRectF

            # Update rubber band rectangle
            rect = QRectF(self.main_window.drag_start_pos, pos).normalized()
            self.main_window.rubber_band_rect.setRect(rect)

    def handle_bbox_complete(self, pos):
        """Handle bbox mode completion in single view."""
        # Implementation from main_window._scene_mouse_release bbox handling
        if (
            hasattr(self.main_window, "rubber_band_rect")
            and self.main_window.rubber_band_rect
        ):
            # Remove rubber band
            self.main_window.viewer.scene().removeItem(
                self.main_window.rubber_band_rect
            )
            self.main_window.rubber_band_rect = None

            # Create polygon from bbox
            start_pos = self.main_window.drag_start_pos
            from PyQt6.QtCore import QRectF

            rect = QRectF(start_pos, pos).normalized()
            if rect.width() > 10 and rect.height() > 10:
                # Convert to polygon
                vertices = [
                    [rect.left(), rect.top()],
                    [rect.right(), rect.top()],
                    [rect.right(), rect.bottom()],
                    [rect.left(), rect.bottom()],
                ]

                new_segment = {
                    "vertices": vertices,
                    "type": "Polygon",
                    "mask": None,
                }

                self.segment_manager.add_segment(new_segment)

                # Record action for undo
                self.main_window.action_history.append(
                    {
                        "type": "add_segment",
                        "segment_index": len(self.segment_manager.segments) - 1,
                    }
                )
                self.main_window.redo_history.clear()

                self.main_window._update_all_lists()

    def display_all_segments(self):
        """Display all segments in single view."""
        # Clear existing segment items
        for _i, items in self.main_window.segment_items.items():
            for item in items:
                if item.scene():
                    self.main_window.viewer.scene().removeItem(item)
        self.main_window.segment_items.clear()
        self.main_window._clear_edit_handles()

        # Display segments from segment manager
        for i, segment in enumerate(self.segment_manager.segments):
            self.main_window.segment_items[i] = []
            class_id = segment.get("class_id")
            base_color = self.main_window._get_color_for_class(class_id)

            if segment["type"] == "Polygon" and segment.get("vertices"):
                # Convert stored list of lists back to QPointF objects
                qpoints = [QPointF(p[0], p[1]) for p in segment["vertices"]]

                poly_item = HoverablePolygonItem(QPolygonF(qpoints))
                default_brush = QBrush(
                    QColor(base_color.red(), base_color.green(), base_color.blue(), 70)
                )
                hover_brush = QBrush(
                    QColor(base_color.red(), base_color.green(), base_color.blue(), 170)
                )
                poly_item.set_brushes(default_brush, hover_brush)
                poly_item.setPen(QPen(Qt.GlobalColor.transparent))
                self.main_window.viewer.scene().addItem(poly_item)
                self.main_window.segment_items[i].append(poly_item)

            elif segment.get("mask") is not None:
                default_pixmap = mask_to_pixmap(
                    segment["mask"], base_color.getRgb()[:3], alpha=70
                )
                hover_pixmap = mask_to_pixmap(
                    segment["mask"], base_color.getRgb()[:3], alpha=170
                )
                pixmap_item = HoverablePixmapItem()
                pixmap_item.set_pixmaps(default_pixmap, hover_pixmap)
                self.main_window.viewer.scene().addItem(pixmap_item)
                pixmap_item.setZValue(i + 1)
                self.main_window.segment_items[i].append(pixmap_item)

    def clear_all_points(self):
        """Clear all temporary points in single view."""
        if (
            hasattr(self.main_window, "rubber_band_line")
            and self.main_window.rubber_band_line
        ):
            self.main_window.viewer.scene().removeItem(
                self.main_window.rubber_band_line
            )
            self.main_window.rubber_band_line = None

        self.main_window.positive_points.clear()
        self.main_window.negative_points.clear()

        for item in self.main_window.point_items:
            self.main_window.viewer.scene().removeItem(item)
        self.main_window.point_items.clear()

        self.main_window.polygon_points.clear()
        for item in self.main_window.polygon_preview_items:
            self.main_window.viewer.scene().removeItem(item)
        self.main_window.polygon_preview_items.clear()

        # Clear polygon lasso lines
        if (
            hasattr(self.main_window, "polygon_lasso_lines")
            and self.main_window.polygon_lasso_lines
        ):
            for line in self.main_window.polygon_lasso_lines:
                if line.scene():
                    self.main_window.viewer.scene().removeItem(line)
            self.main_window.polygon_lasso_lines.clear()

        if (
            hasattr(self.main_window, "preview_mask_item")
            and self.main_window.preview_mask_item
        ):
            self.main_window.viewer.scene().removeItem(
                self.main_window.preview_mask_item
            )
            self.main_window.preview_mask_item = None

    def _finalize_polygon(self):
        """Finalize polygon drawing in single view."""
        if len(self.main_window.polygon_points) < 3:
            return

        # Clear lasso lines when finalizing
        if (
            hasattr(self.main_window, "polygon_lasso_lines")
            and self.main_window.polygon_lasso_lines
        ):
            for line in self.main_window.polygon_lasso_lines:
                if line.scene():
                    self.main_window.viewer.scene().removeItem(line)
            self.main_window.polygon_lasso_lines.clear()

        new_segment = {
            "vertices": [[p.x(), p.y()] for p in self.main_window.polygon_points],
            "type": "Polygon",
            "mask": None,
        }

        self.segment_manager.add_segment(new_segment)

        # Record action for undo
        self.main_window.action_history.append(
            {
                "type": "add_segment",
                "segment_index": len(self.segment_manager.segments) - 1,
            }
        )
        self.main_window.redo_history.clear()

        self.main_window.polygon_points.clear()
        self.clear_all_points()
        self.main_window._update_all_lists()
