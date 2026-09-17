#!/usr/bin/env python
"""Generate the OpenCV ground-truth corpus for the TypeScript geometry primitives.

The TypeScript port of LazyLabel's contour/polygon code must be bit-compatible with
OpenCV 4.12.0, because the exported annotation files record the *output order* of
``cv2.findContours`` and the exact coordinates of ``cv2.approxPolyDP``.  This script
is the only place OpenCV is used: it writes ``opencv-corpus.json`` next to itself and
the Vitest suite then runs without Python.

Run it with the project's venv (read-only use of the legacy app's interpreter)::

    PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src \
        E:/venv/lazylabel/Scripts/python.exe test/geometry/generate_corpus.py

Everything random is driven from SEED, so re-running reproduces the file byte for byte.
"""

from __future__ import annotations

import json
import os
import sys

import cv2
import numpy as np

SEED = 20260917
RANDOM_MASK_COUNT = 320
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "opencv-corpus.json")

# Epsilons applied to every traced contour.  ``arc`` is 0.001 * arcLength(contour, True),
# which is exactly what legacy/lazylabel's YOLO segmentation writer uses.
CLOSED_EPS = ["arc", 0.0, 0.5, 1.0, 3.0]
OPEN_EPS = [1.0, 3.0]
RICH_CLOSED_EPS = ["arc", 0.0, 0.1, 0.5, 1.0, 2.0, 3.0, 7.0, 25.0, "arc10", "arc50"]
RICH_OPEN_EPS = [0.0, 0.5, 1.0, 3.0, 9.0]


# --------------------------------------------------------------------------------------
# encoding helpers


def encode_mask(mask: np.ndarray) -> list[int]:
    """Row-major run-length encoding, alternating runs starting with a run of zeros.

    The runs sum to height * width, so the decoder needs no other size information.
    A base64 blob would be simpler but the 8192x8192 fixture alone would weigh 89 MB.
    """
    assert mask.dtype == np.uint8
    flat = np.ascontiguousarray(mask).reshape(-1)
    if flat.size == 0:
        return []
    change = np.flatnonzero(np.diff(flat)) + 1
    bounds = np.concatenate(([0], change, [flat.size]))
    runs = np.diff(bounds).tolist()
    if flat[0] != 0:
        runs.insert(0, 0)
    return [int(r) for r in runs]


def contour_points(contour: np.ndarray) -> list[list[int]]:
    return [[int(x), int(y)] for x, y in contour.reshape(-1, 2)]


def to_cv_contour(points: list[list[int]]) -> np.ndarray:
    return np.array(points, dtype=np.int32).reshape(-1, 1, 2)


# --------------------------------------------------------------------------------------
# per-contour ground truth


def describe_contour(points: list[list[int]], closed_eps, open_eps) -> dict:
    contour = to_cv_contour(points)
    arc_closed = float(cv2.arcLength(contour, True))
    arc_open = float(cv2.arcLength(contour, False))
    x, y, w, h = cv2.boundingRect(contour)

    def resolve(spec) -> float:
        if spec == "arc":
            return 0.001 * arc_closed
        if spec == "arc10":
            return 0.01 * arc_closed
        if spec == "arc50":
            return 0.05 * arc_closed
        return float(spec)

    approx = []
    for spec in closed_eps:
        eps = resolve(spec)
        approx.append(
            {
                "eps": eps,
                "closed": True,
                "out": contour_points(cv2.approxPolyDP(contour, eps, True)),
            }
        )
    for spec in open_eps:
        eps = resolve(spec)
        approx.append(
            {
                "eps": eps,
                "closed": False,
                "out": contour_points(cv2.approxPolyDP(contour, eps, False)),
            }
        )

    return {
        "points": points,
        "arcLengthClosed": arc_closed,
        "arcLengthOpen": arc_open,
        "boundingRect": {"x": int(x), "y": int(y), "width": int(w), "height": int(h)},
        "area": float(cv2.contourArea(contour)),
        "areaOriented": float(cv2.contourArea(contour, True)),
        "approx": approx,
    }


