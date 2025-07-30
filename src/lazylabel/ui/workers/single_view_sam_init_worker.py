"""Worker thread for initializing single-view SAM model in background."""

import os

from PyQt6.QtCore import QThread, pyqtSignal


class SingleViewSAMInitWorker(QThread):
    """Worker thread for initializing single-view SAM model in background."""

    model_initialized = pyqtSignal(object)  # model_instance
    finished = pyqtSignal()
    error = pyqtSignal(str)
    progress = pyqtSignal(str)  # status message

    def __init__(self, model_manager, default_model_type, custom_model_path=None):
        super().__init__()
        self.model_manager = model_manager
        self.default_model_type = default_model_type
        self.custom_model_path = custom_model_path
        self._should_stop = False

    def stop(self):
        """Stop the worker gracefully."""
        self._should_stop = True

    def run(self):
        """Initialize SAM model in background."""
        try:
            if self._should_stop:
                return

            if self.custom_model_path:
                # Load custom model
                model_name = os.path.basename(self.custom_model_path)
                self.progress.emit(f"Loading {model_name}...")

                success = self.model_manager.load_custom_model(self.custom_model_path)
                if not success:
                    raise Exception(f"Failed to load custom model: {model_name}")

                sam_model = self.model_manager.sam_model
            else:
                # Initialize the default model
                self.progress.emit("Initializing AI model...")
                sam_model = self.model_manager.initialize_default_model(
                    self.default_model_type
                )

            if self._should_stop:
                return

            if sam_model and sam_model.is_loaded:
                self.model_initialized.emit(sam_model)
                self.progress.emit("AI model initialized")
            else:
                self.error.emit("Model failed to load")

        except Exception as e:
            if not self._should_stop:
                self.error.emit(f"Failed to load AI model: {str(e)}")
