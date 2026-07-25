"""Apple CreateML JSON exporter."""

from __future__ import annotations

import json
import os

import cv2

from . import ExportContext, ExportFormat, _register, iter_object_contours


class CreateMlExporter:
    """Save annotations in Apple CreateML JSON format.

    Output file: ``<base>_createml.json``

    Format::

        [
          {
            "image": "filename.png",
            "annotations": [
              {
                "label": "class_name",
                "coordinates": {"x": cx, "y": cy, "width": w, "height": h}
              }
            ]
          }
        ]
    """

    def export(self, ctx: ExportContext) -> str | None:
        ann_list: list[dict] = []

        for channel, contour in iter_object_contours(ctx):
            x, y, bw, bh = cv2.boundingRect(contour)
            ann_list.append(
                {
                    "label": ctx.class_labels[channel],
                    "coordinates": {
                        "x": int(x) + int(bw) / 2,
                        "y": int(y) + int(bh) / 2,
                        "width": int(bw),
                        "height": int(bh),
                    },
                }
            )

        if not ann_list:
            return None

        data = [
            {
                "image": os.path.basename(ctx.image_path),
                "annotations": ann_list,
            }
        ]

        path = self.get_output_path(ctx.image_path)
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
        return path

    def get_output_path(self, image_path: str) -> str:
        return os.path.splitext(image_path)[0] + "_createml.json"

    def delete_output(self, image_path: str) -> bool:
        path = self.get_output_path(image_path)
        if os.path.exists(path):
            os.remove(path)
            return True
        return False


_register(ExportFormat.CREATEML, CreateMlExporter(), {"_createml.json"})
