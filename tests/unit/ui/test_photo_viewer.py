from unittest.mock import MagicMock

import pytest
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import QGraphicsScene

from lazylabel.ui.photo_viewer import PhotoViewer


@pytest.fixture
def photo_viewer(qtbot):
    """Fixture for PhotoViewer."""
    scene = QGraphicsScene()
    viewer = PhotoViewer(scene)
    qtbot.addWidget(viewer)
    return viewer


def test_photo_viewer_creation(photo_viewer):
    """Test that the PhotoViewer can be created."""
    assert photo_viewer is not None


def test_pan_mode(photo_viewer, qtbot):
    """Test the pan mode."""
    photo_viewer.setDragMode(photo_viewer.DragMode.ScrollHandDrag)
    assert photo_viewer.dragMode() == photo_viewer.DragMode.ScrollHandDrag


def test_zoom(photo_viewer, qtbot):
    """Test the zoom functionality."""
    photo_viewer.set_photo(QPixmap(100, 100))  # Add a dummy pixmap
    initial_transform = photo_viewer.transform()
    # Simulate a wheel event
    event = MagicMock()
    event.angleDelta.return_value.y.return_value = 120
    photo_viewer.wheelEvent(event)
    assert photo_viewer.transform().m11() != initial_transform.m11()
