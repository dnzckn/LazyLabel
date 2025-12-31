"""Tests for AnnotationSettingsWidget (size, pan, join threshold)."""

import pytest
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QLineEdit

from lazylabel.ui.widgets.annotation_settings_widget import AnnotationSettingsWidget


@pytest.fixture
def annotation_settings_widget(qtbot):
    """Fixture for AnnotationSettingsWidget."""
    widget = AnnotationSettingsWidget()
    qtbot.addWidget(widget)
    return widget


def test_annotation_settings_widget_creation(annotation_settings_widget):
    """Test that the AnnotationSettingsWidget can be created."""
    assert annotation_settings_widget is not None
    assert isinstance(annotation_settings_widget.size_edit, QLineEdit)
    assert isinstance(annotation_settings_widget.pan_edit, QLineEdit)
    assert isinstance(annotation_settings_widget.join_edit, QLineEdit)


def test_annotation_size_slider_updates_edit(annotation_settings_widget, qtbot):
    """Test that changing annotation size slider updates its QLineEdit."""
    with qtbot.waitSignal(
        annotation_settings_widget.annotation_size_changed
    ) as blocker:
        annotation_settings_widget.size_slider.setValue(20)
    assert blocker.args == [20]
    assert annotation_settings_widget.size_edit.text() == "2.0"


def test_annotation_size_edit_updates_slider(annotation_settings_widget, qtbot):
    """Test that changing annotation size QLineEdit updates its slider and emits signal."""
    annotation_settings_widget.size_edit.setText("3.5")
    qtbot.keyPress(annotation_settings_widget.size_edit, Qt.Key.Key_Return)
    with qtbot.waitSignal(
        annotation_settings_widget.annotation_size_changed
    ) as blocker:
        annotation_settings_widget.size_edit.editingFinished.emit()
    assert blocker.args == [35]
    assert annotation_settings_widget.size_slider.value() == 35


def test_annotation_size_edit_invalid_input(annotation_settings_widget, qtbot):
    """Test that invalid input in annotation size QLineEdit is handled."""
    initial_value = annotation_settings_widget.size_slider.value()
    annotation_settings_widget.size_edit.setText("abc")
    qtbot.keyPress(annotation_settings_widget.size_edit, Qt.Key.Key_Return)
    annotation_settings_widget.size_edit.editingFinished.emit()
    assert annotation_settings_widget.size_slider.value() == initial_value
    assert annotation_settings_widget.size_edit.text() == f"{initial_value / 10.0:.1f}"


def test_pan_speed_slider_updates_edit(annotation_settings_widget, qtbot):
    """Test that changing pan speed slider updates its QLineEdit."""
    with qtbot.waitSignal(annotation_settings_widget.pan_speed_changed) as blocker:
        annotation_settings_widget.pan_slider.setValue(50)
    assert blocker.args == [50]
    assert annotation_settings_widget.pan_edit.text() == "5.0"


def test_pan_speed_edit_updates_slider(annotation_settings_widget, qtbot):
    """Test that changing pan speed QLineEdit updates its slider and emits signal."""
    annotation_settings_widget.pan_edit.setText("7.5")
    qtbot.keyPress(annotation_settings_widget.pan_edit, Qt.Key.Key_Return)
    with qtbot.waitSignal(annotation_settings_widget.pan_speed_changed) as blocker:
        annotation_settings_widget.pan_edit.editingFinished.emit()
    assert blocker.args == [75]
    assert annotation_settings_widget.pan_slider.value() == 75


def test_pan_speed_edit_invalid_input(annotation_settings_widget, qtbot):
    """Test that invalid input in pan speed QLineEdit is handled."""
    initial_value = annotation_settings_widget.pan_slider.value()
    annotation_settings_widget.pan_edit.setText("xyz")
    qtbot.keyPress(annotation_settings_widget.pan_edit, Qt.Key.Key_Return)
    annotation_settings_widget.pan_edit.editingFinished.emit()
    assert annotation_settings_widget.pan_slider.value() == initial_value
    assert annotation_settings_widget.pan_edit.text() == f"{initial_value / 10.0:.1f}"


def test_join_threshold_slider_updates_edit(annotation_settings_widget, qtbot):
    """Test that changing join threshold slider updates its QLineEdit."""
    with qtbot.waitSignal(annotation_settings_widget.join_threshold_changed) as blocker:
        annotation_settings_widget.join_slider.setValue(5)
    assert blocker.args == [5]
    assert annotation_settings_widget.join_edit.text() == "5"


def test_join_threshold_edit_updates_slider(annotation_settings_widget, qtbot):
    """Test that changing join threshold QLineEdit updates its slider and emits signal."""
    annotation_settings_widget.join_edit.setText("8")
    qtbot.keyPress(annotation_settings_widget.join_edit, Qt.Key.Key_Return)
    with qtbot.waitSignal(annotation_settings_widget.join_threshold_changed) as blocker:
        annotation_settings_widget.join_edit.editingFinished.emit()
    assert blocker.args == [8]
    assert annotation_settings_widget.join_slider.value() == 8


def test_join_threshold_edit_invalid_input(annotation_settings_widget, qtbot):
    """Test that invalid input in join threshold QLineEdit is handled."""
    initial_value = annotation_settings_widget.join_slider.value()
    annotation_settings_widget.join_edit.setText("abc")
    qtbot.keyPress(annotation_settings_widget.join_edit, Qt.Key.Key_Return)
    annotation_settings_widget.join_edit.editingFinished.emit()
    assert annotation_settings_widget.join_slider.value() == initial_value
    assert annotation_settings_widget.join_edit.text() == f"{initial_value}"


def test_reset_button_resets_all_values(annotation_settings_widget, qtbot):
    """Test that the reset button sets all annotation settings back to defaults."""
    # Change all values from their defaults
    annotation_settings_widget.set_annotation_size(30)
    annotation_settings_widget.set_pan_speed(70)
    annotation_settings_widget.set_join_threshold(7)

    # Assert they are changed
    assert annotation_settings_widget.get_annotation_size() == 30
    assert annotation_settings_widget.get_pan_speed() == 70
    assert annotation_settings_widget.get_join_threshold() == 7

    # Click the reset button
    with qtbot.waitSignal(annotation_settings_widget.reset_requested):
        annotation_settings_widget.btn_reset.click()

    # Assert they are back to defaults
    assert annotation_settings_widget.get_annotation_size() == 10
    assert annotation_settings_widget.get_pan_speed() == 10
    assert annotation_settings_widget.get_join_threshold() == 2

    # Assert text edits also reflect defaults
    assert annotation_settings_widget.size_edit.text() == "1.0"
    assert annotation_settings_widget.pan_edit.text() == "1.0"
    assert annotation_settings_widget.join_edit.text() == "2"
