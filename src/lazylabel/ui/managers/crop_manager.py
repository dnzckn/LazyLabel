"""Crop manager for handling border crop functionality."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from PyQt6.QtCore import QObject, QRectF, Qt, pyqtSignal
from PyQt6.QtGui import QBrush, QColor, QPen, QPixmap
from PyQt6.QtWidgets import QGraphicsRectItem

if TYPE_CHECKING:
    from ..main_window import MainWindow


class CropManager(QObject):
    """Manages crop functionality for single and multi-view modes."""

    # Signals
    crop_applied = pyqtSignal(tuple)  # (x1, y1, x2, y2)
    crop_cleared = pyqtSignal()

    def __init__(self, main_window: MainWindow):
        super().__init__()
        self.main_window = main_window

        # Crop state
        self.crop_mode: bool = False
        self.crop_rect_item: QGraphicsRectItem | None = None
        self.crop_start_pos: Any = None
        self.crop_coords_by_size: dict[tuple[int, int], tuple[int, int, int, int]] = {}
        self.current_crop_coords: tuple[int, int, int, int] | None = None
        self.crop_visual_overlays: list[QGraphicsRectItem] = []
        self.crop_hover_overlays: list[QGraphicsRectItem] = []
        self.crop_hover_effect_items: list[QGraphicsRectItem] = []
        self.is_hovering_crop: bool = False

        # Multi-view crop state
        self.multi_view_crop_overlays: dict[int, list[QGraphicsRectItem]] = {}
        self.multi_view_crop_start_pos: list[Any] = []
        self.multi_view_crop_rect_items: list[QGraphicsRectItem | None] = []

    def start_crop_drawing(self) -> None:
        """Start crop drawing mode."""
        mw = self.main_window

        if mw.view_mode == "multi" and not any(mw.multi_view_images):
            mw.control_panel.set_crop_status("No images loaded in multi-view mode")
            mw._show_warning_notification("No images loaded in multi-view mode")
            return

        self.crop_mode = True
        mw._set_mode("crop")

        if mw.view_mode == "multi":
            mw.control_panel.set_crop_status(
                "Click and drag to draw crop rectangle (applies to both viewers)"
            )
            mw._show_notification(
                "Click and drag to draw crop rectangle (applies to both viewers)"
            )
        else:
            mw.control_panel.set_crop_status("Click and drag to draw crop rectangle")
            mw._show_notification("Click and drag to draw crop rectangle")

    def clear_crop(self) -> None:
        """Clear current crop."""
        mw = self.main_window

        self.current_crop_coords = None
        mw.control_panel.clear_crop_coordinates()
        self.remove_crop_visual()

        if mw.view_mode == "multi":
            # Clear crop for multi-view mode - check both images
            for _i, image_path in enumerate(mw.multi_view_images):
                if image_path:
                    pixmap = QPixmap(image_path)
                    if not pixmap.isNull():
                        image_size = (pixmap.width(), pixmap.height())
                        if image_size in self.crop_coords_by_size:
                            del self.crop_coords_by_size[image_size]
            # Clear multi-view crop visual overlays
            self.remove_multi_view_crop_visual()
        else:
            # Single view mode
            if mw.current_image_path:
                # Clear crop for current image size
                pixmap = QPixmap(mw.current_image_path)
                if not pixmap.isNull():
                    image_size = (pixmap.width(), pixmap.height())
                    if image_size in self.crop_coords_by_size:
                        del self.crop_coords_by_size[image_size]

        mw._show_notification("Crop cleared")
        self.crop_cleared.emit()

    def apply_crop_coordinates(self, x1: int, y1: int, x2: int, y2: int) -> None:
        """Apply crop coordinates from text input."""
        mw = self.main_window

        if mw.view_mode == "multi":
            self._apply_multi_view_crop_coordinates(x1, y1, x2, y2)
        else:
            self._apply_single_view_crop_coordinates(x1, y1, x2, y2)

    def _apply_single_view_crop_coordinates(
        self, x1: int, y1: int, x2: int, y2: int
    ) -> None:
        """Apply crop coordinates in single-view mode."""
        mw = self.main_window

        if not mw.current_image_path:
            mw.control_panel.set_crop_status("No image loaded")
            return

        pixmap = QPixmap(mw.current_image_path)
        if pixmap.isNull():
            mw.control_panel.set_crop_status("Invalid image")
            return

        # Round to nearest pixel
        x1, y1, x2, y2 = round(x1), round(y1), round(x2), round(y2)

        # Validate coordinates are within image bounds
        img_width, img_height = pixmap.width(), pixmap.height()
        x1 = max(0, min(x1, img_width - 1))
        x2 = max(0, min(x2, img_width - 1))
        y1 = max(0, min(y1, img_height - 1))
        y2 = max(0, min(y2, img_height - 1))

        # Ensure proper ordering
        if x1 > x2:
            x1, x2 = x2, x1
        if y1 > y2:
            y1, y2 = y2, y1

        # Store crop coordinates
        self.current_crop_coords = (x1, y1, x2, y2)
        image_size = (img_width, img_height)
        self.crop_coords_by_size[image_size] = self.current_crop_coords

        # Update display coordinates in case they were adjusted
        mw.control_panel.set_crop_coordinates(x1, y1, x2, y2)

        # Apply crop to current image
        self.apply_crop_to_image()
        mw._show_notification(f"Crop applied: {x1}:{x2}, {y1}:{y2}")
        self.crop_applied.emit((x1, y1, x2, y2))

    def apply_crop_to_image(self) -> None:
        """Add visual overlays to show crop areas."""
        if not self.current_crop_coords or not self.main_window.current_image_path:
            return

        # Add visual crop overlays
        self.add_crop_visual_overlays()

        # Add crop hover overlay
        self.add_crop_hover_overlay()

    def add_crop_visual_overlays(self) -> None:
        """Add simple black overlays to show cropped areas."""
        if not self.current_crop_coords:
            return

        mw = self.main_window

        # Remove existing visual overlays
        self.remove_crop_visual_overlays()

        x1, y1, x2, y2 = self.current_crop_coords

        # Get image dimensions
        pixmap = QPixmap(mw.current_image_path)
        if pixmap.isNull():
            return

        img_width, img_height = pixmap.width(), pixmap.height()

        # Create black overlays for the 4 cropped regions
        self.crop_visual_overlays = []

        # Semi-transparent black color
        overlay_color = QColor(0, 0, 0, 120)  # Black with transparency

        # Top rectangle
        if y1 > 0:
            top_overlay = QGraphicsRectItem(QRectF(0, 0, img_width, y1))
            top_overlay.setBrush(QBrush(overlay_color))
            top_overlay.setPen(QPen(Qt.GlobalColor.transparent))
            top_overlay.setZValue(25)  # Above image but below other UI elements
            self.crop_visual_overlays.append(top_overlay)

        # Bottom rectangle
        if y2 < img_height:
            bottom_overlay = QGraphicsRectItem(
                QRectF(0, y2, img_width, img_height - y2)
            )
            bottom_overlay.setBrush(QBrush(overlay_color))
            bottom_overlay.setPen(QPen(Qt.GlobalColor.transparent))
            bottom_overlay.setZValue(25)
            self.crop_visual_overlays.append(bottom_overlay)

        # Left rectangle
        if x1 > 0:
            left_overlay = QGraphicsRectItem(QRectF(0, y1, x1, y2 - y1))
            left_overlay.setBrush(QBrush(overlay_color))
            left_overlay.setPen(QPen(Qt.GlobalColor.transparent))
            left_overlay.setZValue(25)
            self.crop_visual_overlays.append(left_overlay)

        # Right rectangle
        if x2 < img_width:
            right_overlay = QGraphicsRectItem(QRectF(x2, y1, img_width - x2, y2 - y1))
            right_overlay.setBrush(QBrush(overlay_color))
            right_overlay.setPen(QPen(Qt.GlobalColor.transparent))
            right_overlay.setZValue(25)
            self.crop_visual_overlays.append(right_overlay)

        # Add all visual overlays to scene
        for overlay in self.crop_visual_overlays:
            mw.viewer.scene().addItem(overlay)

    def remove_crop_visual_overlays(self) -> None:
        """Remove crop visual overlays."""
        for overlay in self.crop_visual_overlays:
            if overlay and overlay.scene():
                self.main_window.viewer.scene().removeItem(overlay)
        self.crop_visual_overlays = []

    def remove_crop_visual(self) -> None:
        """Remove visual crop rectangle and overlays."""
        mw = self.main_window

        if self.crop_rect_item and self.crop_rect_item.scene():
            mw.viewer.scene().removeItem(self.crop_rect_item)
        self.crop_rect_item = None

        # Remove all crop-related visuals
        self.remove_crop_visual_overlays()
        self.remove_crop_hover_overlay()
        self.remove_crop_hover_effect()

    def add_crop_hover_overlay(self) -> None:
        """Add invisible hover overlays for cropped areas (outside the crop rectangle)."""
        if not self.current_crop_coords:
            return

        mw = self.main_window

        # Remove existing overlays
        self.remove_crop_hover_overlay()

        x1, y1, x2, y2 = self.current_crop_coords

        # Get image dimensions
        if not mw.current_image_path:
            return
        pixmap = QPixmap(mw.current_image_path)
        if pixmap.isNull():
            return

        img_width, img_height = pixmap.width(), pixmap.height()

        # Create hover overlays for the 4 cropped regions (outside the crop rectangle)
        self.crop_hover_overlays = []

        # Top rectangle (0, 0, img_width, y1)
        if y1 > 0:
            top_overlay = QGraphicsRectItem(QRectF(0, 0, img_width, y1))
            self.crop_hover_overlays.append(top_overlay)

        # Bottom rectangle (0, y2, img_width, img_height - y2)
        if y2 < img_height:
            bottom_overlay = QGraphicsRectItem(
                QRectF(0, y2, img_width, img_height - y2)
            )
            self.crop_hover_overlays.append(bottom_overlay)

        # Left rectangle (0, y1, x1, y2 - y1)
        if x1 > 0:
            left_overlay = QGraphicsRectItem(QRectF(0, y1, x1, y2 - y1))
            self.crop_hover_overlays.append(left_overlay)

        # Right rectangle (x2, y1, img_width - x2, y2 - y1)
        if x2 < img_width:
            right_overlay = QGraphicsRectItem(QRectF(x2, y1, img_width - x2, y2 - y1))
            self.crop_hover_overlays.append(right_overlay)

        # Configure each overlay
        for overlay in self.crop_hover_overlays:
            overlay.setBrush(QBrush(QColor(0, 0, 0, 0)))  # Transparent
            overlay.setPen(QPen(Qt.GlobalColor.transparent))
            overlay.setAcceptHoverEvents(True)
            overlay.setZValue(50)  # Above image but below other items

            # Custom hover events
            original_hover_enter = overlay.hoverEnterEvent
            original_hover_leave = overlay.hoverLeaveEvent

            def hover_enter_event(event, orig_func=original_hover_enter):
                self.on_crop_hover_enter()
                orig_func(event)

            def hover_leave_event(event, orig_func=original_hover_leave):
                self.on_crop_hover_leave()
                orig_func(event)

            overlay.hoverEnterEvent = hover_enter_event
            overlay.hoverLeaveEvent = hover_leave_event

            mw.viewer.scene().addItem(overlay)

    def remove_crop_hover_overlay(self) -> None:
        """Remove crop hover overlays."""
        for overlay in self.crop_hover_overlays:
            if overlay and overlay.scene():
                self.main_window.viewer.scene().removeItem(overlay)
        self.crop_hover_overlays = []
        self.is_hovering_crop = False

    def on_crop_hover_enter(self) -> None:
        """Handle mouse entering crop area."""
        if not self.current_crop_coords:
            return

        self.is_hovering_crop = True
        self.apply_crop_hover_effect()

    def on_crop_hover_leave(self) -> None:
        """Handle mouse leaving crop area."""
        self.is_hovering_crop = False
        self.remove_crop_hover_effect()

    def apply_crop_hover_effect(self) -> None:
        """Apply simple highlight to cropped areas on hover."""
        mw = self.main_window

        if not self.current_crop_coords or not mw.current_image_path:
            return

        # Remove existing hover effect
        self.remove_crop_hover_effect()

        x1, y1, x2, y2 = self.current_crop_coords

        # Get image dimensions
        pixmap = QPixmap(mw.current_image_path)
        if pixmap.isNull():
            return

        img_width, img_height = pixmap.width(), pixmap.height()

        # Create simple colored overlays for the 4 cropped regions
        self.crop_hover_effect_items = []

        # Use a simple semi-transparent yellow overlay
        hover_color = QColor(255, 255, 0, 60)  # Light yellow with transparency

        # Top rectangle
        if y1 > 0:
            top_effect = QGraphicsRectItem(QRectF(0, 0, img_width, y1))
            top_effect.setBrush(QBrush(hover_color))
            top_effect.setPen(QPen(Qt.GlobalColor.transparent))
            top_effect.setZValue(75)  # Above crop overlay
            self.crop_hover_effect_items.append(top_effect)

        # Bottom rectangle
        if y2 < img_height:
            bottom_effect = QGraphicsRectItem(QRectF(0, y2, img_width, img_height - y2))
            bottom_effect.setBrush(QBrush(hover_color))
            bottom_effect.setPen(QPen(Qt.GlobalColor.transparent))
            bottom_effect.setZValue(75)
            self.crop_hover_effect_items.append(bottom_effect)

        # Left rectangle
        if x1 > 0:
            left_effect = QGraphicsRectItem(QRectF(0, y1, x1, y2 - y1))
            left_effect.setBrush(QBrush(hover_color))
            left_effect.setPen(QPen(Qt.GlobalColor.transparent))
            left_effect.setZValue(75)
            self.crop_hover_effect_items.append(left_effect)

        # Right rectangle
        if x2 < img_width:
            right_effect = QGraphicsRectItem(QRectF(x2, y1, img_width - x2, y2 - y1))
            right_effect.setBrush(QBrush(hover_color))
            right_effect.setPen(QPen(Qt.GlobalColor.transparent))
            right_effect.setZValue(75)
            self.crop_hover_effect_items.append(right_effect)

        # Add all hover effect items to scene
        for effect_item in self.crop_hover_effect_items:
            mw.viewer.scene().addItem(effect_item)

    def remove_crop_hover_effect(self) -> None:
        """Remove crop hover effect."""
        for effect_item in self.crop_hover_effect_items:
            if effect_item and effect_item.scene():
                self.main_window.viewer.scene().removeItem(effect_item)
        self.crop_hover_effect_items = []

    # ========== Multi-View Crop Methods ==========

    def get_crop_for_image_size(
        self, width: int, height: int
    ) -> tuple[int, int, int, int] | None:
        """Get stored crop coordinates for a given image size."""
        image_size = (width, height)
        return self.crop_coords_by_size.get(image_size)

    def reset_state(self) -> None:
        """Reset all crop-related state."""
        self.crop_mode = False
        self.crop_rect_item = None
        self.crop_start_pos = None
        self.current_crop_coords = None

        # Clear visual items
        self.remove_crop_visual()
        self.remove_crop_hover_overlay()
        self.remove_crop_hover_effect()
        self.remove_multi_view_crop_visual()

        # Clear state collections
        self.crop_visual_overlays = []
        self.crop_hover_overlays = []
        self.crop_hover_effect_items = []
        self.multi_view_crop_overlays = {}
        self.multi_view_crop_start_pos = []
        self.multi_view_crop_rect_items = []
