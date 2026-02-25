"""Segment display manager for caching and rendering segment pixmaps."""

from __future__ import annotations

import logging
from collections import OrderedDict
from typing import TYPE_CHECKING

import numpy as np
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QBrush, QColor, QPen, QPixmap
from PyQt6.QtWidgets import QGraphicsPolygonItem

from ...utils import mask_to_pixmap

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from numpy.typing import NDArray

    from ..main_window import MainWindow


class SegmentDisplayManager:
    """Manages segment display, caching, and rendering.

    This manager handles:
    - LRU caching of segment pixmaps (default and hover states)
    - LRU caching of highlight pixmaps for selections
    - Color generation and caching for class IDs
    - Cache invalidation and key shifting on segment deletion

    The caching significantly improves performance by avoiding expensive
    pixmap regeneration on every display refresh.
    """

    def __init__(self, main_window: MainWindow):
        self.main_window = main_window

        # Segment pixmap cache for performance optimization
        # Key: (segment_index, viewer_index, color_rgb, alpha) -> QPixmap
        # Uses OrderedDict for LRU eviction when cache exceeds max size
        self._segment_pixmap_cache: OrderedDict = OrderedDict()
        self._segment_cache_max_size: int = 500  # Max pixmaps to keep in cache
        self._segment_cache_valid: bool = True  # Flag to invalidate cache when needed

        # Color cache for class colors - avoids recalculating HSV colors
        # Key: class_id -> QColor
        self._class_color_cache: dict = {}

        # Highlight pixmap cache - avoids regenerating highlight pixmaps
        # Key: (segment_index, highlight_color_rgb, alpha) -> QPixmap
        # Uses OrderedDict for LRU eviction
        self._highlight_pixmap_cache: OrderedDict = OrderedDict()
        self._highlight_cache_max_size: int = 200  # Max highlight pixmaps to keep

    @property
    def viewer(self):
        """Get the active viewer (supports sequence mode)."""
        return self.main_window.active_viewer

    def get_cached_pixmaps(
        self,
        segment_index: int,
        mask: NDArray[np.bool_],
        color_rgb: tuple[int, int, int],
        viewer_index: int | None = None,
    ) -> tuple[QPixmap, QPixmap]:
        """Get or create cached pixmaps for a segment mask.

        Args:
            segment_index: Index of the segment
            mask: The segment mask (numpy array)
            color_rgb: RGB tuple for the color
            viewer_index: Optional viewer index for multi-view mode

        Returns:
            Tuple of (default_pixmap, hover_pixmap)
        """
        # Create cache key based on segment index, color, and optional viewer index
        cache_key_default = (segment_index, viewer_index, color_rgb, 70)
        cache_key_hover = (segment_index, viewer_index, color_rgb, 170)

        # Check if we have valid cached pixmaps (use LRU move_to_end for access tracking)
        if (
            self._segment_cache_valid
            and cache_key_default in self._segment_pixmap_cache
            and cache_key_hover in self._segment_pixmap_cache
        ):
            # Move accessed items to end (most recently used)
            self._segment_pixmap_cache.move_to_end(cache_key_default)
            self._segment_pixmap_cache.move_to_end(cache_key_hover)
            logger.debug(
                f"[CACHE-HIT] seg={segment_index} viewer={viewer_index}: "
                f"returning cached pixmap"
            )
            return (
                self._segment_pixmap_cache[cache_key_default],
                self._segment_pixmap_cache[cache_key_hover],
            )

        # Generate new pixmaps
        logger.debug(
            f"[CACHE-MISS] seg={segment_index} viewer={viewer_index}: "
            f"generating pixmap from mask with {mask.sum()} pixels"
        )
        default_pixmap = mask_to_pixmap(mask, color_rgb, alpha=70)
        hover_pixmap = mask_to_pixmap(mask, color_rgb, alpha=170)

        # LRU eviction: remove oldest entries if cache is full
        while len(self._segment_pixmap_cache) >= self._segment_cache_max_size:
            self._segment_pixmap_cache.popitem(last=False)  # Remove oldest (first)

        # Cache new pixmaps (added at end = most recently used)
        self._segment_pixmap_cache[cache_key_default] = default_pixmap
        self._segment_pixmap_cache[cache_key_hover] = hover_pixmap

        return default_pixmap, hover_pixmap

    def invalidate_cache(self, segment_indices: list[int] | None = None) -> None:
        """Invalidate cached pixmaps for specific segments or all segments.

        Args:
            segment_indices: List of segment indices to invalidate, or None for all
        """
        if segment_indices is None:
            self._segment_pixmap_cache.clear()
            self._highlight_pixmap_cache.clear()
        else:
            # Remove specific segment entries
            keys_to_remove = [
                key for key in self._segment_pixmap_cache if key[0] in segment_indices
            ]
            for key in keys_to_remove:
                del self._segment_pixmap_cache[key]

            # Also clear highlight cache for these segments
            highlight_keys_to_remove = [
                key for key in self._highlight_pixmap_cache if key[0] in segment_indices
            ]
            for key in highlight_keys_to_remove:
                del self._highlight_pixmap_cache[key]

    def shift_cache_after_deletion(self, deleted_index: int) -> None:
        """Shift cache entries after a segment deletion to preserve cached pixmaps.

        When a segment is deleted, all indices after it shift down by 1.
        This method updates cache keys to reflect the new indices, avoiding
        expensive pixmap regeneration.

        Args:
            deleted_index: The index of the segment that was deleted
        """
        # Shift segment pixmap cache (preserve LRU order with OrderedDict)
        new_cache = OrderedDict()
        for key, value in self._segment_pixmap_cache.items():
            segment_idx, viewer_idx, color_rgb, alpha = key
            if segment_idx == deleted_index:
                # Skip deleted segment's cache entries
                continue
            elif segment_idx > deleted_index:
                # Shift index down by 1
                new_key = (segment_idx - 1, viewer_idx, color_rgb, alpha)
                new_cache[new_key] = value
            else:
                # Keep as-is
                new_cache[key] = value
        self._segment_pixmap_cache = new_cache

        # Shift highlight pixmap cache (preserve LRU order with OrderedDict)
        new_highlight_cache = OrderedDict()
        for key, value in self._highlight_pixmap_cache.items():
            segment_idx, color_rgb, alpha = key
            if segment_idx == deleted_index:
                continue
            elif segment_idx > deleted_index:
                new_key = (segment_idx - 1, color_rgb, alpha)
                new_highlight_cache[new_key] = value
            else:
                new_highlight_cache[key] = value
        self._highlight_pixmap_cache = new_highlight_cache

    def get_cached_highlight_pixmap(
        self,
        segment_index: int,
        mask: NDArray[np.bool_],
        color_rgb: tuple[int, int, int],
        alpha: int = 180,
        viewer_index: int = 0,
    ) -> QPixmap:
        """Get or create a cached highlight pixmap.

        Args:
            segment_index: Index of the segment
            mask: The segment mask (numpy array)
            color_rgb: RGB tuple for the highlight color
            alpha: Alpha value for the highlight
            viewer_index: Index of the viewer (for multi-view cache separation)

        Returns:
            Cached or newly generated QPixmap
        """
        cache_key = (segment_index, viewer_index, color_rgb, alpha)

        if cache_key in self._highlight_pixmap_cache:
            # Move to end for LRU tracking
            self._highlight_pixmap_cache.move_to_end(cache_key)
            return self._highlight_pixmap_cache[cache_key]

        # LRU eviction: remove oldest entries if cache is full
        while len(self._highlight_pixmap_cache) >= self._highlight_cache_max_size:
            self._highlight_pixmap_cache.popitem(last=False)

        # Generate new pixmap and cache it
        pixmap = mask_to_pixmap(mask, color_rgb, alpha=alpha)
        self._highlight_pixmap_cache[cache_key] = pixmap
        return pixmap

    def get_color_for_class(self, class_id: int | None) -> QColor:
        """Get color for a class ID with caching.

        Uses HSV color space to generate visually distinct colors for
        different class IDs. Results are cached to avoid recalculation.

        Args:
            class_id: The class ID to get color for

        Returns:
            QColor for the class
        """
        if class_id is None:
            return QColor.fromHsv(0, 0, 128)

        # Check cache first
        if class_id in self._class_color_cache:
            return self._class_color_cache[class_id]

        # Calculate and cache the color
        hue = int((class_id * 222.4922359) % 360)
        color = QColor.fromHsv(hue, 220, 220)
        if not color.isValid():
            color = QColor(Qt.GlobalColor.white)

        self._class_color_cache[class_id] = color
        return color

    def clear_class_color_cache(self) -> None:
        """Clear the class color cache.

        Call this when class colors may have changed.
        """
        self._class_color_cache.clear()

    def clear_all_caches(self) -> None:
        """Clear all caches (segment pixmaps, highlights, and class colors).

        Call this when resetting state or switching images.
        """
        self._segment_pixmap_cache.clear()
        self._highlight_pixmap_cache.clear()
        self._class_color_cache.clear()

    def clear_pixmap_caches(self) -> None:
        """Clear segment and highlight pixmap caches (not class colors).

        Call this when image adjustments change.
        """
        self._segment_pixmap_cache.clear()
        self._highlight_pixmap_cache.clear()

    def set_cache_valid(self, valid: bool):
        """Set the segment cache validity flag.

        Args:
            valid: Whether the cache should be considered valid
        """
        self._segment_cache_valid = valid

    @property
    def cache_valid(self) -> bool:
        """Get the segment cache validity flag."""
        return self._segment_cache_valid

    # -------------------------------------------------------------------------
    # Single-View Display Methods
    # -------------------------------------------------------------------------

    def display_all_segments_single_view(self) -> None:
        """Display all segments on the single-view viewer.

        Uses batched scene operations and cached pixmaps for performance.
        """
        # Import here to avoid circular imports
        from PyQt6.QtCore import QPointF
        from PyQt6.QtGui import QPolygonF

        from ..hoverable_pixelmap_item import HoverablePixmapItem
        from ..hoverable_polygon_item import HoverablePolygonItem

        mw = self.main_window
        scene = self.viewer.scene()

        # Batch scene operations for better performance
        self.viewer.setUpdatesEnabled(False)
        scene.blockSignals(True)

        try:
            # Clear existing segment items
            for _i, items in mw.segment_items.items():
                for item in items:
                    if item.scene():
                        scene.removeItem(item)
            mw.segment_items.clear()
            mw._clear_edit_handles()

            # Compute Z-values based on pixel priority settings
            priority_enabled = mw.settings.pixel_priority_enabled
            if priority_enabled:
                unique_ids = mw.segment_manager.get_unique_class_ids()
                max_z = len(unique_ids) + 1
                if mw.settings.pixel_priority_ascending:
                    class_z = {cid: max_z - idx for idx, cid in enumerate(unique_ids)}
                else:
                    class_z = {cid: idx + 1 for idx, cid in enumerate(unique_ids)}

            # Display segments from segment manager
            for i, segment in enumerate(mw.segment_manager.segments):
                mw.segment_items[i] = []
                class_id = segment.get("class_id")
                base_color = self.get_color_for_class(class_id)
                z_value = (
                    class_z.get(class_id, i + 1) if priority_enabled else i + 1
                )

                if segment.get("type") == "Polygon" and segment.get("vertices"):
                    qpoints = [QPointF(p[0], p[1]) for p in segment["vertices"]]
                    poly_item = HoverablePolygonItem(QPolygonF(qpoints))
                    default_brush = QBrush(
                        QColor(
                            base_color.red(), base_color.green(), base_color.blue(), 70
                        )
                    )
                    hover_brush = QBrush(
                        QColor(
                            base_color.red(),
                            base_color.green(),
                            base_color.blue(),
                            170,
                        )
                    )
                    poly_item.set_brushes(default_brush, hover_brush)
                    poly_item.set_segment_info(i, mw)
                    poly_item.setPen(QPen(Qt.GlobalColor.transparent))
                    poly_item.setZValue(z_value)
                    scene.addItem(poly_item)
                    mw.segment_items[i].append(poly_item)
                elif segment.get("mask") is not None:
                    default_pixmap, hover_pixmap = self.get_cached_pixmaps(
                        i, segment["mask"], base_color.getRgb()[:3]
                    )
                    pixmap_item = HoverablePixmapItem()
                    pixmap_item.set_pixmaps(default_pixmap, hover_pixmap)
                    pixmap_item.set_segment_info(i, mw)
                    scene.addItem(pixmap_item)
                    pixmap_item.setZValue(z_value)
                    mw.segment_items[i].append(pixmap_item)
        finally:
            # Re-enable updates and signals
            scene.blockSignals(False)
            self.viewer.setUpdatesEnabled(True)
            self.viewer.viewport().update()

    def add_segment_to_display_single_view(self, segment_index: int) -> None:
        """Add a single segment to display without clearing existing segments.

        This is an O(1) operation compared to display_all which is O(n).

        Args:
            segment_index: Index of the segment to display
        """
        from PyQt6.QtCore import QPointF
        from PyQt6.QtGui import QPolygonF

        from ..hoverable_pixelmap_item import HoverablePixmapItem
        from ..hoverable_polygon_item import HoverablePolygonItem

        mw = self.main_window

        if segment_index >= len(mw.segment_manager.segments):
            return

        segment = mw.segment_manager.segments[segment_index]
        mw.segment_items[segment_index] = []
        class_id = segment.get("class_id")
        base_color = self.get_color_for_class(class_id)

        # Compute Z-value based on pixel priority settings
        z_value = segment_index + 1
        if mw.settings.pixel_priority_enabled:
            unique_ids = mw.segment_manager.get_unique_class_ids()
            max_z = len(unique_ids) + 1
            if mw.settings.pixel_priority_ascending:
                class_z = {cid: max_z - idx for idx, cid in enumerate(unique_ids)}
            else:
                class_z = {cid: idx + 1 for idx, cid in enumerate(unique_ids)}
            z_value = class_z.get(class_id, z_value)

        if segment.get("type") == "Polygon" and segment.get("vertices"):
            qpoints = [QPointF(p[0], p[1]) for p in segment["vertices"]]
            poly_item = HoverablePolygonItem(QPolygonF(qpoints))
            default_brush = QBrush(
                QColor(base_color.red(), base_color.green(), base_color.blue(), 70)
            )
            hover_brush = QBrush(
                QColor(base_color.red(), base_color.green(), base_color.blue(), 170)
            )
            poly_item.set_brushes(default_brush, hover_brush)
            poly_item.set_segment_info(segment_index, mw)
            poly_item.setPen(QPen(Qt.GlobalColor.transparent))
            poly_item.setZValue(z_value)
            self.viewer.scene().addItem(poly_item)
            mw.segment_items[segment_index].append(poly_item)
        elif segment.get("mask") is not None:
            default_pixmap, hover_pixmap = self.get_cached_pixmaps(
                segment_index, segment["mask"], base_color.getRgb()[:3]
            )
            pixmap_item = HoverablePixmapItem()
            pixmap_item.set_pixmaps(default_pixmap, hover_pixmap)
            pixmap_item.set_segment_info(segment_index, mw)
            self.viewer.scene().addItem(pixmap_item)
            pixmap_item.setZValue(z_value)
            mw.segment_items[segment_index].append(pixmap_item)

    def remove_segment_from_display_single_view(self, segment_index: int) -> None:
        """Remove a single segment from display.

        Args:
            segment_index: Index of the segment to remove
        """
        mw = self.main_window

        if segment_index in mw.segment_items:
            for item in mw.segment_items[segment_index]:
                if item.scene():
                    self.viewer.scene().removeItem(item)
            del mw.segment_items[segment_index]

        # Invalidate cache for this segment
        self.invalidate_cache([segment_index])

    def highlight_segments_single_view(self, selected_indices: list[int]) -> None:
        """Highlight segments in single view mode.

        Args:
            selected_indices: List of segment indices to highlight
        """
        from PyQt6.QtCore import QPointF
        from PyQt6.QtGui import QPolygonF

        mw = self.main_window

        for i in selected_indices:
            seg = mw.segment_manager.segments[i]
            base_color = self.get_color_for_class(seg.get("class_id"))

            if mw.mode == "edit":
                # Use a brighter, hover-like highlight in edit mode
                highlight_brush = QBrush(
                    QColor(base_color.red(), base_color.green(), base_color.blue(), 170)
                )
            else:
                # Use the standard yellow overlay for selection
                highlight_brush = QBrush(QColor(255, 255, 0, 180))

            if seg.get("type") == "Polygon" and seg.get("vertices"):
                qpoints = [QPointF(p[0], p[1]) for p in seg["vertices"]]
                poly_item = QGraphicsPolygonItem(QPolygonF(qpoints))
                poly_item.setBrush(highlight_brush)
                poly_item.setPen(QPen(Qt.GlobalColor.transparent))
                poly_item.setZValue(999)
                self.viewer.scene().addItem(poly_item)
                mw.highlight_items.append(poly_item)
            elif seg.get("mask") is not None:
                # For non-polygon types, use cached highlight pixmaps
                # Skip in edit mode as we use hover effect instead
                if mw.mode != "edit":
                    mask = seg.get("mask")
                    pixmap = self.get_cached_highlight_pixmap(
                        i, mask, (255, 255, 0), alpha=180
                    )
                    highlight_item = self.viewer.scene().addPixmap(pixmap)
                    highlight_item.setZValue(1000)
                    mw.highlight_items.append(highlight_item)
