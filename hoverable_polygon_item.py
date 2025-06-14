from PyQt6.QtWidgets import QGraphicsPolygonItem
from PyQt6.QtGui import QBrush


class HoverablePolygonItem(QGraphicsPolygonItem):
    def __init__(self, polygon, parent=None):
        super().__init__(polygon, parent)
        self.setAcceptHoverEvents(True)
        self.default_brush = QBrush()
        self.hover_brush = QBrush()

    def set_brushes(self, default_brush, hover_brush):
        self.default_brush = default_brush
        self.hover_brush = hover_brush
        self.setBrush(self.default_brush)

    def hoverEnterEvent(self, event):
        self.setBrush(self.hover_brush)
        super().hoverEnterEvent(event)

    def hoverLeaveEvent(self, event):
        self.setBrush(self.default_brush)
        super().hoverLeaveEvent(event)
