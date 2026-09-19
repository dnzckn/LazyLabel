"""Regenerate the cross-language mask fixture the TypeScript contracts suite decodes.

Usage (from the inference directory):
    PYTHONPATH=src python tools/generate_mask_fixture.py

The inference service is Python and the web app is TypeScript, so the bounded mask format has two
implementations. That is the one thing @lazylabel/contracts exists to prevent, and it is unavoidable
across a language boundary -- so instead of sharing code, the two sides share evidence. This writes
what Python encodes; contracts/test/pythonFixture.test.ts decodes it and checks every pixel.

The cases are chosen for where an off-by-one hides: a single pixel, a single row, a single column, a
full-image mask, an empty mask, and two blobs whose bounding box contains mostly nothing.
"""

from __future__ import annotations

import json
import pathlib

import numpy as np

from lazylabel_inference.service import encode_mask

OUT = pathlib.Path(__file__).resolve().parents[2] / "contracts" / "test" / "fixtures" / "python-masks.json"


def mask(height: int, width: int, spans: list[tuple[int, int, int, int]]) -> np.ndarray:
    array = np.zeros((height, width), dtype=np.uint8)
    for y0, y1, x0, x1 in spans:
        array[y0:y1, x0:x1] = 1
    return array


CASES: list[tuple[str, np.ndarray]] = [
    ("empty", mask(8, 9, [])),
    ("one pixel", mask(10, 12, [(4, 5, 3, 4)])),
    ("a rectangle", mask(256, 320, [(40, 120, 30, 140)])),
    ("full image", mask(4, 5, [(0, 4, 0, 5)])),
    ("two blobs, one box", mask(20, 24, [(2, 5, 3, 6), (14, 18, 17, 22)])),
    ("a single row", mask(6, 7, [(3, 4, 0, 7)])),
    ("a single column", mask(6, 7, [(0, 6, 2, 3)])),
]


def main() -> None:
    cases = []
    for name, array in CASES:
        ys, xs = np.nonzero(array)
        cases.append(
            {
                "name": name,
                "wire": encode_mask(array),
                "setPixels": sorted([[int(x), int(y)] for y, x in zip(ys, xs)]),
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "$comment": (
                    "Encoded by the Python inference service "
                    "(lazylabel_inference.service.encode_mask) and decoded by the TypeScript "
                    "contracts package. Two implementations of one binary layout is what this file "
                    "exists to catch. Regenerate with tools/generate_mask_fixture.py."
                ),
                "cases": cases,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT} with {len(cases)} cases")


if __name__ == "__main__":
    main()
