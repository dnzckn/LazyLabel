"""Drawing state manager for centralized state management.

This manager owns all drawing-related state for single-view mode,
providing a single source of truth for:
- Point items and coordinates (SAM points)
- Polygon drawing state
- Bounding box state
- AI mode state (click positions, rubber bands)
- Preview masks
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import QPointF
from PyQt6.QtWidgets import QGraphicsEllipseItem, QGraphicsRectItem

if TYPE_CHECKING:
    from PyQt6.QtWidgets import QGraphicsItem, QGraphicsPixmapItem, QGraphicsScene


class DrawingStateManager:
    """Manages all drawing-related state for single-view mode.

    This class centralizes state that was previously scattered across
    MainWindow, providing:
    - Clear ownership of drawing state
    - Validation and enforcement
    - Methods for state manipulation
    """

    def __init__(self):
        """Initialize the drawing state manager."""
        # SAM point state
        self._point_items: list[QGraphicsEllipseItem] = []
        self._positive_points: list[QPointF] = []
        self._negative_points: list[QPointF] = []

        # Polygon drawing state
        self._polygon_points: list[QPointF] = []
        self._polygon_preview_items: list[QGraphicsItem] = []
        self._rubber_band_line: QGraphicsItem | None = None

        # Bounding box state
        self._rubber_band_rect: QGraphicsRectItem | None = None
        self._drag_start_pos: QPointF | None = None

        # AI mode state
        self._ai_click_start_pos: QPointF | None = None
        self._ai_click_time: int = 0
        self._ai_rubber_band_rect: QGraphicsRectItem | None = None

        # Preview state
        self._preview_mask_item: QGraphicsPixmapItem | None = None
        self._ai_bbox_preview_mask = None
        self._ai_bbox_preview_rect = None

        # Edit mode state
        self._is_dragging_polygon: bool = False
        self._drag_initial_vertices: dict = {}

    # ========== SAM Point Properties ==========

    @property
    def point_items(self) -> list[QGraphicsEllipseItem]:
        """Get the list of point graphics items."""
        return self._point_items

    @property
    def positive_points(self) -> list[QPointF]:
        """Get the list of positive point coordinates."""
        return self._positive_points

    @property
    def negative_points(self) -> list[QPointF]:
        """Get the list of negative point coordinates."""
        return self._negative_points

    def add_point_item(self, item: QGraphicsEllipseItem) -> None:
        """Add a point graphics item."""
        self._point_items.append(item)

    def add_positive_point(self, pos: QPointF) -> None:
        """Add a positive point coordinate."""
        self._positive_points.append(pos)

    def add_negative_point(self, pos: QPointF) -> None:
        """Add a negative point coordinate."""
        self._negative_points.append(pos)

    def clear_points(self, scene: QGraphicsScene | None = None) -> None:
        """Clear all points, optionally removing from scene."""
        if scene:
            for item in self._point_items:
                if item.scene():
                    scene.removeItem(item)
        self._point_items.clear()
        self._positive_points.clear()
        self._negative_points.clear()

    def has_points(self) -> bool:
        """Check if there are any points."""
        return bool(self._positive_points or self._negative_points)

    # ========== Polygon Properties ==========

    @property
    def polygon_points(self) -> list[QPointF]:
        """Get the polygon points."""
        return self._polygon_points

    @property
    def polygon_preview_items(self) -> list[QGraphicsItem]:
        """Get the polygon preview items."""
        return self._polygon_preview_items

    @property
    def rubber_band_line(self):
        """Get the rubber band line item."""
        return self._rubber_band_line

    @rubber_band_line.setter
    def rubber_band_line(self, value) -> None:
        """Set the rubber band line item."""
        self._rubber_band_line = value

    def add_polygon_point(self, pos: QPointF) -> None:
        """Add a polygon point."""
        self._polygon_points.append(pos)

    def add_polygon_preview_item(self, item: QGraphicsItem) -> None:
        """Add a polygon preview item."""
        self._polygon_preview_items.append(item)

    def clear_polygon(self, scene: QGraphicsScene | None = None) -> None:
        """Clear polygon state, optionally removing items from scene."""
        if scene:
            for item in self._polygon_preview_items:
                if item.scene():
                    scene.removeItem(item)
            if self._rubber_band_line and self._rubber_band_line.scene():
                scene.removeItem(self._rubber_band_line)
        self._polygon_points.clear()
        self._polygon_preview_items.clear()
        self._rubber_band_line = None

    def has_polygon_points(self) -> bool:
        """Check if there are polygon points."""
        return len(self._polygon_points) > 0

    def can_complete_polygon(self) -> bool:
        """Check if polygon can be completed (at least 3 points)."""
        return len(self._polygon_points) >= 3

    # ========== Bounding Box Properties ==========

    @property
    def rubber_band_rect(self) -> QGraphicsRectItem | None:
        """Get the bounding box rubber band rect."""
        return self._rubber_band_rect

    @rubber_band_rect.setter
    def rubber_band_rect(self, value: QGraphicsRectItem | None) -> None:
        """Set the bounding box rubber band rect."""
        self._rubber_band_rect = value

    @property
    def drag_start_pos(self) -> QPointF | None:
        """Get the drag start position."""
        return self._drag_start_pos

    @drag_start_pos.setter
    def drag_start_pos(self, value: QPointF | None) -> None:
        """Set the drag start position."""
        self._drag_start_pos = value

    def clear_bbox(self, scene: QGraphicsScene | None = None) -> None:
        """Clear bounding box state."""
        if scene and self._rubber_band_rect and self._rubber_band_rect.scene():
            scene.removeItem(self._rubber_band_rect)
        self._rubber_band_rect = None
        self._drag_start_pos = None

    # ========== AI Mode Properties ==========

    @property
    def ai_click_start_pos(self) -> QPointF | None:
        """Get AI click start position."""
        return self._ai_click_start_pos

    @ai_click_start_pos.setter
    def ai_click_start_pos(self, value: QPointF | None) -> None:
        """Set AI click start position."""
        self._ai_click_start_pos = value

    @property
    def ai_click_time(self) -> int:
        """Get AI click timestamp."""
        return self._ai_click_time

    @ai_click_time.setter
    def ai_click_time(self, value: int) -> None:
        """Set AI click timestamp."""
        self._ai_click_time = value

    @property
    def ai_rubber_band_rect(self) -> QGraphicsRectItem | None:
        """Get AI rubber band rect."""
        return self._ai_rubber_band_rect

    @ai_rubber_band_rect.setter
    def ai_rubber_band_rect(self, value: QGraphicsRectItem | None) -> None:
        """Set AI rubber band rect."""
        self._ai_rubber_band_rect = value

    def clear_ai_state(self, scene: QGraphicsScene | None = None) -> None:
        """Clear AI mode state."""
        if scene and self._ai_rubber_band_rect and self._ai_rubber_band_rect.scene():
            scene.removeItem(self._ai_rubber_band_rect)
        self._ai_click_start_pos = None
        self._ai_click_time = 0
        self._ai_rubber_band_rect = None

    def is_ai_dragging(self) -> bool:
        """Check if currently in AI drag mode."""
        return self._ai_click_start_pos is not None

    # ========== Preview Properties ==========

    @property
    def preview_mask_item(self):
        """Get the preview mask item."""
        return self._preview_mask_item

    @preview_mask_item.setter
    def preview_mask_item(self, value) -> None:
        """Set the preview mask item."""
        self._preview_mask_item = value

    @property
    def ai_bbox_preview_mask(self):
        """Get AI bbox preview mask."""
        return self._ai_bbox_preview_mask

    @ai_bbox_preview_mask.setter
    def ai_bbox_preview_mask(self, value) -> None:
        """Set AI bbox preview mask."""
        self._ai_bbox_preview_mask = value

    @property
    def ai_bbox_preview_rect(self):
        """Get AI bbox preview rect."""
        return self._ai_bbox_preview_rect

    @ai_bbox_preview_rect.setter
    def ai_bbox_preview_rect(self, value) -> None:
        """Set AI bbox preview rect."""
        self._ai_bbox_preview_rect = value

    def clear_preview(self, scene: QGraphicsScene | None = None) -> None:
        """Clear preview state."""
        if scene and self._preview_mask_item and self._preview_mask_item.scene():
            scene.removeItem(self._preview_mask_item)
        self._preview_mask_item = None
        self._ai_bbox_preview_mask = None
        self._ai_bbox_preview_rect = None

    # ========== Edit Mode Properties ==========

    @property
    def is_dragging_polygon(self) -> bool:
        """Check if currently dragging a polygon."""
        return self._is_dragging_polygon

    @is_dragging_polygon.setter
    def is_dragging_polygon(self, value: bool) -> None:
        """Set polygon dragging state."""
        self._is_dragging_polygon = value

    @property
    def drag_initial_vertices(self) -> dict:
        """Get initial vertices for drag operation."""
        return self._drag_initial_vertices

    def start_polygon_drag(self, start_pos: QPointF, initial_vertices: dict) -> None:
        """Start a polygon drag operation."""
        self._is_dragging_polygon = True
        self._drag_start_pos = start_pos
        self._drag_initial_vertices = initial_vertices

    def end_polygon_drag(self) -> None:
        """End a polygon drag operation."""
        self._is_dragging_polygon = False
        self._drag_initial_vertices.clear()

    # ========== Utility Methods ==========

    def clear_all(self, scene: QGraphicsScene | None = None) -> None:
        """Clear all drawing state."""
        self.clear_points(scene)
        self.clear_polygon(scene)
        self.clear_bbox(scene)
        self.clear_ai_state(scene)
        self.clear_preview(scene)
        self.end_polygon_drag()

    def has_any_drawing_state(self) -> bool:
        """Check if there's any active drawing state."""
        return (
            self.has_points()
            or self.has_polygon_points()
            or self._rubber_band_rect is not None
            or self.is_ai_dragging()
            or self._preview_mask_item is not None
        )
