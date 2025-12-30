"""Coordinate transformation utilities for SAM model operations."""

from __future__ import annotations

from typing import TYPE_CHECKING

import cv2
import numpy as np
from PyQt6.QtGui import QPixmap

if TYPE_CHECKING:
    from PyQt6.QtCore import QPointF

    from ..main_window import MainWindow


class CoordinateTransformer:
    """Handles coordinate transformations between display and SAM model space.

    This manager handles:
    - Display to SAM coordinate conversion (single-view and multi-view)
    - Mask scaling from SAM output to display dimensions
    """

    def __init__(self, main_window: MainWindow):
        self.main_window = main_window

    def transform_display_to_sam_coords(self, pos: QPointF) -> tuple[int, int]:
        """Transform display coordinates to SAM model coordinates.

        When 'operate on view' is ON: SAM processes the displayed image
        When 'operate on view' is OFF: SAM processes the original image

        Args:
            pos: Position in display coordinates

        Returns:
            Tuple of (sam_x, sam_y) coordinates
        """
        mw = self.main_window

        if mw.settings.operate_on_view:
            # Simple case: SAM processes the same image the user sees
            sam_x = int(pos.x() * mw.sam_scale_factor)
            sam_y = int(pos.y() * mw.sam_scale_factor)
        else:
            # Complex case: Map display coordinates to original image coordinates
            # then scale for SAM processing
            sam_x, sam_y = self._transform_with_original_mapping(pos)

        return sam_x, sam_y

    def _transform_with_original_mapping(self, pos: QPointF) -> tuple[int, int]:
        """Transform display coords to SAM coords via original image mapping."""
        mw = self.main_window

        # Get displayed image dimensions (may include adjustments)
        if not mw.viewer._pixmap_item or mw.viewer._pixmap_item.pixmap().isNull():
            # Fallback: use simple scaling
            return int(pos.x() * mw.sam_scale_factor), int(
                pos.y() * mw.sam_scale_factor
            )

        display_width = mw.viewer._pixmap_item.pixmap().width()
        display_height = mw.viewer._pixmap_item.pixmap().height()

        # Get original image dimensions
        if not mw.current_image_path:
            # Fallback: use simple scaling
            return int(pos.x() * mw.sam_scale_factor), int(
                pos.y() * mw.sam_scale_factor
            )

        # Load original image to get true dimensions
        original_pixmap = QPixmap(mw.current_image_path)
        if original_pixmap.isNull():
            # Fallback: use simple scaling
            return int(pos.x() * mw.sam_scale_factor), int(
                pos.y() * mw.sam_scale_factor
            )

        original_width = original_pixmap.width()
        original_height = original_pixmap.height()

        # Map display coordinates to original image coordinates
        if display_width > 0 and display_height > 0:
            original_x = pos.x() * (original_width / display_width)
            original_y = pos.y() * (original_height / display_height)

            # Apply SAM scale factor to original coordinates
            sam_x = int(original_x * mw.sam_scale_factor)
            sam_y = int(original_y * mw.sam_scale_factor)
        else:
            # Fallback: use simple scaling
            sam_x = int(pos.x() * mw.sam_scale_factor)
            sam_y = int(pos.y() * mw.sam_scale_factor)

        return sam_x, sam_y

    def scale_mask_to_display(self, mask: np.ndarray, viewer=None) -> np.ndarray:
        """Scale SAM output mask to display dimensions.

        When SAM processes a downscaled image, the output mask needs to be
        scaled back up to match the display dimensions.

        Args:
            mask: Boolean mask from SAM prediction
            viewer: Optional viewer for multi-view mode (uses main viewer if None)

        Returns:
            Scaled boolean mask matching display dimensions
        """
        mw = self.main_window

        # No scaling needed if scale factor is 1.0
        if mw.sam_scale_factor == 1.0:
            return mask

        # Get the appropriate viewer
        if viewer is None:
            viewer = mw.viewer

        # Check if viewer has valid pixmap
        if not viewer._pixmap_item or viewer._pixmap_item.pixmap().isNull():
            return mask

        # Get display dimensions
        display_width = viewer._pixmap_item.pixmap().width()
        display_height = viewer._pixmap_item.pixmap().height()

        # Resize mask to display dimensions
        mask_resized = cv2.resize(
            mask.astype(np.uint8),
            (display_width, display_height),
            interpolation=cv2.INTER_NEAREST,
        ).astype(bool)

        return mask_resized
