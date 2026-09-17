"""Produce golden export files by running the LEGACY Python exporters on the declared fixtures.

Usage (from this directory):
    PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src E:/venv/lazylabel/Scripts/python.exe generate_golden.py

Reads fixtures.json, rebuilds each case through the same calls the app makes
(SegmentManager.create_final_mask_tensor, _apply_crop_to_mask, create_instance_contours,
save_export_manager._build_export_context), runs every registered exporter, and writes the
resulting files under goldens/<case id>/ plus a manifest.

The TypeScript library builds the same inputs from the same fixtures.json and must reproduce these
bytes, under the line-ending rule in MODERNIZATION_BRIEF.md decision 10. Nothing here writes into
legacy/; the legacy tree is a read-only snapshot.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import shutil
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
GOLDENS = HERE.parent / "goldens"

try:
    from PyQt6.QtCore import QPointF

    from lazylabel.core.exporters import EXPORTERS, ExportContext
    from lazylabel.core.file_manager import FileManager
    from lazylabel.core.segment_manager import SegmentManager
except ImportError as exc:  # pragma: no cover - environment problem, not a test failure
    sys.exit(f"cannot import the legacy package: {exc}\n"
             "Run with PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src and the lazylabel venv.")


def build_segment(spec: dict, image_size: tuple[int, int]) -> dict:
    """Turn one declared segment into the dict shape SegmentManager stores."""
    kind = spec["type"]
    seg: dict = {"type": kind, "class_id": spec["classId"]}
    if kind in ("AI", "Loaded"):
        h, w = image_size
        mask = np.zeros((h, w), dtype=bool)
        for x1, y1, x2, y2 in spec["rects"]:
            mask[y1:y2, x1:x2] = True
        seg["mask"] = mask
        seg["vertices"] = None
    else:
        seg["mask"] = None
        seg["vertices"] = [QPointF(float(x), float(y)) for x, y in spec["vertices"]]
    return seg


def build_context(case: dict) -> ExportContext:
    """Mirror SaveExportManager._build_export_context for one fixture case."""
    image_size = tuple(case["imageSize"])  # (height, width)
    manager = SegmentManager()
    for spec in case["segments"]:
        manager.add_segment(build_segment(spec, image_size))
    for cid, alias in (case.get("aliases") or {}).items():
        manager.set_class_alias(int(cid), alias)

    priority = case.get("pixelPriority") or {}
    class_order = manager.get_unique_class_ids()
    class_labels = [manager.get_class_alias(cid) for cid in class_order]
    mask_tensor = manager.create_final_mask_tensor(
        image_size, class_order,
        priority.get("enabled", False), priority.get("ascending", True),
    )
    crop = tuple(case["crop"]) if case.get("crop") else None
    if crop:
        mask_tensor = FileManager(manager)._apply_crop_to_mask(mask_tensor, crop)
    instances = manager.create_instance_contours(image_size, class_order, mask_tensor)

    return ExportContext(
        image_path=str(GOLDENS / case["id"] / "image.png"),
        image_size=image_size,
        class_order=class_order,
        class_labels=class_labels,
        class_aliases=dict(manager.class_aliases),
        mask_tensor=mask_tensor,
        crop_coords=crop,
        instances=instances,
    )


def describe(path: pathlib.Path) -> dict:
    data = path.read_bytes()
    entry = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    if path.suffix == ".npz":
        with np.load(path, allow_pickle=True) as archive:
            entry["members"] = {
                key: {"shape": list(archive[key].shape), "dtype": str(archive[key].dtype)}
                for key in archive.files
            }
    return entry


def main() -> None:
    fixtures = json.loads((HERE / "fixtures.json").read_text(encoding="utf-8"))
    if GOLDENS.exists():
        shutil.rmtree(GOLDENS)
    manifest: dict = {"source": "legacy/lazylabel at 2a7d5d8", "cases": {}}

    for case in fixtures["cases"]:
        out_dir = GOLDENS / case["id"]
        out_dir.mkdir(parents=True)
        ctx = build_context(case)
        written: dict = {}
        for fmt, exporter in EXPORTERS.items():
            try:
                produced = exporter.export(ctx)
            except Exception as exc:  # a format refusing this input is itself the behavior
                written[fmt.value] = {"error": f"{type(exc).__name__}: {exc}"}
                continue
            written[fmt.value] = (describe(pathlib.Path(produced)) | {"file": pathlib.Path(produced).name}
                                  if produced else None)
        manifest["cases"][case["id"]] = {
            "classOrder": ctx.class_order,
            "classLabels": ctx.class_labels,
            "instanceCount": len(ctx.instances),
            "maskShape": list(ctx.mask_tensor.shape),
            "maskSetPixels": int(ctx.mask_tensor.sum()),
            "outputs": written,
        }
        print(f"{case['id']:34s} classes={ctx.class_order} instances={len(ctx.instances)} "
              f"files={sorted(p.name for p in out_dir.iterdir())}")

    (GOLDENS / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    print(f"\nwrote {len(fixtures['cases'])} cases to {GOLDENS}")


if __name__ == "__main__":
    main()
