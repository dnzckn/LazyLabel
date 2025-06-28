import pytest
from PyQt6.QtCore import QPointF
from PyQt6.QtGui import QPolygonF
from PyQt6.QtWidgets import QGraphicsScene

from lazylabel.ui.hoverable_polygon_item import HoverablePolygonItem


@pytest.fixture
def hoverable_polygon_item(qtbot):
    """Fixture for HoverablePolygonItem."""
    scene = QGraphicsScene()
    polygon = QPolygonF(
        [QPointF(0, 0), QPointF(10, 0), QPointF(10, 10), QPointF(0, 10)]
    )
    item = HoverablePolygonItem(polygon)
    scene.addItem(item)
    return item


def test_hoverable_polygon_item_creation(hoverable_polygon_item):
    """Test that the HoverablePolygonItem can be created."""
    assert hoverable_polygon_item is not None
