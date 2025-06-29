"""Tests for fragment threshold widget functionality."""

from unittest.mock import MagicMock

import pytest

from lazylabel.ui.widgets.adjustments_widget import AdjustmentsWidget


@pytest.fixture
def mock_sam_model():
    """Create a mock SAM model."""
    mock_model = MagicMock()
    mock_model.is_loaded = True
    mock_model.device = "CPU"
    return mock_model


@pytest.fixture
def adjustments_widget(qtbot, mock_sam_model):
    """Fixture for AdjustmentsWidget with mocked dependencies."""
    widget = AdjustmentsWidget()
    qtbot.addWidget(widget)
    return widget


def test_fragment_threshold_widget_exists(adjustments_widget):
    """Test that the fragment threshold slider and components exist."""
    assert hasattr(adjustments_widget, "fragment_slider")
    assert hasattr(adjustments_widget, "fragment_edit")
    assert hasattr(adjustments_widget, "fragment_label")
    assert adjustments_widget.fragment_label.text() == "Fragment:"


def test_fragment_threshold_default_values(adjustments_widget):
    """Test that fragment threshold has correct default values."""
    assert adjustments_widget.fragment_slider.value() == 0
    assert adjustments_widget.fragment_edit.text() == "0"
    assert adjustments_widget.fragment_slider.minimum() == 0
    assert adjustments_widget.fragment_slider.maximum() == 100


def test_fragment_threshold_slider_change(adjustments_widget, qtbot):
    """Test that changing the slider updates the text field and emits signal."""
    # Connect to signal to test emission
    signal_emitted = False
    received_value = None

    def on_signal(value):
        nonlocal signal_emitted, received_value
        signal_emitted = True
        received_value = value

    adjustments_widget.fragment_threshold_changed.connect(on_signal)

    # Change slider value
    adjustments_widget.fragment_slider.setValue(50)

    # Check that text field is updated and signal is emitted
    assert adjustments_widget.fragment_edit.text() == "50"
    assert signal_emitted
    assert received_value == 50


def test_fragment_threshold_text_change(adjustments_widget, qtbot):
    """Test that changing the text field updates the slider."""
    # Set text value
    adjustments_widget.fragment_edit.setText("75")
    adjustments_widget.fragment_edit.editingFinished.emit()

    # Check that slider is updated
    assert adjustments_widget.fragment_slider.value() == 75


def test_fragment_threshold_text_validation(adjustments_widget, qtbot):
    """Test that invalid text input is handled correctly."""
    # Test invalid text
    adjustments_widget.fragment_edit.setText("invalid")
    adjustments_widget.fragment_edit.editingFinished.emit()

    # Should revert to slider value
    assert adjustments_widget.fragment_edit.text() == "0"

    # Test out of range values
    adjustments_widget.fragment_edit.setText("150")
    adjustments_widget.fragment_edit.editingFinished.emit()

    # Should clamp to maximum
    assert adjustments_widget.fragment_slider.value() == 100
    assert adjustments_widget.fragment_edit.text() == "100"

    # Test negative values
    adjustments_widget.fragment_edit.setText("-10")
    adjustments_widget.fragment_edit.editingFinished.emit()

    # Should clamp to minimum
    assert adjustments_widget.fragment_slider.value() == 0
    assert adjustments_widget.fragment_edit.text() == "0"


def test_fragment_threshold_reset_to_defaults(adjustments_widget, qtbot):
    """Test that reset to defaults sets fragment threshold to 0."""
    # Change to non-default value
    adjustments_widget.fragment_slider.setValue(80)

    # Reset to defaults
    adjustments_widget.reset_to_defaults()

    # Should be back to default
    assert adjustments_widget.fragment_slider.value() == 0
    assert adjustments_widget.fragment_edit.text() == "0"


def test_fragment_threshold_get_set_methods(adjustments_widget):
    """Test the getter and setter methods for fragment threshold."""
    # Test setter
    adjustments_widget.set_fragment_threshold(42)
    assert adjustments_widget.fragment_slider.value() == 42
    assert adjustments_widget.fragment_edit.text() == "42"

    # Test getter
    assert adjustments_widget.get_fragment_threshold() == 42


def test_fragment_threshold_tooltip(adjustments_widget):
    """Test that the fragment threshold slider has an appropriate tooltip."""
    tooltip = adjustments_widget.fragment_slider.toolTip()
    assert "0=no filtering" in tooltip
    assert "50=drop <50% of largest" in tooltip
    assert "100=only keep largest" in tooltip
