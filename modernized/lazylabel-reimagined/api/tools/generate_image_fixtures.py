"""Generate image fixtures and the pixels OpenCV reads from them.

Usage (from the api directory):
    E:/venv/lazylabel/Scripts/python.exe tools/generate_image_fixtures.py

The API decodes images with `sharp` plus a hand-written BMP reader; legacy decodes them with
OpenCV. Those are different decoders, and RULE-024's 16-bit conversion has to come out the same
from both or a 16-bit image looks one way on screen and arrives at SAM another.

So this writes the fixtures AND what cv2 makes of them, converted the way legacy converts:
`value // 256`, truncated, after cv2's BGR is put back into RGB order. `test/images/differential.test.ts`
decodes the same files through the pipeline and compares.

Lossless formats are compared pixel for pixel. JPEG is not: two conformant decoders may differ by a
level or two on the same file, so its test asserts a small bound rather than equality, and says so.
"""

from __future__ import annotations

import base64
import json
import pathlib

import cv2
import numpy as np

OUT = pathlib.Path(__file__).resolve().parent.parent / "test" / "fixtures" / "images"


def gradient(height: int, width: int, *, depth: int) -> np.ndarray:
    """A picture with structure in all three channels, so a channel swap cannot hide."""
    top = 65535 if depth == 16 else 255
    ys, xs = np.mgrid[0:height, 0:width]
    image = np.zeros((height, width, 3), dtype=np.uint16 if depth == 16 else np.uint8)
    image[..., 0] = (xs * top // max(width - 1, 1))
    image[..., 1] = (ys * top // max(height - 1, 1))
    image[..., 2] = ((xs + ys) * top // max(width + height - 2, 1))
    return image


def edge_cases_16() -> np.ndarray:
    """Values chosen where truncating and scaling disagree.

    255 truncates to 0 and scales to 1; 511 truncates to 1 and scales to 2. If the pipeline ever
    switches to `value * 255 / 65535`, these are the pixels that catch it.
    """
    values = [0, 1, 255, 256, 257, 511, 512, 1000, 32767, 32768, 60000, 65535]
    image = np.zeros((2, 6, 3), dtype=np.uint16)
    for index, value in enumerate(values):
        image[index // 6, index % 6] = (value, max(value // 2, 0), max(value // 3, 0))
    return image


def expected_rgb(path: pathlib.Path) -> tuple[int, int, bytes]:
    """What legacy sees: cv2's three channels, BGR to RGB, 16-bit truncated by 256."""
    data = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if data is None:
        raise SystemExit(f"cv2 could not read {path}")

    if data.ndim == 2:
        data = cv2.cvtColor(data, cv2.COLOR_GRAY2BGR)
    if data.shape[2] == 4:
        data = data[:, :, :3]  # cv2.imread's default drops alpha; so does the pipeline

    if data.dtype == np.uint16:
        data = (data // 256).astype(np.uint8)  # RULE-024, truncated

    rgb = data[:, :, ::-1]  # cv2 holds BGR
    return int(rgb.shape[1]), int(rgb.shape[0]), rgb.tobytes()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    cases: list[tuple[str, np.ndarray]] = [
        ("gradient8.png", gradient(24, 32, depth=8)),
        ("gradient8.tiff", gradient(24, 32, depth=8)),
        ("gradient8.bmp", gradient(24, 32, depth=8)),
        ("gradient16.tiff", gradient(24, 32, depth=16)),
        ("edges16.tiff", edge_cases_16()),
        ("tiny.png", gradient(1, 1, depth=8)),
        ("wide.png", gradient(1, 64, depth=8)),
        ("gradient8.jpg", gradient(24, 32, depth=8)),
    ]

    manifest = []
    for name, array in cases:
        path = OUT / name
        # cv2.imwrite takes BGR, so the array is reversed on the way out and back on the way in.
        cv2.imwrite(str(path), array[:, :, ::-1])

        width, height, rgb = expected_rgb(path)
        manifest.append(
            {
                "file": name,
                "width": width,
                "height": height,
                # JPEG is lossy and two decoders legitimately disagree by a level or two.
                "exact": not name.endswith(".jpg"),
                "rgb": base64.b64encode(rgb).decode("ascii"),
            }
        )
        print(f"  {name:18} {width}x{height} {'exact' if manifest[-1]['exact'] else 'approximate'}")

    (OUT / "expected.json").write_text(
        json.dumps(
            {
                "$comment": (
                    "Pixels OpenCV reads from each fixture, BGR reordered to RGB and 16-bit "
                    "truncated by 256 per RULE-024. Regenerate with tools/generate_image_fixtures.py."
                ),
                "cases": manifest,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"\nwrote {len(manifest)} fixtures and their expected pixels to {OUT}")


if __name__ == "__main__":
    main()
