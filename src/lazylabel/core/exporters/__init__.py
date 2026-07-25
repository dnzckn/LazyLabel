"""Pluggable export format framework for LazyLabel annotations."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol

import cv2
import numpy as np


class ExportFormat(Enum):
    """Supported export formats."""

    NPZ = "NPZ"
    NPZ_CLASS_MAP = "NPZ_CLASS_MAP"
    YOLO_DETECTION = "YOLO_DETECTION"
    YOLO_SEGMENTATION = "YOLO_SEGMENTATION"
    COCO_JSON = "COCO_JSON"
    PASCAL_VOC = "PASCAL_VOC"
    CREATEML = "CREATEML"


EXPORT_FORMAT_LABELS: dict[ExportFormat, str] = {
    ExportFormat.NPZ: "NPZ",
    ExportFormat.NPZ_CLASS_MAP: "NPZ Class Map",
    ExportFormat.YOLO_DETECTION: "YOLO Detection",
    ExportFormat.YOLO_SEGMENTATION: "YOLO Segmentation",
    ExportFormat.COCO_JSON: "COCO JSON",
    ExportFormat.PASCAL_VOC: "Pascal VOC",
    ExportFormat.CREATEML: "CreateML",
}

EXPORT_FORMAT_TOOLTIPS: dict[ExportFormat, str] = {
    ExportFormat.NPZ: (
        "One-hot encoded mask tensor (H\u00d7W\u00d7C). "
        "One binary channel per class. Supports overlapping classes."
    ),
    ExportFormat.NPZ_CLASS_MAP: (
        "Single-channel class map (H\u00d7W). Each pixel stores its class index. "
        "Overlaps default to lowest class index; use Pixel Priority to control."
    ),
    ExportFormat.YOLO_DETECTION: (
        "YOLO bounding box format. One .txt file per image with normalized coordinates."
    ),
    ExportFormat.YOLO_SEGMENTATION: (
        "YOLO polygon segmentation format. Normalized polygon vertices per object."
    ),
    ExportFormat.COCO_JSON: (
        "COCO-style JSON with polygon segmentation, bounding boxes, and categories."
    ),
    ExportFormat.PASCAL_VOC: ("Pascal VOC XML format with bounding box annotations."),
    ExportFormat.CREATEML: (
        "Apple CreateML JSON format with bounding box annotations."
    ),
}

DEFAULT_EXPORT_FORMATS: set[ExportFormat] = {
    ExportFormat.NPZ,
    ExportFormat.YOLO_DETECTION,
}

# Order in which annotation files are trusted when an image has more than one,
# most faithful first. This governs loading only — exporting never consults it
# and never removes a file. Pixel masks beat polygons beat boxes; within that,
# formats that keep objects apart beat formats that merge everything of one
# class. NPZ Class Map is pixel-exact but stores one label per pixel, so it
# cannot represent overlapping classes or separate objects, and ranks below the
# polygon formats despite being a mask format.
# FileManager._LOAD_CHAIN mirrors this order.
LOAD_PRIORITY: tuple[ExportFormat, ...] = (
    ExportFormat.NPZ,
    ExportFormat.YOLO_SEGMENTATION,
    ExportFormat.COCO_JSON,
    ExportFormat.NPZ_CLASS_MAP,
    ExportFormat.PASCAL_VOC,
    ExportFormat.CREATEML,
    ExportFormat.YOLO_DETECTION,
)

# Formats that read ExportContext.instances. Building instance contours costs
# roughly as much as building the mask tensor, so it is skipped when none of
# these are selected.
INSTANCE_AWARE_FORMATS: frozenset[ExportFormat] = frozenset(
    {
        ExportFormat.YOLO_DETECTION,
        ExportFormat.YOLO_SEGMENTATION,
        ExportFormat.COCO_JSON,
        ExportFormat.PASCAL_VOC,
        ExportFormat.CREATEML,
    }
)


@dataclass
class ExportContext:
    """Data needed by exporters to write output files."""

    image_path: str
    image_size: tuple[int, int]  # (height, width)
    class_order: list[int]
    class_labels: list[str]
    class_aliases: dict[int, str]
    mask_tensor: np.ndarray  # (H, W, C) uint8
    crop_coords: tuple[int, int, int, int] | None = None
    # Per-object contours from SegmentManager.create_instance_contours().
    # Empty means "no instance information" and exporters fall back to
    # contouring the merged per-class channels of mask_tensor.
    instances: list[dict] = field(default_factory=list)


def iter_object_contours(ctx: ExportContext) -> Iterator[tuple[int, np.ndarray]]:
    """Yield ``(channel_index, contour)`` for every object to export.

    With ``ctx.instances`` populated each segment contributes its own contours,
    so same-class objects that touch or overlap stay separate. Without it the
    merged per-class channel is contoured instead, which fuses those objects
    into a single box.
    """
    if ctx.instances:
        for record in ctx.instances:
            for contour in record["contours"]:
                yield record["channel"], contour
        return

    for channel in range(ctx.mask_tensor.shape[2]):
        single = ctx.mask_tensor[:, :, channel]
        if not np.any(single):
            continue
        contours, _ = cv2.findContours(
            single, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        for contour in contours:
            yield channel, contour


def contour_to_polygon(contour: np.ndarray) -> list[int]:
    """Flatten a contour to ``[x1, y1, x2, y2, ...]`` pixel coordinates.

    Objects one pixel wide collapse to a one- or two-point contour, which is
    not a polygon. Rather than drop them, the points are repeated to form a
    closed ring that rasterizes back to exactly the same pixels: a doubled
    point for a single pixel, and a there-and-back pair for a line. Using the
    bounding box instead would fill in the whole square for a diagonal.
    """
    points = contour.reshape(-1, 2)
    if len(points) >= 3:
        return [int(v) for v in points.reshape(-1).tolist()]

    if len(points) == 2:
        (x1, y1), (x2, y2) = points
        return [int(x1), int(y1), int(x2), int(y2), int(x2), int(y2), int(x1), int(y1)]

    x, y = points[0]
    return [int(x), int(y)] * 4


class Exporter(Protocol):
    """Protocol that every exporter must satisfy."""

    def export(self, ctx: ExportContext) -> str | None:
        """Write the output file. Return the path written, or None if skipped."""
        ...

    def get_output_path(self, image_path: str) -> str:
        """Return the path that would be written for the given image."""
        ...

    def delete_output(self, image_path: str) -> bool:
        """Delete the output file if it exists. Return True if deleted."""
        ...


# Registry populated by submodule imports below.
EXPORTERS: dict[ExportFormat, Exporter] = {}

# All known output extensions (for file cleanup).
_OUTPUT_EXTENSIONS: set[str] = set()


def _register(fmt: ExportFormat, exporter: Exporter, extensions: set[str]) -> None:
    """Register an exporter and its file extensions."""
    EXPORTERS[fmt] = exporter
    _OUTPUT_EXTENSIONS.update(extensions)


def export_all(formats: set[ExportFormat], ctx: ExportContext) -> list[str]:
    """Run all enabled exporters and return list of paths written.

    Writing never deletes. Every format the user selected is exported, and
    files already sitting next to the image are left alone — they may be
    another format's export of the same annotations, or ground truth that
    shipped with the dataset. When several are present it is the loader's
    priority chain, not the writer, that decides which one is read back.
    """
    written: list[str] = []
    for fmt in formats:
        exporter = EXPORTERS.get(fmt)
        if exporter is None:
            continue
        path = exporter.export(ctx)
        if path is not None:
            written.append(path)
    return written


def delete_all_outputs(image_path: str) -> list[str]:
    """Delete all known format outputs for the given image. Return deleted paths."""
    deleted: list[str] = []
    for exporter in EXPORTERS.values():
        if exporter.delete_output(image_path):
            deleted.append(exporter.get_output_path(image_path))
    return deleted


def get_all_output_extensions() -> set[str]:
    """Return the set of file extensions produced by all registered exporters."""
    return set(_OUTPUT_EXTENSIONS)


# -- Import submodules to trigger registration --
from . import coco as coco  # noqa: E402
from . import createml as createml  # noqa: E402
from . import npz as npz  # noqa: E402
from . import npz_class_map as npz_class_map  # noqa: E402
from . import pascal_voc as pascal_voc  # noqa: E402
from . import yolo_detection as yolo_detection  # noqa: E402
from . import yolo_segmentation as yolo_segmentation  # noqa: E402
