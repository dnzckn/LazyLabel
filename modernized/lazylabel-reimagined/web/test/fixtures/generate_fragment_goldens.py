"""Golden outputs for RULE-027's fragment filter, from legacy's own algorithm.

Run with the app venv, from this directory:

    E:/venv/lazylabel/Scripts/python.exe generate_fragment_goldens.py

Why a fixture rather than a transcription: the rule card gives the SHAPE of the filter -- keep a
region when its contour area is at least threshold% of the largest region's -- and OpenCV supplies
everything the shape leaves out. `findContours` with RETR_EXTERNAL decides what counts as one
region (8-connected, and holes are not regions of their own); `contourArea` is the shoelace area of
a polygon through pixel CENTRES, which is not the pixel count and is not off by a constant either;
and `drawContours` with thickness -1 decides exactly which pixels a kept outline covers when it is
redrawn.

Getting any of those subtly wrong produces a filter that agrees on round numbers and disagrees on
the fragments it exists to judge. So these are the bytes OpenCV actually produces.

The code below is transcribed from `save_export_manager.py:285-344` at snapshot 2a7d5d8, keeping
its order. THREE OF ITS BEHAVIOURS ARE DELIBERATE AND EACH HAS A CASE HERE:

  - A ONE-PIXEL-WIDE REGION HAS CONTOUR AREA ZERO, however long it is, so it is always dropped once
    filtering is on. A pixel-count implementation keeps it.
  - ANY THRESHOLD ABOVE ZERO FILLS INTERIOR HOLES, because the kept pieces are redrawn as filled
    outer contours. A ring becomes a disc. This is the rule card's suspected defect and it is
    reproduced rather than fixed, because a mask accepted in the rewrite has to match the same mask
    accepted in the desktop app.
  - THRESHOLD ZERO IS OFF -- the mask comes back untouched, holes and all. The redraw only happens
    when filtering does, so 0 and 1 differ by more than one percent.
  - THE WHOLE MASK IS DROPPED when the largest region has contour area zero. Not "kept by tying
    with zero", which is what a reading of the rule card alone suggests: legacy has an explicit
    `if max_area == 0: return None` above the comparison, and that is the difference between a
    single-pixel mask surviving and the accept producing nothing at all.
"""

import json
import pathlib

import cv2
import numpy as np


def filter_fragments(mask, threshold):
    """`apply_fragment_threshold`, transcribed line for line.

    Returns None where legacy returns None -- which is not "an empty mask" but "there is no mask",
    and is how an accept comes to produce nothing at all. Three separate paths reach it, and a
    first attempt at this file collapsed all three into an empty mask and disagreed with the port
    on a case the port had right.
    """
    if mask is None:
        return None

    if threshold == 0:
        return mask

    mask_uint8 = (mask * 255).astype(np.uint8)

    contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    contour_areas = [cv2.contourArea(contour) for contour in contours]
    max_area = max(contour_areas)

    # EVERYTHING GOES when the largest region has no area. A single pixel, or a mask made only of
    # one-pixel-wide lines, is dropped in its entirety rather than kept by tying with zero.
    if max_area == 0:
        return None

    min_area_threshold = (threshold / 100.0) * max_area

    filtered = [c for c, area in zip(contours, contour_areas) if area >= min_area_threshold]
    if not filtered:
        return None

    # drawContours with thickness -1, which is legacy's call and fills the OUTER contours -- the
    # step that closes interior holes.
    out = np.zeros_like(mask_uint8)
    cv2.drawContours(out, filtered, -1, 255, -1)
    return (out > 0).astype(np.uint8)


def blank(height, width):
    return np.zeros((height, width), dtype=np.uint8)


def square(mask, x, y, side):
    mask[y : y + side, x : x + side] = 1
    return mask


def ring(mask, x, y, side, hole):
    """A filled square with a hole in the middle, so the hole-filling case is visible."""
    square(mask, x, y, side)
    inset = (side - hole) // 2
    mask[y + inset : y + inset + hole, x + inset : x + inset + hole] = 0
    return mask


def hairlines_only(height=20, width=40):
    """Nothing but one-pixel-wide lines, so every contour area is zero and legacy returns None."""
    mask = blank(height, width)
    mask[5, 2:30] = 1
    mask[12, 4:20] = 1
    return mask


def three_regions(height=40, width=60):
    """The rule card's worked example in spirit: one large, one middling, one small."""
    mask = blank(height, width)
    square(mask, 2, 2, 20)  # the largest
    square(mask, 30, 4, 11)  # middling
    square(mask, 30, 24, 8)  # small
    return mask


def with_hairline(height=40, width=60):
    """A region one pixel wide, which has contour area zero however long it is."""
    mask = blank(height, width)
    square(mask, 2, 2, 20)
    mask[30, 5:50] = 1  # a 45-pixel hairline
    return mask


CASES = [
    # (label, mask builder, threshold)
    ("off-keeps-everything", three_regions, 0),
    ("off-keeps-holes", lambda: ring(blank(40, 60), 5, 5, 21, 9), 0),
    ("one-percent-fills-holes", lambda: ring(blank(40, 60), 5, 5, 21, 9), 1),
    ("thirty-percent", three_regions, 30),
    ("keeps-only-the-largest", three_regions, 100),
    ("hairline-always-dropped", with_hairline, 1),
    ("hairline-kept-when-off", with_hairline, 0),
    ("empty-mask", lambda: blank(20, 20), 50),
    ("only-hairlines-dropped-entirely", lambda: hairlines_only(), 1),
    ("single-pixel-dropped-entirely", lambda: square(blank(20, 20), 10, 10, 1), 50),
]


def main():
    out = {
        "source": "legacy/lazylabel/src/lazylabel/ui/managers/save_export_manager.py:285-344",
        "snapshot": "2a7d5d8",
        "opencv": cv2.__version__,
        "note": (
            "Contour area is the polygon area through pixel centres, not a pixel count: a "
            "one-pixel-wide region has area 0 and is always dropped once filtering is on. Any "
            "threshold above 0 also fills interior holes, because kept pieces are redrawn as "
            "filled outer contours."
        ),
        "cases": [],
    }

    for label, build, threshold in CASES:
        mask = build()
        result = filter_fragments(mask, threshold)
        # `expected: null` is legacy returning None: no mask at all, not an empty one.
        out["cases"].append(
            {
                "label": label,
                "height": int(mask.shape[0]),
                "width": int(mask.shape[1]),
                "threshold": threshold,
                "input": mask.flatten().tolist(),
                "expected": None if result is None else result.flatten().tolist(),
                "inputPixels": int(mask.sum()),
                "expectedPixels": None if result is None else int(result.sum()),
            }
        )
        shown = "None" if result is None else f"{int(result.sum()):5} px"
        print(f"{label:28} {int(mask.sum()):5} -> {shown}")

    path = pathlib.Path(__file__).with_name("legacy-fragments.json")
    path.write_text(json.dumps(out), encoding="utf-8")
    print(f"\nwrote {path} ({path.stat().st_size} bytes, {len(out['cases'])} cases)")

    # A fixture whose cases all agree with a pixel-count filter would prove nothing. Check that at
    # least one case separates the two.
    mask = with_hairline()
    by_area = filter_fragments(mask, 1)
    print(
        "hairline case: contour-area filter keeps "
        f"{int(by_area.sum())} px; a pixel-count filter at 1% would keep {int(mask.sum())}"
    )


if __name__ == "__main__":
    main()
