"""Prove the TypeScript readers return the same segments as the legacy loaders.

Usage (from this directory):
    PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src \
    E:/venv/lazylabel/Scripts/python.exe compare_readers.py ../.differential/read

This is the second half of Phase 1 exit criterion 1. The writer side is proven byte for byte by
compare_npz.py and the differential test suite; this side loads each golden file with the LEGACY
FileManager and compares, segment by segment, against what the port produced for the same file.

Masks are compared by SHA-256 of their bytes, so a single differing pixel fails. The port's summary
comes from test/differential/emitReads.test.ts, which hashes the same row-major 0/1 bytes.

Exit status is non-zero if anything differs.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
GOLDENS = HERE.parent / "goldens"

# Which legacy loader reads each format, and the file it reads.
LOADERS: dict[str, tuple[str, str]] = {
    "YOLO_SEGMENTATION": ("image_seg.txt", "load_yolo_seg_txt"),
    "YOLO_DETECTION": ("image.txt", "load_bb_txt"),
    "COCO_JSON": ("image_coco.json", "load_coco_json"),
    "PASCAL_VOC": ("image.xml", "load_pascal_voc_xml"),
    "CREATEML": ("image_createml.json", "load_createml_json"),
    "NPZ": ("image.npz", "_load_npz"),
    "NPZ_CLASS_MAP": ("image_CM.npz", "load_npz_class_map"),
}


def legacy_read(path: pathlib.Path, loader_name: str, size: tuple[int, int]) -> dict:
    """Run one legacy loader and summarize the segments it produced."""
    from lazylabel.core.file_manager import FileManager
    from lazylabel.core.segment_manager import SegmentManager

    manager = SegmentManager()
    reader = FileManager(manager)
    loader = getattr(reader, loader_name)
    # _load_npz takes only a path; the others take the image size too.
    loader(str(path)) if loader_name == "_load_npz" else loader(str(path), size)

    segments = []
    for segment in manager.segments:
        mask = segment.get("mask")
        if mask is None:
            data = np.zeros(0, dtype=np.uint8)
        else:
            data = np.asarray(mask).astype(np.uint8).reshape(-1)
        segments.append(
            {
                "classId": segment.get("class_id"),
                "pixels": int(data.sum()),
                "sha256": hashlib.sha256(data.tobytes()).hexdigest(),
            }
        )
    return {"segments": segments, "aliases": {str(k): v for k, v in manager.class_aliases.items()}}


def compare_case(case: str, produced: dict) -> list[str]:
    problems: list[str] = []
    size = tuple(produced["imageSize"])

    for fmt, (file_name, loader_name) in LOADERS.items():
        ours = produced["formats"][fmt]
        theirs = legacy_read(GOLDENS / case / file_name, loader_name, size)

        if len(ours["segments"]) != len(theirs["segments"]):
            problems.append(
                f"{case}/{fmt}: we read {len(ours['segments'])} segments, legacy read {len(theirs['segments'])}"
            )
            continue

        for index, (mine, yours) in enumerate(zip(ours["segments"], theirs["segments"], strict=True)):
            if mine["classId"] != yours["classId"]:
                problems.append(
                    f"{case}/{fmt}: segment {index} class {mine['classId']} != legacy {yours['classId']}"
                )
            if mine["sha256"] != yours["sha256"]:
                problems.append(
                    f"{case}/{fmt}: segment {index} mask differs "
                    f"({mine['pixels']} pixels vs legacy {yours['pixels']})"
                )

        # Aliases the file establishes. The port returns only those; legacy mutates its own store,
        # which starts empty here, so the two are directly comparable. That now includes the NPZ
        # formats: the port reads legacy's pickled table as data, without unpickling it (the owner's
        # decision of 2026-09-25), so it must read the same names legacy does.
        if ours["aliases"] != theirs["aliases"]:
            problems.append(f"{case}/{fmt}: aliases {ours['aliases']} != legacy {theirs['aliases']}")

    return problems


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    produced_dir = pathlib.Path(sys.argv[1])
    files = sorted(produced_dir.glob("*.json"))
    if not files:
        sys.exit(f"no reader output in {produced_dir}; run the emitter test first")

    problems: list[str] = []
    for path in files:
        case = path.stem
        found = compare_case(case, json.loads(path.read_text(encoding="utf-8")))
        problems.extend(found)
        print(f"{'FAIL' if found else 'ok  '}  {case}")

    if problems:
        print("\n" + "\n".join(problems))
        sys.exit(f"\n{len(problems)} difference(s) across {len(files)} case(s)")
    print(f"\nevery reader matches the legacy loader across {len(files)} cases and {len(LOADERS)} formats")


if __name__ == "__main__":
    main()
