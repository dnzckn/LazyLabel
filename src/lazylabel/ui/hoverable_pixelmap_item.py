from PyQt6.QtWidgets import QGraphicsPixmapItem


class HoverablePixmapItem(QGraphicsPixmapItem):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAcceptHoverEvents(True)
        self.default_pixmap = None
        self.hover_pixmap = None

    def set_pixmaps(self, default_pixmap, hover_pixmap):
        self.default_pixmap = default_pixmap
        self.hover_pixmap = hover_pixmap
        self.setPixmap(self.default_pixmap)

    def hoverEnterEvent(self, event):
        self.setPixmap(self.hover_pixmap)
        super().hoverEnterEvent(event)

    def hoverLeaveEvent(self, event):
        self.setPixmap(self.default_pixmap)
        super().hoverLeaveEvent(event)
