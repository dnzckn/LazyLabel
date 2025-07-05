from PyQt6.QtGui import QBrush, QPolygonF
from PyQt6.QtWidgets import QGraphicsPolygonItem


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

    def mousePressEvent(self, event):
        # Remove mouse events as per the new instructions
        pass

    def mouseMoveEvent(self, event):
        # Remove mouse events as per the new instructions
        pass

    def mouseReleaseEvent(self, event):
        # Remove mouse events as per the new instructions
        pass

    def setPolygonVertices(self, vertices):
        self.setPolygon(QPolygonF(vertices))
