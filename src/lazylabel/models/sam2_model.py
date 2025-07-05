import os

import cv2
import numpy as np
import torch

from ..utils.logger import logger

# SAM-2 specific imports - will fail gracefully if not available
try:
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor
except ImportError as e:
    logger.error(f"SAM-2 dependencies not found: {e}")
    logger.info(
        "Install SAM-2 with: pip install git+https://github.com/facebookresearch/sam2.git"
    )
    raise ImportError("SAM-2 dependencies required for Sam2Model") from e


class Sam2Model:
    """SAM2 model wrapper that provides the same interface as SamModel."""

    def __init__(self, model_path: str, config_path: str | None = None):
        """Initialize SAM2 model.

        Args:
            model_path: Path to the SAM2 model checkpoint (.pt file)
            config_path: Path to the config file (optional, will auto-detect if None)
        """
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"SAM2: Detected device: {str(self.device).upper()}")

        self.current_model_path = model_path
        self.model = None
        self.predictor = None
        self.image = None
        self.is_loaded = False

        # Auto-detect config if not provided
        if config_path is None:
            config_path = self._auto_detect_config(model_path)

        try:
            logger.info(f"SAM2: Loading model from {model_path}...")
            logger.info(f"SAM2: Using config: {config_path}")

            # Build SAM2 model
            self.model = build_sam2(config_path, model_path, device=self.device)

            # Create predictor
            self.predictor = SAM2ImagePredictor(self.model)

            self.is_loaded = True
            logger.info("SAM2: Model loaded successfully.")

        except Exception as e:
            logger.error(f"SAM2: Failed to load model: {e}")
            logger.warning("SAM2: SAM2 functionality will be disabled.")
            self.is_loaded = False

    def _auto_detect_config(self, model_path: str) -> str:
        """Auto-detect the appropriate config file based on model filename."""
        filename = os.path.basename(model_path).lower()

        # Get the sam2 package directory
        try:
            import sam2

            sam2_dir = os.path.dirname(sam2.__file__)
            configs_dir = os.path.join(sam2_dir, "configs")

            # Map model types to config files
            if "tiny" in filename or "_t" in filename:
                config_file = (
                    "sam2.1_hiera_t.yaml" if "2.1" in filename else "sam2_hiera_t.yaml"
                )
            elif "small" in filename or "_s" in filename:
                config_file = (
                    "sam2.1_hiera_s.yaml" if "2.1" in filename else "sam2_hiera_s.yaml"
                )
            elif "base_plus" in filename or "_b+" in filename:
                config_file = (
                    "sam2.1_hiera_b+.yaml"
                    if "2.1" in filename
                    else "sam2_hiera_b+.yaml"
                )
            elif "large" in filename or "_l" in filename:
                config_file = (
                    "sam2.1_hiera_l.yaml" if "2.1" in filename else "sam2_hiera_l.yaml"
                )
            else:
                # Default to large model
                config_file = "sam2.1_hiera_l.yaml"

            # Check sam2.1 configs first, then fall back to sam2
            if "2.1" in filename:
                config_path = os.path.join(configs_dir, "sam2.1", config_file)
            else:
                config_path = os.path.join(
                    configs_dir, "sam2", config_file.replace("2.1_", "")
                )

            if os.path.exists(config_path):
                return config_path

            # Fallback to default large config
            fallback_config = os.path.join(configs_dir, "sam2.1", "sam2.1_hiera_l.yaml")
            if os.path.exists(fallback_config):
                return fallback_config

            raise FileNotFoundError(f"No suitable config found for {filename}")

        except Exception as e:
            logger.error(f"SAM2: Failed to auto-detect config: {e}")
            # Return a reasonable default path
            return "sam2.1_hiera_l.yaml"

    def set_image_from_path(self, image_path: str) -> bool:
        """Set image for SAM2 model from file path."""
        if not self.is_loaded:
            return False
        try:
            self.image = cv2.imread(image_path)
            self.image = cv2.cvtColor(self.image, cv2.COLOR_BGR2RGB)
            self.predictor.set_image(self.image)
            return True
        except Exception as e:
            logger.error(f"SAM2: Error setting image from path: {e}")
            return False

    def set_image_from_array(self, image_array: np.ndarray) -> bool:
        """Set image for SAM2 model from numpy array."""
        if not self.is_loaded:
            return False
        try:
            self.image = image_array
            self.predictor.set_image(self.image)
            return True
        except Exception as e:
            logger.error(f"SAM2: Error setting image from array: {e}")
            return False

    def predict(self, positive_points, negative_points):
        """Generate predictions using SAM2."""
        if not self.is_loaded or not positive_points:
            return None

        try:
            points = np.array(positive_points + negative_points)
            labels = np.array([1] * len(positive_points) + [0] * len(negative_points))

            masks, scores, logits = self.predictor.predict(
                point_coords=points,
                point_labels=labels,
                multimask_output=True,
            )

            # Return the mask with the highest score
            best_mask_idx = np.argmax(scores)
            return masks[best_mask_idx], scores[best_mask_idx], logits[best_mask_idx]

        except Exception as e:
            logger.error(f"SAM2: Error during prediction: {e}")
            return None

    def predict_from_box(self, box):
        """Generate predictions from bounding box using SAM2."""
        if not self.is_loaded:
            return None

        try:
            masks, scores, logits = self.predictor.predict(
                box=np.array(box),
                multimask_output=True,
            )

            # Return the mask with the highest score
            best_mask_idx = np.argmax(scores)
            return masks[best_mask_idx], scores[best_mask_idx], logits[best_mask_idx]

        except Exception as e:
            logger.error(f"SAM2: Error during box prediction: {e}")
            return None

    def load_custom_model(
        self, model_path: str, config_path: str | None = None
    ) -> bool:
        """Load a custom SAM2 model from the specified path."""
        if not os.path.exists(model_path):
            logger.warning(f"SAM2: Model file not found: {model_path}")
            return False

        logger.info(f"SAM2: Loading custom model from {model_path}...")
        try:
            # Clear existing model from memory
            if hasattr(self, "model") and self.model is not None:
                del self.model
                del self.predictor
                torch.cuda.empty_cache() if torch.cuda.is_available() else None

            # Auto-detect config if not provided
            if config_path is None:
                config_path = self._auto_detect_config(model_path)

            # Load new model
            self.model = build_sam2(config_path, model_path, device=self.device)
            self.predictor = SAM2ImagePredictor(self.model)
            self.current_model_path = model_path
            self.is_loaded = True

            # Re-set image if one was previously loaded
            if self.image is not None:
                self.predictor.set_image(self.image)

            logger.info("SAM2: Custom model loaded successfully.")
            return True
        except Exception as e:
            logger.error(f"SAM2: Error loading custom model: {e}")
            self.is_loaded = False
            self.model = None
            self.predictor = None
            return False
