import os
import cv2
import numpy as np
import torch
import requests
from tqdm import tqdm
from segment_anything import sam_model_registry, SamPredictor


def download_model(url, download_path):
    """Downloads file with a progress bar."""
    print(
        f"SAM model not found. Downloading from Meta's GitHub repository to: {download_path}"
    )
    response = requests.get(url, stream=True)
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
        print("ERROR, something went wrong during download")


class SamModel:
    def __init__(self, model_type, model_filename="sam_vit_h_4b8939.pth"):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # Define model URL and local cache path
        model_url = f"https://dl.fbaipublicfiles.com/segment_anything/{model_filename}"
        cache_dir = os.path.join(os.path.expanduser("~"), ".cache", "lazylabel")
        os.makedirs(cache_dir, exist_ok=True)
        model_path = os.path.join(cache_dir, model_filename)

        # Download the model if it doesn't exist
        if not os.path.exists(model_path):
            download_model(model_url, model_path)

        print(f"Loading SAM model from {model_path}...")
        self.model = sam_model_registry[model_type](checkpoint=model_path).to(
            self.device
        )
        self.predictor = SamPredictor(self.model)
        self.image = None
        print("SAM model loaded successfully.")

    def set_image(self, image_path):
        self.image = cv2.imread(image_path)
        self.image = cv2.cvtColor(self.image, cv2.COLOR_BGR2RGB)
        self.predictor.set_image(self.image)

    def predict(self, positive_points, negative_points):
        if not positive_points:
            return None

        points = np.array(positive_points + negative_points)
        labels = np.array([1] * len(positive_points) + [0] * len(negative_points))

        masks, _, _ = self.predictor.predict(
            point_coords=points,
            point_labels=labels,
            multimask_output=False,
        )
        return masks[0]
