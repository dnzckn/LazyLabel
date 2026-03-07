"""YOLO segmentation (polygon) TXT exporter."""

from __future__ import annotations

import os

import cv2
import numpy as np

from . import ExportContext, ExportFormat, _register


class YoloSegmentationExporter:
    """Save polygon annotations in YOLO segmentation TXT format.

    Each line: ``class_id x1 y1 x2 y2 ... xn yn`` (normalized coordinates).
    Output file: ``<base>_seg.txt``
    """

    def export(self, ctx: ExportContext) -> str | None:
        h, w = ctx.image_size

        annotations: list[str] = []

        for channel in range(ctx.mask_tensor.shape[2]):
            single = ctx.mask_tensor[:, :, channel]
            if not np.any(single):
                continue

            contours, _ = cv2.findContours(
                single, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            class_id = ctx.class_order[channel]
            for contour in contours:
                # Simplify polygon
                epsilon = 0.001 * cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, epsilon, True)
                if len(approx) < 3:
                    continue

                # Build normalised coordinate string
                coords = []
                for point in approx:
                    px, py = point[0]
                    coords.append(f"{px / w} {py / h}")
                annotations.append(f"{class_id} " + " ".join(coords))

        if not annotations:
            return None

        path = self.get_output_path(ctx.image_path)
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w") as f:
            for line in annotations:
                f.write(line + "\n")
        return path

    def get_output_path(self, image_path: str) -> str:
        return os.path.splitext(image_path)[0] + "_seg.txt"

    def delete_output(self, image_path: str) -> bool:
        path = self.get_output_path(image_path)
        if os.path.exists(path):
            os.remove(path)
            return True
        return False


_register(ExportFormat.YOLO_SEGMENTATION, YoloSegmentationExporter(), {"_seg.txt"})
