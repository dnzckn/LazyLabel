"""Write a synthetic acceptance corpus with the LEGACY app's own code, for Phase 6's exit criterion 4.

The owner's substitute for a real corpus (2026-09-25): "simulate the round trip, have multiple
shapes/segments/classes and play with the priority setting to ensure expected behaviors across the
variety of save formats".

    PYTHONPATH=<repo>/legacy/lazylabel/src <legacy venv python> generate_acceptance_corpus.py

It makes a set of randomized images, each with several polygons, circles and masks over several
classes, overlapping on purpose, with names for some classes (non-ASCII among them). It saves the
SAME images once per pixel-priority setting, in all seven formats, exactly as legacy's save path
does: SegmentManager builds the mask tensor and the instances, and every registered exporter writes
its file (the same calls as exporters/tools/generate_golden.py).

    test/fixtures/acceptance-corpus/<setting>/   what legacy SAVED: the picture and its seven files
    test/fixtures/acceptance-oracle/<setting>/   what legacy writes when it OPENS that image and
                                                 saves it again -- FileManager.load_existing_mask,
                                                 then the same save path

    <setting> is priority-off (overlaps kept in every class), priority-ascending (the lowest class
    id wins an overlapping pixel) or priority-descending (the highest wins).

The oracle is needed because legacy's files do not survive its own round trip: the NPZ holds one
mask per CLASS, so opening it merges every instance of a class into one, and the instance formats
written after that list one entry per class region rather than one per drawn shape.

Every file is legacy's bytes, unchanged, pickled class names included: since the owner's decision
of 2026-09-25 the web stack reads legacy's pickled name table as data (never unpickling it,
SEC-01), so a dataset reaches the web app exactly as the desktop app saved it, with no converter
step. `corpus.json` declares every case in fixtures.json's shape, so the port can be given the same
annotations.

Deterministic: the same seed writes the same corpus. Nothing here writes into legacy/.
"""

from __future__ import annotations

import json
import math
import pathlib
import random
import shutil
import sys
import tempfile

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
FIXTURES = HERE.parent / "test" / "fixtures"
CORPUS = FIXTURES / "acceptance-corpus"
ORACLE = FIXTURES / "acceptance-oracle"
SEED = 20260925
IMAGES = 10

SETTINGS = {
    "priority-off": {"enabled": False, "ascending": True},
    "priority-ascending": {"enabled": True, "ascending": True},
    "priority-descending": {"enabled": True, "ascending": False},
}

# Names for some classes, and none for others: an unnamed class is written under its id.
NAMES = ["cell", "nucleus", "vehicle", "person", "tree", "Zelle", "細胞", "héron", "boîte", "road"]

try:
    from PyQt6.QtCore import QPointF
    from PyQt6.QtGui import QImage

    from lazylabel.core.exporters import EXPORTERS, ExportContext
    from lazylabel.core.file_manager import FileManager
    from lazylabel.core.segment_manager import SegmentManager
except ImportError as exc:  # pragma: no cover - environment problem, not a test failure
    sys.exit(f"cannot import the legacy package: {exc}\n"
             "Run with PYTHONPATH=<repo>/legacy/lazylabel/src and the legacy app's venv.")


