"""Worker thread for initializing multi-view SAM models in background."""

import os

from PyQt6.QtCore import QThread, pyqtSignal

from ...utils.logger import logger


class MultiViewSAMInitWorker(QThread):
    """Worker thread for initializing multi-view SAM models in background.

    This worker loads SAM models for each viewer in multi-view mode,
    properly detecting SAM 1 vs SAM 2 models based on filename patterns.
    """

    model_initialized = pyqtSignal(int, object)  # viewer_index, model_instance
    all_models_initialized = pyqtSignal(list)  # list of model instances
    error = pyqtSignal(str)
    progress = pyqtSignal(str)  # status message for user

    def __init__(
        self,
        num_viewers: int,
        default_model_type: str,
        custom_model_path: str | None = None,
    ):
        """Initialize the worker.

        Args:
            num_viewers: Number of viewers to create models for (typically 2)
            default_model_type: Default SAM model type (e.g., "vit_h")
            custom_model_path: Optional path to custom model file
        """
        super().__init__()
        self.num_viewers = num_viewers
        self.default_model_type = default_model_type
        self.custom_model_path = custom_model_path
        self._should_stop = False
        self.models_created: list = []

    def stop(self) -> None:
        """Request the worker to stop gracefully."""
        self._should_stop = True

    def _is_sam2_model(self, model_path: str) -> bool:
        """Check if the model is a SAM2 model based on filename patterns.

        Uses the same detection logic as ModelManager._is_sam2_model().
        """
        filename = os.path.basename(model_path).lower()
        sam2_indicators = ["sam2", "sam2.1", "hiera", "_t.", "_s.", "_b+.", "_l."]
        return any(indicator in filename for indicator in sam2_indicators)

    def _detect_model_type(self, model_path: str) -> str:
        """Detect model type from filename.

        Uses the same detection logic as ModelManager.detect_model_type().
        """
        filename = os.path.basename(model_path).lower()

        if self._is_sam2_model(model_path):
            if "tiny" in filename or "_t" in filename:
                return "sam2_tiny"
            elif "small" in filename or "_s" in filename:
                return "sam2_small"
            elif "base_plus" in filename or "_b+" in filename:
                return "sam2_base_plus"
            elif "large" in filename or "_l" in filename:
                return "sam2_large"
            else:
                return "sam2_large"  # default for SAM2
        else:
            # Original SAM model types
            if "vit_l" in filename or "large" in filename:
                return "vit_l"
            elif "vit_b" in filename or "base" in filename:
                return "vit_b"
            elif "vit_h" in filename or "huge" in filename:
                return "vit_h"
            return "vit_h"  # default for SAM1

    def run(self) -> None:
        """Initialize SAM models for all viewers in background thread."""
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
                logger.info("SAM-2 not available for multi-view")

            # Determine if we're loading a SAM 2 model
            is_sam2 = False
            model_type = self.default_model_type

            if self.custom_model_path:
                is_sam2 = self._is_sam2_model(self.custom_model_path)
                model_type = self._detect_model_type(self.custom_model_path)
                model_name = os.path.basename(self.custom_model_path)
                logger.info(
                    f"Multi-view: Loading custom model '{model_name}' "
                    f"(SAM{'2' if is_sam2 else '1'}, type={model_type})"
                )
            else:
                logger.info(f"Multi-view: Loading default model (type={model_type})")

            # Check SAM 2 availability
            if is_sam2 and not SAM2_AVAILABLE:
                self.error.emit(
                    "SAM-2 model selected but SAM-2 is not installed. "
                    "Install with: pip install git+https://github.com/facebookresearch/sam2.git"
                )
                return

            # Load models for each viewer
            for i in range(self.num_viewers):
                if self._should_stop:
                    return

                # Emit progress message
                self.progress.emit(f"Loading AI model {i + 1}/{self.num_viewers}...")

                try:
                    if is_sam2 and SAM2_AVAILABLE:
                        # Create SAM2 model instance
                        logger.info(f"Creating SAM2 model for viewer {i}")
                        model_instance = Sam2Model(self.custom_model_path)
                    else:
                        # Create SAM1 model instance
                        if self.custom_model_path:
                            logger.info(
                                f"Creating SAM1 model for viewer {i} "
                                f"(type={model_type}, path={self.custom_model_path})"
                            )
                            model_instance = SamModel(
                                model_type=model_type,
                                custom_model_path=self.custom_model_path,
                            )
                        else:
                            logger.info(
                                f"Creating default SAM1 model for viewer {i} "
                                f"(type={model_type})"
                            )
                            model_instance = SamModel(model_type=model_type)

                    if self._should_stop:
                        return

                    # Verify model loaded successfully
                    if model_instance and getattr(model_instance, "is_loaded", False):
                        self.models_created.append(model_instance)
                        self.model_initialized.emit(i, model_instance)
                        logger.info(f"Model for viewer {i} loaded successfully")

                        # Clear GPU cache after each model for stability
                        try:
                            import torch

                            if torch.cuda.is_available():
                                torch.cuda.synchronize()
                                torch.cuda.empty_cache()
                        except ImportError:
                            pass
                    else:
                        raise RuntimeError(f"Model for viewer {i} failed to load")

                except Exception as model_error:
                    logger.error(f"Error creating model for viewer {i}: {model_error}")
                    if not self._should_stop:
                        self.error.emit(
                            f"Failed to load model {i + 1}/{self.num_viewers}: {model_error}"
                        )
                    return

            # All models loaded successfully
            if not self._should_stop:
                self.all_models_initialized.emit(self.models_created)

        except Exception as e:
            logger.error(f"Multi-view SAM init worker error: {e}")
            if not self._should_stop:
                self.error.emit(f"Failed to initialize AI models: {e}")
