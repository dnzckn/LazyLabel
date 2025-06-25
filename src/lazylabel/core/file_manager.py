"""File management functionality."""

import os
import json
import numpy as np
import cv2
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

from .segment_manager import SegmentManager


class FileManager:
    """Manages file operations for saving and loading."""
    
    def __init__(self, segment_manager: SegmentManager):
        self.segment_manager = segment_manager
    
    def save_npz(self, image_path: str, image_size: Tuple[int, int], class_order: List[int]) -> str:
        """Save segments as NPZ file."""
        final_mask_tensor = self.segment_manager.create_final_mask_tensor(image_size, class_order)
        npz_path = os.path.splitext(image_path)[0] + ".npz"
        np.savez_compressed(npz_path, mask=final_mask_tensor.astype(np.uint8))
        return npz_path
    
    def save_yolo_txt(self, image_path: str, image_size: Tuple[int, int], 
                      class_order: List[int], class_labels: List[str]) -> Optional[str]:
        """Save segments as YOLO format TXT file."""
        final_mask_tensor = self.segment_manager.create_final_mask_tensor(image_size, class_order)
        output_path = os.path.splitext(image_path)[0] + ".txt"
        h, w = image_size
        
        yolo_annotations = []
        for channel in range(final_mask_tensor.shape[2]):
            single_channel_image = final_mask_tensor[:, :, channel]
            if not np.any(single_channel_image):
                continue
            
            contours, _ = cv2.findContours(
                single_channel_image, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            
            class_label = class_labels[channel]
            for contour in contours:
                x, y, width, height = cv2.boundingRect(contour)
                center_x = (x + width / 2) / w
                center_y = (y + height / 2) / h
                normalized_width = width / w
                normalized_height = height / h
                yolo_entry = f"{class_label} {center_x} {center_y} {normalized_width} {normalized_height}"
                yolo_annotations.append(yolo_entry)
        
        if not yolo_annotations:
            return None
        
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w") as file:
            for annotation in yolo_annotations:
                file.write(annotation + "\n")
        
        return output_path
    
    def save_class_aliases(self, image_path: str) -> str:
        """Save class aliases as JSON file."""
        aliases_path = os.path.splitext(image_path)[0] + ".json"
        aliases_to_save = {str(k): v for k, v in self.segment_manager.class_aliases.items()}
        with open(aliases_path, "w") as f:
            json.dump(aliases_to_save, f, indent=4)
        return aliases_path
    
    def load_class_aliases(self, image_path: str) -> None:
        """Load class aliases from JSON file."""
        json_path = os.path.splitext(image_path)[0] + ".json"
        if os.path.exists(json_path):
            try:
                with open(json_path, "r") as f:
                    loaded_aliases = json.load(f)
                    self.segment_manager.class_aliases = {int(k): v for k, v in loaded_aliases.items()}
            except (json.JSONDecodeError, ValueError) as e:
                print(f"Error loading class aliases from {json_path}: {e}")
                self.segment_manager.class_aliases.clear()
    
    def load_existing_mask(self, image_path: str) -> None:
        """Load existing mask from NPZ file."""
        npz_path = os.path.splitext(image_path)[0] + ".npz"
        if os.path.exists(npz_path):
            with np.load(npz_path) as data:
                if "mask" in data:
                    mask_data = data["mask"]
                    if mask_data.ndim == 2:
                        mask_data = np.expand_dims(mask_data, axis=-1)
                    
                    num_classes = mask_data.shape[2]
                    for i in range(num_classes):
                        class_mask = mask_data[:, :, i].astype(bool)
                        if np.any(class_mask):
                            self.segment_manager.add_segment({
                                "mask": class_mask,
                                "type": "Loaded",
                                "vertices": None,
                                "class_id": i,
                            })
    
    def is_image_file(self, filepath: str) -> bool:
        """Check if file is a supported image format."""
        return filepath.lower().endswith((".png", ".jpg", ".jpeg", ".tiff", ".tif"))