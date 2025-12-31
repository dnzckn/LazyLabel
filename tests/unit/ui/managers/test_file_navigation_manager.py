"""Tests for image adjustment persistence when loading new images.

These tests verify that when navigating to new images, all image adjustment
settings (brightness, contrast, gamma, saturation) are properly applied.
"""

from unittest.mock import MagicMock

import pytest


class TestImageAdjustmentManagerAppliesAllSettings:
    """Test that ImageAdjustmentManager applies all 4 adjustment parameters."""

    @pytest.fixture
    def mock_main_window(self):
        """Create a mock MainWindow with required attributes."""
        mw = MagicMock()

        # Mock viewer with necessary attributes
        mw.viewer = MagicMock()
        mw.viewer._original_image = MagicMock()
        mw.viewer._original_image_bgra = MagicMock()

        # Mock settings
        mw.settings = MagicMock()
        mw.settings.brightness = 25.0
        mw.settings.contrast = -10.0
        mw.settings.gamma = 1.5
        mw.settings.saturation = 0.8

        # Mock control panel
        mw.control_panel = MagicMock()
        mw.control_panel.adjustments_widget = MagicMock()

        # Other required attributes
        mw.current_image_path = "/test/image.png"
        mw.view_mode = "single"
        mw.any_slider_dragging = False

        return mw

    @pytest.fixture
    def image_adjustment_manager(self, mock_main_window):
        """Create ImageAdjustmentManager with mock main window."""
        from lazylabel.ui.managers.image_adjustment_manager import (
            ImageAdjustmentManager,
        )

        return ImageAdjustmentManager(mock_main_window)

    def test_apply_to_all_viewers_passes_four_parameters(
        self, image_adjustment_manager, mock_main_window
    ):
        """Test that apply_to_all_viewers calls set_image_adjustments with 4 params."""
        # Call apply_to_all_viewers
        image_adjustment_manager.apply_to_all_viewers()

        # Verify set_image_adjustments was called
        mock_main_window.viewer.set_image_adjustments.assert_called_once()

        # Get the call arguments
        call_args = mock_main_window.viewer.set_image_adjustments.call_args[0]

        # Verify exactly 4 positional arguments were passed
        assert len(call_args) == 4, (
            f"Expected 4 adjustment parameters (brightness, contrast, gamma, saturation), "
            f"but got {len(call_args)}: {call_args}"
        )

    def test_apply_to_all_viewers_passes_correct_values(
        self, image_adjustment_manager, mock_main_window
    ):
        """Test that apply_to_all_viewers passes the correct adjustment values."""
        # Set specific values
        image_adjustment_manager.brightness = 50.0
        image_adjustment_manager.contrast = -25.0
        image_adjustment_manager.gamma = 1.2
        image_adjustment_manager.saturation = 0.5

        # Call apply_to_all_viewers
        image_adjustment_manager.apply_to_all_viewers()

        # Verify the call
        mock_main_window.viewer.set_image_adjustments.assert_called_once_with(
            50.0,  # brightness
            -25.0,  # contrast
            1.2,  # gamma
            0.5,  # saturation
        )

    def test_saturation_included_in_adjustment_calls(
        self, image_adjustment_manager, mock_main_window
    ):
        """Regression test: saturation must always be included in adjustment calls."""
        image_adjustment_manager.saturation = 0.0  # Grayscale

        image_adjustment_manager.apply_to_all_viewers()

        call_args = mock_main_window.viewer.set_image_adjustments.call_args[0]

        # Verify saturation (4th parameter) is 0.0
        assert call_args[3] == 0.0, "Saturation should be passed as 4th parameter"

    def test_set_saturation_updates_value(
        self, image_adjustment_manager, mock_main_window
    ):
        """Test that set_saturation properly updates the saturation value."""
        # Slider value 50 should become 0.5 (divided by 100)
        image_adjustment_manager.set_saturation(50)

        assert image_adjustment_manager.saturation == 0.5
        assert mock_main_window.settings.saturation == 0.5

    def test_reset_to_defaults_includes_saturation(
        self, image_adjustment_manager, mock_main_window
    ):
        """Test that reset_to_defaults resets saturation to 1.0."""
        # Set non-default value
        image_adjustment_manager.saturation = 0.5

        # Reset
        image_adjustment_manager.reset_to_defaults()

        # Verify saturation is reset to 1.0 (normal)
        assert image_adjustment_manager.saturation == 1.0
        assert mock_main_window.settings.saturation == 1.0


class TestAdjustmentParameterOrder:
    """Tests to ensure the parameter order is always: brightness, contrast, gamma, saturation."""

    @pytest.fixture
    def mock_main_window(self):
        """Create minimal mock for testing parameter order."""
        mw = MagicMock()
        mw.viewer = MagicMock()
        mw.viewer._original_image = MagicMock()
        mw.viewer._original_image_bgra = MagicMock()
        mw.settings = MagicMock()
        mw.settings.brightness = 0.0
        mw.settings.contrast = 0.0
        mw.settings.gamma = 1.0
        mw.settings.saturation = 1.0
        mw.control_panel = MagicMock()
        mw.current_image_path = "/test/image.png"
        mw.view_mode = "single"
        mw.any_slider_dragging = False
        return mw

    @pytest.fixture
    def manager(self, mock_main_window):
        from lazylabel.ui.managers.image_adjustment_manager import (
            ImageAdjustmentManager,
        )

        return ImageAdjustmentManager(mock_main_window)

    def test_parameter_order_is_brightness_contrast_gamma_saturation(
        self, manager, mock_main_window
    ):
        """Verify the exact order of parameters passed to set_image_adjustments."""
        # Set distinct values so we can verify order
        manager.brightness = 10.0
        manager.contrast = 20.0
        manager.gamma = 0.3
        manager.saturation = 0.4

        manager.apply_to_all_viewers()

        brightness, contrast, gamma, saturation = (
            mock_main_window.viewer.set_image_adjustments.call_args[0]
        )

        assert brightness == 10.0, "First param should be brightness"
        assert contrast == 20.0, "Second param should be contrast"
        assert gamma == 0.3, "Third param should be gamma"
        assert saturation == 0.4, "Fourth param should be saturation"
