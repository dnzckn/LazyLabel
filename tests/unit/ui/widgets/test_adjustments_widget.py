"""Tests for AdjustmentsWidget (image adjustments: brightness, contrast, gamma, saturation)."""

import pytest
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QLineEdit

from lazylabel.ui.widgets.adjustments_widget import AdjustmentsWidget


@pytest.fixture
def adjustments_widget(qtbot):
    """Fixture for AdjustmentsWidget."""
    widget = AdjustmentsWidget()
    qtbot.addWidget(widget)
    return widget


def test_adjustments_widget_creation(adjustments_widget):
    """Test that the AdjustmentsWidget can be created."""
    assert adjustments_widget is not None
    assert isinstance(adjustments_widget.brightness_edit, QLineEdit)
    assert isinstance(adjustments_widget.contrast_edit, QLineEdit)
    assert isinstance(adjustments_widget.gamma_edit, QLineEdit)
    assert isinstance(adjustments_widget.saturation_edit, QLineEdit)


def test_brightness_slider_updates_edit(adjustments_widget, qtbot):
    """Test that changing brightness slider updates its QLineEdit."""
    with qtbot.waitSignal(adjustments_widget.brightness_changed) as blocker:
        adjustments_widget.brightness_slider.setValue(50)
    assert blocker.args == [50]
    assert adjustments_widget.brightness_edit.text() == "50"


def test_brightness_edit_updates_slider(adjustments_widget, qtbot):
    """Test that changing brightness QLineEdit updates its slider and emits signal."""
    adjustments_widget.brightness_edit.setText("-25")
    qtbot.keyPress(adjustments_widget.brightness_edit, Qt.Key.Key_Return)
    with qtbot.waitSignal(adjustments_widget.brightness_changed) as blocker:
        adjustments_widget.brightness_edit.editingFinished.emit()
    assert blocker.args == [-25]
    assert adjustments_widget.brightness_slider.value() == -25


def test_brightness_edit_invalid_input(adjustments_widget, qtbot):
    """Test that invalid input in brightness QLineEdit is handled."""
    initial_value = adjustments_widget.brightness_slider.value()
    adjustments_widget.brightness_edit.setText("invalid")
    qtbot.keyPress(adjustments_widget.brightness_edit, Qt.Key.Key_Return)
    adjustments_widget.brightness_edit.editingFinished.emit()
    assert adjustments_widget.brightness_slider.value() == initial_value
    assert adjustments_widget.brightness_edit.text() == f"{initial_value}"


def test_contrast_slider_updates_edit(adjustments_widget, qtbot):
    """Test that changing contrast slider updates its QLineEdit."""
    with qtbot.waitSignal(adjustments_widget.contrast_changed) as blocker:
        adjustments_widget.contrast_slider.setValue(75)
    assert blocker.args == [75]
    assert adjustments_widget.contrast_edit.text() == "75"


def test_contrast_edit_updates_slider(adjustments_widget, qtbot):
    """Test that changing contrast QLineEdit updates its slider and emits signal."""
    adjustments_widget.contrast_edit.setText("-10")
    qtbot.keyPress(adjustments_widget.contrast_edit, Qt.Key.Key_Return)
    with qtbot.waitSignal(adjustments_widget.contrast_changed) as blocker:
        adjustments_widget.contrast_edit.editingFinished.emit()
    assert blocker.args == [-10]
    assert adjustments_widget.contrast_slider.value() == -10


def test_contrast_edit_invalid_input(adjustments_widget, qtbot):
    """Test that invalid input in contrast QLineEdit is handled."""
    initial_value = adjustments_widget.contrast_slider.value()
    adjustments_widget.contrast_edit.setText("bad")
    qtbot.keyPress(adjustments_widget.contrast_edit, Qt.Key.Key_Return)
    adjustments_widget.contrast_edit.editingFinished.emit()
    assert adjustments_widget.contrast_slider.value() == initial_value
    assert adjustments_widget.contrast_edit.text() == f"{initial_value}"


def test_gamma_slider_updates_edit(adjustments_widget, qtbot):
    """Test that changing gamma slider updates its QLineEdit."""
    with qtbot.waitSignal(adjustments_widget.gamma_changed) as blocker:
        adjustments_widget.gamma_slider.setValue(150)  # Corresponds to 1.50
    assert blocker.args == [150]
    assert adjustments_widget.gamma_edit.text() == "1.50"


