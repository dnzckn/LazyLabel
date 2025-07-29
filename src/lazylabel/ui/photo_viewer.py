import cv2
import numpy as np
from PyQt6.QtCore import QRectF, Qt, pyqtSignal
from PyQt6.QtGui import QCursor, QImage, QPainter, QPixmap
from PyQt6.QtWidgets import QGraphicsPixmapItem, QGraphicsScene, QGraphicsView


class PhotoViewer(QGraphicsView):
    # Signals for multi-view synchronization
    zoom_changed = pyqtSignal(float)  # Emits zoom factor
    view_changed = pyqtSignal()  # Emits when view (pan/zoom) changes

    def __init__(self, parent=None):
        super().__init__(parent)
        self._scene = QGraphicsScene(self)
        self._pixmap_item = QGraphicsPixmapItem()
        self._scene.addItem(self._pixmap_item)
        self.setScene(self._scene)

        # Enable proper alpha blending for transparency
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)

        # Ensure viewport supports transparency
        self.viewport().setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setStyleSheet("background: transparent;")

        self.setTransformationAnchor(QGraphicsView.ViewportAnchor.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.ViewportAnchor.AnchorViewCenter)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setDragMode(QGraphicsView.DragMode.NoDrag)
        self.setMouseTracking(True)  # Enable mouse tracking for hover events

        self._original_image = None
        self._adjusted_pixmap = None
        self._original_image_bgra = None

    def fitInView(self, scale=True):
        rect = QRectF(self._pixmap_item.pixmap().rect())
        if not rect.isNull():
            self.setSceneRect(rect)
            self.resetTransform()
            viewrect = self.viewport().rect()
            scenerect = self.transform().mapRect(rect)
            factor = min(
                viewrect.width() / scenerect.width(),
                viewrect.height() / scenerect.height(),
            )
            self.scale(factor, factor)
            self.centerOn(self._pixmap_item)

    def set_photo(self, pixmap):
        if pixmap and not pixmap.isNull():
            self._original_image = pixmap.toImage()
            self._adjusted_pixmap = pixmap
            # Check if _pixmap_item still exists, recreate if deleted
            if self._pixmap_item not in self._scene.items():
                self._pixmap_item = QGraphicsPixmapItem()
                self._scene.addItem(self._pixmap_item)

            # PNG files are now loaded with proper alpha format at source

            self._pixmap_item.setPixmap(pixmap)

            # Convert QImage to ARGB32 for consistent processing
            converted_image = self._original_image.convertToFormat(
                QImage.Format.Format_ARGB32
            )
            # Get raw bytes and reshape to numpy array (height, width, 4 for ARGB)
            ptr = converted_image.constBits()
            ptr.setsize(converted_image.bytesPerLine() * converted_image.height())
            img_np = np.array(ptr).reshape(
                converted_image.height(), converted_image.width(), 4
            )
            # QImage ARGB32 is stored as BGRA in memory, keep this format
            self._original_image_bgra = (
                img_np.copy()
            )  # Make a copy to avoid memory issues

            self.fitInView()
        else:
            self._original_image = None
            self._adjusted_pixmap = None
            self._original_image_bgra = None
            # Check if _pixmap_item still exists, recreate if deleted
            if self._pixmap_item not in self._scene.items():
                self._pixmap_item = QGraphicsPixmapItem()
                self._scene.addItem(self._pixmap_item)
            self._pixmap_item.setPixmap(QPixmap())

    def set_image_adjustments(self, brightness: float, contrast: float, gamma: float):
        if self._original_image_bgra is None or self._original_image is None:
            return

        # Ensure _pixmap_item exists and is valid
        if self._pixmap_item not in self._scene.items():
            self._pixmap_item = QGraphicsPixmapItem()
            self._scene.addItem(self._pixmap_item)

        img_bgra = self._original_image_bgra.copy()

        # Separate alpha channel for transparency preservation
        alpha_channel = img_bgra[:, :, 3:4]  # Keep dimensions
        img_bgr = img_bgra[:, :, :3]  # RGB channels only

        # Apply brightness and contrast to RGB channels only
        # new_image = alpha * old_image + beta
        adjusted_img = cv2.convertScaleAbs(
            img_bgr, alpha=1 + contrast / 100.0, beta=brightness
        )

        # Apply gamma correction
        if gamma != 1.0:
            inv_gamma = 1.0 / gamma
            table = np.array(
                [((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]
            ).astype("uint8")
            adjusted_img = cv2.LUT(adjusted_img, table)

        # Recombine with alpha channel to preserve transparency
        adjusted_bgra = np.concatenate([adjusted_img, alpha_channel], axis=2)

        # Convert back to QImage with alpha support
        h, w, ch = adjusted_bgra.shape
        bytes_per_line = ch * w
        adjusted_qimage = QImage(
            adjusted_bgra.data, w, h, bytes_per_line, QImage.Format.Format_ARGB32
        )
        # Convert to premultiplied alpha for proper blending
        adjusted_qimage = adjusted_qimage.convertToFormat(
            QImage.Format.Format_ARGB32_Premultiplied
        )
        self._adjusted_pixmap = QPixmap.fromImage(adjusted_qimage)

        # Ensure the pixmap is valid before setting it
        if not self._adjusted_pixmap.isNull():
            self._pixmap_item.setPixmap(self._adjusted_pixmap)

    def set_cursor(self, cursor_shape):
        self.viewport().setCursor(QCursor(cursor_shape))

    def resizeEvent(self, event):
        self.fitInView()
        super().resizeEvent(event)

    def wheelEvent(self, event):
        if not self._pixmap_item.pixmap().isNull():
            factor = 1.25 if event.angleDelta().y() > 0 else 0.8
            self.scale(factor, factor)
            # Emit zoom signal for multi-view synchronization
            self.zoom_changed.emit(factor)

    def sync_zoom(self, factor):
        """Synchronize zoom from another viewer."""
        if not self._pixmap_item.pixmap().isNull():
            self.scale(factor, factor)