def random_case(rng: random.Random, index: int) -> dict:
    """One image's worth of annotations, in fixtures.json's shape."""
    height = rng.randrange(48, 161)
    width = rng.randrange(64, 225)
    class_ids = sorted(rng.sample(range(10), rng.randrange(2, 6)))
    aliases = {str(cid): rng.choice(NAMES) for cid in class_ids if rng.random() < 0.6}

    segments: list[dict] = []
    anchor: tuple[float, float] | None = None
    for _ in range(rng.randrange(3, 9)):
        class_id = rng.choice(class_ids)
        # Half the shapes are placed near the previous one, so overlaps between classes are common:
        # the pixel-priority settings only differ where two classes cover the same pixel.
        if anchor is not None and rng.random() < 0.5:
            cx = min(width - 6.0, max(5.0, anchor[0] + rng.uniform(-15, 15)))
            cy = min(height - 6.0, max(5.0, anchor[1] + rng.uniform(-15, 15)))
        else:
            cx, cy = rng.uniform(8, width - 8), rng.uniform(8, height - 8)
        anchor = (cx, cy)
        kind = rng.choices(["Polygon", "Circle", "AI", "Loaded"], weights=[3, 2, 3, 2])[0]

        if kind == "Polygon":
            # A star-shaped polygon: sorted angles and jittered radii never cross themselves.
            count = rng.randrange(3, 9)
            radius = rng.uniform(5, min(width, height) / 3)
            angles = sorted(rng.uniform(0, 2 * math.pi) for _ in range(count))
            vertices = []
            for angle in angles:
                r = radius * rng.uniform(0.5, 1.0)
                x = min(width - 1.0, max(0.0, cx + r * math.cos(angle)))
                y = min(height - 1.0, max(0.0, cy + r * math.sin(angle)))
                vertices.append([round(x, 1), round(y, 1)])
            segments.append({"type": "Polygon", "classId": class_id, "vertices": vertices})
        elif kind == "Circle":
            radius = rng.uniform(3, min(width, height) / 4)
            segments.append({
                "type": "Circle",
                "classId": class_id,
                "vertices": [[round(cx, 1), round(cy, 1)], [round(cx + radius, 1), round(cy, 1)]],
            })
        else:
            rects = []
            for _ in range(rng.randrange(1, 4)):
                w, h = rng.randrange(4, max(5, width // 3)), rng.randrange(4, max(5, height // 3))
                x1 = int(min(width - w, max(0, cx - w / 2 + rng.uniform(-10, 10))))
                y1 = int(min(height - h, max(0, cy - h / 2 + rng.uniform(-10, 10))))
                rects.append([x1, y1, x1 + w, y1 + h])
            segments.append({"type": kind, "classId": class_id, "rects": rects})

    return {
        "name": f"image_{index:02d}",
        "imageSize": [height, width],
        "aliases": aliases,
        "segments": segments,
    }


def build_segment(spec: dict, image_size: tuple[int, int]) -> dict:
    """The dict SegmentManager stores for one declared segment, as generate_golden.py builds it."""
    seg: dict = {"type": spec["type"], "class_id": spec["classId"]}
    if spec["type"] in ("AI", "Loaded"):
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


def write_picture(path: pathlib.Path, image_size: tuple[int, int]) -> None:
    """A plain gradient of the right size: only the size reaches the formats."""
    height, width = image_size
    ramp = (np.arange(width, dtype=np.uint16) * 160 // max(1, width - 1) + 48).astype(np.uint8)
    pixels = np.repeat(np.repeat(ramp[None, :, None], height, axis=0), 3, axis=2)
    data = pixels.tobytes()  # QImage does not copy its bytes: held until the save is done
    image = QImage(data, width, height, width * 3, QImage.Format.Format_RGB888)
    if not image.save(str(path), "PNG"):
        raise RuntimeError(f"could not write {path}")


def export_all(manager: SegmentManager, image_path: pathlib.Path, image_size, priority) -> None:
    """Legacy's save path: SaveExportManager._build_export_context, then every exporter."""
    class_order = manager.get_unique_class_ids()
    mask_tensor = manager.create_final_mask_tensor(
        image_size, class_order, priority["enabled"], priority["ascending"],
    )
    context = ExportContext(
        image_path=str(image_path),
        image_size=image_size,
        class_order=class_order,
        class_labels=[manager.get_class_alias(cid) for cid in class_order],
        class_aliases=dict(manager.class_aliases),
        mask_tensor=mask_tensor,
        crop_coords=None,
        instances=manager.create_instance_contours(image_size, class_order, mask_tensor),
    )
    for _fmt, exporter in EXPORTERS.items():
        exporter.export(context)


def save_case(case: dict, priority: dict, image_path: pathlib.Path) -> None:
    """What legacy writes when these annotations are drawn and saved."""
    image_size = tuple(case["imageSize"])
    manager = SegmentManager()
    for spec in case["segments"]:
        manager.add_segment(build_segment(spec, image_size))
    for cid, alias in case["aliases"].items():
        manager.set_class_alias(int(cid), alias)
    export_all(manager, image_path, image_size, priority)


def resave(image_path: pathlib.Path, image_size, priority, out_path: pathlib.Path) -> None:
    """What legacy writes when it opens that image and saves it again."""
    manager = SegmentManager()
    FileManager(manager).load_existing_mask(str(image_path), image_size)
    export_all(manager, out_path, image_size, priority)


def publish(source: pathlib.Path, destination: pathlib.Path, pictures: bool) -> None:
    """Copy one folder of legacy output as legacy wrote it."""
    destination.mkdir(parents=True, exist_ok=True)
    for path in sorted(source.iterdir()):
        if path.suffix == ".png" and not pictures:
            continue
        shutil.copyfile(path, destination / path.name)


def main() -> None:
    rng = random.Random(SEED)
    cases = [random_case(rng, index) for index in range(IMAGES)]

    # Only the folders this script writes: each root's .gitattributes keeps legacy's bytes exact in git.
    for folder in (CORPUS, ORACLE):
        for setting in SETTINGS:
            if (folder / setting).exists():
                shutil.rmtree(folder / setting)

    declared = []
    with tempfile.TemporaryDirectory(prefix="lazylabel-corpus-") as scratch:
        for setting, priority in SETTINGS.items():
            saved = pathlib.Path(scratch) / "saved" / setting
            resaved = pathlib.Path(scratch) / "resaved" / setting
            saved.mkdir(parents=True)
            resaved.mkdir(parents=True)
            for case in cases:
                image_size = tuple(case["imageSize"])
                image = saved / f"{case['name']}.png"
                write_picture(image, image_size)
                save_case(case, priority, image)
                # Legacy reads its own files, pickled names and all, exactly as the app opens them.
                resave(image, image_size, priority, resaved / image.name)
                declared.append({
                    "id": f"{setting}/{case['name']}",
                    "file": f"{setting}/{case['name']}.png",
                    "imageSize": case["imageSize"],
                    "pixelPriority": priority,
                    "aliases": case["aliases"],
                    "segments": case["segments"],
                })
            publish(saved, CORPUS / setting, pictures=True)
            publish(resaved, ORACLE / setting, pictures=False)
            print(f"{setting:22s} {len(cases)} images")

    (CORPUS / "corpus.json").write_text(
        json.dumps({
            "note": "Written by api/tools/generate_acceptance_corpus.py with legacy/lazylabel at "
                    "2a7d5d8. Rects are [x1, y1, x2, y2] with x2/y2 exclusive; vertices are [x, y] "
                    "in pixels; imageSize is [height, width], as in fixtures.json.",
            "seed": SEED,
            "cases": declared,
        }, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    print(f"\nwrote {len(declared)} images to {CORPUS}, and legacy's re-saves to {ORACLE}")


if __name__ == "__main__":
    main()
