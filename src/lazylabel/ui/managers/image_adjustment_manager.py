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
        self.saturation: float = main_window.settings.saturation

        # Cached image data for fast processing
        self._cached_original_image: np.ndarray | None = None
        self._cached_multi_view_original_images: list[np.ndarray | None] | None = None

    # ========== Property Accessors ==========

    @property
    def viewer(self) -> PhotoViewer:
        """Get the active viewer (supports sequence mode)."""
        return self.mw.active_viewer

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

    def set_saturation(self, value: float) -> None:
        """Set image saturation.

        Args:
            value: Slider value (converted to 0.0-2.0 range internally)
                   0 = grayscale, 100 = normal, 200 = double saturation
        """
        self.saturation = value / 100.0  # Convert slider value to 0.0-2.0 range
        self.mw.settings.saturation = self.saturation
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
            mw.viewer.set_image_adjustments(
                self.brightness, self.contrast, self.gamma, self.saturation
            )

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
                        self.brightness, self.contrast, self.gamma, self.saturation
                    )

    def reset_to_defaults(self) -> None:
        """Reset all image adjustment settings to their default values."""
        mw = self.mw

        self.brightness = 0.0
        self.contrast = 0.0
        self.gamma = 1.0
        self.saturation = 1.0
        mw.settings.brightness = self.brightness
        mw.settings.contrast = self.contrast
        mw.settings.gamma = self.gamma
        mw.settings.saturation = self.saturation
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

    def handle_rescale_changed(self) -> None:
        """Handle changes in rescale — same throttling pattern as channel threshold."""
        mw = self.mw

        if self.settings.operate_on_view and mw.any_rescale_dragging:
            return

        if mw.any_rescale_dragging:
            mw.pending_rescale_update = True
            if not mw.slider_throttle_timer.isActive():
                mw.slider_throttle_timer.start(mw.slider_throttle_interval)
        else:
            self.apply_rescale_now()

    def apply_rescale_now(self) -> None:
        """Apply rescale changes immediately."""
        mw = self.mw

        if mw.view_mode == "multi":
            if hasattr(mw, "multi_view_images") and any(mw.multi_view_images):
                self.apply_multi_view_image_processing_fast()
                if self.settings.operate_on_view:
                    changed_indices = [
                        i
                        for i in range(len(mw.multi_view_images))
                        if mw.multi_view_images[i]
                        and i < len(mw.multi_view_models)
                        and mw.multi_view_models[i] is not None
                    ]
                    if changed_indices:
                        mw._fast_update_multi_view_images(changed_indices)
            return

        if not mw.current_image_path:
            return

        self.apply_image_processing_fast()

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

        # Convert 16-bit to 8-bit for display
        thresholded_image = self._ensure_uint8(thresholded_image)

        # Convert back to QPixmap efficiently
        qimage = self._numpy_to_qimage(thresholded_image)
        thresholded_pixmap = QPixmap.fromImage(qimage)

        # Apply to viewer
        self.viewer.set_photo(thresholded_pixmap)
        self.viewer.set_image_adjustments(
            self.brightness,
            self.contrast,
            self.gamma,
            self.saturation,
        )

        # Reapply crop overlays if they exist
        if self.crop_manager.current_crop_coords:
            self.crop_manager.apply_crop_to_image()

    def apply_image_processing_fast(self) -> None:
        """Apply all image processing (channel thresholding + FFT) using cached image data."""
        mw = self.mw

        if not mw.current_image_path:
            return

        # Get all processing widgets
        threshold_widget = self.control_panel.get_channel_threshold_widget()
        rescale_widget = self.control_panel.get_rescale_widget()
        fft_widget = self.control_panel.get_fft_threshold_widget()

        # Check if any processing is active
        has_channel_threshold = (
            threshold_widget and threshold_widget.has_active_thresholding()
        )
        has_rescale = rescale_widget and rescale_widget.has_active_rescaling()
        has_fft_threshold = fft_widget and fft_widget.is_active()

        # If no active processing, reload original image
        if not has_channel_threshold and not has_rescale and not has_fft_threshold:
            self.reload_original_image_without_sam()
            return

        # Use cached image array if available, otherwise load and cache
        if self._cached_original_image is None:
            self.cache_original_image()

        if self._cached_original_image is None:
            return

        # Start with cached original image
        processed_image = self._cached_original_image.copy()

        # Apply rescaling first (normalize range before thresholding)
        if has_rescale:
            crop = self.crop_manager.current_crop_coords
            processed_image = rescale_widget.apply_rescaling(processed_image, crop)

        # Apply channel thresholding second (crop-aware)
        if has_channel_threshold:
            processed_image = self._apply_threshold_with_crop(
                processed_image, threshold_widget
            )

        # Apply FFT thresholding third if active (crop-aware)
        if has_fft_threshold:
            processed_image = self._apply_fft_with_crop(processed_image, fft_widget)

        # Convert 16-bit to 8-bit for display
        processed_image = self._ensure_uint8(processed_image)

        # Convert back to QPixmap efficiently
        qimage = self._numpy_to_qimage(processed_image)
        processed_pixmap = QPixmap.fromImage(qimage)

        # Apply to viewer
        self.viewer.set_photo(processed_pixmap)
        self.viewer.set_image_adjustments(
            self.brightness,
            self.contrast,
            self.gamma,
            self.saturation,
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
                self.saturation,
            )
            # Reapply crop overlays if they exist
            if self.crop_manager.current_crop_coords:
                self.crop_manager.apply_crop_to_image()
            # Clear cached image
            self._cached_original_image = None
            # Don't call _update_sam_model_image() - that's the expensive part!

    # ========== Multi-View Image Processing ==========

    def cache_original_image(self) -> None:
        """Cache the original image as numpy array for fast processing.

        Uses cv2.IMREAD_UNCHANGED to preserve 16-bit depth when present.
        """
        mw = self.mw

        if not mw.current_image_path:
            self._cached_original_image = None
            return

        import cv2

        image = cv2.imread(mw.current_image_path, cv2.IMREAD_UNCHANGED)
        if image is None:
            self._cached_original_image = None
            return

        # Convert BGR(A) to RGB
        if len(image.shape) == 3:
            if image.shape[2] == 4:
                image = cv2.cvtColor(image, cv2.COLOR_BGRA2RGB)
            else:
                image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        # Grayscale stays as-is (2D array)

        self._cached_original_image = image

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

        # Use cv2.IMREAD_UNCHANGED to preserve 16-bit depth
        try:
            import cv2

            image_array = cv2.imread(mw.current_image_path, cv2.IMREAD_UNCHANGED)
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

        # Update the rescale widget (with crop region if active)
        crop_coords = self.crop_manager.current_crop_coords
        self.control_panel.update_rescale_for_image(image_array, crop_coords)

        # Update the FFT threshold widget
        self.control_panel.update_fft_threshold_for_image(image_array)

        # Auto-collapse FFT threshold panel if image is not black and white
        self.control_panel.auto_collapse_fft_threshold_for_image(image_array)

    @staticmethod
    def _ensure_uint8(image_array: np.ndarray) -> np.ndarray:
        """Convert to uint8 for display/SAM, scaling 16-bit down by /256."""
        if image_array.dtype == np.uint16:
            return (image_array / 256).astype(np.uint8)
        return image_array

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

        # Apply rescaling first (normalize range before thresholding)
        rescale_widget = self.control_panel.get_rescale_widget()
        if rescale_widget and rescale_widget.has_active_rescaling():
            crop = self.crop_manager.current_crop_coords
            result_image = rescale_widget.apply_rescaling(result_image, crop)

        # Apply channel thresholding second (crop-aware)
        threshold_widget = self.control_panel.get_channel_threshold_widget()
        if threshold_widget and threshold_widget.has_active_thresholding():
            result_image = self._apply_threshold_with_crop(
                result_image, threshold_widget
            )

        # Apply FFT thresholding third (crop-aware)
        fft_widget = self.control_panel.get_fft_threshold_widget()
        if fft_widget and fft_widget.is_active():
            result_image = self._apply_fft_with_crop(result_image, fft_widget)

        # NOTE: Crop is NOT applied here - it's only a visual overlay and should only
        # affect saved masks. The crop visual overlay is handled separately.

        # SAM expects uint8
        result_image = self._ensure_uint8(result_image)

        return result_image

    def _apply_threshold_with_crop(self, image, threshold_widget):
        """Apply channel thresholding restricted to crop region if active, else full image."""
        crop = self.crop_manager.current_crop_coords
        if crop is not None:
            x1, y1, x2, y2 = crop
            region = image[y1:y2, x1:x2].copy()
            image[y1:y2, x1:x2] = threshold_widget.apply_thresholding(region)
            return image
        return threshold_widget.apply_thresholding(image)

    def _apply_fft_with_crop(self, image, fft_widget):
        """Apply FFT restricted to crop region if active, else full image."""
        crop = self.crop_manager.current_crop_coords
        if crop is not None:
            x1, y1, x2, y2 = crop
            region = image[y1:y2, x1:x2].copy()
            image[y1:y2, x1:x2] = fft_widget.apply_fft_thresholding(region)
            return image
        return fft_widget.apply_fft_thresholding(image)

    # ========== Legacy Compatibility ==========

    # Keep main_window reference for backward compatibility
    @property
    def main_window(self):
        """Backward compatibility property."""
        return self.mw
