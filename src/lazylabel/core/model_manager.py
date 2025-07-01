"""Model management functionality."""

import os
from collections.abc import Callable

from ..config import Paths
from ..models.sam_model import SamModel
from ..utils.logger import logger


class ModelManager:
    """Manages SAM model loading and selection."""

    def __init__(self, paths: Paths):
        self.paths = paths
        self.sam_model: SamModel | None = None
        self.current_models_folder: str | None = None
        self.on_model_changed: Callable[[str], None] | None = None

    def initialize_default_model(self, model_type: str = "vit_h") -> SamModel | None:
        """Initialize the default SAM model.

        Returns:
            SamModel instance if successful, None if failed
        """
        try:
            logger.info(f"Step 4/8: Loading {model_type.upper()} model...")
            self.sam_model = SamModel(model_type=model_type)
            self.current_models_folder = str(self.paths.models_dir)
            return self.sam_model
        except Exception as e:
            logger.error(f"Step 4/8: Failed to initialize default model: {e}")
            self.sam_model = None
            return None

    def get_available_models(self, folder_path: str) -> list[tuple[str, str]]:
        """Get list of available .pth models in folder.

        Returns:
            List of (display_name, full_path) tuples
        """
        pth_files = []
        for root, _dirs, files in os.walk(folder_path):
            for file in files:
                if file.lower().endswith(".pth"):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, folder_path)
                    pth_files.append((rel_path, full_path))

        return sorted(pth_files, key=lambda x: x[0])

    def detect_model_type(self, model_path: str) -> str:
        """Detect model type from filename."""
        filename = os.path.basename(model_path).lower()
        if "vit_l" in filename or "large" in filename:
            return "vit_l"
        elif "vit_b" in filename or "base" in filename:
            return "vit_b"
        elif "vit_h" in filename or "huge" in filename:
            return "vit_h"
        return "vit_h"  # default

    def load_custom_model(self, model_path: str) -> bool:
        """Load a custom model from path.

        Returns:
            True if successful, False otherwise
        """
        if not self.sam_model:
            return False

        if not os.path.exists(model_path):
            return False

        model_type = self.detect_model_type(model_path)
        success = self.sam_model.load_custom_model(model_path, model_type)

        if success and self.on_model_changed:
            model_name = os.path.basename(model_path)
            self.on_model_changed(f"Current: {model_name}")

        return success

    def set_models_folder(self, folder_path: str) -> None:
        """Set the current models folder."""
        self.current_models_folder = folder_path

    def get_models_folder(self) -> str | None:
        """Get the current models folder."""
        return self.current_models_folder

    def is_model_available(self) -> bool:
        """Check if a SAM model is loaded and available."""
        return self.sam_model is not None and getattr(
            self.sam_model, "is_loaded", False
        )

    def set_image_from_path(self, image_path: str) -> bool:
        """Set image for SAM model from file path."""
        if not self.is_model_available():
            return False
        return self.sam_model.set_image_from_path(image_path)

    def set_image_from_array(self, image_array) -> bool:
        """Set image for SAM model from numpy array."""
        if not self.is_model_available():
            return False
        return self.sam_model.set_image_from_array(image_array)
