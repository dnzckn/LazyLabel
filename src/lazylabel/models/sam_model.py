import os
import cv2
import numpy as np
import torch
import requests
from tqdm import tqdm
from segment_anything import sam_model_registry, SamPredictor


def download_model(url, download_path):
    """Downloads file with a progress bar."""
    print(f"[10/20] SAM model not found. Downloading from Meta's repository...")
    print(f"        Downloading to: {download_path}")
    try:
        print(f"[10/20] Connecting to download server...")
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()
        total_size_in_bytes = int(response.headers.get("content-length", 0))
        block_size = 1024  # 1 Kibibyte

        print(
            f"[10/20] Starting download ({total_size_in_bytes / (1024*1024*1024):.1f} GB)..."
        )
        progress_bar = tqdm(total=total_size_in_bytes, unit="iB", unit_scale=True)
        with open(download_path, "wb") as file:
            for data in response.iter_content(block_size):
                progress_bar.update(len(data))
                file.write(data)
        progress_bar.close()

        if total_size_in_bytes != 0 and progress_bar.n != total_size_in_bytes:
            raise RuntimeError("Download incomplete - file size mismatch")

        print("[10/20] Model download completed successfully.")

    except requests.exceptions.ConnectionError as e:
        raise RuntimeError(
            f"[10/20] Network connection failed: Check your internet connection"
        )
    except requests.exceptions.Timeout as e:
        raise RuntimeError(f"[10/20] Download timeout: Server took too long to respond")
    except requests.exceptions.HTTPError as e:
        raise RuntimeError(
            f"[10/20] HTTP error {e.response.status_code}: Server rejected request"
        )
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"[10/20] Network error during download: {e}")
    except PermissionError as e:
        raise RuntimeError(
            f"[10/20] Permission denied: Cannot write to {download_path}"
        )
    except OSError as e:
        raise RuntimeError(f"[10/20] Disk error: {e} (check available disk space)")
    except Exception as e:
        # Clean up partial download
        if os.path.exists(download_path):
            try:
                os.remove(download_path)
            except:
                pass
        raise RuntimeError(f"[10/20] Download failed: {e}")


class SamModel:
    def __init__(
        self,
        model_type="vit_h",
        model_filename="sam_vit_h_4b8939.pth",
        custom_model_path=None,
    ):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"[9/20] Detected device: {str(self.device).upper()}")

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
                print(f"[10/20] Loading custom SAM model from {model_path}...")
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
                    print(
                        f"[10/20] Moving existing model from cache to models folder..."
                    )
                    import shutil

                    shutil.move(old_model_path, model_path)
                elif not os.path.exists(model_path):
                    # Download the model if it doesn't exist
                    download_model(model_url, model_path)

                print(f"[10/20] Loading default SAM model from {model_path}...")

            print(f"[11/20] Initializing {model_type.upper()} model architecture...")
            self.model = sam_model_registry[model_type](checkpoint=model_path).to(
                self.device
            )

            print(f"[12/20] Setting up predictor...")
            self.predictor = SamPredictor(self.model)
            self.is_loaded = True
            print("[13/20] SAM model loaded successfully.")

        except Exception as e:
            print(f"[8/20] Failed to load SAM model: {e}")
            print(f"[8/20] SAM point functionality will be disabled.")
            self.is_loaded = False

    def load_custom_model(self, model_path, model_type="vit_h"):
        """Load a custom model from the specified path."""
        if not os.path.exists(model_path):
            print(f"Model file not found: {model_path}")
            return False

        print(f"Loading custom SAM model from {model_path}...")
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

            print("Custom SAM model loaded successfully.")
            return True
        except Exception as e:
            print(f"Error loading custom model: {e}")
            self.is_loaded = False
            self.model = None
            self.predictor = None
            return False

    def set_image(self, image_path):
        if not self.is_loaded:
            return False
        try:
            self.image = cv2.imread(image_path)
            self.image = cv2.cvtColor(self.image, cv2.COLOR_BGR2RGB)
            self.predictor.set_image(self.image)
            return True
        except Exception as e:
            print(f"Error setting image: {e}")
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
            print(f"Error during prediction: {e}")
            return None
