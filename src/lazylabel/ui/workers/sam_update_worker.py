"""Worker thread for updating SAM model in background."""

from PyQt6.QtCore import QThread, pyqtSignal


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

            # Always use scale_factor = 1.0 - SAM handles its own internal resizing
            self.scale_factor = 1.0

            if self.operate_on_view and self.current_image is not None:
                # Use the provided modified image directly
                if self._should_stop:
                    return

                self.model_manager.set_image_from_array(self.current_image)
            else:
                # Load original image from path
                if self._should_stop:
                    return

                self.model_manager.set_image_from_path(self.image_path)

            if not self._should_stop:
                self.finished.emit()

        except Exception as e:
            if not self._should_stop:
                self.error.emit(str(e))
