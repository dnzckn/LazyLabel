import pytest
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import QGraphicsScene

from lazylabel.ui.hoverable_pixelmap_item import HoverablePixmapItem


@pytest.fixture
def hoverable_pixmap_item(qtbot):
    """Fixture for HoverablePixmapItem."""
    scene = QGraphicsScene()
    pixmap = QPixmap(100, 100)
    item = HoverablePixmapItem(pixmap)
    scene.addItem(item)
    return item


def test_hoverable_pixmap_item_creation(hoverable_pixmap_item):
    """Test that the HoverablePixmapItem can be created."""
    assert hoverable_pixmap_item is not None
