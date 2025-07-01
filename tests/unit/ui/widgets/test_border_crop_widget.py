import pytest
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QLineEdit, QPushButton

from lazylabel.ui.widgets.border_crop_widget import BorderCropWidget


@pytest.fixture
def border_crop_widget(qtbot):
    """Fixture for BorderCropWidget."""
    widget = BorderCropWidget()
    qtbot.addWidget(widget)
    return widget


def test_border_crop_widget_creation(border_crop_widget):
    """Test that the BorderCropWidget can be created."""
    assert border_crop_widget is not None
    assert isinstance(border_crop_widget.x_edit, QLineEdit)
    assert isinstance(border_crop_widget.y_edit, QLineEdit)
    assert isinstance(border_crop_widget.btn_draw, QPushButton)
    assert isinstance(border_crop_widget.btn_clear, QPushButton)
    assert isinstance(border_crop_widget.btn_apply, QPushButton)


def test_coordinate_setting_and_getting(border_crop_widget):
    """Test setting and getting crop coordinates."""
    # Set coordinates
    border_crop_widget.set_crop_coordinates(10, 20, 100, 200)

    # Check that text fields are updated
    assert border_crop_widget.x_edit.text() == "10:100"
    assert border_crop_widget.y_edit.text() == "20:200"

    # Check that coordinates can be retrieved
    coords = border_crop_widget.get_crop_coordinates()
    assert coords == (10, 20, 100, 200)


def test_has_crop_functionality(border_crop_widget):
    """Test has_crop method."""
    # Initially should have no crop
    assert not border_crop_widget.has_crop()

    # After setting coordinates, should have crop
    border_crop_widget.set_crop_coordinates(5, 10, 50, 100)
    assert border_crop_widget.has_crop()

    # After clearing, should have no crop
    border_crop_widget.clear_crop_coordinates()
    assert not border_crop_widget.has_crop()


def test_clear_crop_coordinates(border_crop_widget):
    """Test clearing crop coordinates."""
    # Set some coordinates first
    border_crop_widget.set_crop_coordinates(15, 25, 150, 250)
    assert border_crop_widget.has_crop()

    # Clear coordinates
    border_crop_widget.clear_crop_coordinates()

    # Check that fields are cleared
    assert border_crop_widget.x_edit.text() == ""
    assert border_crop_widget.y_edit.text() == ""
    assert not border_crop_widget.has_crop()


def test_coordinate_validation_and_ordering(border_crop_widget):
    """Test that coordinates are properly validated and ordered."""
    # Test with reversed coordinates (should be auto-corrected)
    border_crop_widget.set_crop_coordinates(100, 200, 10, 20)
    coords = border_crop_widget.get_crop_coordinates()
    assert coords == (10, 20, 100, 200)  # Should be reordered


def test_manual_coordinate_input_valid(border_crop_widget, qtbot):
    """Test manual coordinate input with valid values."""
    # Set valid coordinates in text fields
    border_crop_widget.x_edit.setText("30:150")
    border_crop_widget.y_edit.setText("40:180")

    # Simulate signal emission
    with qtbot.waitSignal(border_crop_widget.crop_applied) as blocker:
        border_crop_widget._apply_crop_from_text()

    # Check that signal was emitted with correct coordinates
    assert blocker.args == [30, 40, 150, 180]


def test_manual_coordinate_input_invalid_format(border_crop_widget):
    """Test manual coordinate input with invalid format."""
    # Set invalid format
    border_crop_widget.x_edit.setText("invalid")
    border_crop_widget.y_edit.setText("30:150")

    # Should not emit signal and should show error status
    border_crop_widget._apply_crop_from_text()
    assert "Invalid X format" in border_crop_widget.status_label.text()


def test_manual_coordinate_input_missing_values(border_crop_widget):
    """Test manual coordinate input with missing values."""
    # Set only one field
    border_crop_widget.x_edit.setText("30:150")
    border_crop_widget.y_edit.setText("")

    # Should not emit signal and should show error status
    border_crop_widget._apply_crop_from_text()
    assert "Enter both X and Y coordinates" in border_crop_widget.status_label.text()


def test_manual_coordinate_input_non_numeric(border_crop_widget):
    """Test manual coordinate input with non-numeric values."""
    # Set non-numeric values
    border_crop_widget.x_edit.setText("abc:def")
    border_crop_widget.y_edit.setText("30:150")

    # Should not emit signal and should show error status
    border_crop_widget._apply_crop_from_text()
    assert "Invalid coordinates" in border_crop_widget.status_label.text()


def test_get_crop_coordinates_invalid(border_crop_widget):
    """Test get_crop_coordinates with invalid input."""
    # Set invalid format
    border_crop_widget.x_edit.setText("invalid")
    border_crop_widget.y_edit.setText("30:150")

    # Should return None for invalid coordinates
    coords = border_crop_widget.get_crop_coordinates()
    assert coords is None


def test_get_crop_coordinates_empty(border_crop_widget):
    """Test get_crop_coordinates with empty fields."""
    # Clear all fields
    border_crop_widget.x_edit.setText("")
    border_crop_widget.y_edit.setText("")

    # Should return None for empty coordinates
    coords = border_crop_widget.get_crop_coordinates()
    assert coords is None


def test_button_signals(border_crop_widget, qtbot):
    """Test that buttons emit correct signals."""
    # Test draw button signal
    with qtbot.waitSignal(border_crop_widget.crop_draw_requested):
        border_crop_widget.btn_draw.click()

    # Test clear button signal
    with qtbot.waitSignal(border_crop_widget.crop_clear_requested):
        border_crop_widget.btn_clear.click()


def test_return_key_triggers_apply(border_crop_widget, qtbot):
    """Test that pressing Return in text fields triggers apply."""
    border_crop_widget.x_edit.setText("10:100")
    border_crop_widget.y_edit.setText("20:200")

    # Test Return key in X field
    with qtbot.waitSignal(border_crop_widget.crop_applied) as blocker:
        qtbot.keyPress(border_crop_widget.x_edit, Qt.Key.Key_Return)
    assert blocker.args == [10, 20, 100, 200]

    # Test Return key in Y field
    with qtbot.waitSignal(border_crop_widget.crop_applied) as blocker:
        qtbot.keyPress(border_crop_widget.y_edit, Qt.Key.Key_Return)
    assert blocker.args == [10, 20, 100, 200]


def test_status_setting(border_crop_widget):
    """Test status message setting."""
    test_message = "Test status message"
    border_crop_widget.set_status(test_message)
    assert border_crop_widget.status_label.text() == test_message


def test_coordinate_auto_ordering(border_crop_widget):
    """Test that coordinates are automatically ordered correctly."""
    # Test with x coordinates reversed
    border_crop_widget.x_edit.setText("100:10")
    border_crop_widget.y_edit.setText("20:200")

    coords = border_crop_widget.get_crop_coordinates()
    assert coords == (10, 20, 100, 200)  # x coordinates should be swapped

    # Test with y coordinates reversed
    border_crop_widget.x_edit.setText("10:100")
    border_crop_widget.y_edit.setText("200:20")

    coords = border_crop_widget.get_crop_coordinates()
    assert coords == (10, 20, 100, 200)  # y coordinates should be swapped


def test_edge_case_single_pixel_crop(border_crop_widget):
    """Test edge case with single pixel crop area."""
    border_crop_widget.set_crop_coordinates(50, 50, 50, 50)
    coords = border_crop_widget.get_crop_coordinates()
    assert coords == (50, 50, 50, 50)  # Should handle single pixel area
