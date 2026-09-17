"""Regenerate test/util/python-expectations.json, the CPython oracle for the parity tests.

Usage (from this directory):
    E:/venv/lazylabel/Scripts/python.exe generate_expectations.py

Covers the three CPython behaviours the exports depend on byte for byte: float repr, json.dump's
escaping and layout, os.path.splitext, and round's half-to-even tie rule. Never hand-edit the JSON,
and never paste a value produced by the TypeScript implementation into it: the point is that these
come from Python.
"""

from __future__ import annotations

import json
import os
import pathlib
import random

OUT = pathlib.Path(__file__).resolve().parent.parent / "test" / "util" / "python-expectations.json"


def main() -> None:
    random.seed(20260917)
    values = [
        1.0, 0.5, 0.0, -0.0, 1 / 3, 2 / 3, 0.1, 6.103515625e-05, 0.0001220703125, 1e-4, 9.999e-5,
        1e-5, 1234567890123456.0, 12345678901234567.0, 1e16, 1e17, 5e-324, 1.7976931348623157e308,
        0.3125, 0.20833333333333334, 100 / 640, 1 / 8192, 0.9984375, 479 / 480,
    ]
    for _ in range(20):
        width = random.choice([1, 7, 64, 640, 5000, 8192, 100000])
        box = random.randint(1, max(1, width))
        left = random.randint(0, max(0, width - box))
        values.extend([(left + box / 2) / width, box / width])

    paths = ["a/b.png", "a/b.tar.png", "a/b", ".bashrc", "a/.config/x.png",
             "C:" + chr(92) + "x" + chr(92) + "y.jpeg", "no_ext", "trailing."]
    document = {
        "images": [{"id": 1, "file_name": "s.png", "width": 30, "height": 20}],
        "annotations": [{"id": 1, "bbox": [1, 2, 3, 4], "iscrowd": 0, "segmentation": [[1, 2, 3, 4, 5, 6]]}],
        "categories": [
            {"id": 5, "name": "\u7d30\u80de", "supercategory": "\u7d30\u80de"},
            {"id": 1, "name": 'a"b' + chr(92) + "c", "supercategory": "x\ny"},
        ],
    }
    ties = [0.5, 1.5, 2.5, -0.5, -1.5, 3.5, 102.5, 0.49999999999999994, 4.5]

    out = {
        "repr": [[repr(v), v] for v in values],
        "splitext": [[p, os.path.splitext(p)[0]] for p in paths],
        "json": json.dumps(document, indent=2),
        "rounding": [[v, int(round(v))] for v in ties],
    }
    OUT.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT} with {len(out['repr'])} float cases")


if __name__ == "__main__":
    main()
