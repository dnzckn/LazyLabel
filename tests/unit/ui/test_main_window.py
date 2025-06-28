from unittest.mock import MagicMock

import pytest
from PyQt6.QtCore import QPointF, Qt
from PyQt6.QtGui import QMouseEvent, QPixmap

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

    # Simulate a mouse press event on the viewer's scene
    pos = QPointF(10, 10)
    mouse_event = MagicMock(spec=QMouseEvent)
    mouse_event.type.return_value = QMouseEvent.Type.MouseButtonPress
    mouse_event.button.return_value = Qt.MouseButton.LeftButton
    mouse_event.buttons.return_value = Qt.MouseButton.LeftButton
    mouse_event.modifiers.return_value = Qt.KeyboardModifier.NoModifier
    mouse_event.scenePos = MagicMock(return_value=pos)
    mouse_event.pos.return_value = pos.toPoint()
    mouse_event.isAccepted.return_value = False
    mouse_event.accept = MagicMock()

    # Call the scene's mousePressEvent, which will then call _scene_mouse_press
    main_window.viewer.scene().mousePressEvent(mouse_event)

    # Assert that _add_point was called
    main_window._add_point.assert_called_once_with(pos, positive=True)
