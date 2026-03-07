"""File management functionality."""

import json
import os
import xml.etree.ElementTree as ET

import cv2
import numpy as np

from ..utils.logger import logger
from .segment_manager import SegmentManager


class FileManager:
    """Manages file operations for saving and loading."""

    def __init__(self, segment_manager: SegmentManager):
        self.segment_manager = segment_manager

    def save_npz(
        self,
        image_path: str,
        image_size: tuple[int, int],
        class_order: list[int],
        crop_coords: tuple[int, int, int, int] | None = None,
        pixel_priority_enabled: bool = False,
        pixel_priority_ascending: bool = True,
    ) -> str:
        """Save segments as NPZ file."""
        logger.debug(f"Saving NPZ for image: {image_path}")
        logger.debug(f"Image size: {image_size}, Class order: {class_order}")

        # Validate inputs
        if not class_order:
            raise ValueError("No classes defined for saving")

        final_mask_tensor = self.segment_manager.create_final_mask_tensor(
            image_size, class_order, pixel_priority_enabled, pixel_priority_ascending
        )

        # Validate mask tensor
        if final_mask_tensor.size == 0:
            raise ValueError("Empty mask tensor generated")

        logger.debug(f"Final mask tensor shape: {final_mask_tensor.shape}")

        # Apply crop if coordinates are provided
        if crop_coords:
            final_mask_tensor = self._apply_crop_to_mask(final_mask_tensor, crop_coords)
            logger.debug(f"Applied crop: {crop_coords}")

        npz_path = os.path.splitext(image_path)[0] + ".npz"

        # Create parent directory if it doesn't exist
        parent_dir = os.path.dirname(npz_path)
        if parent_dir:  # Only create if there's actually a parent directory
            os.makedirs(parent_dir, exist_ok=True)
            logger.debug(f"Ensured directory exists: {parent_dir}")

        # Save the NPZ file
        try:
            np.savez_compressed(npz_path, mask=final_mask_tensor.astype(np.uint8))
            logger.debug(f"Saved NPZ file: {npz_path}")
        except Exception as e:
            raise OSError(f"Failed to save NPZ file {npz_path}: {str(e)}") from e

        # Verify the file was actually created
        if not os.path.exists(npz_path):
            raise OSError(f"NPZ file was not created: {npz_path}")

        logger.debug(f"Successfully saved NPZ: {os.path.basename(npz_path)}")
        return npz_path

    def save_bb_txt(
        self,
        image_path: str,
        image_size: tuple[int, int],
        class_order: list[int],
        class_labels: list[str],
        crop_coords: tuple[int, int, int, int] | None = None,
        pixel_priority_enabled: bool = False,
        pixel_priority_ascending: bool = True,
    ) -> str | None:
        """Save segments as bounding box TXT file."""
        final_mask_tensor = self.segment_manager.create_final_mask_tensor(
            image_size, class_order, pixel_priority_enabled, pixel_priority_ascending
        )

        # Apply crop if coordinates are provided
        if crop_coords:
            final_mask_tensor = self._apply_crop_to_mask(final_mask_tensor, crop_coords)
        output_path = os.path.splitext(image_path)[0] + ".txt"
        h, w = image_size

        bb_annotations = []
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
                bb_entry = f"{class_label} {center_x} {center_y} {normalized_width} {normalized_height}"
                bb_annotations.append(bb_entry)

        if not bb_annotations:
            return None

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w") as file:
            for annotation in bb_annotations:
                file.write(annotation + "\n")

        return output_path

    def load_existing_mask(
        self, image_path: str, image_size: tuple[int, int] | None = None
    ) -> None:
        """Load existing annotations with fallback chain.

        Priority: NPZ > YOLO Seg > COCO JSON > Pascal VOC > CreateML > YOLO Det

        Args:
            image_path: Path to the current image file.
            image_size: (height, width) of the image, needed for non-NPZ loading.
        """
        base = os.path.splitext(image_path)[0]

        # 1. NPZ (highest fidelity — full mask tensor)
        npz_path = base + ".npz"
        if os.path.exists(npz_path):
            with np.load(npz_path, allow_pickle=True) as data:
                if "class_aliases" in data:
                    try:
                        aliases = data["class_aliases"].item()
                    except (AttributeError, ValueError):
                        aliases = dict(data["class_aliases"])
                    self.segment_manager.class_aliases = {
                        int(k): v for k, v in aliases.items()
                    }

                class_order = None
                if "class_order" in data:
                    class_order = data["class_order"].tolist()

                if "mask" in data:
                    mask_data = data["mask"]
                    if mask_data.ndim == 2:
                        mask_data = np.expand_dims(mask_data, axis=-1)

                    num_classes = mask_data.shape[2]
                    for i in range(num_classes):
                        class_mask = mask_data[:, :, i].astype(bool)
                        if np.any(class_mask):
                            class_id = (
                                class_order[i]
                                if class_order and i < len(class_order)
                                else i
                            )
                            self.segment_manager.add_segment(
                                {
                                    "mask": class_mask,
                                    "type": "Loaded",
                                    "vertices": None,
                                    "class_id": class_id,
                                }
                            )
            return

        if image_size is None:
            return

        # 2. YOLO Segmentation (polygon masks)
        seg_path = base + "_seg.txt"
        if os.path.exists(seg_path):
            self.load_yolo_seg_txt(seg_path, image_size)
            return

        # 3. COCO JSON (polygon + bbox)
        coco_path = base + "_coco.json"
        if os.path.exists(coco_path):
            self.load_coco_json(coco_path, image_size)
            return

        # 4. Pascal VOC XML (bbox only)
        xml_path = base + ".xml"
        if os.path.exists(xml_path):
            self.load_pascal_voc_xml(xml_path, image_size)
            return

        # 5. CreateML JSON (bbox only)
        createml_path = base + "_createml.json"
        if os.path.exists(createml_path):
            self.load_createml_json(createml_path, image_size)
            return

        # 6. YOLO Detection (bbox only)
        txt_path = base + ".txt"
        if os.path.exists(txt_path):
            self.load_bb_txt(txt_path, image_size)

    def _resolve_class_id(self, label_str: str, reverse_aliases: dict[str, int]) -> int:
        """Resolve a label string to a class_id.

        Looks up the label in reverse_aliases first, then tries int conversion,
        then auto-assigns a new class_id and registers the alias.
        """
        if label_str in reverse_aliases:
            return reverse_aliases[label_str]
        try:
            return int(label_str)
        except ValueError:
            existing = set(self.segment_manager.class_aliases.keys())
            class_id = max(existing, default=-1) + 1
            self.segment_manager.class_aliases[class_id] = label_str
            reverse_aliases[label_str] = class_id
            return class_id

    def load_bb_txt(self, txt_path: str, image_size: tuple[int, int]) -> None:
        """Load bounding box TXT labels and add them as segments.

        Each line: ``class_index cx cy w h`` (normalized coordinates).

        Args:
            txt_path: Path to the .txt file.
            image_size: (height, width) of the image.
        """
        h, w = image_size
        reverse_aliases: dict[str, int] = {
            v: k for k, v in self.segment_manager.class_aliases.items()
        }

        with open(txt_path) as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) != 5:
                    continue

                label_str, cx_s, cy_s, bw_s, bh_s = parts
                try:
                    cx, cy, bw, bh = (
                        float(cx_s),
                        float(cy_s),
                        float(bw_s),
                        float(bh_s),
                    )
                except ValueError:
                    continue

                class_id = self._resolve_class_id(label_str, reverse_aliases)

                # Denormalize to pixel coordinates
                x1 = int(round((cx - bw / 2) * w))
                y1 = int(round((cy - bh / 2) * h))
                x2 = int(round((cx + bw / 2) * w))
                y2 = int(round((cy + bh / 2) * h))

                # Clamp to image bounds
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w, x2), min(h, y2)

                if x2 <= x1 or y2 <= y1:
                    continue

                mask = np.zeros((h, w), dtype=bool)
                mask[y1:y2, x1:x2] = True

                self.segment_manager.add_segment(
                    {
                        "mask": mask,
                        "type": "Loaded",
                        "vertices": None,
                        "class_id": class_id,
                    }
                )

        logger.debug(f"Loaded bounding box labels from {txt_path}")

    def load_pascal_voc_xml(self, xml_path: str, image_size: tuple[int, int]) -> None:
        """Load Pascal VOC XML annotations and add them as segments.

        Args:
            xml_path: Path to the .xml file.
            image_size: (height, width) of the image.
        """
        h, w = image_size
        reverse_aliases: dict[str, int] = {
            v: k for k, v in self.segment_manager.class_aliases.items()
        }

        try:
            tree = ET.parse(xml_path)
        except ET.ParseError:
            logger.error(f"Failed to parse VOC XML: {xml_path}")
            return

        root = tree.getroot()

        for obj in root.findall("object"):
            name_el = obj.find("name")
            bbox_el = obj.find("bndbox")
            if name_el is None or bbox_el is None:
                continue

            label_str = name_el.text or "0"
            try:
                x1 = int(round(float(bbox_el.findtext("xmin", "0"))))
                y1 = int(round(float(bbox_el.findtext("ymin", "0"))))
                x2 = int(round(float(bbox_el.findtext("xmax", "0"))))
                y2 = int(round(float(bbox_el.findtext("ymax", "0"))))
            except ValueError:
                continue

            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            if x2 <= x1 or y2 <= y1:
                continue

            class_id = self._resolve_class_id(label_str, reverse_aliases)

            mask = np.zeros((h, w), dtype=bool)
            mask[y1:y2, x1:x2] = True

            self.segment_manager.add_segment(
                {
                    "mask": mask,
                    "type": "Loaded",
                    "vertices": None,
                    "class_id": class_id,
                }
            )

        logger.debug(f"Loaded Pascal VOC annotations from {xml_path}")

    def load_createml_json(self, json_path: str, image_size: tuple[int, int]) -> None:
        """Load CreateML JSON annotations and add them as segments.

        Args:
            json_path: Path to the _createml.json file.
            image_size: (height, width) of the image.
        """
        h, w = image_size
        reverse_aliases: dict[str, int] = {
            v: k for k, v in self.segment_manager.class_aliases.items()
        }

        try:
            with open(json_path) as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            logger.error(f"Failed to load CreateML JSON: {json_path}")
            return

        if not isinstance(data, list) or not data:
            return

        annotations = data[0].get("annotations", [])
        for ann in annotations:
            label_str = ann.get("label", "0")
            coords = ann.get("coordinates", {})
            try:
                cx = float(coords.get("x", 0))
                cy = float(coords.get("y", 0))
                bw = float(coords.get("width", 0))
                bh = float(coords.get("height", 0))
            except (ValueError, TypeError):
                continue

            x1 = int(round(cx - bw / 2))
            y1 = int(round(cy - bh / 2))
            x2 = x1 + int(round(bw))
            y2 = y1 + int(round(bh))

            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            if x2 <= x1 or y2 <= y1:
                continue

            class_id = self._resolve_class_id(label_str, reverse_aliases)

            mask = np.zeros((h, w), dtype=bool)
            mask[y1:y2, x1:x2] = True

            self.segment_manager.add_segment(
                {
                    "mask": mask,
                    "type": "Loaded",
                    "vertices": None,
                    "class_id": class_id,
                }
            )

        logger.debug(f"Loaded CreateML annotations from {json_path}")

    def load_yolo_seg_txt(self, txt_path: str, image_size: tuple[int, int]) -> None:
        """Load YOLO segmentation TXT labels and add them as segments.

        Each line: ``class_index x1 y1 x2 y2 ... xn yn`` (normalized coordinates).

        Args:
            txt_path: Path to the ``_seg.txt`` file.
            image_size: (height, width) of the image.
        """
        h, w = image_size
        reverse_aliases: dict[str, int] = {
            v: k for k, v in self.segment_manager.class_aliases.items()
        }

        with open(txt_path) as f:
            for line in f:
                parts = line.strip().split()
                # Minimum: label + 3 pairs (6 values) = 7 tokens
                if len(parts) < 7 or len(parts) % 2 == 0:
                    continue

                label_str = parts[0]
                coord_strs = parts[1:]

                try:
                    coords = [float(c) for c in coord_strs]
                except ValueError:
                    continue

                # Build polygon points
                points = []
                for i in range(0, len(coords), 2):
                    px = int(round(coords[i] * w))
                    py = int(round(coords[i + 1] * h))
                    points.append([px, py])

                if len(points) < 3:
                    continue

                class_id = self._resolve_class_id(label_str, reverse_aliases)

                # Rasterize polygon
                pts = np.array(points, dtype=np.int32)
                mask = np.zeros((h, w), dtype=np.uint8)
                cv2.fillPoly(mask, [pts], 1)
                mask = mask.astype(bool)

                if not np.any(mask):
                    continue

                # Store vertices for potential polygon editing
                vertices = [[p[0], p[1]] for p in points]

                self.segment_manager.add_segment(
                    {
                        "mask": mask,
                        "type": "Loaded",
                        "vertices": vertices,
                        "class_id": class_id,
                    }
                )

        logger.debug(f"Loaded YOLO segmentation labels from {txt_path}")

    def load_coco_json(self, json_path: str, image_size: tuple[int, int]) -> None:
        """Load COCO JSON annotations and add them as segments.

        Handles polygon segmentation; falls back to bbox if no segmentation.
        Reconstructs class aliases from categories (using supercategory dot notation).

        Args:
            json_path: Path to the ``_coco.json`` file.
            image_size: (height, width) of the image.
        """
        h, w = image_size

        try:
            with open(json_path) as f:
                coco_data = json.load(f)
        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"Error loading COCO JSON from {json_path}: {e}")
            return

        # Build category lookup
        categories = coco_data.get("categories", [])
        cat_lookup: dict[int, dict] = {cat["id"]: cat for cat in categories}

        # Register aliases from categories
        for cat_id, cat in cat_lookup.items():
            name = cat.get("name", str(cat_id))
            supercategory = cat.get("supercategory", name)
            alias = f"{name}.{supercategory}" if supercategory != name else name
            self.segment_manager.class_aliases[cat_id] = alias

        for ann in coco_data.get("annotations", []):
            category_id = ann.get("category_id", 0)
            segmentation = ann.get("segmentation")

            if segmentation and isinstance(segmentation, list) and segmentation:
                # Polygon segmentation: list of [x1,y1,x2,y2,...] lists
                for polygon in segmentation:
                    if not isinstance(polygon, list) or len(polygon) < 6:
                        continue

                    points = []
                    for i in range(0, len(polygon), 2):
                        points.append(
                            [int(round(polygon[i])), int(round(polygon[i + 1]))]
                        )

                    pts = np.array(points, dtype=np.int32)
                    mask = np.zeros((h, w), dtype=np.uint8)
                    cv2.fillPoly(mask, [pts], 1)
                    mask = mask.astype(bool)

                    if not np.any(mask):
                        continue

                    self.segment_manager.add_segment(
                        {
                            "mask": mask,
                            "type": "Loaded",
                            "vertices": [[p[0], p[1]] for p in points],
                            "class_id": category_id,
                        }
                    )
            else:
                # Fallback to bounding box
                bbox = ann.get("bbox")
                if not bbox or len(bbox) != 4:
                    continue

                x, y, bw, bh = [int(round(v)) for v in bbox]
                x1 = max(0, x)
                y1 = max(0, y)
                x2 = min(w, x + bw)
                y2 = min(h, y + bh)

                if x2 <= x1 or y2 <= y1:
                    continue

                mask = np.zeros((h, w), dtype=bool)
                mask[y1:y2, x1:x2] = True

                self.segment_manager.add_segment(
                    {
                        "mask": mask,
                        "type": "Loaded",
                        "vertices": None,
                        "class_id": category_id,
                    }
                )

        logger.debug(f"Loaded COCO JSON annotations from {json_path}")

    def _apply_crop_to_mask(
        self, mask_tensor: np.ndarray, crop_coords: tuple[int, int, int, int]
    ) -> np.ndarray:
        """Apply crop to mask tensor by setting areas outside crop to 0."""
        x1, y1, x2, y2 = crop_coords
        h, w = mask_tensor.shape[:2]

        # Create a copy of the mask tensor
        cropped_mask = mask_tensor.copy()

        # Set areas outside crop to 0
        # Top area (0, 0, w, y1)
        if y1 > 0:
            cropped_mask[:y1, :, :] = 0

        # Bottom area (0, y2, w, h)
        if y2 < h:
            cropped_mask[y2:, :, :] = 0

        # Left area (0, y1, x1, y2)
        if x1 > 0:
            cropped_mask[y1:y2, :x1, :] = 0

        # Right area (x2, y1, w, y2)
        if x2 < w:
            cropped_mask[y1:y2, x2:, :] = 0

        return cropped_mask

    def is_image_file(self, filepath: str) -> bool:
        """Check if file is a supported image format."""
        return filepath.lower().endswith((".png", ".jpg", ".jpeg", ".tiff", ".tif"))
