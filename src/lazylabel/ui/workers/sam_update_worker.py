"""Worker thread for updating SAM model in background."""

import cv2
import numpy as np
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QPixmap


class SAMUpdateWorker(QThread):
    """Worker thread for updating SAM model in background."""

    finished = pyqtSignal()
    error = pyqtSignal(str)

    def __init__(
        self,
        model_manager,
        image_path,
        operate_on_view,
        current_image=None,
        parent=None,
    ):
        super().__init__(parent)
        self.model_manager = model_manager
        self.image_path = image_path
        self.operate_on_view = operate_on_view
        self.current_image = current_image  # Numpy array of current modified image
        self._should_stop = False
        self.scale_factor = 1.0  # Track scaling factor for coordinate transformation

    def stop(self):
        """Request the worker to stop."""
        self._should_stop = True

    def get_scale_factor(self):
        """Get the scale factor used for image resizing."""
        return self.scale_factor

    def run(self):
        """Run SAM update in background thread."""
        try:
            if self._should_stop:
                return

            if self.operate_on_view and self.current_image is not None:
                # Use the provided modified image
                if self._should_stop:
                    return

                # Optimize image size for faster SAM processing
                image = self.current_image
                original_height, original_width = image.shape[:2]
                max_size = 1024

                if original_height > max_size or original_width > max_size:
                    # Calculate scaling factor
                    self.scale_factor = min(
                        max_size / original_width, max_size / original_height
                    )
                    new_width = int(original_width * self.scale_factor)
                    new_height = int(original_height * self.scale_factor)

                    # Resize using OpenCV for speed
                    image = cv2.resize(
                        image, (new_width, new_height), interpolation=cv2.INTER_AREA
                    )
                else:
                    self.scale_factor = 1.0

                if self._should_stop:
                    return

                # Set image from numpy array (FIXED: use resized image, not original)
                self.model_manager.set_image_from_array(image)
            else:
                # Load original image
                pixmap = QPixmap(self.image_path)
                if pixmap.isNull():
                    self.error.emit("Failed to load image")
                    return

                if self._should_stop:
                    return

                original_width = pixmap.width()
                original_height = pixmap.height()

                # Optimize image size for faster SAM processing
                max_size = 1024
                if original_width > max_size or original_height > max_size:
                    # Calculate scaling factor
                    self.scale_factor = min(
                        max_size / original_width, max_size / original_height
                    )

                    # Scale down while maintaining aspect ratio
                    scaled_pixmap = pixmap.scaled(
                        max_size,
                        max_size,
                        Qt.AspectRatioMode.KeepAspectRatio,
                        Qt.TransformationMode.SmoothTransformation,
                    )

                    # Convert to numpy array for SAM
                    qimage = scaled_pixmap.toImage()
                    width = qimage.width()
                    height = qimage.height()
                    ptr = qimage.bits()
                    ptr.setsize(height * width * 4)
                    arr = np.array(ptr).reshape(height, width, 4)
                    # Convert RGBA to RGB
                    image_array = arr[:, :, :3]

                    if self._should_stop:
                        return

                    # FIXED: Use the resized image array, not original path
                    self.model_manager.set_image_from_array(image_array)
                else:
                    self.scale_factor = 1.0
                    # For images that don't need resizing, use original path
                    self.model_manager.set_image_from_path(self.image_path)

            if not self._should_stop:
                self.finished.emit()

        except Exception as e:
            if not self._should_stop:
                self.error.emit(str(e))
