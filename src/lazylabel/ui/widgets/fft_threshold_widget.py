"""
FFT Threshold Widget for LazyLabel.

This widget provides FFT-based thresholding for single channel images.
It includes frequency band thresholding and intensity thresholding.
Users can double-click to add threshold points for both frequency and intensity processing.
"""

import numpy as np
from PyQt6.QtCore import pyqtSignal
from PyQt6.QtWidgets import (
    QCheckBox,
    QGroupBox,
    QLabel,
    QVBoxLayout,
    QWidget,
)
from scipy.fft import fft2, fftshift, ifft2

# Import MultiIndicatorSlider from channel threshold widget
from .channel_threshold_widget import MultiIndicatorSlider


class FFTThresholdSlider(MultiIndicatorSlider):
    """Custom slider for FFT thresholds that allows removing all indicators."""

    def contextMenuEvent(self, event):
        """Handle right-click to remove indicator (allows removing all indicators)."""
        from PyQt6.QtCore import QRect

        slider_rect = self.get_slider_rect()

        # Allow removal of any indicator (no minimum constraint)
        # Check if right-clicking on an indicator
        for i, value in enumerate(self.indicators):
            x = self.value_to_x(value)
            handle_rect = QRect(
                x - 6, slider_rect.top() - 3, 12, slider_rect.height() + 6
            )

            if handle_rect.contains(event.pos()):
                self.indicators.pop(i)
                self.valueChanged.emit(self.indicators[:])
                self.update()
                return


