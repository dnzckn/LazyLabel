"""Golden outputs for CLAHE, part of RULE-031.

Run with the app venv, from this directory:

    E:/venv/lazylabel/Scripts/python.exe generate_clahe_goldens.py

The rule card gives CLAHE's PARAMETERS -- clip limit 2.0, an 8x8 tile grid -- and not its
algorithm, and OpenCV's implementation has choices that no description pins down: how the clipped
histogram mass is redistributed, how tile lookup tables are interpolated between, and what happens
in the half-tile border where there is no neighbour on one side. Implementing from the name would
produce something that looks plausible and matches nothing.

So these are the bytes `cv2.createCLAHE` actually produces, and a TypeScript port either matches
them or does not. The cases are chosen to exercise the parts a description would leave ambiguous:

  - A grid that does NOT divide the image evenly, so tiles are uneven and the border handling
    shows.
  - A clip limit low enough to bite on a peaked histogram, so the redistribution matters.
  - A flat region beside a detailed one, which is where CLAHE's local contrast is most visible and
    where interpolation artefacts appear if the blending is wrong.
"""

import json
import pathlib

import cv2
import numpy as np


def sample(height, width):
    """Flat on the left, detailed on the right, with a bright corner."""
    y, x = np.ogrid[:height, :width]
    flat = np.full((height, width), 120, dtype=np.float64)
    detail = 60 * np.sin(2 * np.pi * x / 7) * np.sin(2 * np.pi * y / 5)
    image = flat + np.where(x > width // 2, detail, 0)
    image[: height // 4, : width // 4] += 80
    return np.clip(image, 0, 255).astype(np.uint8)


CASES = [
    # (label, height, width, clip limit, tile grid)
    ("default-8x8", 32, 32, 2.0, (8, 8)),
    ("uneven-tiles", 30, 22, 2.0, (8, 8)),
    ("low-clip-limit", 32, 32, 0.5, (8, 8)),
    ("high-clip-limit", 32, 32, 40.0, (8, 8)),
    ("two-by-two", 32, 32, 2.0, (2, 2)),
    ("single-tile", 16, 16, 2.0, (1, 1)),
]


def main():
    out = {
        "source": "cv2.createCLAHE, the implementation RULE-031 names",
        "opencv": cv2.__version__,
        "note": (
            "CLAHE's parameters are in the rule card and its algorithm is not. These are the exact "
            "bytes OpenCV produces, including the uneven-tile case where the grid does not divide "
            "the image and the border has no neighbouring tile on one side."
        ),
        "cases": [],
    }

    for label, height, width, clip, tiles in CASES:
        image = sample(height, width)
        clahe = cv2.createCLAHE(clipLimit=clip, tileGridSize=tiles)
        result = clahe.apply(image)

        out["cases"].append(
            {
                "label": label,
                "height": height,
                "width": width,
                "clipLimit": clip,
                "tilesX": tiles[0],
                "tilesY": tiles[1],
                "input": image.flatten().tolist(),
                "expected": result.flatten().tolist(),
            }
        )

    path = pathlib.Path(__file__).with_name("legacy-clahe.json")
    path.write_text(json.dumps(out), encoding="utf-8")
    print(f"wrote {path} ({path.stat().st_size} bytes, {len(out['cases'])} cases)")

    # A fixture whose cases all agree with a simpler algorithm proves nothing. Check that CLAHE is
    # actually doing something different from a plain global equalization on this data.
    plain = cv2.equalizeHist(sample(32, 32))
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(sample(32, 32))
    differing = int(np.count_nonzero(plain != clahe))
    print(f"differs from global equalizeHist on {differing} of {plain.size} pixels")


if __name__ == "__main__":
    main()
