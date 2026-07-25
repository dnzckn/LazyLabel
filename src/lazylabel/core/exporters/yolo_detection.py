"""YOLO detection (bounding box) TXT exporter."""

from __future__ import annotations

import os

import cv2

from . import ExportContext, ExportFormat, _register, iter_object_contours


class YoloDetectionExporter:
    """Save bounding box annotations in YOLO detection TXT format.

    Each line: ``class_id cx cy w h`` (normalized coordinates).
    One line per object.
    """

    def export(self, ctx: ExportContext) -> str | None:
        h, w = ctx.image_size
        if h <= 0 or w <= 0:
            return None

        annotations: list[str] = []

        for channel, contour in iter_object_contours(ctx):
            x, y, bw, bh = cv2.boundingRect(contour)
            class_id = ctx.class_order[channel]
            cx = (x + bw / 2) / w
            cy = (y + bh / 2) / h
            nw = bw / w
            nh = bh / h
            annotations.append(f"{class_id} {cx} {cy} {nw} {nh}")

        if not annotations:
            return None

        path = self.get_output_path(ctx.image_path)
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w") as f:
            for line in annotations:
                f.write(line + "\n")
        return path

    def get_output_path(self, image_path: str) -> str:
        return os.path.splitext(image_path)[0] + ".txt"

    def delete_output(self, image_path: str) -> bool:
        path = self.get_output_path(image_path)
        if os.path.exists(path):
            os.remove(path)
            return True
        return False


_register(ExportFormat.YOLO_DETECTION, YoloDetectionExporter(), {".txt"})
