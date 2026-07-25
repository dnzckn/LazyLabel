"""Pascal VOC XML exporter."""

from __future__ import annotations

import os
import xml.etree.ElementTree as ET

import cv2

from . import ExportContext, ExportFormat, _register, iter_object_contours


class PascalVocExporter:
    """Save annotations in Pascal VOC XML format.

    Output file: ``<base>.xml``

    One ``<object>`` element per object. ``xmax``/``ymax`` are exclusive, so
    ``xmax - xmin`` is the box width; the VOC loader uses the same convention.
    """

    def export(self, ctx: ExportContext) -> str | None:
        h, w = ctx.image_size

        root = ET.Element("annotation")
        ET.SubElement(root, "filename").text = os.path.basename(ctx.image_path)

        size_el = ET.SubElement(root, "size")
        ET.SubElement(size_el, "width").text = str(w)
        ET.SubElement(size_el, "height").text = str(h)
        ET.SubElement(size_el, "depth").text = "3"

        has_objects = False

        for channel, contour in iter_object_contours(ctx):
            x, y, bw, bh = cv2.boundingRect(contour)
            label = ctx.class_labels[channel]

            obj_el = ET.SubElement(root, "object")
            ET.SubElement(obj_el, "name").text = label
            ET.SubElement(obj_el, "pose").text = "Unspecified"
            ET.SubElement(obj_el, "truncated").text = "0"
            ET.SubElement(obj_el, "difficult").text = "0"

            bbox_el = ET.SubElement(obj_el, "bndbox")
            ET.SubElement(bbox_el, "xmin").text = str(x)
            ET.SubElement(bbox_el, "ymin").text = str(y)
            ET.SubElement(bbox_el, "xmax").text = str(x + bw)
            ET.SubElement(bbox_el, "ymax").text = str(y + bh)
            has_objects = True

        if not has_objects:
            return None

        path = self.get_output_path(ctx.image_path)
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        tree = ET.ElementTree(root)
        ET.indent(tree)
        tree.write(path, encoding="unicode", xml_declaration=True)
        return path

    def get_output_path(self, image_path: str) -> str:
        return os.path.splitext(image_path)[0] + ".xml"

    def delete_output(self, image_path: str) -> bool:
        path = self.get_output_path(image_path)
        if os.path.exists(path):
            os.remove(path)
            return True
        return False


_register(ExportFormat.PASCAL_VOC, PascalVocExporter(), {".xml"})
