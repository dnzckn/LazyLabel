from PyQt6.QtWidgets import QGraphicsEllipseItem, QGraphicsItem
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QBrush, QPen, QColor


class EditableVertexItem(QGraphicsEllipseItem):
    def __init__(self, main_window, segment_index, vertex_index, x, y, w, h):
        super().__init__(x, y, w, h)
        self.main_window = main_window
        self.segment_index = segment_index
        self.vertex_index = vertex_index

        self.setZValue(200)

        color = QColor(Qt.GlobalColor.cyan)
        color.setAlpha(180)
        self.setBrush(QBrush(color))

        self.setPen(QPen(Qt.GlobalColor.transparent))
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges)

    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionHasChanged:
            new_pos = value
            self.main_window.update_vertex_pos(
                self.segment_index, self.vertex_index, new_pos
            )
        return super().itemChange(change, value)
