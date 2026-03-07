"""COCO JSON exporter."""

from __future__ import annotations

import json
import os

import cv2
import numpy as np

from . import ExportContext, ExportFormat, _register


def _parse_alias(alias: str) -> tuple[str, str]:
    """Parse 'name.supercategory' dot notation.

    Returns (name, supercategory). If no dot, supercategory equals name.
    """
    if "." in alias:
        parts = alias.rsplit(".", 1)
        return parts[0], parts[1]
    return alias, alias


class CocoExporter:
    """Save annotations in per-image COCO JSON format.

    Output file: ``<base>_coco.json``

    Each annotation contains polygon segmentation, bounding box, and area.
    Supercategory support via dot notation in class aliases
    (e.g. ``"dog.animal"`` -> ``name="dog"``, ``supercategory="animal"``).
    """

    def export(self, ctx: ExportContext) -> str | None:
        h, w = ctx.image_size

        # Build categories
        categories = []
        for class_id in ctx.class_order:
            alias = ctx.class_aliases.get(class_id, str(class_id))
            name, supercategory = _parse_alias(alias)
            categories.append(
                {"id": class_id, "name": name, "supercategory": supercategory}
            )

        # Build image entry
        image_filename = os.path.basename(ctx.image_path)
        image_entry = {"id": 1, "file_name": image_filename, "width": w, "height": h}

        # Build annotations
        annotations = []
        ann_id = 1

        for channel in range(ctx.mask_tensor.shape[2]):
            single = ctx.mask_tensor[:, :, channel]
            if not np.any(single):
                continue

            contours, _ = cv2.findContours(
                single, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            category_id = ctx.class_order[channel]

            for contour in contours:
                if len(contour) < 3:
                    continue

                # Polygon segmentation: flatten [[x,y]] to [x1,y1,x2,y2,...]
                polygon = contour.reshape(-1).tolist()
                # Convert numpy ints to Python ints for JSON serialization
                polygon = [int(v) for v in polygon]

                # Bounding box
                x, y, bw, bh = cv2.boundingRect(contour)
                area = int(cv2.contourArea(contour))

                annotations.append(
                    {
                        "id": ann_id,
                        "image_id": 1,
                        "category_id": category_id,
                        "bbox": [int(x), int(y), int(bw), int(bh)],
                        "area": area,
                        "segmentation": [polygon],
                        "iscrowd": 0,
                    }
                )
                ann_id += 1

        if not annotations:
            return None

        coco_data = {
            "images": [image_entry],
            "annotations": annotations,
            "categories": categories,
        }

        path = self.get_output_path(ctx.image_path)
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w") as f:
            json.dump(coco_data, f, indent=2)
        return path

    def get_output_path(self, image_path: str) -> str:
        return os.path.splitext(image_path)[0] + "_coco.json"

    def delete_output(self, image_path: str) -> bool:
        path = self.get_output_path(image_path)
        if os.path.exists(path):
            os.remove(path)
            return True
        return False


_register(ExportFormat.COCO_JSON, CocoExporter(), {"_coco.json"})
