import os
from pathlib import Path

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

            # Ensure config_path is absolute
            if not os.path.isabs(config_path):
                # Try to make it absolute if it's relative
                import sam2

                sam2_dir = os.path.dirname(sam2.__file__)
                config_path = os.path.join(sam2_dir, "configs", config_path)

            # Verify the config exists before passing to build_sam2
            if not os.path.exists(config_path):
                raise FileNotFoundError(f"Config file not found: {config_path}")

            logger.info(f"SAM2: Resolved config path: {config_path}")

            # Build SAM2 model
            # SAM2 uses Hydra for configuration - we need to pass the right config name
            # Try different approaches based on what's available

            model_filename = Path(model_path).name.lower()

            # First, try using the auto-detected config path directly
            try:
                logger.info(f"SAM2: Attempting to load with config path: {config_path}")
                self.model = self._build_sam2_with_fallback(config_path, model_path)
                logger.info("SAM2: Successfully loaded with config path")
            except Exception as e1:
                logger.debug(f"SAM2: Config path approach failed: {e1}")

                # Second, try just the config filename without path
                try:
                    config_filename = Path(config_path).name
                    logger.info(
                        f"SAM2: Attempting to load with config filename: {config_filename}"
                    )
                    self.model = self._build_sam2_with_fallback(
                        config_filename, model_path
                    )
                    logger.info("SAM2: Successfully loaded with config filename")
                except Exception as e2:
                    logger.debug(f"SAM2: Config filename approach failed: {e2}")

                    # Third, try the base config name without version
                    try:
                        # Map model sizes to base config names
                        if (
                            "tiny" in model_filename
                            or "_t." in model_filename
                            or "_t_" in model_filename
                        ):
                            base_config = "sam2_hiera_t.yaml"
                        elif (
                            "small" in model_filename
                            or "_s." in model_filename
                            or "_s_" in model_filename
                        ):
                            base_config = "sam2_hiera_s.yaml"
                        elif (
                            "base_plus" in model_filename
                            or "_b+." in model_filename
                            or "_b+_" in model_filename
                        ):
                            base_config = "sam2_hiera_b+.yaml"
                        elif (
                            "large" in model_filename
                            or "_l." in model_filename
                            or "_l_" in model_filename
                        ):
                            base_config = "sam2_hiera_l.yaml"
                        else:
                            base_config = "sam2_hiera_l.yaml"

                        logger.info(
                            f"SAM2: Attempting to load with base config: {base_config}"
                        )
                        self.model = self._build_sam2_with_fallback(
                            base_config, model_path
                        )
                        logger.info("SAM2: Successfully loaded with base config")
                    except Exception as e3:
                        # All approaches failed
                        raise Exception(
                            f"Failed to load SAM2 model with any config approach. "
                            f"Tried: {config_path}, {config_filename}, {base_config}. "
                            f"Last error: {e3}"
                        ) from e3

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
        model_path = Path(model_path)
        filename = model_path.name.lower()

        # Get the sam2 package directory
        try:
            import sam2

            sam2_dir = Path(sam2.__file__).parent
            configs_dir = sam2_dir / "configs"

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
                config_path = configs_dir / "sam2.1" / config_file
            else:
                config_path = configs_dir / "sam2" / config_file.replace("2.1_", "")

            logger.debug(f"SAM2: Checking config path: {config_path}")
            if config_path.exists():
                return str(config_path.absolute())

            # Fallback to default large config
            fallback_config = configs_dir / "sam2.1" / "sam2.1_hiera_l.yaml"
            logger.debug(f"SAM2: Checking fallback config: {fallback_config}")
            if fallback_config.exists():
                return str(fallback_config.absolute())

            # Try without version subdirectory
            direct_config = configs_dir / config_file
            logger.debug(f"SAM2: Checking direct config: {direct_config}")
            if direct_config.exists():
                return str(direct_config.absolute())

            raise FileNotFoundError(
                f"No suitable config found for {filename} in {configs_dir}"
            )

        except Exception as e:
            logger.error(f"SAM2: Failed to auto-detect config: {e}")
            # Try to construct a full path even if auto-detection failed
            try:
                import sam2

                sam2_dir = Path(sam2.__file__).parent
                # Return full path to default config
                return str(sam2_dir / "configs" / "sam2.1" / "sam2.1_hiera_l.yaml")
            except Exception:
                # Last resort - return just the config name and let hydra handle it
                return "sam2.1_hiera_l.yaml"

    def _build_sam2_with_fallback(self, config_path, model_path):
        """Build SAM2 model with fallback for state_dict compatibility issues."""
        try:
            # First, try the standard build_sam2 approach
            return build_sam2(config_path, model_path, device=self.device)
        except RuntimeError as e:
            if "Unexpected key(s) in state_dict" in str(e):
                logger.warning(f"SAM2: Detected state_dict compatibility issue: {e}")
                logger.info("SAM2: Attempting to load with state_dict filtering...")

                # Build model without loading weights first
                model = build_sam2(config_path, None, device=self.device)

                # Load checkpoint and handle nested structure
                checkpoint = torch.load(model_path, map_location=self.device)

                # Check if checkpoint has nested 'model' key (common in SAM2.1)
                if "model" in checkpoint and isinstance(checkpoint["model"], dict):
                    logger.info(
                        "SAM2: Detected nested checkpoint structure, extracting model weights"
                    )
                    model_weights = checkpoint["model"]
                else:
                    # Flat structure - filter out the known problematic keys
                    model_weights = {}
                    problematic_keys = {
                        "no_obj_embed_spatial",
                        "obj_ptr_tpos_proj.weight",
                        "obj_ptr_tpos_proj.bias",
                    }
                    for key, value in checkpoint.items():
                        if key not in problematic_keys:
                            model_weights[key] = value

                    logger.info(
                        f"SAM2: Filtered out problematic keys: {list(problematic_keys & set(checkpoint.keys()))}"
                    )

                # Load the model weights
                model.load_state_dict(model_weights, strict=False)
                logger.info("SAM2: Successfully loaded model with state_dict filtering")

                return model
            else:
                # Re-raise if it's a different type of error
                raise

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
            self.model = self._build_sam2_with_fallback(config_path, model_path)
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
