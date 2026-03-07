"""YOLO detection (bounding box) TXT exporter."""

from __future__ import annotations

import os

import cv2
import numpy as np

from . import ExportContext, ExportFormat, _register


class YoloDetectionExporter:
    """Save bounding box annotations in YOLO detection TXT format.

    Each line: ``class_id cx cy w h`` (normalized coordinates).
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
                x, y, bw, bh = cv2.boundingRect(contour)
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