class FFTThresholdWidget(QWidget):
    """Widget for FFT-based thresholding of single channel images."""

    fft_threshold_changed = pyqtSignal()  # Emitted when FFT threshold changes
    dragStarted = pyqtSignal()  # Emitted when slider drag starts
    dragFinished = pyqtSignal()  # Emitted when slider drag finishes

    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_image_channels = (
            0  # 0 = no image, 1 = grayscale, 3+ = not supported
        )
        self.frequency_thresholds = []  # List of frequency threshold percentages (0-100)
        self.intensity_thresholds = []  # List of intensity threshold percentages (0-100)
        self._setup_ui()
        self._connect_signals()

    def _setup_ui(self):
        """Setup the UI layout."""
        group = QGroupBox("FFT Frequency Band Thresholding")
        layout = QVBoxLayout(group)
        layout.setSpacing(8)

        # Enable checkbox
        self.enable_checkbox = QCheckBox("Enable FFT Frequency Thresholding")
        self.enable_checkbox.setChecked(False)
        layout.addWidget(self.enable_checkbox)

        # Status label
        self.status_label = QLabel("Load a single channel (grayscale) image")
        self.status_label.setStyleSheet(
            "color: #888; font-size: 9px; font-style: italic;"
        )
        layout.addWidget(self.status_label)

        # Frequency threshold slider (percentage-based)
        freq_label = QLabel("Frequency Thresholds (Double-click to add):")
        freq_label.setStyleSheet("font-weight: bold; margin-top: 5px;")
        layout.addWidget(freq_label)

        self.frequency_slider = FFTThresholdSlider(
            channel_name="Frequency Bands", minimum=0, maximum=100, parent=self
        )
        self.frequency_slider.setEnabled(False)
        self.frequency_slider.setToolTip(
            "Double-click to add frequency cutoff points. Each frequency band gets mapped to a different intensity level."
        )
        layout.addWidget(self.frequency_slider)

        # Intensity threshold slider (percentage-based)
        intensity_label = QLabel("Intensity Thresholds (Double-click to add):")
        intensity_label.setStyleSheet("font-weight: bold; margin-top: 10px;")
        layout.addWidget(intensity_label)

        self.intensity_slider = FFTThresholdSlider(
            channel_name="Intensity Levels", minimum=0, maximum=100, parent=self
        )
        self.intensity_slider.setEnabled(False)
        self.intensity_slider.setToolTip(
            "Double-click to add intensity threshold points. Applied after frequency band processing."
        )
        layout.addWidget(self.intensity_slider)

        # Instructions
        instructions = QLabel(
            "1. Add frequency thresholds to create bands: low freq → dark, high freq → bright.\n"
            "2. Add intensity thresholds to further process the result with quantization levels."
        )
        instructions.setStyleSheet("color: #888; font-size: 9px;")
        instructions.setWordWrap(True)
        layout.addWidget(instructions)

        # Main layout
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.addWidget(group)

    def _connect_signals(self):
        """Connect internal signals."""
        # Enable checkbox connection
        self.enable_checkbox.toggled.connect(self._on_enable_checkbox_toggled)

        # Frequency threshold connections
        self.frequency_slider.valueChanged.connect(self._on_frequency_slider_changed)
        self.frequency_slider.dragStarted.connect(self.dragStarted.emit)
        self.frequency_slider.dragFinished.connect(self.dragFinished.emit)

        # Intensity threshold connections
        self.intensity_slider.valueChanged.connect(self._on_intensity_slider_changed)
        self.intensity_slider.dragStarted.connect(self.dragStarted.emit)
        self.intensity_slider.dragFinished.connect(self.dragFinished.emit)

    def _on_enable_checkbox_toggled(self, checked):
        """Handle enable checkbox toggle."""
        # Enable/disable controls based on checkbox state
        self.frequency_slider.setEnabled(checked)
        self.intensity_slider.setEnabled(checked)

        # If unchecking, optionally reset the thresholds
        if not checked:
            self.frequency_slider.reset()  # Clear frequency threshold indicators
            self.intensity_slider.reset()  # Clear intensity threshold indicators
            self.frequency_thresholds = []  # Clear stored thresholds
            self.intensity_thresholds = []  # Clear stored thresholds

        # Always emit change signal when checkbox is toggled (both check and uncheck)
        # This ensures the image refreshes to show/remove thresholding
        self.fft_threshold_changed.emit()

    def _on_frequency_slider_changed(self, indicators):
        """Handle frequency threshold slider change (receives list of threshold indicators)."""
        # Store the frequency threshold indicators (percentages 0-100)
        self.frequency_thresholds = indicators[:]  # Copy the list
        self._emit_change_if_active()

    def _on_intensity_slider_changed(self, indicators):
        """Handle intensity threshold slider change (receives list of threshold indicators)."""
        # Store the intensity threshold indicators (percentages 0-100)
        self.intensity_thresholds = indicators[:]  # Copy the list
        self._emit_change_if_active()

    def _emit_change_if_active(self):
        """Emit change signal if FFT processing is active."""
        if self.is_active():
            self.fft_threshold_changed.emit()

    def update_fft_threshold_for_image(self, image_array):
        """Update widget based on loaded image."""
        if image_array is None:
            self.current_image_channels = 0
            self.status_label.setText("Load a single channel (grayscale) image")
            self.status_label.setStyleSheet(
                "color: #888; font-size: 9px; font-style: italic;"
            )
            return

        # Determine if image is grayscale (single channel or 3-channel with identical values)
        if len(image_array.shape) == 2:
            # True grayscale - supported
            self.current_image_channels = 1
            self.status_label.setText("✓ Grayscale image - FFT processing available")
            self.status_label.setStyleSheet(
                "color: #4CAF50; font-size: 9px; font-style: italic;"
            )
        elif len(image_array.shape) == 3 and image_array.shape[2] == 3:
            # Check if all three channels are identical (grayscale stored as RGB)
            r_channel = image_array[:, :, 0]
            g_channel = image_array[:, :, 1]
            b_channel = image_array[:, :, 2]
            if np.array_equal(r_channel, g_channel) and np.array_equal(
                g_channel, b_channel
            ):
                # Grayscale stored as RGB - supported
                self.current_image_channels = 1
                self.status_label.setText(
                    "✓ Grayscale image (RGB format) - FFT processing available"
                )
                self.status_label.setStyleSheet(
                    "color: #4CAF50; font-size: 9px; font-style: italic;"
                )
            else:
                # True multi-channel - not supported
                self.current_image_channels = 3
                self.status_label.setText(
                    "❌ Multi-channel color image - not supported"
                )
                self.status_label.setStyleSheet(
                    "color: #F44336; font-size: 9px; font-style: italic;"
                )
        else:
            # Unknown format
            self.current_image_channels = 0
            self.status_label.setText("❌ Unsupported image format")
            self.status_label.setStyleSheet(
                "color: #F44336; font-size: 9px; font-style: italic;"
            )

    def is_active(self):
        """Check if FFT processing is active (checkbox enabled and image is grayscale)."""
        return self.enable_checkbox.isChecked() and self.current_image_channels == 1

    def apply_fft_thresholding(self, image_array):
        """Apply frequency band thresholding to image array and return modified array."""
        if not self.is_active() or image_array is None:
            return image_array

        # Handle both 2D grayscale and 3D grayscale (stored as RGB) images
        if len(image_array.shape) == 2:
            # True grayscale
            processing_image = image_array
            is_3channel = False
        elif len(image_array.shape) == 3 and image_array.shape[2] == 3:
            # Check if it's grayscale stored as RGB
            r_channel = image_array[:, :, 0]
            g_channel = image_array[:, :, 1]
            b_channel = image_array[:, :, 2]
            if np.array_equal(r_channel, g_channel) and np.array_equal(
                g_channel, b_channel
            ):
                # Convert to 2D for processing
                processing_image = image_array[:, :, 0]
                is_3channel = True
            else:
                return image_array
        else:
            return image_array

        try:
            result_image = self._apply_frequency_band_thresholding(processing_image)

            # Convert back to original format if needed
            if is_3channel:
                result = np.stack([result_image, result_image, result_image], axis=2)
            else:
                result = result_image

            return result

        except Exception:
            # If FFT processing fails, return original image
            return image_array

    def _apply_frequency_band_thresholding(self, image_array):
        """Apply frequency band thresholding with multiple frequency cutoffs."""
        # Convert to float for processing
        image_float = image_array.astype(np.float64)
        height, width = image_float.shape

        # Apply FFT
        fft_image = fft2(image_float)
        fft_shifted = fftshift(fft_image)

        # Create frequency coordinate arrays (normalized 0-1)
        y_coords, x_coords = np.ogrid[:height, :width]
        center_y, center_x = height // 2, width // 2

        # Calculate distance from center (frequency magnitude)
        max_freq = np.sqrt((height / 2) ** 2 + (width / 2) ** 2)
        freq_distance = (
            np.sqrt((y_coords - center_y) ** 2 + (x_coords - center_x) ** 2) / max_freq
        )
        freq_distance = np.clip(freq_distance, 0, 1)  # Normalize to 0-1

        if not self.frequency_thresholds:
            # No frequency thresholds - use original FFT
            result_fft = fft_shifted
        else:
            # Create frequency bands based on thresholds
            sorted_thresholds = sorted(self.frequency_thresholds)
            freq_thresholds_normalized = [
                t / 100.0 for t in sorted_thresholds
            ]  # Convert to 0-1

            # Number of bands = number of thresholds + 1
            num_bands = len(freq_thresholds_normalized) + 1
            result_fft = np.zeros_like(fft_shifted, dtype=complex)

            for band_idx in range(num_bands):
                # Define frequency band
                if band_idx == 0:
                    # First band: 0 to first threshold
                    band_mask = freq_distance <= freq_thresholds_normalized[0]
                elif band_idx == num_bands - 1:
                    # Last band: last threshold to 1
                    band_mask = freq_distance > freq_thresholds_normalized[band_idx - 1]
                else:
                    # Middle bands: between two thresholds
                    band_mask = (
                        freq_distance > freq_thresholds_normalized[band_idx - 1]
                    ) & (freq_distance <= freq_thresholds_normalized[band_idx])

                # Band intensity (evenly distributed)
                band_intensity = (band_idx / (num_bands - 1)) if num_bands > 1 else 1.0

                # Apply band contribution
                result_fft += fft_shifted * band_mask * band_intensity

        # Inverse FFT
        filtered_fft_unshifted = fftshift(result_fft)
        filtered_image = np.real(ifft2(filtered_fft_unshifted))

        # Normalize to 0-255 range
        filtered_image = filtered_image - np.min(filtered_image)
        if np.max(filtered_image) > 0:
            filtered_image = filtered_image / np.max(filtered_image) * 255

        result_image = filtered_image.astype(np.uint8)

        # Apply intensity thresholding if specified
        if self.intensity_thresholds:
            result_image = self._apply_intensity_thresholding(result_image)

        return result_image

    def _apply_intensity_thresholding(self, image_array):
        """Apply intensity thresholding to the image array."""
        sorted_thresholds = sorted(self.intensity_thresholds)

        # If no thresholds, return original
        if not sorted_thresholds:
            return image_array

        # Convert thresholds from percentages to intensity values (0-255)
        intensity_thresholds = [t * 255 / 100.0 for t in sorted_thresholds]

        # Number of levels = number of thresholds + 1
        num_levels = len(intensity_thresholds) + 1
        result_image = np.copy(image_array)

        for level_idx in range(num_levels):
            # Define intensity range for this level
            if level_idx == 0:
                # First level: 0 to first threshold
                mask = image_array <= intensity_thresholds[0]
            elif level_idx == num_levels - 1:
                # Last level: last threshold to 255
                mask = image_array > intensity_thresholds[level_idx - 1]
            else:
                # Middle levels: between two thresholds
                mask = (image_array > intensity_thresholds[level_idx - 1]) & (
                    image_array <= intensity_thresholds[level_idx]
                )

            # Map to quantized level (evenly distributed)
            level_value = (
                (level_idx / (num_levels - 1)) * 255 if num_levels > 1 else 255
            )
            result_image[mask] = level_value

        return result_image.astype(np.uint8)

    def get_settings(self):
        """Get current FFT threshold settings."""
        return {
            "frequency_thresholds": self.frequency_thresholds,
            "intensity_thresholds": self.intensity_thresholds,
            "is_active": self.is_active(),
        }

    def reset(self):
        """Reset to default values."""
        self.frequency_slider.reset()  # Reset the frequency slider
        self.intensity_slider.reset()  # Reset the intensity slider
        self.frequency_thresholds = []
        self.intensity_thresholds = []
