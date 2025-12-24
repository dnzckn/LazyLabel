"""Worker thread for updating SAM model image in multi-view mode."""

from PyQt6.QtCore import QThread, pyqtSignal


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

            # Always use scale_factor = 1.0 - SAM handles its own internal resizing
            self.scale_factor = 1.0

            # Add CUDA synchronization for multi-model scenarios
            try:
                import torch

                if torch.cuda.is_available():
                    torch.cuda.synchronize()
            except ImportError:
                pass

            if self.operate_on_view and self.current_image is not None:
                # Use the provided modified image directly
                if self._should_stop:
                    return

                self.model.set_image_from_array(self.current_image)
            else:
                # Load original image from path
                if self._should_stop:
                    return

                self.model.set_image_from_path(self.image_path)

            if not self._should_stop:
                self.finished.emit(self.viewer_index)

        except Exception as e:
            if not self._should_stop:
                self.error.emit(self.viewer_index, str(e))
