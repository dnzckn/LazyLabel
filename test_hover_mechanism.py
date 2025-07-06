#!/usr/bin/env python3
"""Test the hover mechanism directly."""

import os
import sys

# Add the src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from PyQt6.QtCore import QPointF
from PyQt6.QtGui import QBrush, QColor, QPolygonF
from PyQt6.QtWidgets import QApplication, QGraphicsScene, QGraphicsView

from lazylabel.ui.hoverable_polygon_item import HoverablePolygonItem


def test_hover_directly():
    app = QApplication(sys.argv)

    # Create a simple scene and view
    scene = QGraphicsScene()
    view = QGraphicsView(scene)

    # Create a test polygon
    points = [QPointF(10, 10), QPointF(100, 10), QPointF(100, 100), QPointF(10, 100)]
    poly = QPolygonF(points)

    # Create hoverable item
    item = HoverablePolygonItem(poly)

    # Set brushes
    default_brush = QBrush(QColor(255, 0, 0, 70))
    hover_brush = QBrush(QColor(255, 0, 0, 170))
    item.set_brushes(default_brush, hover_brush)

    # Add to scene
    scene.addItem(item)

    # Show view
    view.show()

    print("Hoverable polygon created.")
    print("Try hovering over the red square.")
    print("It should change from light red to dark red.")

    app.exec()


if __name__ == "__main__":
    test_hover_directly()
