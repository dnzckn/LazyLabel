"""YOLO segmentation (polygon) TXT exporter."""

from __future__ import annotations

import os

import cv2

from . import (
    ExportContext,
    ExportFormat,
    _register,
    contour_to_polygon,
    iter_object_contours,
)


class YoloSegmentationExporter:
    """Save polygon annotations in YOLO segmentation TXT format.

    Each line: ``class_id x1 y1 x2 y2 ... xn yn`` (normalized coordinates).
    One line per object. Output file: ``<base>_seg.txt``
    """

    def export(self, ctx: ExportContext) -> str | None:
        h, w = ctx.image_size
        if h <= 0 or w <= 0:
            return None

        annotations: list[str] = []

        for channel, contour in iter_object_contours(ctx):
            # Simplify polygon
            epsilon = 0.001 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            polygon = contour_to_polygon(approx)

            # Build normalised coordinate string
            coords = [
                f"{polygon[i] / w} {polygon[i + 1] / h}"
                for i in range(0, len(polygon), 2)
            ]
            annotations.append(f"{ctx.class_order[channel]} " + " ".join(coords))

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
