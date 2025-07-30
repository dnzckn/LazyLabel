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

            # For SAM2.1 models, use manual Hydra initialization since configs aren't in search path
            if "2.1" in model_filename:
                logger.info(
                    "SAM2: Loading SAM2.1 model with manual config initialization"
                )

                try:
                    # Import required Hydra components
                    # Get the configs directory
                    import sam2
                    from hydra import compose, initialize_config_dir
                    from hydra.core.global_hydra import GlobalHydra

                    sam2_configs_dir = os.path.join(
                        os.path.dirname(sam2.__file__), "configs", "sam2.1"
                    )

                    # Clear any existing Hydra instance
                    GlobalHydra.instance().clear()

                    # Initialize Hydra with the SAM2.1 configs directory
                    with initialize_config_dir(
                        config_dir=sam2_configs_dir, version_base=None
                    ):
                        config_filename = Path(config_path).name
                        logger.info(f"SAM2: Loading SAM2.1 config: {config_filename}")

                        # Load the config
                        cfg = compose(config_name=config_filename.replace(".yaml", ""))

                        # Manually build the model using the config
                        from hydra.utils import instantiate

                        self.model = instantiate(cfg.model)
                        self.model.to(self.device)

                        # Load the checkpoint weights
                        if model_path:
                            checkpoint = torch.load(
                                model_path, map_location=self.device
                            )
                            # Handle nested checkpoint structure
                            if "model" in checkpoint:
                                model_weights = checkpoint["model"]
                            else:
                                model_weights = checkpoint
                            self.model.load_state_dict(model_weights, strict=False)

                        logger.info(
                            "SAM2: Successfully loaded SAM2.1 with manual initialization"
                        )

                except Exception as e1:
                    logger.debug(f"SAM2: SAM2.1 manual initialization failed: {e1}")
                    # Fallback to using a compatible SAM2.0 config as a workaround
                    logger.warning(
                        "SAM2: Falling back to SAM2.0 config for SAM2.1 model (may have reduced functionality)"
                    )
                    try:
                        # Use the closest SAM2.0 config
                        fallback_config = (
                            "sam2_hiera_l.yaml"  # This works according to our test
                        )
                        logger.info(
                            f"SAM2: Attempting fallback with SAM2.0 config: {fallback_config}"
                        )
                        self.model = build_sam2(
                            fallback_config, model_path, device=self.device
                        )
                        logger.warning(
                            "SAM2: Loaded SAM2.1 model with SAM2.0 config - some features may not work"
                        )
                    except Exception as e2:
                        raise Exception(
                            f"Failed to load SAM2.1 model. Manual initialization failed: {e1}. "
                            f"Fallback to SAM2.0 config also failed: {e2}. "
                            f"Try reinstalling SAM2 with latest version from official repo."
                        ) from e2
            else:
                # Standard SAM2.0 loading approach
                try:
                    logger.info(
                        f"SAM2: Attempting to load with config path: {config_path}"
                    )
                    self.model = build_sam2(config_path, model_path, device=self.device)
                    logger.info("SAM2: Successfully loaded with config path")
                except Exception as e1:
                    logger.debug(f"SAM2: Config path approach failed: {e1}")

                    # Try just the config filename without path (for Hydra)
                    try:
                        config_filename = Path(config_path).name
                        logger.info(
                            f"SAM2: Attempting to load with config filename: {config_filename}"
                        )
                        self.model = build_sam2(
                            config_filename, model_path, device=self.device
                        )
                        logger.info("SAM2: Successfully loaded with config filename")
                    except Exception as e2:
                        logger.debug(f"SAM2: Config filename approach failed: {e2}")

                        # Try the base config name for SAM2.0 models
                        try:
                            # Map model sizes to base config names (SAM2.0 only)
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
                            self.model = build_sam2(
                                base_config, model_path, device=self.device
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

            # Determine if this is a SAM2.1 model
            is_sam21 = "2.1" in filename

            # Map model types to config files based on version
            if "tiny" in filename or "_t" in filename:
                config_file = "sam2.1_hiera_t.yaml" if is_sam21 else "sam2_hiera_t.yaml"
            elif "small" in filename or "_s" in filename:
                config_file = "sam2.1_hiera_s.yaml" if is_sam21 else "sam2_hiera_s.yaml"
            elif "base_plus" in filename or "_b+" in filename:
                config_file = (
                    "sam2.1_hiera_b+.yaml" if is_sam21 else "sam2_hiera_b+.yaml"
                )
            elif "large" in filename or "_l" in filename:
                config_file = "sam2.1_hiera_l.yaml" if is_sam21 else "sam2_hiera_l.yaml"
            else:
                # Default to large model with appropriate version
                config_file = "sam2.1_hiera_l.yaml" if is_sam21 else "sam2_hiera_l.yaml"

            # Build config path based on version
            if is_sam21:
                config_path = configs_dir / "sam2.1" / config_file
            else:
                config_path = configs_dir / "sam2" / config_file

            logger.debug(f"SAM2: Checking config path: {config_path}")
            if config_path.exists():
                return str(config_path.absolute())

            # Fallback to default large config of the same version
            fallback_config_file = (
                "sam2.1_hiera_l.yaml" if is_sam21 else "sam2_hiera_l.yaml"
            )
            fallback_subdir = "sam2.1" if is_sam21 else "sam2"
            fallback_config = configs_dir / fallback_subdir / fallback_config_file
            logger.debug(f"SAM2: Checking fallback config: {fallback_config}")
            if fallback_config.exists():
                return str(fallback_config.absolute())

            # Try without version subdirectory (only for SAM2.0)
            if not is_sam21:
                direct_config = configs_dir / config_file
                logger.debug(f"SAM2: Checking direct config: {direct_config}")
                if direct_config.exists():
                    return str(direct_config.absolute())

            raise FileNotFoundError(
                f"No suitable {'SAM2.1' if is_sam21 else 'SAM2'} config found for {filename} in {configs_dir}"
            )

        except Exception as e:
            logger.error(f"SAM2: Failed to auto-detect config: {e}")
            # Try to construct a full path even if auto-detection failed
            try:
                import sam2

                sam2_dir = Path(sam2.__file__).parent
                filename = Path(model_path).name.lower()
                is_sam21 = "2.1" in filename

                # Return full path to appropriate default config
                if is_sam21:
                    return str(sam2_dir / "configs" / "sam2.1" / "sam2.1_hiera_l.yaml")
                else:
                    return str(sam2_dir / "configs" / "sam2" / "sam2_hiera_l.yaml")
            except Exception:
                # Last resort - return just the config name and let hydra handle it
                filename = Path(model_path).name.lower()
                is_sam21 = "2.1" in filename
                return "sam2.1_hiera_l.yaml" if is_sam21 else "sam2_hiera_l.yaml"

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

            # Load new model with same logic as __init__
            model_filename = Path(model_path).name.lower()

            # Use same loading logic as __init__
            if "2.1" in model_filename:
                # SAM2.1 models need manual Hydra initialization
                logger.info(
                    "SAM2: Loading custom SAM2.1 model with manual config initialization"
                )

                try:
                    import sam2
                    from hydra import compose, initialize_config_dir
                    from hydra.core.global_hydra import GlobalHydra

                    sam2_configs_dir = os.path.join(
                        os.path.dirname(sam2.__file__), "configs", "sam2.1"
                    )
                    GlobalHydra.instance().clear()

                    with initialize_config_dir(
                        config_dir=sam2_configs_dir, version_base=None
                    ):
                        config_filename = Path(config_path).name
                        cfg = compose(config_name=config_filename.replace(".yaml", ""))

                        from hydra.utils import instantiate

                        self.model = instantiate(cfg.model)
                        self.model.to(self.device)

                        if model_path:
                            checkpoint = torch.load(
                                model_path, map_location=self.device
                            )
                            model_weights = checkpoint.get("model", checkpoint)
                            self.model.load_state_dict(model_weights, strict=False)

                        logger.info(
                            "SAM2: Successfully loaded custom SAM2.1 with manual initialization"
                        )

                except Exception as e1:
                    # Fallback to SAM2.0 config
                    logger.warning(
                        "SAM2: Falling back to SAM2.0 config for custom SAM2.1 model"
                    )
                    try:
                        fallback_config = "sam2_hiera_l.yaml"
                        self.model = build_sam2(
                            fallback_config, model_path, device=self.device
                        )
                        logger.warning(
                            "SAM2: Loaded custom SAM2.1 model with SAM2.0 config"
                        )
                    except Exception as e2:
                        raise Exception(
                            f"Failed to load custom SAM2.1 model. Manual init failed: {e1}, fallback failed: {e2}"
                        ) from e2
            else:
                # Standard SAM2.0 loading
                try:
                    logger.info(
                        f"SAM2: Attempting to load custom model with config path: {config_path}"
                    )
                    self.model = build_sam2(config_path, model_path, device=self.device)
                except Exception:
                    try:
                        config_filename = Path(config_path).name
                        logger.info(
                            f"SAM2: Attempting to load custom model with config filename: {config_filename}"
                        )
                        self.model = build_sam2(
                            config_filename, model_path, device=self.device
                        )
                    except Exception as e2:
                        raise Exception(
                            f"Failed to load custom model. Last error: {e2}"
                        ) from e2
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
