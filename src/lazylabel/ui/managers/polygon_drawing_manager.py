"""Polygon drawing manager for handling polygon creation and editing.

This manager handles:
- Single-view polygon drawing
- Multi-view polygon drawing with mirroring
- Polygon preview rendering
- Polygon finalization (create or erase)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QBrush, QColor, QPen, QPolygonF
from PyQt6.QtWidgets import (
    QApplication,
    QGraphicsEllipseItem,
    QGraphicsLineItem,
    QGraphicsPolygonItem,
)

from ...utils.logger import logger

if TYPE_CHECKING:
    from PyQt6.QtCore import QPointF

    from ..main_window import MainWindow


class PolygonDrawingManager:
    """Manages polygon drawing operations for single and multi-view modes.

    This class consolidates all polygon drawing handling including:
    - Point addition and tracking
    - Preview rendering
    - Polygon finalization
    - Erase mode handling
    """

    def __init__(self, main_window: MainWindow):
        """Initialize the polygon drawing manager.

        Args:
            main_window: Parent MainWindow instance
        """
        self.mw = main_window

    # ========== Property Accessors ==========

    @property
    def viewer(self):
        """Get viewer from main window."""
        return self.mw.viewer

    @property
    def segment_manager(self):
        """Get segment manager from main window."""
        return self.mw.segment_manager

    @property
    def undo_redo_manager(self):
        """Get undo/redo manager from main window."""
        return self.mw.undo_redo_manager

    # ========== Single View Polygon Drawing ==========

    def handle_polygon_click(self, pos: QPointF) -> None:
        """Handle polygon drawing clicks.

        Args:
            pos: Position of the click
        """
        # Check if shift is pressed for erase functionality
        modifiers = QApplication.keyboardModifiers()
        shift_pressed = bool(modifiers & Qt.KeyboardModifier.ShiftModifier)

        # Check if clicking near the first point to close polygon
        if self.mw.polygon_points and len(self.mw.polygon_points) > 2:
            first_point = self.mw.polygon_points[0]
            distance_squared = (pos.x() - first_point.x()) ** 2 + (
                pos.y() - first_point.y()
            ) ** 2
            if distance_squared < self.mw.polygon_join_threshold**2:
                if shift_pressed:
                    logger.debug(
                        "Shift+click polygon completion - activating erase mode"
                    )
                self.finalize_polygon(erase_mode=shift_pressed)
                return

        # Add new point to polygon
        self.mw.polygon_points.append(pos)

        # Create visual point
        point_diameter = self.mw.point_radius * 2
        point_color = QColor(Qt.GlobalColor.blue)
        point_color.setAlpha(150)
        dot = QGraphicsEllipseItem(
            pos.x() - self.mw.point_radius,
            pos.y() - self.mw.point_radius,
            point_diameter,
            point_diameter,
        )
        dot.setBrush(QBrush(point_color))
        dot.setPen(QPen(Qt.GlobalColor.transparent))
        self.viewer.scene().addItem(dot)
        self.mw.polygon_preview_items.append(dot)

        # Update polygon preview
        self.draw_polygon_preview()

        # Record the action for undo
        self.undo_redo_manager.record_action(
            {
                "type": "add_polygon_point",
                "point_coords": pos,
                "dot_item": dot,
            }
        )

    def draw_polygon_preview(self) -> None:
        """Draw polygon preview lines and fill."""
        scene = self.viewer.scene()

        # Batch scene operations for better performance
        self.viewer.setUpdatesEnabled(False)
        scene.blockSignals(True)

        try:
            # Remove old preview lines and polygons (keep dots)
            for item in self.mw.polygon_preview_items[:]:
                if not isinstance(item, QGraphicsEllipseItem):
                    if item.scene():
                        scene.removeItem(item)
                    self.mw.polygon_preview_items.remove(item)

            if len(self.mw.polygon_points) > 2:
                # Create preview polygon fill
                preview_poly = QGraphicsPolygonItem(QPolygonF(self.mw.polygon_points))
                preview_poly.setBrush(QBrush(QColor(0, 255, 255, 100)))
                preview_poly.setPen(QPen(Qt.GlobalColor.transparent))
                scene.addItem(preview_poly)
                self.mw.polygon_preview_items.append(preview_poly)

            if len(self.mw.polygon_points) > 1:
                # Create preview lines between points
                line_color = QColor(Qt.GlobalColor.cyan)
                line_color.setAlpha(150)
                for i in range(len(self.mw.polygon_points) - 1):
                    line = QGraphicsLineItem(
                        self.mw.polygon_points[i].x(),
                        self.mw.polygon_points[i].y(),
                        self.mw.polygon_points[i + 1].x(),
                        self.mw.polygon_points[i + 1].y(),
                    )
                    line.setPen(QPen(line_color, self.mw.line_thickness))
                    scene.addItem(line)
                    self.mw.polygon_preview_items.append(line)
        finally:
            # Re-enable updates and signals
            scene.blockSignals(False)
            self.viewer.setUpdatesEnabled(True)
            self.viewer.viewport().update()

    def finalize_polygon(self, erase_mode: bool = False) -> None:
        """Finalize polygon drawing.

        Args:
            erase_mode: If True, erase overlapping segments instead of creating
        """
        if len(self.mw.polygon_points) < 3:
            return

        if erase_mode:
            # Erase overlapping segments using polygon vertices
            image_height = self.viewer._pixmap_item.pixmap().height()
            image_width = self.viewer._pixmap_item.pixmap().width()
            image_size = (image_height, image_width)
            removed_indices, removed_segments_data = (
                self.segment_manager.erase_segments_with_shape(
                    self.mw.polygon_points, image_size
                )
            )

            if removed_indices:
                # Record the action for undo
                self.undo_redo_manager.record_action(
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
            # Create new polygon segment (normal mode)
            new_segment = {
                "vertices": [[p.x(), p.y()] for p in self.mw.polygon_points],
                "type": "Polygon",
                "mask": None,
            }
            self.segment_manager.add_segment(new_segment)
            # Record the action for undo
            self.undo_redo_manager.record_action(
                {
                    "type": "add_segment",
                    "segment_index": len(self.segment_manager.segments) - 1,
                }
            )

        self.mw.polygon_points.clear()
        self.mw.clear_all_points()

        # Use appropriate update method based on operation type
        if erase_mode:
            self.mw._update_all_lists()  # Erase modifies masks, need full refresh
        else:
            self.mw._update_lists_incremental(
                added_segment_index=len(self.segment_manager.segments) - 1
            )

    # ========== Multi-View Polygon Drawing ==========
