"""Measure the spec's interactive-latency budget on this machine, with this deployment's checkpoints.

AI_NATIVE_SPEC.md's non-functional table: p95 of 150 ms from click to mask on a 12-megapixel image
with a warm embedding. It went unmeasured until 2026-09-23, when this found 213 ms -- the tail was
the mask's wire encoding at a byte per pixel -- and bit packing brought it to 94-97 ms in-process
and 114 ms over HTTP through the API (RTX 3080, SAM 2.1 large). This is the in-process half, kept so the
number can be re-taken on the hardware a deployment actually has.

Usage (from the inference directory, with the service's own configuration):

    LAZYLABEL_MODEL_DIR=/path/to/checkpoints PYTHONPATH=src python tools/measure_latency.py "SAM 2.1 large"

It runs the real route -- parsing, the model's decoder, the wire encoding and the JSON -- through
`create_app`, on a generated 4000x3000 picture in a temporary dataset root. Only sockets are left
out; over HTTP through the API, add roughly 20 ms at the tail.
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import pathlib
import statistics
import sys
import tempfile
import time

import numpy as np

from lazylabel_inference.app import Request, create_app
from lazylabel_inference.config import load_config
from lazylabel_inference.log import Logger
from lazylabel_inference.manifest import load_manifest
from lazylabel_inference.server import build_deps

BUDGET_MS = 150
CLICKS = 50
WARMUP = 5


class _Quiet(Logger):
    """The service logs every model load; the result should not be buried under them."""

    def log(self, *args: object, **kwargs: object) -> None:
        return None


def _scene(path: pathlib.Path) -> None:
    """A 12-megapixel picture with objects to click on. Content barely moves decoder latency."""
    import cv2

    rng = np.random.default_rng(0)
    image = np.full((3000, 4000, 3), 40, np.uint8)
    for _ in range(60):
        colour = tuple(int(c) for c in rng.integers(60, 255, 3))
        centre = (int(rng.integers(100, 3900)), int(rng.integers(100, 2900)))
        cv2.circle(image, centre, int(rng.integers(40, 300)), colour, -1)
    cv2.imwrite(str(path), image)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("model", help="a model name from the manifest, e.g. 'SAM 2.1 large'")
    arguments = parser.parse_args()

    # The app writes a line per request to stdout; fifty-five of them would bury the three that matter.
    with tempfile.TemporaryDirectory(prefix="lazylabel-latency-") as scratch, contextlib.redirect_stdout(io.StringIO()):
        root = pathlib.Path(scratch)
        _scene(root / "scene.png")
        config = load_config()
        config = type(config)(**{**config.__dict__, "dataset_root": root})
        app = create_app(build_deps(config, load_manifest(config.manifest_path), _Quiet()))

        started = time.perf_counter()
        embedded = app(Request(method="POST", path="/inference/embeddings",
                               body=json.dumps({"image": "scene.png", "model": arguments.model}).encode()))
        if embedded.status != 200:
            print(f"the embedding failed ({embedded.status}): {embedded.body}", file=sys.stderr)
            return 2
        cold = time.perf_counter() - started
        handle = json.loads(embedded.body)["handle"]

        rng = np.random.default_rng(1)
        timings: list[float] = []
        sizes: list[int] = []
        for click in range(CLICKS + WARMUP):
            point = {"x": float(rng.integers(0, 4000)), "y": float(rng.integers(0, 3000)), "positive": True}
            started = time.perf_counter()
            answer = app(Request(method="POST", path="/inference/segment",
                                 body=json.dumps({"handle": handle, "points": [point]}).encode()))
            elapsed = (time.perf_counter() - started) * 1000
            if answer.status != 200:
                print(f"a click failed ({answer.status}): {answer.body}", file=sys.stderr)
                return 2
            # The first few pay for the GPU's own warm-up, which a user's warm embedding has paid.
            if click >= WARMUP:
                timings.append(elapsed)
                sizes.append(len(answer.body))

    timings.sort()
    p95 = timings[int(len(timings) * 0.95) - 1]
    print(f"{arguments.model}: cold embed {cold:.1f} s; over {CLICKS} warm clicks p50 "
          f"{statistics.median(timings):.0f} ms, p95 {p95:.0f} ms, max {timings[-1]:.0f} ms; "
          f"response median {statistics.median(sizes) / 1024:.0f} KiB")
    print(f"budget: p95 {BUDGET_MS} ms -- {'met' if p95 <= BUDGET_MS else 'MISSED'} in-process")
    return 0 if p95 <= BUDGET_MS else 1


if __name__ == "__main__":
    sys.exit(main())
