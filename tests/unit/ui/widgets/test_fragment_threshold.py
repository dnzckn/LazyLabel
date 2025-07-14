"""Tests for fragment threshold widget functionality."""

from unittest.mock import MagicMock

import pytest

from lazylabel.ui.widgets.fragment_threshold_widget import FragmentThresholdWidget


@pytest.fixture
def mock_sam_model():
    """Create a mock SAM model."""
    mock_model = MagicMock()
    mock_model.is_loaded = True
    mock_model.device = "CPU"
    return mock_model


@pytest.fixture
def fragment_widget(qtbot, mock_sam_model):
    """Fixture for FragmentThresholdWidget with mocked dependencies."""
    widget = FragmentThresholdWidget()
    qtbot.addWidget(widget)
    return widget


def test_fragment_threshold_widget_exists(fragment_widget):
    """Test that the fragment threshold slider and components exist."""
    assert hasattr(fragment_widget, "fragment_slider")
    assert hasattr(fragment_widget, "fragment_edit")


def test_fragment_threshold_default_values(fragment_widget):
    """Test that fragment threshold has correct default values."""
    assert fragment_widget.fragment_slider.value() == 0
    assert fragment_widget.fragment_edit.text() == "0"
    assert fragment_widget.fragment_slider.minimum() == 0
    assert fragment_widget.fragment_slider.maximum() == 100


def test_fragment_threshold_slider_change(fragment_widget, qtbot):
    """Test that changing the slider updates the text field and emits signal."""
    # Connect to signal to test emission
    signal_emitted = False
    received_value = None

    def on_signal(value):
        nonlocal signal_emitted, received_value
        signal_emitted = True
        received_value = value

    fragment_widget.fragment_threshold_changed.connect(on_signal)

    # Change slider value
    fragment_widget.fragment_slider.setValue(50)

    # Check that text field is updated and signal is emitted
    assert fragment_widget.fragment_edit.text() == "50"
    assert signal_emitted
    assert received_value == 50


def test_fragment_threshold_text_change(fragment_widget, qtbot):
    """Test that changing the text field updates the slider."""
    # Set text value
    fragment_widget.fragment_edit.setText("75")
    fragment_widget.fragment_edit.editingFinished.emit()

    # Check that slider is updated
    assert fragment_widget.fragment_slider.value() == 75


def test_fragment_threshold_text_validation(fragment_widget, qtbot):
    """Test that invalid text input is handled correctly."""
    # Test invalid text
    fragment_widget.fragment_edit.setText("invalid")
    fragment_widget.fragment_edit.editingFinished.emit()

    # Should revert to slider value
    assert fragment_widget.fragment_edit.text() == "0"

    # Test out of range values
    fragment_widget.fragment_edit.setText("150")
    fragment_widget.fragment_edit.editingFinished.emit()

    # Should clamp to maximum
    assert fragment_widget.fragment_slider.value() == 100
    assert fragment_widget.fragment_edit.text() == "100"

    # Test negative values
    fragment_widget.fragment_edit.setText("-10")
    fragment_widget.fragment_edit.editingFinished.emit()

    # Should clamp to minimum
    assert fragment_widget.fragment_slider.value() == 0
    assert fragment_widget.fragment_edit.text() == "0"


def test_fragment_threshold_reset_to_defaults(fragment_widget, qtbot):
    """Test that setting to default value works."""
    # Change to non-default value
    fragment_widget.fragment_slider.setValue(80)

    # Set back to default
    fragment_widget.set_fragment_threshold(0)

    # Should be back to default
    assert fragment_widget.fragment_slider.value() == 0
    assert fragment_widget.fragment_edit.text() == "0"


def test_fragment_threshold_get_set_methods(fragment_widget):
    """Test the getter and setter methods for fragment threshold."""
    # Test setter
    fragment_widget.set_fragment_threshold(42)
    assert fragment_widget.fragment_slider.value() == 42
    assert fragment_widget.fragment_edit.text() == "42"

    # Test getter
    assert fragment_widget.get_fragment_threshold() == 42


def test_fragment_threshold_tooltip(fragment_widget):
    """Test that the fragment threshold slider has an appropriate tooltip."""
    tooltip = fragment_widget.fragment_slider.toolTip()
    assert "0=no filtering" in tooltip
    assert "50=drop <50% of largest" in tooltip
    assert "100=only keep largest" in tooltip
