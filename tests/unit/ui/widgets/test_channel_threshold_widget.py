"""Test cases for ChannelThresholdWidget."""

import numpy as np
import pytest
from PyQt6.QtWidgets import QApplication

from lazylabel.ui.widgets.channel_threshold_widget import (
    ChannelThresholdWidget,
    MultiIndicatorSlider,
)


@pytest.fixture
def app():
    """Create QApplication instance."""
    return QApplication.instance() or QApplication([])


@pytest.fixture
def widget(app):
    """Create ChannelThresholdWidget instance."""
    return ChannelThresholdWidget()


@pytest.fixture
def slider(app):
    """Create MultiIndicatorSlider instance."""
    return MultiIndicatorSlider("Test", 0, 255)


class TestMultiIndicatorSlider:
    """Test cases for MultiIndicatorSlider."""

    def test_initial_state(self, slider):
        """Test initial slider state."""
        assert slider.channel_name == "Test"
        assert slider.minimum == 0
        assert slider.maximum == 255
        assert slider.indicators == []

    def test_reset(self, slider):
        """Test slider reset functionality."""
        slider.indicators = [50, 128, 200]
        slider.reset()
        assert slider.indicators == []

    def test_get_set_indicators(self, slider):
        """Test getting and setting indicators."""
        test_indicators = [64, 128, 192]
        slider.set_indicators(test_indicators)
        retrieved = slider.get_indicators()
        assert retrieved == test_indicators


class TestChannelThresholdWidget:
    """Test cases for ChannelThresholdWidget."""

    def test_initial_state(self, widget):
        """Test initial widget state."""
        assert widget.current_image_channels == 0
        assert len(widget.sliders) == 0

    def test_update_for_grayscale_image(self, widget):
        """Test updating widget for grayscale image."""
        gray_image = np.random.randint(0, 256, (100, 100), dtype=np.uint8)
        widget.update_for_image(gray_image)

        assert widget.current_image_channels == 1
        assert len(widget.sliders) == 1
        assert "Gray" in widget.sliders

    def test_update_for_rgb_image(self, widget):
        """Test updating widget for RGB image."""
        rgb_image = np.random.randint(0, 256, (100, 100, 3), dtype=np.uint8)
        widget.update_for_image(rgb_image)

        assert widget.current_image_channels == 3
        assert len(widget.sliders) == 3
        assert "Red" in widget.sliders
        assert "Green" in widget.sliders
        assert "Blue" in widget.sliders

    def test_apply_thresholding_grayscale(self, widget):
        """Test applying thresholding to grayscale image."""
        gray_image = np.array([[0, 64, 128, 192, 255]], dtype=np.uint8)
        widget.update_for_image(gray_image)

        # Enable the Gray channel and set indicators
        gray_slider_widget = widget.sliders["Gray"]
        gray_slider_widget.checkbox.setChecked(True)  # Enable the channel
        gray_slider_widget.slider.set_indicators(
            [128]
        )  # Set indicators on internal slider

        result = widget.apply_thresholding(gray_image)
        expected = np.array([[0, 0, 255, 255, 255]], dtype=np.uint8)
        np.testing.assert_array_equal(result, expected)
