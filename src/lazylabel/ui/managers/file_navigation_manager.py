"""File navigation manager for image loading and navigation.

This manager handles:
- Single-view image loading
- Multi-view image loading from selection
- Image loading by path
- Navigation between images
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
from PyQt6.QtGui import QImage, QPixmap

from ...utils.logger import logger

if TYPE_CHECKING:
    from PyQt6.QtCore import QModelIndex
    from PyQt6.QtWidgets import QFileSystemModel

    from ...core.segment_manager import SegmentManager
    from ...models.model_manager import ModelManager
    from ..control_panel import ControlPanel
    from ..main_window import MainWindow
    from ..photo_viewer import PhotoViewer
    from ..right_panel import RightPanel
    from .crop_manager import CropManager
    from .file_manager import FileManager
    from .image_adjustment_manager import ImageAdjustmentManager
    from .image_preload_manager import ImagePreloadManager


class FileNavigationManager:
    """Manages file navigation and image loading operations.

    This class consolidates all file navigation handling including:
    - Loading selected images
    - Loading images by path
    - Multi-view image loading
    - Navigation helpers
    """

    def __init__(self, main_window: MainWindow):
        """Initialize the file navigation manager.

        Args:
            main_window: Parent MainWindow instance
        """
        self.mw = main_window

    # ========== Property Accessors ==========

    @property
    def viewer(self) -> PhotoViewer:
        """Get viewer from main window."""
        return self.mw.viewer

    @property
    def file_manager(self) -> FileManager:
        """Get file manager from main window."""
        return self.mw.file_manager

    @property
    def file_model(self) -> QFileSystemModel:
        """Get file model from main window."""
        return self.mw.file_model

    @property
    def segment_manager(self) -> SegmentManager:
        """Get segment manager from main window."""
        return self.mw.segment_manager

    @property
    def control_panel(self) -> ControlPanel:
        """Get control panel from main window."""
        return self.mw.control_panel

    @property
    def right_panel(self) -> RightPanel:
        """Get right panel from main window."""
        return self.mw.right_panel

    @property
    def image_adjustment_manager(self) -> ImageAdjustmentManager:
        """Get image adjustment manager from main window."""
        return self.mw.image_adjustment_manager

    @property
    def image_preload_manager(self) -> ImagePreloadManager:
        """Get image preload manager from main window."""
        return self.mw.image_preload_manager

    @property
    def crop_manager(self) -> CropManager:
        """Get crop manager from main window."""
        return self.mw.crop_manager

    @property
    def model_manager(self) -> ModelManager:
        """Get model manager from main window."""
        return self.mw.model_manager

    # ========== Single-View Image Loading ==========

    def load_selected_image(self, index: QModelIndex) -> None:
        """Load the selected image. Auto-saves previous work if enabled.

        Args:
            index: QModelIndex of the selected file
        """
        if not index.isValid() or not self.file_model.isDir(index.parent()):
            return

        self.mw.current_file_index = index
        path = self.file_model.filePath(index)

        if os.path.isfile(path) and self.file_manager.is_image_file(path):
            # Check if we're in multi-view mode
            if hasattr(self.mw, "view_mode") and self.mw.view_mode == "multi":
                self.load_selected_image_multi_view(index, path)
                return

            if path == self.mw.current_image_path:  # Only reset if loading a new image
                return

            # Auto-save if enabled and we have a current image (not the first load)
            if self.mw.current_image_path and self.control_panel.get_settings().get(
                "auto_save", True
            ):
                self.mw._save_output_to_npz()

            self.mw.current_image_path = path

            # Try to use preloaded pixmap first (instant navigation)
            pixmap = self.image_preload_manager.get_preloaded_pixmap(path)
            if pixmap is None:
                # Load image with explicit transparency support
                qimage = QImage(self.mw.current_image_path)
                if qimage.isNull():
                    return
                # For PNG files, always ensure proper alpha format handling
                if self.mw.current_image_path.lower().endswith(".png"):
                    # PNG files can have alpha channels, use ARGB32_Premultiplied
                    qimage = qimage.convertToFormat(
                        QImage.Format.Format_ARGB32_Premultiplied
                    )
                pixmap = QPixmap.fromImage(qimage)

            if not pixmap.isNull():
                self.mw._reset_state()
                self.viewer.set_photo(pixmap)
                self.viewer.set_image_adjustments(
                    self.image_adjustment_manager.brightness,
                    self.image_adjustment_manager.contrast,
                    self.image_adjustment_manager.gamma,
                    self.image_adjustment_manager.saturation,
                )
                self.mw._update_sam_model_image()
                self.file_manager.load_class_aliases(self.mw.current_image_path)
                self.file_manager.load_existing_mask(self.mw.current_image_path)
                self.right_panel.file_tree.setCurrentIndex(index)
                self.mw._update_all_lists()
                self.viewer.setFocus()

        if self.model_manager.is_model_available():
            self.mw._update_sam_model_image()

        # Update channel threshold widget for new image
        self.mw._update_channel_threshold_for_image(pixmap)

        # Restore crop coordinates for this image size if they exist
        image_size = (pixmap.width(), pixmap.height())
        if image_size in self.crop_manager.crop_coords_by_size:
            self.crop_manager.current_crop_coords = (
                self.crop_manager.crop_coords_by_size[image_size]
            )
            x1, y1, x2, y2 = self.crop_manager.current_crop_coords
            self.control_panel.set_crop_coordinates(x1, y1, x2, y2)
            self.crop_manager.apply_crop_to_image()
        else:
            self.crop_manager.current_crop_coords = None
            self.control_panel.clear_crop_coordinates()

        # Cache original image for channel threshold processing
        self.mw._cache_original_image()

        self.mw._show_success_notification(
            f"Loaded: {Path(self.mw.current_image_path).name}"
        )

        # Preload adjacent images for instant navigation
        self.image_preload_manager.preload_adjacent_images()

    def load_image_by_path(self, path: str) -> None:
        """Load image by file path directly (for FastFileManager).

        Args:
            path: Path to the image file
        """
        # Check if we're in multi-view mode
        if hasattr(self.mw, "view_mode") and self.mw.view_mode == "multi":
            # For multi-view, we need to handle differently
            # Load the selected image and consecutive ones
            self.load_multi_view_from_path(path)
            return

        if path == self.mw.current_image_path:  # Only reset if loading a new image
            return

        # Auto-save if enabled and we have a current image (not the first load)
        if self.mw.current_image_path and self.control_panel.get_settings().get(
            "auto_save", True
        ):
            self.mw._save_output_to_npz()

        self.mw.current_image_path = path

        # CRITICAL: Reset state and mark SAM as dirty when loading new image
        self.mw._reset_state()

        self.segment_manager.clear()
        # Remove all scene items except the pixmap
        items_to_remove = [
            item
            for item in self.viewer.scene().items()
            if item is not self.viewer._pixmap_item
        ]
        for item in items_to_remove:
            self.viewer.scene().removeItem(item)

        # Load the image
        original_image = cv2.imread(path)
        if original_image is None:
            logger.error(f"Failed to load image: {path}")
            return

        # Convert BGR to RGB
        if len(original_image.shape) == 3:
            original_image = cv2.cvtColor(original_image, cv2.COLOR_BGR2RGB)
        self.mw.original_image = original_image

        # Convert to QImage and display
        height, width = original_image.shape[:2]
        bytes_per_line = 3 * width if len(original_image.shape) == 3 else width

        if len(original_image.shape) == 3:
            q_image = QImage(
                original_image.data.tobytes(),
                width,
                height,
                bytes_per_line,
                QImage.Format.Format_RGB888,
            )
        else:
            q_image = QImage(
                original_image.data.tobytes(),
                width,
                height,
                bytes_per_line,
                QImage.Format.Format_Grayscale8,
            )

        pixmap = QPixmap.fromImage(q_image)
        self.viewer.set_photo(pixmap)

        # Apply current image adjustments to the new image
        self.viewer.set_image_adjustments(
            self.image_adjustment_manager.brightness,
            self.image_adjustment_manager.contrast,
            self.image_adjustment_manager.gamma,
            self.image_adjustment_manager.saturation,
        )

        # Load existing segments and class aliases
        self.file_manager.load_class_aliases(path)
        self.file_manager.load_existing_mask(path)

        # Update UI lists to reflect loaded segments
        self.mw._update_all_lists()

        # Update display if we have an update method
        if hasattr(self.mw, "_update_display"):
            self.mw._update_display()
        self.mw._show_success_notification(f"Loaded: {Path(path).name}")

        # Update file selection in the file manager
        self.right_panel.select_file(Path(path))

        # CRITICAL: Update SAM model with new image
        self.mw._update_sam_model_image()

        # Update threshold widgets for new image (this was missing!)
        self.mw._update_channel_threshold_for_image(pixmap)

        # Preload adjacent images for instant navigation
        self.image_preload_manager.preload_adjacent_images()

    # ========== Multi-View Image Loading ==========

    def load_selected_image_multi_view(self, index: QModelIndex, path: str) -> None:
        """Load an image into multi-view mode when selected from file tree.

        Args:
            index: QModelIndex of the selected file
            path: Path to the image file
        """
        # Find the selected image in the cached list and load consecutive pair
        self.load_multi_view_from_path(path)

    def load_multi_view_from_path(self, path: str) -> None:
        """Load consecutive images into multi-view starting from the given path.

        Uses the file manager's current sorted order, so if the list is sorted
        in reverse, the "next" image will be the one displayed below in the list.

        Args:
            path: Path to the first image to load
        """
        from pathlib import Path as PathLib

        # Auto-save current annotations before navigating
        if hasattr(self.mw, "_save_multi_view_annotations"):
            self.mw._save_multi_view_annotations()

        # Load selected image to viewer 0
        self.mw._load_multi_view_image(0, path)

        # Get next consecutive image from file manager's sorted view
        next_path = None
        if (
            hasattr(self.mw, "right_panel")
            and hasattr(self.mw.right_panel, "file_manager")
            and self.mw.right_panel.file_manager is not None
        ):
            next_path = self.mw.right_panel.file_manager.getConsecutiveFile(
                PathLib(path)
            )

        # Load next image to viewer 1 (or None if at end of list)
        if next_path:
            self.mw._load_multi_view_image(1, str(next_path))
        else:
            self.mw._load_multi_view_image(1, None)

    def get_index_for_path(self, path: str) -> QModelIndex | None:
        """Get the QModelIndex for a given file path.

        Args:
            path: File path to find

        Returns:
            QModelIndex for the path, or None if not found
        """
        if not self.file_model or not path:
            return None

        # Use the file model to find the index for this path
        index = self.file_model.index(path)
        return index if index.isValid() else None

    def get_next_image_from_file_model(self, current_index: QModelIndex) -> str | None:
        """Get the next image file from the file model without scanning all files.

        Args:
            current_index: Current file index

        Returns:
            Path to next image, or None if not found
        """
        if not self.file_model or not current_index.isValid():
            return None

        parent_index = current_index.parent()
        current_row = current_index.row()

        # Look for the next image file starting from the next row
        for row in range(current_row + 1, self.file_model.rowCount(parent_index)):
            next_index = self.file_model.index(row, 0, parent_index)
            if next_index.isValid():
                next_path = self.file_model.filePath(next_index)
                if os.path.isfile(next_path) and self.file_manager.is_image_file(
                    next_path
                ):
                    return next_path

        return None

    def load_next_image(self) -> None:
        """Load next image in the file list."""
        # Handle multi-view mode by loading next batch
        if hasattr(self.mw, "view_mode") and self.mw.view_mode == "multi":
            self.mw._load_next_multi_batch()
            return

        # Use new file manager navigation
        self.right_panel.navigate_next_image()

    def load_previous_image(self) -> None:
        """Load previous image in the file list."""
        # Handle multi-view mode by loading previous batch
        if hasattr(self.mw, "view_mode") and self.mw.view_mode == "multi":
            self.mw._load_previous_multi_batch()
            return

        # Use new file manager navigation
        self.right_panel.navigate_previous_image()
