from PyQt6.QtCore import Qt, QRectF
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import QGraphicsView, QGraphicsScene, QGraphicsPixmapItem


class PhotoViewer(QGraphicsView):
    def __init__(self, parent=None):
        super().__init__(parent)
        self._scene = QGraphicsScene(self)
        self._pixmap_item = QGraphicsPixmapItem()
        self._scene.addItem(self._pixmap_item)
        self.setScene(self._scene)

        self.setTransformationAnchor(QGraphicsView.ViewportAnchor.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.ViewportAnchor.AnchorViewCenter)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setDragMode(QGraphicsView.DragMode.NoDrag)

    def fitInView(self, scale=True):
        rect = QRectF(self._pixmap_item.pixmap().rect())
        if not rect.isNull():
            self.setSceneRect(rect)
            unity = self.transform().mapRect(QRectF(0, 0, 1, 1))
            self.scale(1 / unity.width(), 1 / unity.height())
            viewrect = self.viewport().rect()
            scenerect = self.transform().mapRect(rect)
            factor = min(
                viewrect.width() / scenerect.width(),
                viewrect.height() / scenerect.height(),
            )
            self.scale(factor, factor)

    def set_photo(self, pixmap):
        if pixmap and not pixmap.isNull():
            self._pixmap_item.setPixmap(pixmap)
            self.fitInView()
        else:
            self._pixmap_item.setPixmap(QPixmap())

    def resizeEvent(self, event):
        self.fitInView()
        super().resizeEvent(event)

    def wheelEvent(self, event):
        if not self._pixmap_item.pixmap().isNull():
            if event.angleDelta().y() > 0:
                factor = 1.25
            else:
                factor = 0.8
            self.scale(factor, factor)
