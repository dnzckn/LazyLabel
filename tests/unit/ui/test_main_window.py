from unittest.mock import MagicMock

import pytest
from PyQt6.QtCore import QPointF, Qt
from PyQt6.QtGui import QPixmap

from lazylabel.ui.main_window import MainWindow


@pytest.fixture
def main_window(qtbot):
    """Fixture for MainWindow."""
    window = MainWindow()
    qtbot.addWidget(window)
    return window


def test_main_window_creation(main_window):
    """Test that the MainWindow can be created."""
    assert main_window is not None


def test_sam_point_creation_on_mouse_press(main_window, qtbot):
    """Test that _add_point is called when in sam_points mode and mouse is pressed."""
    # Set the mode to sam_points
    main_window.set_sam_mode()

    # Load a dummy pixmap to ensure mouse events are processed
    dummy_pixmap = QPixmap(100, 100)  # Create a 100x100 dummy pixmap
    dummy_pixmap.fill(Qt.GlobalColor.white)
    main_window.viewer.set_photo(dummy_pixmap)

    # Mock _add_point and _original_mouse_press to prevent side effects and TypeErrors
    main_window._add_point = MagicMock()
    main_window._original_mouse_press = MagicMock()

    # Simulate a left mouse press event by calling the handler directly
    pos = QPointF(10, 10)
    mock_event = MagicMock()
    mock_event.button.return_value = Qt.MouseButton.LeftButton
    mock_event.scenePos.return_value = pos

    # Call the scene mouse press handler directly
    main_window._scene_mouse_press(mock_event)

    # Assert that _add_point was called
    main_window._add_point.assert_called_once_with(pos, positive=True)
