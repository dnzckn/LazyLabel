"""
Unit tests for FFT Threshold Widget.
"""

import numpy as np
import pytest
from PyQt6.QtWidgets import QApplication

from lazylabel.ui.widgets.fft_threshold_widget import FFTThresholdWidget


@pytest.fixture
def app():
    """Create QApplication instance."""
    return QApplication.instance() or QApplication([])


@pytest.fixture
def widget(app):
    """Create FFT threshold widget for testing."""
    return FFTThresholdWidget()


class TestFFTThresholdWidget:
    """Test FFT threshold widget functionality."""

    def test_initial_state(self, widget):
        """Test initial widget state."""
        assert widget.current_image_channels == 0
        assert widget.frequency_thresholds == []
        assert widget.intensity_thresholds == []
        assert not widget.enable_checkbox.isChecked()
        assert not widget.is_active()

    def test_update_for_grayscale_image(self, widget):
        """Test updating widget for grayscale image."""
        gray_image = np.random.randint(0, 256, (100, 100), dtype=np.uint8)
        widget.update_fft_threshold_for_image(gray_image)

        assert widget.current_image_channels == 1
        assert (
            "✓ Grayscale image - FFT processing available" in widget.status_label.text()
        )

    def test_update_for_grayscale_rgb_image(self, widget):
        """Test updating widget for grayscale image stored as RGB."""
        # Create grayscale image stored as RGB (all channels identical)
        gray_value = np.random.randint(0, 256, (50, 50), dtype=np.uint8)
        rgb_gray_image = np.stack([gray_value, gray_value, gray_value], axis=2)
        widget.update_fft_threshold_for_image(rgb_gray_image)

        assert widget.current_image_channels == 1
        assert (
            "✓ Grayscale image (RGB format) - FFT processing available"
            in widget.status_label.text()
        )

    def test_update_for_rgb_image(self, widget):
        """Test updating widget for RGB image."""
        rgb_image = np.random.randint(0, 256, (100, 100, 3), dtype=np.uint8)
        widget.update_fft_threshold_for_image(rgb_image)

        assert widget.current_image_channels == 3
        assert (
            "❌ Multi-channel color image - not supported" in widget.status_label.text()
        )

    def test_update_for_no_image(self, widget):
        """Test updating widget with no image."""
        widget.update_fft_threshold_for_image(None)

        assert widget.current_image_channels == 0
        assert "Load a single channel (grayscale) image" in widget.status_label.text()

    def test_is_active_conditions(self, widget):
        """Test is_active method under various conditions."""
        # Initially not active
        assert not widget.is_active()

        # Set grayscale image but checkbox not checked
        gray_image = np.random.randint(0, 256, (100, 100), dtype=np.uint8)
        widget.update_fft_threshold_for_image(gray_image)
        assert not widget.is_active()

        # Check checkbox - should now be active
        widget.enable_checkbox.setChecked(True)
        assert widget.is_active()

        # Set RGB image - should not be active even with checkbox checked
        rgb_image = np.random.randint(0, 256, (100, 100, 3), dtype=np.uint8)
        widget.update_fft_threshold_for_image(rgb_image)
        assert not widget.is_active()

    def test_checkbox_toggle(self, widget):
        """Test checkbox enable/disable functionality."""
        signal_count = 0

        def signal_handler():
            nonlocal signal_count
            signal_count += 1

        widget.fft_threshold_changed.connect(signal_handler)

        # Set up grayscale image
        gray_image = np.random.randint(0, 256, (100, 100), dtype=np.uint8)
        widget.update_fft_threshold_for_image(gray_image)

        # Check checkbox - should emit signal
        widget.enable_checkbox.setChecked(True)
        assert signal_count == 1
        assert widget.frequency_slider.isEnabled()
        assert widget.intensity_slider.isEnabled()

        # Uncheck checkbox - should emit signal and reset thresholds
        widget.enable_checkbox.setChecked(False)
        assert signal_count == 2
        assert not widget.frequency_slider.isEnabled()
        assert not widget.intensity_slider.isEnabled()
        assert widget.frequency_thresholds == []
        assert widget.intensity_thresholds == []

    def test_frequency_slider_changes(self, widget):
        """Test frequency slider value changes."""
        signal_count = 0

        def signal_handler():
            nonlocal signal_count
            signal_count += 1

        widget.fft_threshold_changed.connect(signal_handler)

        # Set up for signal emission
        gray_image = np.random.randint(0, 256, (100, 100), dtype=np.uint8)
        widget.update_fft_threshold_for_image(gray_image)
        widget.enable_checkbox.setChecked(True)  # Enable FFT processing
        signal_count = 0  # Reset count after setup

        # Test slider change
        test_thresholds = [25.0, 75.0]
        widget.frequency_slider.valueChanged.emit(test_thresholds)
        assert widget.frequency_thresholds == test_thresholds
        assert signal_count == 1  # Signal should be emitted once

    def test_intensity_slider_changes(self, widget):
        """Test intensity slider value changes."""
        signal_count = 0

        def signal_handler():
            nonlocal signal_count
            signal_count += 1

        widget.fft_threshold_changed.connect(signal_handler)

        # Set up for signal emission
        gray_image = np.random.randint(0, 256, (100, 100), dtype=np.uint8)
        widget.update_fft_threshold_for_image(gray_image)
        widget.enable_checkbox.setChecked(True)  # Enable FFT processing
        signal_count = 0  # Reset count after setup

        # Test slider change
        test_thresholds = [30.0, 70.0]
        widget.intensity_slider.valueChanged.emit(test_thresholds)
        assert widget.intensity_thresholds == test_thresholds
        assert signal_count == 1  # Signal should be emitted once

    def test_apply_fft_thresholding_inactive(self, widget):
        """Test FFT thresholding when widget is inactive."""
        test_image = np.random.randint(0, 256, (100, 100), dtype=np.uint8)
        result = widget.apply_fft_thresholding(test_image)

        # Should return original image unchanged when inactive
        np.testing.assert_array_equal(result, test_image)

    def test_apply_fft_thresholding_active(self, widget):
        """Test FFT thresholding when widget is active."""
        # Create a simple test image
        test_image = np.random.randint(0, 256, (50, 50), dtype=np.uint8)

        # Set up active widget
        widget.update_fft_threshold_for_image(test_image)
        widget.enable_checkbox.setChecked(True)
        widget.frequency_thresholds = [50.0]  # Add one frequency threshold

        result = widget.apply_fft_thresholding(test_image)

        # Result should be valid
        assert result.shape == test_image.shape
        assert result.dtype == np.uint8
        # FFT processing should work without crashing

    def test_apply_fft_thresholding_rgb_image(self, widget):
        """Test FFT thresholding with RGB image (should return unchanged)."""
        rgb_image = np.random.randint(0, 256, (50, 50, 3), dtype=np.uint8)

        # Set up widget for RGB (which makes it inactive)
        widget.update_fft_threshold_for_image(rgb_image)
        widget.enable_checkbox.setChecked(True)
        widget.frequency_thresholds = [50.0]

        result = widget.apply_fft_thresholding(rgb_image)

        # Should return original image unchanged for RGB
        np.testing.assert_array_equal(result, rgb_image)

    def test_apply_fft_thresholding_grayscale_rgb(self, widget):
        """Test FFT thresholding with grayscale stored as RGB."""
        # Create grayscale image stored as RGB
        gray_value = np.random.randint(0, 256, (30, 30), dtype=np.uint8)
        rgb_gray_image = np.stack([gray_value, gray_value, gray_value], axis=2)

        # Set up active widget
        widget.update_fft_threshold_for_image(rgb_gray_image)
        widget.enable_checkbox.setChecked(True)
        widget.frequency_thresholds = [50.0]

        result = widget.apply_fft_thresholding(rgb_gray_image)

        # Result should be RGB format with same shape
        assert result.shape == rgb_gray_image.shape
        assert result.dtype == np.uint8
        # All channels should be identical (still grayscale)
        assert np.array_equal(result[:, :, 0], result[:, :, 1])
        assert np.array_equal(result[:, :, 1], result[:, :, 2])

    def test_intensity_thresholding(self, widget):
        """Test intensity thresholding functionality."""
        # Create test image with known values
        test_image = np.array(
            [[0, 64, 128, 192, 255], [32, 96, 160, 224, 255]], dtype=np.uint8
        )

        # Test with intensity thresholds at 25% and 75% (64 and 191 in 0-255 range)
        widget.intensity_thresholds = [25.0, 75.0]
        result = widget._apply_intensity_thresholding(test_image)

        # Should have only 3 distinct values: 0, 127, 255 (for 3 levels)
        unique_values = np.unique(result)
        assert len(unique_values) == 3
        assert 0 in unique_values
        assert 127 in unique_values
        assert 255 in unique_values

    def test_intensity_thresholding_no_thresholds(self, widget):
        """Test intensity thresholding with no thresholds."""
        test_image = np.random.randint(0, 256, (10, 10), dtype=np.uint8)

        widget.intensity_thresholds = []
        result = widget._apply_intensity_thresholding(test_image)

        # Should return original image when no thresholds
        np.testing.assert_array_equal(result, test_image)

    def test_get_settings(self, widget):
        """Test get_settings method."""
        # Set up widget state
        gray_image = np.random.randint(0, 256, (100, 100), dtype=np.uint8)
        widget.update_fft_threshold_for_image(gray_image)
        widget.enable_checkbox.setChecked(True)
        widget.frequency_thresholds = [25.0, 75.0]
        widget.intensity_thresholds = [30.0, 70.0]

        settings = widget.get_settings()

        assert settings["frequency_thresholds"] == [25.0, 75.0]
        assert settings["intensity_thresholds"] == [30.0, 70.0]
        assert settings["is_active"]

    def test_get_settings_inactive(self, widget):
        """Test get_settings when widget is inactive."""
        settings = widget.get_settings()

        assert settings["frequency_thresholds"] == []
        assert settings["intensity_thresholds"] == []
        assert not settings["is_active"]

    def test_reset(self, widget):
        """Test reset functionality."""
        # Set up widget with values
        gray_image = np.random.randint(0, 256, (100, 100), dtype=np.uint8)
        widget.update_fft_threshold_for_image(gray_image)
        widget.enable_checkbox.setChecked(True)
        widget.frequency_thresholds = [25.0, 75.0]
        widget.intensity_thresholds = [30.0, 70.0]

        # Reset
        widget.reset()

        # Check values are reset
        assert widget.frequency_thresholds == []
        assert widget.intensity_thresholds == []

    def test_drag_signals(self, widget):
        """Test drag start/finish signals."""
        drag_started_count = 0
        drag_finished_count = 0

        def drag_started_handler():
            nonlocal drag_started_count
            drag_started_count += 1

        def drag_finished_handler():
            nonlocal drag_finished_count
            drag_finished_count += 1

        widget.dragStarted.connect(drag_started_handler)
        widget.dragFinished.connect(drag_finished_handler)

        # Simulate slider press and release
        widget.frequency_slider.dragStarted.emit()
        assert drag_started_count == 1

        widget.frequency_slider.dragFinished.emit()
        assert drag_finished_count == 1

        # Test with intensity slider too
        widget.intensity_slider.dragStarted.emit()
        assert drag_started_count == 2

        widget.intensity_slider.dragFinished.emit()
        assert drag_finished_count == 2

    def test_signal_emission_conditions(self, widget):
        """Test that signals are only emitted when widget is active."""
        signal_count = 0

        def signal_handler():
            nonlocal signal_count
            signal_count += 1

        widget.fft_threshold_changed.connect(signal_handler)

        # No image - signal should not be emitted
        widget.frequency_slider.valueChanged.emit([50.0])
        assert signal_count == 0

        # RGB image - signal should not be emitted
        rgb_image = np.random.randint(0, 256, (100, 100, 3), dtype=np.uint8)
        widget.update_fft_threshold_for_image(rgb_image)
        widget.enable_checkbox.setChecked(True)
        widget.frequency_slider.valueChanged.emit([50.0])
        assert signal_count == 1  # Only from checkbox toggle, not slider change

        # Grayscale image and checkbox checked - signal should be emitted
        gray_image = np.random.randint(0, 256, (100, 100), dtype=np.uint8)
        widget.update_fft_threshold_for_image(gray_image)
        widget.enable_checkbox.setChecked(True)
        signal_count = 0  # Reset count

        widget.frequency_slider.valueChanged.emit([30.0])
        assert signal_count == 1

        widget.intensity_slider.valueChanged.emit([40.0])
        assert signal_count == 2
