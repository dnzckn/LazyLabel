"""Worker thread for updating SAM model image in multi-view mode."""

import cv2
import numpy as np
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QPixmap


class MultiViewSAMUpdateWorker(QThread):
    """Worker thread for updating SAM model image in multi-view mode."""

    finished = pyqtSignal(int)  # viewer_index
    error = pyqtSignal(int, str)  # viewer_index, error_message

    def __init__(
        self,
        viewer_index,
        model,
        image_path,
        operate_on_view=False,
        current_image=None,
        parent=None,
    ):
        super().__init__(parent)
        self.viewer_index = viewer_index
        self.model = model
        self.image_path = image_path
        self.operate_on_view = operate_on_view
        self.current_image = current_image
        self._should_stop = False
        self.scale_factor = 1.0

    def stop(self):
        """Request the worker to stop."""
        self._should_stop = True

    def get_scale_factor(self):
        """Get the scale factor used for image resizing."""
        return self.scale_factor

    def run(self):
        """Update SAM model image in background thread."""
        try:
            if self._should_stop:
                return

            # Clear GPU cache to reduce memory pressure in multi-view mode
            try:
                import torch

                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass  # PyTorch not available

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

                # Set image from numpy array
                self.model.set_image_from_array(image)
            else:
                # Load original image
                if self._should_stop:
                    return

                # Optimize image size for faster SAM processing
                pixmap = QPixmap(self.image_path)
                if pixmap.isNull():
                    if not self._should_stop:
                        self.error.emit(self.viewer_index, "Failed to load image")
                    return

                original_width = pixmap.width()
                original_height = pixmap.height()
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

                    # Add CUDA synchronization for multi-model scenarios
                    try:
                        import torch

                        if torch.cuda.is_available():
                            torch.cuda.synchronize()
                    except ImportError:
                        pass

                    self.model.set_image_from_array(image_array)
                else:
                    self.scale_factor = 1.0

                    # Add CUDA synchronization for multi-model scenarios
                    try:
                        import torch

                        if torch.cuda.is_available():
                            torch.cuda.synchronize()
                    except ImportError:
                        pass

                    self.model.set_image_from_path(self.image_path)

            if not self._should_stop:
                self.finished.emit(self.viewer_index)

        except Exception as e:
            if not self._should_stop:
                self.error.emit(self.viewer_index, str(e))
