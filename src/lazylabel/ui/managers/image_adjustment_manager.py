"""Image adjustment manager for brightness, contrast, gamma, and channel processing.

This manager handles:
- Brightness, contrast, gamma adjustments
- Channel thresholding (fast and legacy)
- FFT thresholding
- Image caching for performance
- Multi-view image processing
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np
from PyQt6.QtGui import QImage, QPixmap

if TYPE_CHECKING:
    from ..control_panel import ControlPanel
    from ..main_window import MainWindow
    from ..photo_viewer import PhotoViewer
    from ..settings import Settings
    from .crop_manager import CropManager


class ImageAdjustmentManager:
    """Manages image adjustment settings and processing.

    This manager handles the application of image adjustments to viewers
    including brightness, contrast, gamma, channel thresholding, and FFT
    processing.
    """

    def __init__(self, main_window: MainWindow):
        """Initialize the image adjustment manager.

        Args:
            main_window: Parent MainWindow instance
        """
        self.mw = main_window

        # Image adjustment values - loaded from settings
        self.brightness: float = main_window.settings.brightness
        self.contrast: float = main_window.settings.contrast
        self.gamma: float = main_window.settings.gamma

        # Cached image data for fast processing
        self._cached_original_image: np.ndarray | None = None
        self._cached_multi_view_original_images: list[np.ndarray | None] | None = None

    # ========== Property Accessors ==========

    @property
    def viewer(self) -> PhotoViewer:
        """Get viewer from main window."""
        return self.mw.viewer

    @property
    def control_panel(self) -> ControlPanel:
        """Get control panel from main window."""
        return self.mw.control_panel

    @property
    def settings(self) -> Settings:
        """Get settings from main window."""
        return self.mw.settings

    @property
    def crop_manager(self) -> CropManager:
        """Get crop manager from main window."""
        return self.mw.crop_manager

    # ========== Brightness/Contrast/Gamma ==========

    def set_brightness(self, value: float) -> None:
        """Set image brightness."""
        self.brightness = value
        self.mw.settings.brightness = value
        self._request_slider_update()

    def set_contrast(self, value: float) -> None:
        """Set image contrast."""
        self.contrast = value
        self.mw.settings.contrast = value
        self._request_slider_update()

    def set_gamma(self, value: float) -> None:
        """Set image gamma.

        Args:
            value: Slider value (converted to 0.01-2.0 range internally)
        """
        self.gamma = value / 100.0  # Convert slider value to 0.01-2.0 range
        self.mw.settings.gamma = self.gamma
        self._request_slider_update()

    def _request_slider_update(self) -> None:
        """Request a slider update with throttling for smooth performance."""
        mw = self.mw

        # If operate_on_view is ON and dragging: defer until drag ends
        if mw.settings.operate_on_view and mw.any_slider_dragging:
            return

        # If dragging (operate_on_view is OFF): use throttling for smooth updates
        if mw.any_slider_dragging:
            mw.pending_slider_update = True
            if not mw.slider_throttle_timer.isActive():
                mw.slider_throttle_timer.start(mw.slider_throttle_interval)
        else:
            # Not dragging: apply immediately
            self.apply_to_all_viewers()

    def apply_to_all_viewers(self) -> None:
        """Apply current image adjustments to all active viewers."""
        mw = self.mw

        # Apply to single view viewer if it has an image
        if (
            mw.current_image_path
            and hasattr(mw.viewer, "_original_image")
            and mw.viewer._original_image is not None
            and hasattr(mw.viewer, "_original_image_bgra")
            and mw.viewer._original_image_bgra is not None
        ):
            mw.viewer.set_image_adjustments(self.brightness, self.contrast, self.gamma)

        # Apply to multi-view viewers if they have images
        if mw.view_mode == "multi" and hasattr(mw, "multi_view_viewers"):
            for i, viewer in enumerate(mw.multi_view_viewers):
                if (
                    i < len(mw.multi_view_images)
                    and mw.multi_view_images[i] is not None
                    and hasattr(viewer, "_original_image")
                    and viewer._original_image is not None
                    and hasattr(viewer, "_original_image_bgra")
                    and viewer._original_image_bgra is not None
                ):
                    viewer.set_image_adjustments(
                        self.brightness, self.contrast, self.gamma
                    )

    def reset_to_defaults(self) -> None:
        """Reset all image adjustment settings to their default values."""
        mw = self.mw

        self.brightness = 0.0
        self.contrast = 0.0
        self.gamma = 1.0
        mw.settings.brightness = self.brightness
        mw.settings.contrast = self.contrast
        mw.settings.gamma = self.gamma
        mw.control_panel.adjustments_widget.reset_to_defaults()

        if mw.current_image_path or (
            mw.view_mode == "multi" and any(mw.multi_view_images)
        ):
            self.apply_to_all_viewers()

    # ========== Channel Threshold Handling ==========

    def handle_channel_threshold_changed(self) -> None:
        """Handle changes in channel thresholding - optimized to avoid unnecessary work."""
        mw = self.mw

        # If operate_on_view is ON and dragging: defer until drag ends
        if self.settings.operate_on_view and mw.any_channel_threshold_dragging:
            return

        # If dragging (operate_on_view is OFF): use throttling for smooth updates
        if mw.any_channel_threshold_dragging:
            mw.pending_channel_threshold_update = True
            if not mw.slider_throttle_timer.isActive():
                mw.slider_throttle_timer.start(mw.slider_throttle_interval)
        else:
            # Not dragging: apply immediately
            self.apply_channel_threshold_now()

    def apply_channel_threshold_now(self) -> None:
        """Apply channel threshold changes immediately (used by throttling)."""
        mw = self.mw

        # Handle multi-view mode
        if mw.view_mode == "multi":
            # Check if any multi-view images are loaded
            if hasattr(mw, "multi_view_images") and any(mw.multi_view_images):
                self.apply_multi_view_image_processing_fast()

                # Update SAM models if operate_on_view is enabled
                if self.settings.operate_on_view:
                    changed_indices = []
                    for i in range(len(mw.multi_view_images)):
                        if (
                            mw.multi_view_images[i]
                            and i < len(mw.multi_view_models)
                            and mw.multi_view_models[i] is not None
                        ):
                            changed_indices.append(i)

                    if changed_indices:
                        mw._fast_update_multi_view_images(changed_indices)
            return

        # Handle single-view mode
        if not mw.current_image_path:
            return

        self.apply_image_processing_fast()

        # Update SAM model if operate_on_view is enabled
        if self.settings.operate_on_view:
            mw._mark_sam_dirty()

    def handle_fft_threshold_changed(self) -> None:
        """Handle changes in FFT thresholding."""
        mw = self.mw

        # Handle multi-view mode
        if mw.view_mode == "multi":
            # Check if any multi-view images are loaded
            if hasattr(mw, "multi_view_images") and any(mw.multi_view_images):
                self.apply_multi_view_image_processing_fast()

                # Use fast updates for multi-view SAM models instead of marking dirty
                if self.settings.operate_on_view:
                    changed_indices = []
                    for i in range(len(mw.multi_view_images)):
                        if (
                            mw.multi_view_images[i]
                            and i < len(mw.multi_view_models)
                            and mw.multi_view_models[i] is not None
                        ):
                            changed_indices.append(i)

                    if changed_indices:
                        mw._fast_update_multi_view_images(changed_indices)
            return

        # Handle single-view mode
        if not mw.current_image_path:
            return

        # Always update visuals immediately for responsive UI
        self.apply_image_processing_fast()

        # Mark SAM as dirty instead of updating immediately
        # Only update SAM when user actually needs it (enters SAM mode)
        if self.settings.operate_on_view:
            mw._mark_sam_dirty()

    # ========== Single-View Image Processing ==========

    def apply_channel_thresholding_fast(self) -> None:
        """Apply channel thresholding using cached image data for better performance."""
        mw = self.mw

        if not mw.current_image_path:
            return

        # Get channel threshold widget
        threshold_widget = self.control_panel.get_channel_threshold_widget()

        # If no active thresholding, reload original image
        if not threshold_widget.has_active_thresholding():
            self.reload_original_image_without_sam()
            return

        # Use cached image array if available, otherwise load and cache
        if self._cached_original_image is None:
            self.cache_original_image()

        if self._cached_original_image is None:
            return

        # Apply thresholding to cached image
        thresholded_image = threshold_widget.apply_thresholding(
            self._cached_original_image
        )

        # Convert back to QPixmap efficiently
        qimage = self._numpy_to_qimage(thresholded_image)
        thresholded_pixmap = QPixmap.fromImage(qimage)

        # Apply to viewer
        self.viewer.set_photo(thresholded_pixmap)
        self.viewer.set_image_adjustments(
            self.brightness,
            self.contrast,
            self.gamma,
        )

        # Reapply crop overlays if they exist
        if self.crop_manager.current_crop_coords:
            self.crop_manager.apply_crop_to_image()

    def apply_image_processing_fast(self) -> None:
        """Apply all image processing (channel thresholding + FFT) using cached image data."""
        mw = self.mw

        if not mw.current_image_path:
            return

        # Get both widgets
        threshold_widget = self.control_panel.get_channel_threshold_widget()
        fft_widget = self.control_panel.get_fft_threshold_widget()

        # Check if any processing is active
        has_channel_threshold = (
            threshold_widget and threshold_widget.has_active_thresholding()
        )
        has_fft_threshold = fft_widget and fft_widget.is_active()

        # If no active processing, reload original image
        if not has_channel_threshold and not has_fft_threshold:
            self.reload_original_image_without_sam()
            return

        # Use cached image array if available, otherwise load and cache
        if self._cached_original_image is None:
            self.cache_original_image()

        if self._cached_original_image is None:
            return

        # Start with cached original image
        processed_image = self._cached_original_image.copy()

        # Apply channel thresholding first if active
        if has_channel_threshold:
            processed_image = threshold_widget.apply_thresholding(processed_image)

        # Apply FFT thresholding second if active
        if has_fft_threshold:
            processed_image = fft_widget.apply_fft_thresholding(processed_image)

        # Convert back to QPixmap efficiently
        qimage = self._numpy_to_qimage(processed_image)
        processed_pixmap = QPixmap.fromImage(qimage)

        # Apply to viewer
        self.viewer.set_photo(processed_pixmap)
        self.viewer.set_image_adjustments(
            self.brightness,
            self.contrast,
            self.gamma,
        )

        # Reapply crop overlays if they exist
        if self.crop_manager.current_crop_coords:
            self.crop_manager.apply_crop_to_image()

    def reload_original_image_without_sam(self) -> None:
        """Reload original image without triggering expensive SAM update."""
        mw = self.mw

        if not mw.current_image_path:
            return

        pixmap = QPixmap(mw.current_image_path)
        if not pixmap.isNull():
            self.viewer.set_photo(pixmap)
            self.viewer.set_image_adjustments(
                self.brightness,
                self.contrast,
                self.gamma,
            )
            # Reapply crop overlays if they exist
            if self.crop_manager.current_crop_coords:
                self.crop_manager.apply_crop_to_image()
            # Clear cached image
            self._cached_original_image = None
            # Don't call _update_sam_model_image() - that's the expensive part!

    # ========== Multi-View Image Processing ==========

    def cache_original_image(self) -> None:
        """Cache the original image as numpy array for fast processing."""
        mw = self.mw

        if not mw.current_image_path:
            self._cached_original_image = None
            return

        # Load original image
        pixmap = QPixmap(mw.current_image_path)
        if pixmap.isNull():
            self._cached_original_image = None
            return

        # Convert pixmap to numpy array
        qimage = pixmap.toImage()
        ptr = qimage.constBits()
        ptr.setsize(qimage.bytesPerLine() * qimage.height())
        image_np = np.array(ptr).reshape(qimage.height(), qimage.width(), 4)
        # Convert from BGRA to RGB
        self._cached_original_image = image_np[
            :, :, [2, 1, 0]
        ]  # BGR to RGB, ignore alpha

    def clear_cached_images(self) -> None:
        """Clear all cached images."""
        self._cached_original_image = None
        self._cached_multi_view_original_images = None

    # ========== Channel Threshold Widget Updates ==========

    def update_channel_threshold_for_image(self, pixmap: QPixmap) -> None:
        """Update channel threshold widget for the given image pixmap.

        Args:
            pixmap: The image pixmap
        """
        mw = self.mw

        if pixmap.isNull() or not mw.current_image_path:
            self.control_panel.update_channel_threshold_for_image(None)
            return

        # Use cv2.imread for more robust loading instead of QPixmap conversion
        try:
            import cv2

            image_array = cv2.imread(mw.current_image_path)
            if image_array is None:
                self.control_panel.update_channel_threshold_for_image(None)
                return

            # Convert from BGR to RGB
            if len(image_array.shape) == 3 and image_array.shape[2] == 3:
                image_array = cv2.cvtColor(image_array, cv2.COLOR_BGR2RGB)

            # Check if image is grayscale (all channels are the same)
            if (
                len(image_array.shape) == 3
                and np.array_equal(image_array[:, :, 0], image_array[:, :, 1])
                and np.array_equal(image_array[:, :, 1], image_array[:, :, 2])
            ):
                # Convert to single channel grayscale
                image_array = image_array[:, :, 0]

        except Exception:
            # Fallback to QPixmap conversion if cv2 fails
            qimage = pixmap.toImage()
            ptr = qimage.constBits()
            ptr.setsize(qimage.bytesPerLine() * qimage.height())
            image_np = np.array(ptr).reshape(qimage.height(), qimage.width(), 4)
            # Convert from BGRA to RGB, ignore alpha
            image_rgb = image_np[:, :, [2, 1, 0]]

            # Check if image is grayscale (all channels are the same)
            if np.array_equal(
                image_rgb[:, :, 0], image_rgb[:, :, 1]
            ) and np.array_equal(image_rgb[:, :, 1], image_rgb[:, :, 2]):
                # Convert to single channel grayscale
                image_array = image_rgb[:, :, 0]
            else:
                # Keep as RGB
                image_array = image_rgb

        # Update the channel threshold widget
        self.control_panel.update_channel_threshold_for_image(image_array)

        # Update the FFT threshold widget
        self.control_panel.update_fft_threshold_for_image(image_array)

        # Auto-collapse FFT threshold panel if image is not black and white
        self.control_panel.auto_collapse_fft_threshold_for_image(image_array)

    def _numpy_to_qimage(self, image_array: np.ndarray) -> QImage:
        """Convert numpy array to QImage efficiently.

        Args:
            image_array: Numpy array (RGB or grayscale)

        Returns:
            QImage representation
        """
        # Ensure array is contiguous
        image_array = np.ascontiguousarray(image_array)

        if len(image_array.shape) == 2:
            # Grayscale
            height, width = image_array.shape
            bytes_per_line = width
            return QImage(
                bytes(image_array.data),  # Convert memoryview to bytes
                width,
                height,
                bytes_per_line,
                QImage.Format.Format_Grayscale8,
            )
        else:
            # RGB
            height, width, channels = image_array.shape
            bytes_per_line = width * channels
            return QImage(
                bytes(image_array.data),  # Convert memoryview to bytes
                width,
                height,
                bytes_per_line,
                QImage.Format.Format_RGB888,
            )

    def get_current_modified_image(self) -> np.ndarray | None:
        """Get the current image with all modifications applied (excluding crop for SAM).

        Returns:
            Modified image as numpy array, or None if no image loaded
        """
        if self._cached_original_image is None:
            self.cache_original_image()

        if self._cached_original_image is None:
            return None

        # Start with cached original
        result_image = self._cached_original_image.copy()

        # Apply channel thresholding if active
        threshold_widget = self.control_panel.get_channel_threshold_widget()
        if threshold_widget and threshold_widget.has_active_thresholding():
            result_image = threshold_widget.apply_thresholding(result_image)

        # Apply FFT thresholding if active (after channel thresholding)
        fft_widget = self.control_panel.get_fft_threshold_widget()
        if fft_widget and fft_widget.is_active():
            result_image = fft_widget.apply_fft_thresholding(result_image)

        # NOTE: Crop is NOT applied here - it's only a visual overlay and should only
        # affect saved masks. The crop visual overlay is handled separately.

        return result_image

    # ========== Legacy Compatibility ==========

    # Keep main_window reference for backward compatibility
    @property
    def main_window(self):
        """Backward compatibility property."""
        return self.mw