def describe_mask(name: str, mask: np.ndarray, rich: bool = False) -> dict:
    mask = np.ascontiguousarray(mask.astype(np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    none_contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    closed_eps = RICH_CLOSED_EPS if rich else CLOSED_EPS
    open_eps = RICH_OPEN_EPS if rich else OPEN_EPS
    return {
        "name": name,
        "height": int(mask.shape[0]),
        "width": int(mask.shape[1]),
        "mask": encode_mask(mask),
        "contoursNone": [contour_points(c) for c in none_contours],
        "contours": [describe_contour(contour_points(c), closed_eps, open_eps) for c in contours],
    }


# --------------------------------------------------------------------------------------
# hand-picked masks


def blank(h: int, w: int) -> np.ndarray:
    return np.zeros((h, w), dtype=np.uint8)


def handpicked_masks() -> list[tuple[str, np.ndarray, bool]]:
    cases: list[tuple[str, np.ndarray, bool]] = []

    # --- degenerate sizes -------------------------------------------------------------
    cases.append(("empty-8x8", blank(8, 8), False))
    cases.append(("image-1x1-off", blank(1, 1), False))
    m = blank(1, 1)
    m[0, 0] = 1
    cases.append(("image-1x1-on", m, True))
    m = blank(1, 9)
    m[0, 2:6] = 1
    cases.append(("image-1xN-run", m, True))
    m = blank(9, 1)
    m[2:6, 0] = 1
    cases.append(("image-Nx1-run", m, True))
    m = blank(1, 9)
    m[0, ::2] = 1
    cases.append(("image-1xN-alternating", m, True))

    # --- single pixels ----------------------------------------------------------------
    m = blank(7, 7)
    m[3, 3] = 1
    cases.append(("single-pixel-centre", m, True))
    for name, (y, x) in {
        "tl": (0, 0),
        "tr": (0, 6),
        "bl": (6, 0),
        "br": (6, 6),
        "top": (0, 3),
        "bottom": (6, 3),
        "left": (3, 0),
        "right": (3, 6),
    }.items():
        m = blank(7, 7)
        m[y, x] = 1
        cases.append((f"single-pixel-{name}", m, True))

    # the fixtures.json case that proves enumeration order is observable
    m = blank(16, 16)
    m[3, 3] = 1
    m[9, 12] = 1
    cases.append(("single-pixel-objects-fixture", m, True))

    # --- full frame -------------------------------------------------------------------
    cases.append(("full-frame-1x1", np.ones((1, 1), dtype=np.uint8), True))
    cases.append(("full-frame-2x2", np.ones((2, 2), dtype=np.uint8), True))
    cases.append(("full-frame-5x9", np.ones((5, 9), dtype=np.uint8), True))
    cases.append(("full-frame-64x64", np.ones((64, 64), dtype=np.uint8), True))

    # --- L shape ----------------------------------------------------------------------
    m = blank(10, 10)
    m[1:9, 1:4] = 1
    m[6:9, 1:9] = 1
    cases.append(("l-shape", m, True))
    cases.append(("l-shape-rot90", np.ascontiguousarray(np.rot90(m)), True))
    cases.append(("l-shape-rot180", np.ascontiguousarray(np.rot90(m, 2)), True))
    cases.append(("l-shape-rot270", np.ascontiguousarray(np.rot90(m, 3)), True))

    # --- ring with a hole -------------------------------------------------------------
    m = blank(12, 12)
    m[2:10, 2:10] = 1
    m[4:8, 4:8] = 0
    cases.append(("ring-square-hole", m, True))
    m = blank(15, 15)
    cv2.circle(m, (7, 7), 6, 1, thickness=-1)
    cv2.circle(m, (7, 7), 2, 0, thickness=-1)
    cases.append(("ring-round-hole", m, True))
    # nested rings: RETR_EXTERNAL must return only the outermost border
    m = blank(21, 21)
    m[1:20, 1:20] = 1
    m[3:18, 3:18] = 0
    m[5:16, 5:16] = 1
    m[7:14, 7:14] = 0
    m[9:12, 9:12] = 1
    cases.append(("nested-rings", m, True))
    # one-pixel-wide ring
    m = blank(9, 9)
    m[2:7, 2:7] = 1
    m[3:6, 3:6] = 0
    cases.append(("thin-ring", m, True))

    # --- diagonal staircase -----------------------------------------------------------
    m = blank(10, 10)
    for i in range(9):
        m[i, i] = 1
        m[i, i + 1] = 1
    cases.append(("diagonal-staircase", m, True))
    m = blank(10, 10)
    for i in range(10):
        m[i, i] = 1
    cases.append(("diagonal-line", m, True))
    m = blank(10, 10)
    for i in range(10):
        m[i, 9 - i] = 1
    cases.append(("anti-diagonal-line", m, True))
    m = blank(12, 12)
    for i in range(0, 10, 2):
        m[i : i + 2, i : i + 2] = 1
    cases.append(("diagonal-blocks", m, True))

    # --- two disjoint islands ---------------------------------------------------------
    m = blank(200, 400)
    m[10:20, 10:20] = 1
    m[100:120, 300:340] = 1
    cases.append(("split-segment-two-islands-fixture", m, True))
    m = blank(12, 20)
    m[2:5, 2:6] = 1
    m[7:10, 12:18] = 1
    cases.append(("two-islands-small", m, True))
    m = blank(12, 20)
    m[2:5, 12:18] = 1
    m[7:10, 2:6] = 1
    cases.append(("two-islands-swapped", m, True))
    m = blank(9, 30)
    for i in range(5):
        m[2:6, 1 + i * 6 : 4 + i * 6] = 1
    cases.append(("five-islands-in-a-row", m, True))

    # --- touching diagonal neighbours -------------------------------------------------
    m = blank(6, 6)
    m[1, 1] = 1
    m[2, 2] = 1
    cases.append(("diagonal-touch-pair", m, True))
    m = blank(6, 6)
    m[1, 2] = 1
    m[2, 1] = 1
    cases.append(("anti-diagonal-touch-pair", m, True))
    m = blank(8, 8)
    m[1:3, 1:3] = 1
    m[3:5, 3:5] = 1
    m[5:7, 5:7] = 1
    cases.append(("diagonal-touch-blocks", m, True))
    m = np.indices((9, 9)).sum(axis=0) % 2
    cases.append(("checkerboard-9x9", m.astype(np.uint8), True))
    m = np.indices((8, 8)).sum(axis=0) % 2
    cases.append(("checkerboard-8x8", (1 - m).astype(np.uint8), True))

    # --- shapes against every edge ----------------------------------------------------
    m = blank(10, 10)
    m[0, :] = 1
    cases.append(("edge-top-row", m, True))
    m = blank(10, 10)
    m[9, :] = 1
    cases.append(("edge-bottom-row", m, True))
    m = blank(10, 10)
    m[:, 0] = 1
    cases.append(("edge-left-column", m, True))
    m = blank(10, 10)
    m[:, 9] = 1
    cases.append(("edge-right-column", m, True))
    m = blank(10, 10)
    m[0, :] = 1
    m[9, :] = 1
    m[:, 0] = 1
    m[:, 9] = 1
    cases.append(("edge-frame", m, True))
    m = blank(10, 10)
    m[0:3, 0:3] = 1
    m[0:3, 7:10] = 1
    m[7:10, 0:3] = 1
    m[7:10, 7:10] = 1
    cases.append(("edge-four-corners", m, True))
    m = blank(10, 16)
    m[0:4, 6:10] = 1
    m[6:10, 6:10] = 1
    m[3:7, 0:4] = 1
    m[3:7, 12:16] = 1
    cases.append(("edge-four-sides", m, True))

    # --- assorted topology ------------------------------------------------------------
    m = blank(11, 11)
    m[4:7, 1:10] = 1
    m[1:10, 4:7] = 1
    cases.append(("plus-shape", m, True))
    m = blank(11, 13)
    m[1:4, 1:12] = 1
    for x in range(1, 12, 2):
        m[4:10, x] = 1
    cases.append(("comb-shape", m, True))
    m = blank(13, 13)
    m[1:12, 1:12] = 1
    m[3:5, 3:5] = 0
    m[8:10, 3:5] = 0
    m[3:5, 8:10] = 0
    m[8:10, 8:10] = 0
    m[6, 6] = 0
    cases.append(("blob-with-four-holes", m, True))
    m = blank(15, 15)
    m[7, 1:14] = 1
    m[1:14, 13] = 1
    m[13, 3:14] = 1
    m[3:14, 3] = 1
    m[3, 3:11] = 1
    m[5:11, 10] = 1
    m[10, 6:11] = 1
    cases.append(("spiral", m, True))
    m = blank(17, 17)
    m[1:16, 1:16] = 1
    m[3:14, 3:14] = 0
    m[5:12, 5:12] = 1
    m[7:10, 7:10] = 0
    cases.append(("concentric-squares", m, True))
    m = blank(14, 14)
    m[2:12, 2:12] = 1
    m[7, 2:12] = 0
    cases.append(("split-by-a-slit", m, True))
    m = blank(14, 14)
    m[2:12, 2:12] = 1
    m[2:12, 7] = 0
    cases.append(("split-by-a-vertical-slit", m, True))
    m = blank(20, 20)
    cv2.circle(m, (9, 9), 8, 1, thickness=-1)
    cases.append(("filled-circle-r8", m, True))
    m = blank(30, 30)
    cv2.fillPoly(m, [np.array([[2, 2], [27, 5], [15, 27]], dtype=np.int32)], 1)
    cases.append(("filled-triangle", m, True))

    # --- fixture masks from tools/fixtures.json ---------------------------------------
    m = blank(20, 30)
    m[5:10, 4:14] = 1
    cases.append(("fixture-two-classes-a", m, True))
    m = blank(50, 50)
    m[10:30, 10:30] = 1
    m[20:40, 20:40] = 1
    cases.append(("fixture-overlap-union", m, True))
    m = blank(50, 50)
    m[10:30, 10:30] = 1
    m[20:40, 20:40] = 1
    m[20:30, 20:30] = 0
    cases.append(("fixture-overlap-carved", m, True))
    m = blank(100, 100)
    cv2.fillPoly(m, [np.array([[10, 10], [20, 10], [20, 30], [10, 30]], dtype=np.int32)], 1)
    cases.append(("fixture-polygon", m, True))
    m = blank(100, 100)
    cv2.circle(m, (60, 60), 4, 1, thickness=-1)
    cases.append(("fixture-circle", m, True))
    m = blank(8192, 8192)
    m[0, 0] = 1
    cases.append(("fixture-tiny-box-huge-image", m, False))

    return cases


# --------------------------------------------------------------------------------------
# random masks


def random_masks(rng: np.random.Generator) -> list[tuple[str, np.ndarray, bool]]:
    out: list[tuple[str, np.ndarray, bool]] = []
    strategies = [
        "bernoulli",
        "rects",
        "circles",
        "polygons",
        "sparse",
        "bands",
        "bernoulli-smoothed",
        "carved",
    ]
    for i in range(RANDOM_MASK_COUNT):
        strategy = strategies[i % len(strategies)]
        h = int(rng.integers(1, 29))
        w = int(rng.integers(1, 29))
        m = blank(h, w)

        if strategy == "bernoulli":
            density = float(rng.uniform(0.05, 0.95))
            m = (rng.random((h, w)) < density).astype(np.uint8)
        elif strategy == "bernoulli-smoothed":
            density = float(rng.uniform(0.3, 0.7))
            m = (rng.random((h, w)) < density).astype(np.uint8)
            k = int(rng.integers(2, 4))
            op = int(rng.integers(0, 2))
            kernel = np.ones((k, k), dtype=np.uint8)
            m = cv2.dilate(m, kernel) if op else cv2.erode(m, kernel)
        elif strategy == "rects":
            for _ in range(int(rng.integers(1, 5))):
                x0 = int(rng.integers(0, w))
                y0 = int(rng.integers(0, h))
                x1 = int(rng.integers(x0, w)) + 1
                y1 = int(rng.integers(y0, h)) + 1
                m[y0:y1, x0:x1] = 1
        elif strategy == "circles":
            for _ in range(int(rng.integers(1, 4))):
                cx = int(rng.integers(-2, w + 2))
                cy = int(rng.integers(-2, h + 2))
                r = int(rng.integers(0, max(h, w) // 2 + 2))
                cv2.circle(m, (cx, cy), r, 1, thickness=-1)
        elif strategy == "polygons":
            for _ in range(int(rng.integers(1, 3))):
                n = int(rng.integers(3, 7))
                pts = rng.integers(-2, max(h, w) + 2, size=(n, 2)).astype(np.int32)
                cv2.fillPoly(m, [pts], 1)
        elif strategy == "sparse":
            for _ in range(int(rng.integers(1, 9))):
                m[int(rng.integers(0, h)), int(rng.integers(0, w))] = 1
        elif strategy == "bands":
            for _ in range(int(rng.integers(1, 5))):
                if rng.random() < 0.5:
                    y0 = int(rng.integers(0, h))
                    m[y0 : y0 + int(rng.integers(1, 4)), :] = 1
                else:
                    x0 = int(rng.integers(0, w))
                    m[:, x0 : x0 + int(rng.integers(1, 4))] = 1
        elif strategy == "carved":
            m[:, :] = 1
            for _ in range(int(rng.integers(1, 6))):
                x0 = int(rng.integers(0, w))
                y0 = int(rng.integers(0, h))
                x1 = int(rng.integers(x0, w)) + 1
                y1 = int(rng.integers(y0, h)) + 1
                m[y0:y1, x0:x1] = 0

        out.append((f"random-{i:04d}-{strategy}", np.ascontiguousarray(m.astype(np.uint8)), False))

    # a handful of larger random masks, to exercise long contours
    for i in range(12):
        h = int(rng.integers(40, 97))
        w = int(rng.integers(40, 97))
        m = blank(h, w)
        for _ in range(int(rng.integers(2, 8))):
            cx = int(rng.integers(0, w))
            cy = int(rng.integers(0, h))
            r = int(rng.integers(2, 20))
            cv2.circle(m, (cx, cy), r, 1, thickness=-1)
        for _ in range(int(rng.integers(0, 4))):
            cx = int(rng.integers(0, w))
            cy = int(rng.integers(0, h))
            r = int(rng.integers(1, 10))
            cv2.circle(m, (cx, cy), r, 0, thickness=-1)
        out.append((f"random-big-{i:02d}", np.ascontiguousarray(m.astype(np.uint8)), False))

    return out


# --------------------------------------------------------------------------------------
# fillPoly / circle ground truth


def fill_poly_cases(rng: np.random.Generator) -> list[dict]:
    cases: list[dict] = []

    def add(name: str, h: int, w: int, polys: list[list[list[int]]]) -> None:
        mask = blank(h, w)
        arrays = [np.array(p, dtype=np.int32) for p in polys]
        if arrays:
            cv2.fillPoly(mask, arrays, 1)
        cases.append(
            {
                "name": name,
                "height": h,
                "width": w,
                "polygons": polys,
                "mask": encode_mask(mask),
            }
        )

    add("square", 20, 20, [[[4, 4], [14, 4], [14, 14], [4, 14]]])
    add("square-ccw", 20, 20, [[[4, 14], [14, 14], [14, 4], [4, 4]]])
    add("triangle", 20, 20, [[[2, 2], [17, 5], [9, 17]]])
    add("triangle-flat", 12, 20, [[[1, 6], [18, 6], [10, 7]]])
    add("bowtie", 20, 20, [[[2, 2], [17, 17], [2, 17], [17, 2]]])
    add("concave-arrow", 20, 20, [[[2, 10], [10, 2], [10, 7], [18, 7], [18, 13], [10, 13], [10, 18]]])
    add("single-point", 10, 10, [[[5, 5]]])
    add("two-points", 10, 10, [[[2, 2], [7, 7]]])
    add("collinear-three", 10, 10, [[[1, 5], [4, 5], [8, 5]]])
    add("degenerate-zero-area", 10, 10, [[[3, 3], [3, 3], [3, 3]]])
    add("full-frame", 8, 8, [[[0, 0], [7, 0], [7, 7], [0, 7]]])
    add("beyond-frame", 8, 8, [[[-5, -5], [12, -5], [12, 12], [-5, 12]]])
    add("half-outside-left", 10, 10, [[[-6, 2], [4, 2], [4, 8], [-6, 8]]])
    add("half-outside-right", 10, 10, [[[5, 2], [16, 2], [16, 8], [5, 8]]])
    add("half-outside-top", 10, 10, [[[2, -6], [8, -6], [8, 4], [2, 4]]])
    add("half-outside-bottom", 10, 10, [[[2, 5], [8, 5], [8, 16], [2, 16]]])
    add("fully-outside", 10, 10, [[[20, 20], [30, 20], [30, 30], [20, 30]]])
    add("touching-edges", 10, 10, [[[0, 0], [9, 0], [9, 9], [0, 9]]])
    add("one-pixel-wide", 10, 10, [[[4, 1], [4, 8], [5, 8], [5, 1]]])
    add("horizontal-line", 10, 10, [[[1, 4], [8, 4]]])
    add("vertical-line", 10, 10, [[[4, 1], [4, 8]]])
    add("diagonal-line", 10, 10, [[[1, 1], [8, 8]]])
    add("two-polygons", 16, 24, [[[1, 1], [6, 1], [6, 6], [1, 6]], [[12, 6], [22, 6], [17, 14]]])
    add(
        "two-overlapping-polygons",
        16,
        16,
        [[[1, 1], [10, 1], [10, 10], [1, 10]], [[5, 5], [14, 5], [14, 14], [5, 14]]],
    )
    add("nested-polygons", 20, 20, [[[1, 1], [18, 1], [18, 18], [1, 18]], [[6, 6], [13, 6], [13, 13], [6, 13]]])
    add("no-polygons", 6, 6, [])
    add("star", 24, 24, [[[12, 1], [15, 9], [23, 9], [17, 14], [19, 22], [12, 17], [5, 22], [7, 14], [1, 9], [9, 9]]])
    # the polygon-and-circle fixture, after the int32 truncation the legacy code applies
    add("fixture-polygon", 100, 100, [[[10, 10], [20, 10], [20, 30], [10, 30]]])
    add("thin-sliver", 14, 14, [[[1, 1], [12, 2], [12, 3], [1, 2]]])
    add("self-intersecting-star", 20, 20, [[[10, 1], [3, 18], [18, 7], [2, 7], [17, 18]]])
    add("clockwise-vs-ccw-hole", 20, 20, [[[2, 2], [17, 2], [17, 17], [2, 17]], [[6, 6], [6, 13], [13, 13], [13, 6]]])
    add("very-tall", 30, 6, [[[1, 0], [4, 0], [4, 29], [1, 29]]])
    add("very-wide", 6, 30, [[[0, 1], [29, 1], [29, 4], [0, 4]]])
    add("negative-and-huge", 10, 10, [[[-1000, 5], [1000, 5], [1000, 6], [-1000, 6]]])
    # A vertex exactly one past the far border (x == w, y == h) is where OpenCV's clipped
    # active-edge walk is easiest to get wrong: the outline is clipped but the edge that
    # feeds the scanline fill keeps its unclipped x.  These pin that behaviour down.
    add("vertex-at-width", 10, 10, [[[2, 2], [10, 2], [10, 7], [2, 7]]])
    add("vertex-at-height", 10, 10, [[[2, 2], [7, 2], [7, 10], [2, 10]]])
    add("vertex-at-width-and-height", 10, 10, [[[0, 0], [10, 0], [10, 10], [0, 10]]])
    add("vertex-one-past-corner", 10, 10, [[[10, 10], [3, 10], [3, 3], [10, 3]]])
    add("vertex-at-width-triangle", 12, 12, [[[0, 0], [12, 6], [0, 11]]])
    add("vertex-straddling-right", 12, 12, [[[6, 0], [13, 6], [6, 11], [-1, 6]]])

    for i in range(90):
        h = int(rng.integers(3, 33))
        w = int(rng.integers(3, 33))
        n = int(rng.integers(1, 9))
        span = max(h, w)
        polys = []
        for _ in range(int(rng.integers(1, 3))):
            pts = rng.integers(-span // 2 - 1, span + span // 2 + 1, size=(n, 2))
            polys.append([[int(p[0]), int(p[1])] for p in pts])
        add(f"random-poly-{i:03d}", h, w, polys)

    return cases


def circle_cases(rng: np.random.Generator) -> list[dict]:
    cases: list[dict] = []

    def add(name: str, h: int, w: int, cx: int, cy: int, r: int) -> None:
        mask = blank(h, w)
        cv2.circle(mask, (cx, cy), r, 1, thickness=-1)
        cases.append(
            {
                "name": name,
                "height": h,
                "width": w,
                "centre": [cx, cy],
                "radius": r,
                "mask": encode_mask(mask),
            }
        )

    for r in range(0, 13):
        add(f"centred-r{r}", 30, 30, 15, 15, r)
    add("fixture-circle", 100, 100, 60, 60, 4)
    add("radius-exceeds-image", 10, 10, 5, 5, 30)
    add("tangent-inside", 11, 11, 5, 5, 5)
    add("tangent-off-by-one", 11, 11, 5, 5, 6)
    for name, (cx, cy) in {
        "tl": (0, 0),
        "tr": (9, 0),
        "bl": (0, 9),
        "br": (9, 9),
    }.items():
        for r in (1, 3, 6):
            add(f"corner-{name}-r{r}", 10, 10, cx, cy, r)
    for name, (cx, cy) in {
        "left": (-4, 5),
        "right": (14, 5),
        "above": (5, -4),
        "below": (5, 14),
        "far": (100, 100),
    }.items():
        for r in (2, 5, 9):
            add(f"outside-{name}-r{r}", 10, 10, cx, cy, r)
    add("one-pixel-image", 1, 1, 0, 0, 3)
    add("row-image", 1, 20, 10, 0, 4)
    add("column-image", 20, 1, 0, 10, 4)

    for i in range(70):
        h = int(rng.integers(1, 41))
        w = int(rng.integers(1, 41))
        cx = int(rng.integers(-8, w + 8))
        cy = int(rng.integers(-8, h + 8))
        r = int(rng.integers(0, 22))
        add(f"random-circle-{i:03d}", h, w, cx, cy, r)

    return cases


# --------------------------------------------------------------------------------------
# free-standing curve cases (approxPolyDP / arcLength / boundingRect / contourArea)


def curve_cases(rng: np.random.Generator) -> list[dict]:
    cases: list[dict] = []

    def add(name: str, points: list[list[int]]) -> None:
        cases.append({"name": name, **describe_contour(points, RICH_CLOSED_EPS, RICH_OPEN_EPS)})

    add("one-point", [[5, 5]])
    add("two-points", [[1, 1], [9, 9]])
    add("two-identical-points", [[4, 4], [4, 4]])
    add("three-collinear", [[0, 0], [5, 0], [10, 0]])
    add("three-collinear-reversed", [[10, 0], [5, 0], [0, 0]])
    add("triangle", [[0, 0], [10, 0], [5, 9]])
    add("square", [[0, 0], [10, 0], [10, 10], [0, 10]])
    add("square-with-midpoints", [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [5, 10], [0, 10], [0, 5]])
    add("square-with-noise", [[0, 0], [5, 1], [10, 0], [9, 5], [10, 10], [5, 9], [0, 10], [1, 5]])
    add("staircase", [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3], [4, 3], [4, 4]])
    add("zigzag", [[0, 0], [2, 8], [4, 0], [6, 8], [8, 0], [10, 8], [12, 0]])
    add("all-identical", [[3, 3], [3, 3], [3, 3], [3, 3]])
    add("closed-ring-repeat-first", [[0, 0], [8, 0], [8, 8], [0, 8], [0, 0]])
    add("negative-coords", [[-5, -5], [5, -5], [5, 5], [-5, 5]])
    add("large-coords", [[0, 0], [10000, 0], [10000, 7000], [0, 7000]])
    add("circle-poly", [[int(round(20 * np.cos(t))), int(round(20 * np.sin(t)))] for t in np.linspace(0, 2 * np.pi, 40, endpoint=False)])
    add("spiral-poly", [[int(round((3 + t) * np.cos(t))), int(round((3 + t) * np.sin(t)))] for t in np.linspace(0, 6 * np.pi, 60)])
    add("degenerate-thin", [[0, 0], [100, 1], [200, 0], [100, -1]])
    add("horizontal-line-poly", [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5]])
    add("vertical-line-poly", [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5]])
    add("figure-eight", [[0, 0], [10, 10], [20, 0], [30, 10], [20, 20], [10, 10], [0, 20]])

    for i in range(60):
        n = int(rng.integers(1, 26))
        span = int(rng.integers(3, 120))
        pts = rng.integers(-span, span + 1, size=(n, 2))
        add(f"random-curve-{i:03d}", [[int(p[0]), int(p[1])] for p in pts])

    return cases


# --------------------------------------------------------------------------------------


def main() -> int:
    rng = np.random.default_rng(SEED)

    masks: list[dict] = []
    for name, mask, rich in handpicked_masks():
        masks.append(describe_mask(name, mask, rich=rich))
    for name, mask, rich in random_masks(rng):
        masks.append(describe_mask(name, mask, rich=rich))

    corpus = {
        "generatedBy": "test/geometry/generate_corpus.py",
        "opencv": cv2.__version__,
        "numpy": np.__version__,
        "python": sys.version.split()[0],
        "seed": SEED,
        "masks": masks,
        "fillPoly": fill_poly_cases(rng),
        "circles": circle_cases(rng),
        "curves": curve_cases(rng),
    }

    # One compact JSON object per line inside each top-level array, so the committed
    # corpus stays diffable per case without the 3x bloat of a fully indented dump.
    compact = {"separators": (",", ":"), "sort_keys": False}
    with open(OUT, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("{\n")
        scalars = [k for k in corpus if not isinstance(corpus[k], list)]
        for key in scalars:
            handle.write(f"{json.dumps(key)}: {json.dumps(corpus[key])},\n")
        arrays = [k for k in corpus if isinstance(corpus[k], list)]
        for pos, key in enumerate(arrays):
            handle.write(f"{json.dumps(key)}: [\n")
            rows = corpus[key]
            for i, row in enumerate(rows):
                sep = "," if i + 1 < len(rows) else ""
                handle.write(json.dumps(row, **compact) + sep + "\n")
            handle.write("]" + ("," if pos + 1 < len(arrays) else "") + "\n")
        handle.write("}\n")

    contour_total = sum(len(m["contours"]) for m in masks)
    approx_total = sum(len(c["approx"]) for m in masks for c in m["contours"])
    approx_total += sum(len(c["approx"]) for c in corpus["curves"])
    print(f"wrote {OUT}")
    print(
        f"  masks={len(masks)} contours={contour_total} approx={approx_total} "
        f"fillPoly={len(corpus['fillPoly'])} circles={len(corpus['circles'])} "
        f"curves={len(corpus['curves'])}"
    )
    print(f"  bytes={os.path.getsize(OUT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
