"""Pluggable export format framework for LazyLabel annotations."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol

import numpy as np


class ExportFormat(Enum):
    """Supported export formats."""

    NPZ = "NPZ"
    YOLO_DETECTION = "YOLO_DETECTION"
    YOLO_SEGMENTATION = "YOLO_SEGMENTATION"
    COCO_JSON = "COCO_JSON"
    PASCAL_VOC = "PASCAL_VOC"
    CREATEML = "CREATEML"


EXPORT_FORMAT_LABELS: dict[ExportFormat, str] = {
    ExportFormat.NPZ: "NPZ",
    ExportFormat.YOLO_DETECTION: "YOLO Detection",
    ExportFormat.YOLO_SEGMENTATION: "YOLO Segmentation",
    ExportFormat.COCO_JSON: "COCO JSON",
    ExportFormat.PASCAL_VOC: "Pascal VOC",
    ExportFormat.CREATEML: "CreateML",
}

DEFAULT_EXPORT_FORMATS: set[ExportFormat] = {
    ExportFormat.NPZ,
    ExportFormat.YOLO_DETECTION,
}


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
    segments: list[dict] = field(default_factory=list)


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
    """Run all enabled exporters and return list of paths written."""
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
from . import pascal_voc as pascal_voc  # noqa: E402
from . import yolo_detection as yolo_detection  # noqa: E402
from . import yolo_segmentation as yolo_segmentation  # noqa: E402
