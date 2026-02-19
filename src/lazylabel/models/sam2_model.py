import os
from collections.abc import Callable
from pathlib import Path

import cv2
import numpy as np
import torch

from ..utils.logger import logger

# SAM-2 specific imports - will fail gracefully if not available
try:
    from sam2.build_sam import build_sam2, build_sam2_video_predictor
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    SAM2_VIDEO_AVAILABLE = True
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

        # Video predictor state (for sequence propagation)
        self.video_predictor = None
        self.video_inference_state = None
        self.video_image_paths: list[str] = []
        self.is_video_initialized = False
        self._video_temp_dir: str | None = None  # Temp dir for non-JPEG images

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

    def get_embeddings(self):
        """Extract current image embeddings for caching.

        Returns:
            Dict with embeddings data, or None if no image is set
        """
        if not self.is_loaded or not hasattr(self.predictor, "_features"):
            return None

        try:
            # SAM2ImagePredictor stores _features as a dict of tensors
            features = self.predictor._features
            if features is None:
                return None

            # Clone each tensor in the features dict to CPU
            if isinstance(features, dict):
                features_copy = {
                    k: v.cpu().clone() if hasattr(v, "cpu") else v
                    for k, v in features.items()
                }
            else:
                # Fallback if it's a tensor
                features_copy = features.cpu().clone()

            return {
                "features": features_copy,
                "orig_hw": self.predictor._orig_hw,
                "image": self.image.copy() if self.image is not None else None,
            }
        except Exception as e:
            logger.error(f"SAM2: Error extracting embeddings: {e}")
            return None

    def set_embeddings(self, embeddings_data):
        """Restore cached embeddings to skip image encoding.

        Args:
            embeddings_data: Dict from get_embeddings()

        Returns:
            True if successful, False otherwise
        """
        if not self.is_loaded or embeddings_data is None:
            return False

        try:
            features = embeddings_data.get("features")
            if features is not None:
                # Restore features dict - move each tensor back to device
                if isinstance(features, dict):
                    self.predictor._features = {
                        k: v.to(self.device) if hasattr(v, "to") else v
                        for k, v in features.items()
                    }
                else:
                    self.predictor._features = features.to(self.device)

                self.predictor._orig_hw = embeddings_data["orig_hw"]
                self.predictor._is_image_set = True
                self.image = embeddings_data.get("image")
                return True
            return False
        except Exception as e:
            logger.error(f"SAM2: Error restoring embeddings: {e}")
            return False

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

    # =========================================================================
    # Video Predictor Methods (for sequence/video propagation)
    # =========================================================================

    def init_video_predictor(self) -> bool:
        """Initialize the video predictor for sequence propagation.

        Uses the same model checkpoint as the image predictor.

        Returns:
            True if successful, False otherwise
        """
        if not SAM2_VIDEO_AVAILABLE:
            logger.error("SAM2: Video predictor not available")
            return False

        if self.video_predictor is not None:
            logger.debug("SAM2: Video predictor already initialized")
            return True

        try:
            logger.info("SAM2: Initializing video predictor...")

            model_filename = Path(self.current_model_path).name.lower()

            # Determine the config file path for build_sam2_video_predictor
            # The function expects paths relative to the sam2 package configs dir
            # Format: "configs/sam2.1/sam2.1_hiera_l.yaml" for SAM2.1
            # Format: "configs/sam2/sam2_hiera_l.yaml" for SAM2.0
            if "2.1" in model_filename:
                # SAM2.1 model
                if "large" in model_filename or "hiera_l" in model_filename:
                    config_file = "configs/sam2.1/sam2.1_hiera_l.yaml"
                elif "base" in model_filename or "hiera_b" in model_filename:
                    config_file = "configs/sam2.1/sam2.1_hiera_b+.yaml"
                elif "small" in model_filename or "hiera_s" in model_filename:
                    config_file = "configs/sam2.1/sam2.1_hiera_s.yaml"
                elif "tiny" in model_filename or "hiera_t" in model_filename:
                    config_file = "configs/sam2.1/sam2.1_hiera_t.yaml"
                else:
                    # Default to large
                    config_file = "configs/sam2.1/sam2.1_hiera_l.yaml"
            else:
                # SAM2.0 model
                if "large" in model_filename or "hiera_l" in model_filename:
                    config_file = "configs/sam2/sam2_hiera_l.yaml"
                elif "base" in model_filename or "hiera_b" in model_filename:
                    config_file = "configs/sam2/sam2_hiera_b+.yaml"
                elif "small" in model_filename or "hiera_s" in model_filename:
                    config_file = "configs/sam2/sam2_hiera_s.yaml"
                elif "tiny" in model_filename or "hiera_t" in model_filename:
                    config_file = "configs/sam2/sam2_hiera_t.yaml"
                else:
                    # Default to large
                    config_file = "configs/sam2/sam2_hiera_l.yaml"

            logger.info(f"SAM2: Using video predictor config: {config_file}")

            # Ensure Hydra is properly initialized for sam2
            # sam2.__init__ normally does this, but if image predictor cleared
            # Hydra state, we need to re-initialize it
            try:
                from hydra import initialize_config_module
                from hydra.core.global_hydra import GlobalHydra

                if not GlobalHydra.instance().is_initialized():
                    # Re-initialize with sam2 config module (same as sam2.__init__)
                    initialize_config_module("sam2", version_base="1.2")
                    logger.debug("SAM2: Re-initialized Hydra for video predictor")
            except Exception as hydra_error:
                logger.debug(f"SAM2: Hydra init note: {hydra_error}")

            self.video_predictor = build_sam2_video_predictor(
                config_file,
                self.current_model_path,
                device=self.device,
            )

            logger.info("SAM2: Video predictor initialized successfully")
            return True

        except Exception as e:
            logger.error(f"SAM2: Failed to initialize video predictor: {e}")
            self.video_predictor = None
            return False

    def init_video_state(
        self,
        image_paths: list[str],
        image_cache: dict[str, np.ndarray] | None = None,
        progress_callback: Callable[[int, int, str], None] | None = None,
    ) -> bool:
        """Initialize video state with an explicit list of image paths.

        Note: SAM2 video predictor only supports JPEG files. If the images
        are non-JPEG (PNG, BMP, etc.), they will be converted to temporary
        JPEG files automatically.

        Args:
            image_paths: List of image file paths for the sequence. Only
                these images are loaded into the video predictor.
            image_cache: Optional dict mapping image paths to numpy arrays.
                If provided, cached images will be used instead of reading
                from disk, which saves I/O when images are preloaded.
            progress_callback: Optional callback(current, total, message)
                called after each image is prepared, for UI progress updates.

        Returns:
            True if successful, False otherwise
        """
        if self.video_predictor is None and not self.init_video_predictor():
            return False

        try:
            all_images = [Path(p) for p in image_paths]
            logger.info(
                f"SAM2: Initializing video state with {len(all_images)} images"
            )

            if not all_images:
                logger.error("SAM2: No images provided")
                return False

            # Store original image paths for reference
            self.video_image_paths = [str(p) for p in all_images]

            # SAM2 requires numeric-only filenames (e.g., "00000.jpg")
            # Always create a temp directory with properly named files
            # This handles arbitrary user filenames transparently
            import tempfile

            # Clean up any previous temp directory
            self._cleanup_temp_dir()

            # Create temp directory
            self._video_temp_dir = tempfile.mkdtemp(prefix="sam2_video_")
            logger.info(
                f"SAM2: Preparing {len(all_images)} images for video predictor..."
            )

            cache_hits = 0
            jpeg_extensions_set = {".jpg", ".jpeg"}

            total_images = len(all_images)
            for i, img_path in enumerate(all_images):
                img_path_str = str(img_path)
                jpeg_path = Path(self._video_temp_dir) / f"{i:05d}.jpg"

                # Try to use cached image first (saves disk I/O)
                if image_cache and img_path_str in image_cache:
                    img = image_cache[img_path_str]
                    # Cache stores RGB, need to convert to BGR for cv2.imwrite
                    img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
                    cv2.imwrite(str(jpeg_path), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
                    cache_hits += 1
                elif img_path.suffix.lower() in jpeg_extensions_set:
                    # Already JPEG - use symlink to avoid doubling disk usage
                    try:
                        os.symlink(img_path_str, str(jpeg_path))
                    except OSError:
                        # Symlinks may fail on some systems, fall back to copy
                        import shutil

                        shutil.copy2(img_path_str, str(jpeg_path))
                else:
                    # Read and convert to JPEG
                    img = cv2.imread(img_path_str)
                    if img is None:
                        logger.warning(f"SAM2: Could not read {img_path}")
                        continue
                    cv2.imwrite(str(jpeg_path), img, [cv2.IMWRITE_JPEG_QUALITY, 95])

                if progress_callback is not None:
                    progress_callback(
                        i + 1,
                        total_images,
                        f"Preparing image {i + 1}/{total_images}",
                    )

            if cache_hits > 0:
                logger.info(f"SAM2: Used {cache_hits} cached images (saved disk I/O)")

            video_path = self._video_temp_dir
            logger.debug(f"SAM2: Created temp directory: {video_path}")

            # SAM2 video predictor expects a directory path
            # It will automatically load images in sorted order
            if progress_callback is not None:
                progress_callback(
                    total_images,
                    total_images,
                    "Initializing SAM 2 video predictor...",
                )

            with (
                torch.inference_mode(),
                torch.autocast(str(self.device), dtype=torch.bfloat16),
            ):
                self.video_inference_state = self.video_predictor.init_state(
                    video_path=video_path,
                    offload_video_to_cpu=True,  # Save GPU memory
                    offload_state_to_cpu=False,
                )

            self.is_video_initialized = True
            logger.info(
                f"SAM2: Video state initialized with {len(self.video_image_paths)} frames"
            )
            return True

        except Exception as e:
            logger.error(f"SAM2: Failed to initialize video state: {e}")
            self.video_inference_state = None
            self.is_video_initialized = False
            self._cleanup_temp_dir()
            return False

    def _cleanup_temp_dir(self) -> None:
        """Clean up temporary JPEG directory if it exists."""
        if self._video_temp_dir is not None:
            try:
                import shutil

                shutil.rmtree(self._video_temp_dir, ignore_errors=True)
                logger.debug(f"SAM2: Cleaned up temp dir: {self._video_temp_dir}")
            except Exception as e:
                logger.warning(f"SAM2: Failed to clean up temp dir: {e}")
            self._video_temp_dir = None

    def add_video_mask(
        self, frame_idx: int, obj_id: int, mask: np.ndarray
    ) -> tuple[np.ndarray, float] | None:
        """Add a mask prompt to the video predictor.

        Args:
            frame_idx: Frame index (0-based)
            obj_id: Object ID for tracking
            mask: Binary mask array (H, W)

        Returns:
            Tuple of (output_mask, confidence_score) or None if failed
        """
        if not self.is_video_initialized:
            logger.error("SAM2: Video state not initialized")
            return None

        try:
            with (
                torch.inference_mode(),
                torch.autocast(str(self.device), dtype=torch.bfloat16),
            ):
                # Add mask to the video predictor
                frame_idx_out, obj_ids, mask_logits = self.video_predictor.add_new_mask(
                    inference_state=self.video_inference_state,
                    frame_idx=frame_idx,
                    obj_id=obj_id,
                    mask=mask.astype(bool),
                )

                # Convert logits to mask and confidence
                if mask_logits is not None and len(mask_logits) > 0:
                    # Find the mask for our object
                    obj_idx = list(obj_ids).index(obj_id) if obj_id in obj_ids else 0
                    logits = mask_logits[obj_idx]

                    # Convert to mask (threshold at 0)
                    output_mask = (logits > 0).cpu().numpy().astype(np.uint8)

                    # Compute confidence from logits (sigmoid of mean positive logit)
                    positive_logits = logits[logits > 0]
                    if len(positive_logits) > 0:
                        confidence = float(torch.sigmoid(positive_logits.mean()).item())
                    else:
                        confidence = 0.5

                    return output_mask, confidence

            return None

        except Exception as e:
            logger.error(f"SAM2: Failed to add video mask: {e}")
            return None

    def add_video_points(
        self,
        frame_idx: int,
        obj_id: int,
        points: np.ndarray,
        labels: np.ndarray,
    ) -> tuple[np.ndarray, float] | None:
        """Add point prompts to the video predictor.

        Args:
            frame_idx: Frame index (0-based)
            obj_id: Object ID for tracking
            points: Point coordinates array (N, 2)
            labels: Point labels array (N,) - 1 for positive, 0 for negative

        Returns:
            Tuple of (output_mask, confidence_score) or None if failed
        """
        if not self.is_video_initialized:
            logger.error("SAM2: Video state not initialized")
            return None

        try:
            with (
                torch.inference_mode(),
                torch.autocast(str(self.device), dtype=torch.bfloat16),
            ):
                # Add points to the video predictor
                (
                    frame_idx_out,
                    obj_ids,
                    mask_logits,
                ) = self.video_predictor.add_new_points_or_box(
                    inference_state=self.video_inference_state,
                    frame_idx=frame_idx,
                    obj_id=obj_id,
                    points=points,
                    labels=labels,
                    clear_old_points=True,
                )

                # Convert logits to mask and confidence
                if mask_logits is not None and len(mask_logits) > 0:
                    obj_idx = list(obj_ids).index(obj_id) if obj_id in obj_ids else 0
                    logits = mask_logits[obj_idx]

                    output_mask = (logits > 0).cpu().numpy().astype(np.uint8)

                    positive_logits = logits[logits > 0]
                    if len(positive_logits) > 0:
                        confidence = float(torch.sigmoid(positive_logits.mean()).item())
                    else:
                        confidence = 0.5

                    return output_mask, confidence

            return None

        except Exception as e:
            logger.error(f"SAM2: Failed to add video points: {e}")
            return None

    def propagate_in_video(
        self,
        start_frame_idx: int | None = None,
        max_frames: int | None = None,
        reverse: bool = False,
    ):
        """Propagate masks through the video sequence.

        This is a generator that yields results frame by frame.

        Args:
            start_frame_idx: Starting frame index (None = reference frame)
            max_frames: Maximum number of frames to propagate (None = all)
            reverse: If True, propagate backward instead of forward

        Yields:
            Tuple of (frame_idx, obj_id, mask, confidence) for each frame/object
        """
        if not self.is_video_initialized:
            logger.error("SAM2: Video state not initialized")
            return

        try:
            logger.debug(
                f"SAM2: propagate_in_video called with start_frame_idx={start_frame_idx}, "
                f"max_frames={max_frames}, reverse={reverse}"
            )
            frame_count = 0

            with (
                torch.inference_mode(),
                torch.autocast(str(self.device), dtype=torch.bfloat16),
            ):
                # Propagate through video
                for (
                    frame_idx,
                    obj_ids,
                    mask_logits,
                ) in self.video_predictor.propagate_in_video(
                    inference_state=self.video_inference_state,
                    start_frame_idx=start_frame_idx,
                    max_frame_num_to_track=max_frames,
                    reverse=reverse,
                ):
                    frame_count += 1
                    logger.debug(
                        f"SAM2: video_predictor yielded frame_idx={frame_idx}, "
                        f"num_objects={len(obj_ids)}"
                    )
                    # Process each object in this frame
                    for i, obj_id in enumerate(obj_ids):
                        logits = mask_logits[i]

                        # Convert to binary mask
                        mask = (logits > 0).cpu().numpy().squeeze().astype(np.uint8)

                        # Compute confidence score
                        positive_logits = logits[logits > 0]
                        if len(positive_logits) > 0:
                            confidence = float(
                                torch.sigmoid(positive_logits.mean()).item()
                            )
                        else:
                            confidence = 0.0

                        yield frame_idx, int(obj_id), mask, confidence

            logger.debug(
                f"SAM2: propagate_in_video completed, yielded {frame_count} frames"
            )

        except Exception as e:
            logger.error(f"SAM2: Error during video propagation: {e}")
            return

    def reset_video_state(self) -> None:
        """Reset the video inference state (clear all prompts)."""
        if self.video_predictor is not None and self.video_inference_state is not None:
            try:
                self.video_predictor.reset_state(self.video_inference_state)
                logger.debug("SAM2: Video state reset")
            except Exception as e:
                logger.error(f"SAM2: Failed to reset video state: {e}")

    def cleanup_video_predictor(self) -> None:
        """Clean up video predictor to free GPU memory."""
        if self.video_inference_state is not None:
            self.video_inference_state = None

        if self.video_predictor is not None:
            del self.video_predictor
            self.video_predictor = None

        self.video_image_paths = []
        self.is_video_initialized = False

        # Clean up temp directory if it exists
        self._cleanup_temp_dir()

        # Clear GPU cache
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        logger.info("SAM2: Video predictor cleaned up")

    @property
    def video_frame_count(self) -> int:
        """Get the number of frames in the current video state."""
        return len(self.video_image_paths)
