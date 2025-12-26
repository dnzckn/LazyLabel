"""Worker thread for preloading images in background."""

from PyQt6.QtCore import QThread, pyqtSignal
from PyQt6.QtGui import QImage, QPixmap


class ImagePreloadWorker(QThread):
    """Worker thread for preloading images in the background.

    Loads images to QPixmap before they're needed, making navigation instant.
    """

    image_loaded = pyqtSignal(str, QPixmap)  # (path, pixmap)
    error = pyqtSignal(str, str)  # (path, error_message)

    def __init__(self, image_path: str, parent=None):
        super().__init__(parent)
        self.image_path = image_path
        self._should_stop = False

    def stop(self):
        """Request the worker to stop."""
        self._should_stop = True

    def run(self):
        """Load the image in background thread."""
        if self._should_stop:
            return

        try:
            qimage = QImage(self.image_path)
            if qimage.isNull():
                self.error.emit(self.image_path, "Failed to load image")
                return

            # For PNG files, ensure proper alpha format handling
            if self.image_path.lower().endswith(".png"):
                qimage = qimage.convertToFormat(
                    QImage.Format.Format_ARGB32_Premultiplied
                )

            if self._should_stop:
                return

            pixmap = QPixmap.fromImage(qimage)
            if not pixmap.isNull() and not self._should_stop:
                self.image_loaded.emit(self.image_path, pixmap)

        except Exception as e:
            if not self._should_stop:
                self.error.emit(self.image_path, str(e))
