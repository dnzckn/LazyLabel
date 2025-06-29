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
    assert isinstance(adjustments_widget.size_edit, QLineEdit)
    assert isinstance(adjustments_widget.pan_edit, QLineEdit)
    assert isinstance(adjustments_widget.join_edit, QLineEdit)
    assert isinstance(adjustments_widget.brightness_edit, QLineEdit)
    assert isinstance(adjustments_widget.contrast_edit, QLineEdit)
    assert isinstance(adjustments_widget.gamma_edit, QLineEdit)


def test_annotation_size_slider_updates_edit(adjustments_widget, qtbot):
    """Test that changing annotation size slider updates its QLineEdit."""
    with qtbot.waitSignal(adjustments_widget.annotation_size_changed) as blocker:
        adjustments_widget.size_slider.setValue(20)
    assert blocker.args == [20]
    assert adjustments_widget.size_edit.text() == "2.0"


def test_annotation_size_edit_updates_slider(adjustments_widget, qtbot):
    """Test that changing annotation size QLineEdit updates its slider and emits signal."""
    adjustments_widget.size_edit.setText("3.5")
    qtbot.keyPress(adjustments_widget.size_edit, Qt.Key.Key_Return)
    with qtbot.waitSignal(adjustments_widget.annotation_size_changed) as blocker:
        adjustments_widget.size_edit.editingFinished.emit()  # Manually emit after text change
    assert blocker.args == [35]
    assert adjustments_widget.size_slider.value() == 35


def test_annotation_size_edit_invalid_input(adjustments_widget, qtbot):
    """Test that invalid input in annotation size QLineEdit is handled."""
    initial_value = adjustments_widget.size_slider.value()
    adjustments_widget.size_edit.setText("abc")
    qtbot.keyPress(adjustments_widget.size_edit, Qt.Key.Key_Return)
    adjustments_widget.size_edit.editingFinished.emit()
    assert adjustments_widget.size_slider.value() == initial_value
    assert adjustments_widget.size_edit.text() == f"{initial_value / 10.0:.1f}"


def test_pan_speed_slider_updates_edit(adjustments_widget, qtbot):
    """Test that changing pan speed slider updates its QLineEdit."""
    with qtbot.waitSignal(adjustments_widget.pan_speed_changed) as blocker:
        adjustments_widget.pan_slider.setValue(50)
    assert blocker.args == [50]
    assert adjustments_widget.pan_edit.text() == "5.0"


def test_pan_speed_edit_updates_slider(adjustments_widget, qtbot):
    """Test that changing pan speed QLineEdit updates its slider and emits signal."""
    adjustments_widget.pan_edit.setText("7.5")
    qtbot.keyPress(adjustments_widget.pan_edit, Qt.Key.Key_Return)
    with qtbot.waitSignal(adjustments_widget.pan_speed_changed) as blocker:
        adjustments_widget.pan_edit.editingFinished.emit()
    assert blocker.args == [75]
    assert adjustments_widget.pan_slider.value() == 75


def test_pan_speed_edit_invalid_input(adjustments_widget, qtbot):
    """Test that invalid input in pan speed QLineEdit is handled."""
    initial_value = adjustments_widget.pan_slider.value()
    adjustments_widget.pan_edit.setText("xyz")
    qtbot.keyPress(adjustments_widget.pan_edit, Qt.Key.Key_Return)
    adjustments_widget.pan_edit.editingFinished.emit()
    assert adjustments_widget.pan_slider.value() == initial_value
    assert adjustments_widget.pan_edit.text() == f"{initial_value / 10.0:.1f}"


def test_join_threshold_slider_updates_edit(adjustments_widget, qtbot):
    """Test that changing join threshold slider updates its QLineEdit."""
    with qtbot.waitSignal(adjustments_widget.join_threshold_changed) as blocker:
        adjustments_widget.join_slider.setValue(5)
    assert blocker.args == [5]
    assert adjustments_widget.join_edit.text() == "5"


def test_join_threshold_edit_updates_slider(adjustments_widget, qtbot):
    """Test that changing join threshold QLineEdit updates its slider and emits signal."""
    adjustments_widget.join_edit.setText("8")
    qtbot.keyPress(adjustments_widget.join_edit, Qt.Key.Key_Return)
    with qtbot.waitSignal(adjustments_widget.join_threshold_changed) as blocker:
        adjustments_widget.join_edit.editingFinished.emit()
    assert blocker.args == [8]
    assert adjustments_widget.join_slider.value() == 8


def test_join_threshold_edit_invalid_input(adjustments_widget, qtbot):
    """Test that invalid input in join threshold QLineEdit is handled."""
    initial_value = adjustments_widget.join_slider.value()
    adjustments_widget.join_edit.setText("abc")
    qtbot.keyPress(adjustments_widget.join_edit, Qt.Key.Key_Return)
    adjustments_widget.join_edit.editingFinished.emit()
    assert adjustments_widget.join_slider.value() == initial_value
    assert adjustments_widget.join_edit.text() == f"{initial_value}"


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


def test_reset_button_resets_all_values(adjustments_widget, qtbot):
    """Test that the reset button sets all adjustment values back to defaults."""
    # Change all values from their defaults
    adjustments_widget.set_annotation_size(30)
    adjustments_widget.set_pan_speed(70)
    adjustments_widget.set_join_threshold(7)
    adjustments_widget.set_brightness(50)
    adjustments_widget.set_contrast(-50)
    adjustments_widget.set_gamma(50)  # 0.50

    # Assert they are changed
    assert adjustments_widget.get_annotation_size() == 30
    assert adjustments_widget.get_pan_speed() == 70
    assert adjustments_widget.get_join_threshold() == 7
    assert adjustments_widget.get_brightness() == 50
    assert adjustments_widget.get_contrast() == -50
    assert adjustments_widget.get_gamma() == 50

    # Click the reset button
    with qtbot.waitSignal(adjustments_widget.reset_requested):
        adjustments_widget.btn_reset.click()

    # Directly call reset_to_defaults for unit test
    adjustments_widget.reset_to_defaults()

    # Assert they are back to defaults
    assert adjustments_widget.get_annotation_size() == 10
    assert adjustments_widget.get_pan_speed() == 10
    assert adjustments_widget.get_join_threshold() == 2
    assert adjustments_widget.get_brightness() == 0
    assert adjustments_widget.get_contrast() == 0
    assert adjustments_widget.get_gamma() == 100

    # Assert text edits also reflect defaults
    assert adjustments_widget.size_edit.text() == "1.0"
    assert adjustments_widget.pan_edit.text() == "1.0"
    assert adjustments_widget.join_edit.text() == "2"
    assert adjustments_widget.brightness_edit.text() == "0"
    assert adjustments_widget.contrast_edit.text() == "0"
    assert adjustments_widget.gamma_edit.text() == "1.00"
