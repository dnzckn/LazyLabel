from PyQt6.QtCore import Qt
from PyQt6.QtGui import QBrush, QColor, QPen
from PyQt6.QtWidgets import QGraphicsEllipseItem, QGraphicsItem


class EditableVertexItem(QGraphicsEllipseItem):
    def __init__(self, main_window, segment_index, vertex_index, x, y, w, h):
        super().__init__(x, y, w, h)
        self.main_window = main_window
        self.segment_index = segment_index
        self.vertex_index = vertex_index
        self.initial_pos = None

        self.setZValue(200)

        color = QColor(Qt.GlobalColor.cyan)
        color.setAlpha(180)
        self.setBrush(QBrush(color))

        self.setPen(QPen(Qt.GlobalColor.transparent))

        # Set flags for dragging - use the original working approach
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable)

        # Accept mouse events
        self.setAcceptHoverEvents(True)

    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionHasChanged:
            new_pos = value
            if hasattr(self.main_window, "update_vertex_pos"):
                self.main_window.update_vertex_pos(
                    self.segment_index, self.vertex_index, new_pos, record_undo=False
                )
        return super().itemChange(change, value)

    def mousePressEvent(self, event):
        """Handle mouse press events."""
        self.initial_pos = self.pos()
        super().mousePressEvent(event)
        event.accept()

    def mouseMoveEvent(self, event):
        """Handle mouse move events."""
        super().mouseMoveEvent(event)
        event.accept()

    def mouseReleaseEvent(self, event):
        """Handle mouse release events."""
        if self.initial_pos and self.initial_pos != self.pos():
            self.main_window.action_history.append(
                {
                    "type": "move_vertex",
                    "segment_index": self.segment_index,
                    "vertex_index": self.vertex_index,
                    "old_pos": [self.initial_pos.x(), self.initial_pos.y()],
                    "new_pos": [self.pos().x(), self.pos().y()],
                }
            )
        self.initial_pos = None
        super().mouseReleaseEvent(event)
        event.accept()
