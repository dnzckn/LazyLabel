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

    # Annotation files LazyLabel can load, most faithful first — mirrors
    # exporters.LOAD_PRIORITY. Everything below NPZ needs the image size to
    # rebuild pixel masks.
    _LOAD_CHAIN: tuple[tuple[str, str], ...] = (
        (".npz", "npz"),
        ("_seg.txt", "yolo_seg"),
        ("_coco.json", "coco"),
        ("_CM.npz", "npz_class_map"),
        (".xml", "pascal_voc"),
        ("_createml.json", "createml"),
        (".txt", "yolo_det"),
    )

    @classmethod
    def find_annotation_file(cls, image_path: str) -> str | None:
        """Return the annotation file that would be loaded for an image.

        Use this instead of probing for ``.npz`` when deciding whether an image
        is already labelled — an image annotated as YOLO Detection has no NPZ
        and would otherwise look untouched.
        """
        base = os.path.splitext(image_path)[0]
        for suffix, _ in cls._LOAD_CHAIN:
            path = base + suffix
            if os.path.exists(path):
                return path
        return None

    def load_existing_mask(
        self, image_path: str, image_size: tuple[int, int] | None = None
    ) -> None:
        """Load existing annotations with fallback chain.

        Priority (highest fidelity first): NPZ > YOLO Seg > COCO JSON >
        NPZ Class Map > Pascal VOC > CreateML > YOLO Det. The first format
        present on disk wins, so a mask format is never passed over in favour
        of a bounding box downgrade of the same annotations. A file that cannot
        be read is logged and the chain moves on to the next format rather than
        letting one damaged sidecar hide a healthy one.

        Args:
            image_path: Path to the current image file.
            image_size: (height, width) of the image. Every format except NPZ
                needs it to rebuild pixel masks; when omitted it is read from
                the image file itself.
        """
        base = os.path.splitext(image_path)[0]

        for suffix, fmt in self._LOAD_CHAIN:
            path = base + suffix
            if not os.path.exists(path):
                continue

            if fmt != "npz" and image_size is None:
                image_size = self._read_image_size(image_path)
                if image_size is None:
                    logger.error(
                        f"Cannot load {fmt} annotations: image size unavailable "
                        f"for {image_path}"
                    )
                    return

            try:
                if fmt == "npz":
                    self._load_npz(path)
                elif fmt == "npz_class_map":
                    self.load_npz_class_map(path, image_size)
                elif fmt == "yolo_seg":
                    self.load_yolo_seg_txt(path, image_size)
                elif fmt == "coco":
                    self.load_coco_json(path, image_size)
                elif fmt == "pascal_voc":
                    self.load_pascal_voc_xml(path, image_size)
                elif fmt == "createml":
                    self.load_createml_json(path, image_size)
                else:
                    self.load_bb_txt(path, image_size)
            except Exception as e:
                logger.error(f"Failed to load {path}: {e}")
                continue
            return

    @staticmethod
    def _read_image_size(image_path: str) -> tuple[int, int] | None:
        """Return (height, width) of an image, header-only where possible."""
        try:
            from PyQt6.QtGui import QImageReader

            size = QImageReader(image_path).size()
            if size.isValid() and size.width() > 0 and size.height() > 0:
                return size.height(), size.width()
        except Exception:  # pragma: no cover - Qt unavailable/headless
            pass

        image = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if image is None:
            return None
        return int(image.shape[0]), int(image.shape[1])

    def _load_npz(self, npz_path: str) -> None:
        """Load a one-hot (H, W, C) mask tensor NPZ.

        Two legacy layouts are also accepted: a ``masks`` key holding the same
        (H, W, C) tensor, and a ``masks`` (N, H, W) stack paired with a
        ``class_ids`` array.
        """
        with np.load(npz_path, allow_pickle=True) as data:
            self._restore_aliases(data)

            if "masks" in data and "class_ids" in data and "mask" not in data:
                self._add_mask_stack(data["masks"], data["class_ids"])
                return

            mask_key = (
                "mask" if "mask" in data else "masks" if "masks" in data else None
            )
            if mask_key is None:
                return

            class_order = None
            if "class_order" in data:
                class_order = data["class_order"].tolist()

            mask_data = data[mask_key]
            if mask_data.ndim == 2:
                mask_data = np.expand_dims(mask_data, axis=-1)

            # Channels are packed in class_order, so a channel index is only the
            # class id for files written before that key existed.
            for i in range(mask_data.shape[2]):
                class_mask = mask_data[:, :, i].astype(bool)
                if not np.any(class_mask):
                    continue
                class_id = class_order[i] if class_order and i < len(class_order) else i
                self.segment_manager.add_segment(
                    {
                        "mask": class_mask,
                        "type": "Loaded",
                        "vertices": None,
                        "class_id": class_id,
                    }
                )

    def _add_mask_stack(self, masks: np.ndarray, class_ids: np.ndarray) -> None:
        """Add one segment per mask in an (N, H, W) stack."""
        for i in range(len(masks)):
            if not np.any(masks[i]):
                continue
            self.segment_manager.add_segment(
                {
                    "mask": masks[i].astype(bool),
                    "type": "Loaded",
                    "vertices": None,
                    "class_id": int(class_ids[i]) if i < len(class_ids) else 0,
                }
            )

    def load_npz_class_map(
        self, npz_path: str, image_size: tuple[int, int] | None = None
    ) -> None:
        """Load a single-channel (H, W) class map NPZ as one segment per class.

        ``class_map`` stores the class id at every labelled pixel, which makes
        id 0 ambiguous with background. The exporter also writes a ``foreground``
        mask for exactly that reason; files written before it existed fall back
        to treating 0 as background.

        Args:
            npz_path: Path to the ``_CM.npz`` file.
            image_size: (height, width) used to reject a mismatched class map.
        """
        try:
            with np.load(npz_path, allow_pickle=True) as data:
                if "class_map" not in data:
                    logger.error(f"No class_map in {npz_path}")
                    return

                class_map = data["class_map"]
                foreground = (
                    data["foreground"].astype(bool)
                    if "foreground" in data
                    else class_map != 0
                )
                self._restore_aliases(data)
        except (OSError, ValueError) as e:
            logger.error(f"Failed to load NPZ class map {npz_path}: {e}")
            return

        if image_size is not None and tuple(class_map.shape[:2]) != tuple(image_size):
            logger.error(
                f"Class map shape {class_map.shape[:2]} does not match image "
                f"size {image_size}: {npz_path}"
            )
            return

        for class_id in np.unique(class_map[foreground]):
            class_mask = foreground & (class_map == class_id)
            if not np.any(class_mask):
                continue
            self.segment_manager.add_segment(
                {
                    "mask": class_mask,
                    "type": "Loaded",
                    "vertices": None,
                    "class_id": int(class_id),
                }
            )

        logger.debug(f"Loaded NPZ class map from {npz_path}")

    def _restore_aliases(self, data) -> None:
        """Restore class aliases from an opened NPZ archive, if present."""
        if "class_aliases" not in data:
            return
        try:
            aliases = data["class_aliases"].item()
        except (AttributeError, ValueError):
            aliases = dict(data["class_aliases"])
        self.segment_manager.class_aliases = {int(k): v for k, v in aliases.items()}

    def _build_label_map(self, labels: list[str]) -> dict[str, int]:
        """Map every label string in one annotation file to a class id.

        Resolution order per label: an existing alias, then a plain integer,
        then a freshly assigned id. Assignment happens only after every numeric
        label in the file has claimed its id, otherwise a file mixing ``dog``
        with ``0`` would hand both the same id and merge two classes into one.

        Newly assigned ids are registered as aliases so the name survives.
        """
        reverse_aliases = {v: k for k, v in self.segment_manager.class_aliases.items()}
        label_map: dict[str, int] = {}
        unnamed: list[str] = []

        for label in labels:
            if label in label_map or label in unnamed:
                continue
            if label in reverse_aliases:
                label_map[label] = reverse_aliases[label]
                continue
            try:
                label_map[label] = int(label)
            except ValueError:
                unnamed.append(label)

        taken = set(self.segment_manager.class_aliases) | set(label_map.values())
        next_id = 0
        for label in unnamed:
            while next_id in taken:
                next_id += 1
            label_map[label] = next_id
            taken.add(next_id)
            self.segment_manager.class_aliases[next_id] = label

        return label_map

    def _add_box_segments(
        self,
        boxes: list[tuple[str, int, int, int, int]],
        image_size: tuple[int, int],
    ) -> None:
        """Turn ``(label, x1, y1, x2, y2)`` boxes into segments.

        Coordinates are pixel bounds with ``x2``/``y2`` exclusive. Boxes are
        clamped to the image and dropped when they collapse to nothing.
        """
        h, w = image_size
        label_map = self._build_label_map([label for label, *_ in boxes])

        for label, x1, y1, x2, y2 in boxes:
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
                    "class_id": label_map[label],
                }
            )

    def load_bb_txt(self, txt_path: str, image_size: tuple[int, int]) -> None:
        """Load bounding box TXT labels and add them as segments.

        Each line: ``class_index cx cy w h`` (normalized coordinates).

        Args:
            txt_path: Path to the .txt file.
            image_size: (height, width) of the image.
        """
        h, w = image_size

        try:
            with open(txt_path) as f:
                lines = f.readlines()
        except (OSError, UnicodeDecodeError) as e:
            logger.error(f"Failed to read bounding box TXT {txt_path}: {e}")
            return

        boxes: list[tuple[str, int, int, int, int]] = []
        for line in lines:
            parts = line.strip().split()
            if len(parts) != 5:
                continue

            label_str, cx_s, cy_s, bw_s, bh_s = parts
            try:
                cx, cy, bw, bh = float(cx_s), float(cy_s), float(bw_s), float(bh_s)
            except ValueError:
                continue

            # Denormalize to pixel coordinates
            boxes.append(
                (
                    label_str,
                    int(round((cx - bw / 2) * w)),
                    int(round((cy - bh / 2) * h)),
                    int(round((cx + bw / 2) * w)),
                    int(round((cy + bh / 2) * h)),
                )
            )

        self._add_box_segments(boxes, image_size)
        logger.debug(f"Loaded bounding box labels from {txt_path}")

    def load_pascal_voc_xml(self, xml_path: str, image_size: tuple[int, int]) -> None:
        """Load Pascal VOC XML annotations and add them as segments.

        ``xmax``/``ymax`` are read as exclusive bounds, matching what the
        Pascal VOC exporter writes.

        Args:
            xml_path: Path to the .xml file.
            image_size: (height, width) of the image.
        """
        try:
            tree = ET.parse(xml_path)
        except (ET.ParseError, OSError) as e:
            logger.error(f"Failed to parse VOC XML {xml_path}: {e}")
            return

        boxes: list[tuple[str, int, int, int, int]] = []
        for obj in tree.getroot().findall("object"):
            name_el = obj.find("name")
            bbox_el = obj.find("bndbox")
            if name_el is None or bbox_el is None:
                continue

            try:
                boxes.append(
                    (
                        name_el.text or "0",
                        int(round(float(bbox_el.findtext("xmin", "0")))),
                        int(round(float(bbox_el.findtext("ymin", "0")))),
                        int(round(float(bbox_el.findtext("xmax", "0")))),
                        int(round(float(bbox_el.findtext("ymax", "0")))),
                    )
                )
            except (ValueError, TypeError):
                continue

        self._add_box_segments(boxes, image_size)
        logger.debug(f"Loaded Pascal VOC annotations from {xml_path}")

    def load_createml_json(self, json_path: str, image_size: tuple[int, int]) -> None:
        """Load CreateML JSON annotations and add them as segments.

        Args:
            json_path: Path to the _createml.json file.
            image_size: (height, width) of the image.
        """
        try:
            with open(json_path) as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError, UnicodeDecodeError) as e:
            logger.error(f"Failed to load CreateML JSON {json_path}: {e}")
            return

        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            return

        boxes: list[tuple[str, int, int, int, int]] = []
        for ann in data[0].get("annotations") or []:
            if not isinstance(ann, dict):
                continue
            coords = ann.get("coordinates")
            if not isinstance(coords, dict):
                continue
            try:
                cx = float(coords.get("x", 0))
                cy = float(coords.get("y", 0))
                bw = float(coords.get("width", 0))
                bh = float(coords.get("height", 0))
            except (ValueError, TypeError):
                continue

            x1 = int(round(cx - bw / 2))
            y1 = int(round(cy - bh / 2))
            boxes.append(
                (
                    str(ann.get("label", "0")),
                    x1,
                    y1,
                    x1 + int(round(bw)),
                    y1 + int(round(bh)),
                )
            )

        self._add_box_segments(boxes, image_size)
        logger.debug(f"Loaded CreateML annotations from {json_path}")

    def load_yolo_seg_txt(self, txt_path: str, image_size: tuple[int, int]) -> None:
        """Load YOLO segmentation TXT labels and add them as segments.

        Each line: ``class_index x1 y1 x2 y2 ... xn yn`` (normalized coordinates).

        Args:
            txt_path: Path to the ``_seg.txt`` file.
            image_size: (height, width) of the image.
        """
        h, w = image_size

        try:
            with open(txt_path) as f:
                lines = f.readlines()
        except (OSError, UnicodeDecodeError) as e:
            logger.error(f"Failed to read YOLO segmentation TXT {txt_path}: {e}")
            return

        polygons: list[tuple[str, list[list[int]]]] = []
        for line in lines:
            parts = line.strip().split()
            # Minimum: label + 3 pairs (6 values) = 7 tokens
            if len(parts) < 7 or len(parts) % 2 == 0:
                continue

            try:
                coords = [float(c) for c in parts[1:]]
            except ValueError:
                continue

            points = [
                [int(round(coords[i] * w)), int(round(coords[i + 1] * h))]
                for i in range(0, len(coords), 2)
            ]
            if len(points) >= 3:
                polygons.append((parts[0], points))

        label_map = self._build_label_map([label for label, _ in polygons])

        for label, points in polygons:
            # Rasterize polygon
            mask = np.zeros((h, w), dtype=np.uint8)
            cv2.fillPoly(mask, [np.array(points, dtype=np.int32)], 1)
            mask = mask.astype(bool)

            if not np.any(mask):
                continue

            self.segment_manager.add_segment(
                {
                    "mask": mask,
                    "type": "Loaded",
                    # Store vertices for potential polygon editing
                    "vertices": [[p[0], p[1]] for p in points],
                    "class_id": label_map[label],
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
        except (json.JSONDecodeError, OSError, UnicodeDecodeError, ValueError) as e:
            logger.error(f"Error loading COCO JSON from {json_path}: {e}")
            return

        if not isinstance(coco_data, dict):
            logger.error(f"COCO JSON is not an object: {json_path}")
            return

        # Register aliases from categories
        for cat in coco_data.get("categories") or []:
            if not isinstance(cat, dict) or "id" not in cat:
                continue
            try:
                cat_id = int(cat["id"])
            except (TypeError, ValueError):
                continue
            name = str(cat.get("name", cat_id))
            supercategory = str(cat.get("supercategory", name))
            self.segment_manager.class_aliases[cat_id] = (
                f"{name}.{supercategory}" if supercategory != name else name
            )

        for ann in coco_data.get("annotations") or []:
            if not isinstance(ann, dict):
                continue
            try:
                category_id = int(ann.get("category_id", 0))
            except (TypeError, ValueError):
                continue

            # Polygon segmentation: list of [x1,y1,x2,y2,...] lists. An RLE
            # dict, an empty list, or polygons too degenerate to rasterize all
            # fall through to the bounding box so the object is never lost.
            added = False
            segmentation = ann.get("segmentation")
            if isinstance(segmentation, list):
                for polygon in segmentation:
                    if not isinstance(polygon, list) or len(polygon) < 6:
                        continue

                    try:
                        points = [
                            [int(round(polygon[i])), int(round(polygon[i + 1]))]
                            for i in range(0, len(polygon) - 1, 2)
                        ]
                    except (TypeError, ValueError):
                        continue

                    mask = np.zeros((h, w), dtype=np.uint8)
                    cv2.fillPoly(mask, [np.array(points, dtype=np.int32)], 1)
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
                    added = True

            if added:
                continue

            bbox = ann.get("bbox")
            if not isinstance(bbox, list) or len(bbox) != 4:
                continue
            try:
                x, y, bw, bh = (int(round(float(v))) for v in bbox)
            except (TypeError, ValueError):
                continue

            x1, y1 = max(0, x), max(0, y)
            x2, y2 = min(w, x + bw), min(h, y + bh)
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
