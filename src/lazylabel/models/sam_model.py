import os

import cv2
import numpy as np
import requests
import torch
from segment_anything import SamPredictor, sam_model_registry
from tqdm import tqdm

from ..utils.logger import logger


def download_model(url, download_path):
    """Downloads file with a progress bar."""

    try:
        logger.info("Step 5/8: Connecting to download server...")
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()
        total_size_in_bytes = int(response.headers.get("content-length", 0))
        block_size = 1024  # 1 Kibibyte

        progress_bar = tqdm(total=total_size_in_bytes, unit="iB", unit_scale=True)
        with open(download_path, "wb") as file:
            for data in response.iter_content(block_size):
                progress_bar.update(len(data))
                file.write(data)
        progress_bar.close()

        if total_size_in_bytes != 0 and progress_bar.n != total_size_in_bytes:
            raise RuntimeError("Download incomplete - file size mismatch")

        logger.info("Step 5/8: Model download completed successfully.")

    except requests.exceptions.ConnectionError as e:
        raise RuntimeError(
            "Step 5/8: Network connection failed: Check your internet connection"
        ) from e
    except requests.exceptions.Timeout as e:
        raise RuntimeError(
            "Step 5/8: Download timeout: Server took too long to respond"
        ) from e
    except requests.exceptions.HTTPError as e:
        raise RuntimeError(
            f"Step 5/8: HTTP error {e.response.status_code}: Server rejected request"
        ) from e
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Step 5/8: Network error during download: {e}") from e
    except PermissionError as e:
        raise RuntimeError(
            f"Step 5/8: Permission denied: Cannot write to {download_path}"
        ) from e
    except OSError as e:
        raise RuntimeError(
            f"Step 5/8: Disk error: {e} (check available disk space)"
        ) from e
    except Exception as e:
        # Clean up partial download
        if os.path.exists(download_path):
            import contextlib

            with contextlib.suppress(OSError):
                os.remove(download_path)
        raise RuntimeError(f"Step 5/8: Download failed: {e}") from e


class SamModel:
    def __init__(
        self,
        model_type="vit_h",
        model_filename="sam_vit_h_4b8939.pth",
        custom_model_path=None,
    ):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Step 5/8: Detected device: {str(self.device).upper()}")

        self.current_model_type = model_type
        self.current_model_path = custom_model_path
        self.model = None
        self.predictor = None
        self.image = None
        self.is_loaded = False

        try:
            if custom_model_path and os.path.exists(custom_model_path):
                # Use custom model path
                model_path = custom_model_path
                logger.info(f"Step 5/8: Loading custom SAM model from {model_path}...")
            else:
                # Use default model with download if needed - store in models folder
                model_url = (
                    f"https://dl.fbaipublicfiles.com/segment_anything/{model_filename}"
                )

                # Use models folder instead of cache folder
                models_dir = os.path.dirname(__file__)  # Already in models directory
                os.makedirs(models_dir, exist_ok=True)
                model_path = os.path.join(models_dir, model_filename)

                # Also check the old cache location and move it if it exists
                old_cache_dir = os.path.join(
                    os.path.expanduser("~"), ".cache", "lazylabel"
                )
                old_model_path = os.path.join(old_cache_dir, model_filename)

                if os.path.exists(old_model_path) and not os.path.exists(model_path):
                    logger.info(
                        "Step 5/8: Moving existing model from cache to models folder..."
                    )
                    import shutil

                    shutil.move(old_model_path, model_path)
                elif not os.path.exists(model_path):
                    # Download the model if it doesn't exist
                    download_model(model_url, model_path)

                logger.info(f"Step 5/8: Loading default SAM model from {model_path}...")

            logger.info(
                f"Step 5/8: Initializing {model_type.upper()} model architecture..."
            )
            self.model = sam_model_registry[model_type](checkpoint=model_path).to(
                self.device
            )

            logger.info("Step 5/8: Setting up predictor...")
            self.predictor = SamPredictor(self.model)
            self.is_loaded = True
            logger.info("Step 5/8: SAM model loaded successfully.")

        except Exception as e:
            logger.error(f"Step 4/8: Failed to load SAM model: {e}")
            logger.warning("Step 4/8: SAM point functionality will be disabled.")
            self.is_loaded = False

    def load_custom_model(self, model_path, model_type="vit_h"):
        """Load a custom model from the specified path."""
        if not os.path.exists(model_path):
            logger.warning(f"Model file not found: {model_path}")
            return False

        logger.info(f"Loading custom SAM model from {model_path}...")
        try:
            # Clear existing model from memory
            if hasattr(self, "model") and self.model is not None:
                del self.model
                del self.predictor
                torch.cuda.empty_cache() if torch.cuda.is_available() else None

            # Load new model
            self.model = sam_model_registry[model_type](checkpoint=model_path).to(
                self.device
            )
            self.predictor = SamPredictor(self.model)
            self.current_model_type = model_type
            self.current_model_path = model_path
            self.is_loaded = True

            # Re-set image if one was previously loaded
            if self.image is not None:
                self.predictor.set_image(self.image)

            logger.info("Custom SAM model loaded successfully.")
            return True
        except Exception as e:
            logger.error(f"Error loading custom model: {e}")
            self.is_loaded = False
            self.model = None
            self.predictor = None
            return False

    def set_image_from_path(self, image_path):
        if not self.is_loaded:
            return False
        try:
            self.image = cv2.imread(image_path)
            self.image = cv2.cvtColor(self.image, cv2.COLOR_BGR2RGB)
            self.predictor.set_image(self.image)
            return True
        except Exception as e:
            logger.error(f"Error setting image from path: {e}")
            return False

    def set_image_from_array(self, image_array: np.ndarray):
        if not self.is_loaded:
            return False
        try:
            self.image = image_array
            self.predictor.set_image(self.image)
            return True
        except Exception as e:
            logger.error(f"Error setting image from array: {e}")
            return False

    def predict(self, positive_points, negative_points):
        if not self.is_loaded or not positive_points:
            return None

        try:
            points = np.array(positive_points + negative_points)
            labels = np.array([1] * len(positive_points) + [0] * len(negative_points))

            masks, _, _ = self.predictor.predict(
                point_coords=points,
                point_labels=labels,
                multimask_output=False,
            )
            return masks[0]
        except Exception as e:
            logger.error(f"Error during prediction: {e}")
            return None
