"""Worker thread for initializing multi-view SAM models in background."""

from PyQt6.QtCore import QThread, pyqtSignal

from ...utils.logger import logger


class MultiViewSAMInitWorker(QThread):
    """Worker thread for initializing multi-view SAM models in background."""

    model_initialized = pyqtSignal(int, object)  # viewer_index, model_instance
    all_models_initialized = pyqtSignal(int)  # total_models_count
    error = pyqtSignal(str)
    progress = pyqtSignal(int, int)  # current, total

    def __init__(self, model_manager, parent=None):
        super().__init__(parent)
        self.model_manager = model_manager
        self._should_stop = False
        self.models_created = []

    def stop(self):
        """Request the worker to stop."""
        self._should_stop = True

    def run(self):
        """Initialize multi-view SAM models in background thread."""
        try:
            if self._should_stop:
                return

            # Import the required model classes
            from ...models.sam_model import SamModel

            try:
                from ...models.sam2_model import Sam2Model

                SAM2_AVAILABLE = True
            except ImportError:
                Sam2Model = None
                SAM2_AVAILABLE = False

            # Determine which type of model to create
            # Get the currently selected model from the GUI
            parent = self.parent()
            custom_model_path = None
            default_model_type = "vit_h"  # fallback

            if parent and hasattr(parent, "control_panel"):
                # Get the selected model path from the model selection widget
                model_path = parent.control_panel.model_widget.get_selected_model_path()
                if model_path:
                    # User has selected a custom model
                    custom_model_path = model_path
                    # Detect model type from filename
                    default_model_type = self.model_manager.detect_model_type(
                        model_path
                    )
                else:
                    # Using default model
                    default_model_type = (
                        parent.settings.default_model_type
                        if hasattr(parent, "settings")
                        else "vit_h"
                    )

            is_sam2 = default_model_type.startswith("sam2")

            # Create model instances for all viewers - but optimize memory usage
            config = parent._get_multi_view_config()
            num_viewers = config["num_viewers"]

            # Warn about performance implications for VIT_H in multi-view
            if num_viewers > 2 and default_model_type == "vit_h":
                logger.warning(
                    f"Using vit_h model with {num_viewers} viewers may cause performance issues. Consider using vit_b for better performance."
                )
            for i in range(num_viewers):
                if self._should_stop:
                    return

                self.progress.emit(i + 1, num_viewers)

                try:
                    if is_sam2 and SAM2_AVAILABLE:
                        # Create SAM2 model instance
                        if custom_model_path:
                            model_instance = Sam2Model(custom_model_path)
                        else:
                            model_instance = Sam2Model(model_type=default_model_type)
                    else:
                        # Create SAM1 model instance
                        if custom_model_path:
                            model_instance = SamModel(
                                model_type=default_model_type,
                                custom_model_path=custom_model_path,
                            )
                        else:
                            model_instance = SamModel(model_type=default_model_type)

                    if self._should_stop:
                        return

                    if model_instance and getattr(model_instance, "is_loaded", False):
                        self.models_created.append(model_instance)
                        self.model_initialized.emit(i, model_instance)

                        # Synchronize and clear GPU cache after each model for stability
                        try:
                            import torch

                            if torch.cuda.is_available():
                                torch.cuda.synchronize()  # Ensure model is fully loaded
                                torch.cuda.empty_cache()
                        except ImportError:
                            pass  # PyTorch not available
                    else:
                        raise Exception(f"Model instance {i + 1} failed to load")

                except Exception as model_error:
                    logger.error(
                        f"Error creating model instance {i + 1}: {model_error}"
                    )
                    if not self._should_stop:
                        self.error.emit(
                            f"Failed to create model instance {i + 1}: {model_error}"
                        )
                    return

            if not self._should_stop:
                self.all_models_initialized.emit(len(self.models_created))

        except Exception as e:
            if not self._should_stop:
                self.error.emit(str(e))
