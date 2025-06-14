import cv2
import numpy as np
import torch
from segment_anything import sam_model_registry, SamPredictor


class SamModel:
    def __init__(self, model_type, model_path):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = sam_model_registry[model_type](checkpoint=model_path).to(
            self.device
        )
        self.predictor = SamPredictor(self.model)
        self.image = None

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