def test_gamma_edit_updates_slider(adjustments_widget, qtbot):
    """Test that changing gamma QLineEdit updates its slider and emits signal."""
    adjustments_widget.gamma_edit.setText("0.75")
    qtbot.keyPress(adjustments_widget.gamma_edit, Qt.Key.Key_Return)
    with qtbot.waitSignal(adjustments_widget.gamma_changed) as blocker:
        adjustments_widget.gamma_edit.editingFinished.emit()
    assert blocker.args == [75]  # Corresponds to 0.75
    assert adjustments_widget.gamma_slider.value() == 75


def test_gamma_edit_invalid_input(adjustments_widget, qtbot):
    """Test that invalid input in gamma QLineEdit is handled."""
    initial_value = adjustments_widget.gamma_slider.value()
    adjustments_widget.gamma_edit.setText("wrong")
    qtbot.keyPress(adjustments_widget.gamma_edit, Qt.Key.Key_Return)
    adjustments_widget.gamma_edit.editingFinished.emit()
    assert adjustments_widget.gamma_slider.value() == initial_value
    assert adjustments_widget.gamma_edit.text() == f"{initial_value / 100.0:.2f}"


def test_saturation_slider_updates_edit(adjustments_widget, qtbot):
    """Test that changing saturation slider updates its QLineEdit."""
    with qtbot.waitSignal(adjustments_widget.saturation_changed) as blocker:
        adjustments_widget.saturation_slider.setValue(50)  # Corresponds to 0.50
    assert blocker.args == [50]
    assert adjustments_widget.saturation_edit.text() == "0.50"


def test_saturation_edit_updates_slider(adjustments_widget, qtbot):
    """Test that changing saturation QLineEdit updates its slider and emits signal."""
    adjustments_widget.saturation_edit.setText("1.50")
    qtbot.keyPress(adjustments_widget.saturation_edit, Qt.Key.Key_Return)
    with qtbot.waitSignal(adjustments_widget.saturation_changed) as blocker:
        adjustments_widget.saturation_edit.editingFinished.emit()
    assert blocker.args == [150]  # Corresponds to 1.50
    assert adjustments_widget.saturation_slider.value() == 150


def test_saturation_edit_invalid_input(adjustments_widget, qtbot):
    """Test that invalid input in saturation QLineEdit is handled."""
    initial_value = adjustments_widget.saturation_slider.value()
    adjustments_widget.saturation_edit.setText("wrong")
    qtbot.keyPress(adjustments_widget.saturation_edit, Qt.Key.Key_Return)
    adjustments_widget.saturation_edit.editingFinished.emit()
    assert adjustments_widget.saturation_slider.value() == initial_value
    assert adjustments_widget.saturation_edit.text() == f"{initial_value / 100.0:.2f}"


def test_saturation_slider_zero_for_grayscale(adjustments_widget, qtbot):
    """Test that saturation slider at 0 represents grayscale (black and white)."""
    with qtbot.waitSignal(adjustments_widget.saturation_changed) as blocker:
        adjustments_widget.saturation_slider.setValue(0)
    assert blocker.args == [0]
    assert adjustments_widget.saturation_edit.text() == "0.00"


def test_reset_button_resets_all_values(adjustments_widget, qtbot):
    """Test that the reset button sets all adjustment values back to defaults."""
    # Change all values from their defaults
    adjustments_widget.set_brightness(50)
    adjustments_widget.set_contrast(-50)
    adjustments_widget.set_gamma(50)  # 0.50
    adjustments_widget.set_saturation(50)  # 0.50

    # Assert they are changed
    assert adjustments_widget.get_brightness() == 50
    assert adjustments_widget.get_contrast() == -50
    assert adjustments_widget.get_gamma() == 50
    assert adjustments_widget.get_saturation() == 50

    # Click the reset button
    with qtbot.waitSignal(adjustments_widget.reset_requested):
        adjustments_widget.btn_reset.click()

    # Assert they are back to defaults
    assert adjustments_widget.get_brightness() == 0
    assert adjustments_widget.get_contrast() == 0
    assert adjustments_widget.get_gamma() == 100
    assert adjustments_widget.get_saturation() == 100

    # Assert text edits also reflect defaults
    assert adjustments_widget.brightness_edit.text() == "0"
    assert adjustments_widget.contrast_edit.text() == "0"
    assert adjustments_widget.gamma_edit.text() == "1.00"
    assert adjustments_widget.saturation_edit.text() == "1.00"
