"""A clip of shapes moving about, drawn identically on every machine: the propagation goldens' input.

No real recording was available, and the owner's answer on 2026-09-23 was to make one: "just make
some random shapes move around then use that clip series". This is that clip, and the reason it is
a generator rather than a folder of PNGs is the test that pins it: the goldens record a digest of
every frame, and `test_propagation_goldens.py` regenerates the clip and checks those digests before
it compares anything. A golden compared against frames that had quietly changed would prove
nothing, and nothing else would notice.

WHAT THE CLIP HAS TO CONTAIN. A golden only pins the behaviour its frames exercise, so every branch
of legacy's sequence feature needs a frame that takes it:

- TWO tracked objects -- a disc and a square -- so a frame's confidence is a minimum over objects
  (RULE-060) and Keep Flagged Masks has a frame where one object passes and one fails.
- The reference in the MIDDLE (frame 8), so there is a backward pass. Legacy's sequence widget
  always asks for "both", and RULE-025 runs both passes away from the earliest reference.
- A bar sweeping across the disc on frames 14-16, covering most of it on 15, so its score falls
  below Min Conf and frames are FLAGGED.
- The square leaving through the bottom edge, gone from frame 20, so its mask comes back EMPTY and
  RULE-060's clause that an empty mask is not a low-confidence one is taken.
- Four distractors bouncing about, so the model has something to confuse the objects with.
- Two DECOYS, the same colour and size as the object each imitates, crossing it once in each pass:
  a blue square under the tracked square on frames 3-6 (backward) and a yellow disc through the
  tracked disc on frames 9-15 (forward). A same-coloured neighbour is the classic way to make SAM 2
  unsure, and without them the only flag in the clip was one frame the model happened to dislike.

DETERMINISM, AND WHY NO FLOAT DECIDES A PIXEL. Positions are integers, shapes are integer
inequalities, and randomness comes from `random.Random.random()`, the one call Python guarantees to
reproduce across versions for a seed -- numpy's `Generator` makes no such promise across numpy
releases. `sin` would be the natural way to wobble a path, and it is exactly what differs in the last
bit between C libraries, so the wobble is a table. Every pixel is a function of integers, so the
frames are byte-identical everywhere and their digests can be pinned.

    python synthetic_clip.py --out <folder> [--variant <golden name>]

writes `<folder>/frames/*` and `<folder>/reference/*.png`, and prints the capture command.

THE VARIANTS. One drawing, three goldens (`VARIANTS`), each for a difference only it can show:

- `synthetic-shapes`: the clip above as PNG, in one SAM 2 state (legacy's full-context mode).
- `synthetic-shapes-jpeg`: the same frames as JPEG. Legacy hands SAM 2 a JPEG's own bytes
  (`sam2_model.py:788-796`) and re-encodes everything else, so a PNG clip cannot show whether the
  port does the same (SEQUENCE_PARITY.md SP-08). The bytes come from OpenCV's encoder, so the
  golden records their digests and the test checks it regenerates the same files.
- `synthetic-shapes-streaming`: the clip drawn on to 34 frames, the reference on frame 12 and a
  Stream window of 10, so legacy's streaming mode runs four windows forward and three backward,
  with overlaps and seams (SP-09, SP-36). Past frame 24 the disc leaves by the right edge, so the
  last windows hold frames the model is unsure of and frames with nothing left to track.
"""

from __future__ import annotations

import argparse
import hashlib
import pathlib
import random
from dataclasses import dataclass

import numpy as np

SEED = 20260923
WIDTH, HEIGHT = 320, 240
FRAMES = 24

#: Where the user "drew" the objects. Mid-clip, so propagation runs both ways from it.
REFERENCE_FRAME = 8

#: Legacy's four scenarios, which the capture runs unless a variant names fewer.
SCENARIOS = ("defaults", "keep-flagged", "skip-labeled", "overwrite")


@dataclass(frozen=True)
class Variant:
    """One golden: which clip it is of, how its frames are stored, and how legacy was run on it."""

    #: The golden's file name under `goldens/propagation/`, without a suffix.
    name: str
    frames: int = FRAMES
    reference: int = REFERENCE_FRAME
    #: How each frame is written: ".png", or ".jpg" at `quality`.
    suffix: str = ".png"
    quality: int | None = None
    #: The Stream window the capture sets, legacy's `stream_window_spin` (RULE-026).
    window: int = 250
    #: Frames given a sidecar for the Skip Labeled scenarios.
    labeled: tuple[int, ...] = ()
    scenarios: tuple[str, ...] = SCENARIOS


VARIANTS = {
    variant.name: variant
    for variant in (
        Variant("synthetic-shapes", labeled=(2, 5, 15, 21)),
        Variant("synthetic-shapes-jpeg", suffix=".jpg", quality=90, scenarios=("defaults",)),
        Variant(
            "synthetic-shapes-streaming",
            frames=34,
            reference=12,
            window=10,
            scenarios=("defaults", "keep-flagged"),
        ),
    )
}

#: Object ids as legacy assigns them: 1, 2, ... in the order the reference frame lists its segments.
DISC, SQUARE = 1, 2
#: The class each object was labelled with. Save All writes these, so they are part of the golden.
CLASSES = {DISC: 1, SQUARE: 2}

#: Label-image values for what is drawn over the objects, so a visible mask is `labels == object`.
_BAR = 9
_DISTRACTOR = -1

#: The disc's vertical wobble, a table rather than `sin` (see the module docstring).
_WOBBLE = (0, 3, 5, 6, 5, 3, 0, -3, -5, -6, -5, -3)

_DISC_RADIUS = 24
_SQUARE_SIDE = 36
_BAR_HALF_WIDTH = 17
_BAR_TOP, _BAR_BOTTOM = 60, 190

_DISC_COLOUR = (236, 190, 40)
_SQUARE_COLOUR = (52, 96, 222)
_BAR_COLOUR = (58, 62, 72)
_DISTRACTOR_COLOURS = ((204, 64, 60), (70, 172, 96), (158, 84, 204), (238, 238, 232))


@dataclass(frozen=True)
class Clip:
    #: (file name, RGB uint8 array), in timeline order. Names sort the same way the frames play.
    frames: list[tuple[str, np.ndarray]]
    #: Per frame, each tracked object's VISIBLE pixels: its shape minus whatever is drawn over it.
    visible: list[dict[int, np.ndarray]]

    def reference_masks(self, frame: int = REFERENCE_FRAME) -> dict[int, np.ndarray]:
        """What the user drew on the reference frame: each object exactly, nothing occluding it."""
        return self.visible[frame]


def digest(rgb: np.ndarray) -> str:
    """SHA-256 of the decoded pixels and their shape.

    Of the PIXELS rather than the PNG file: two encoders, or one at two compression levels, write
    different bytes for the same picture, and the model only ever sees the picture.
    """
    array = np.ascontiguousarray(rgb, dtype=np.uint8)
    hasher = hashlib.sha256()
    hasher.update(repr(array.shape).encode())
    hasher.update(array.tobytes())
    return hasher.hexdigest()


def _bounce(start: int, velocity: int, low: int, high: int, frame: int) -> int:
    """A position moving at `velocity` and reflecting off `low` and `high`, in integers only."""
    span = high - low
    travelled = (start - low + velocity * frame) % (2 * span)
    return low + (travelled if travelled <= span else 2 * span - travelled)


def _distractors(rng: random.Random) -> list[dict[str, int | str | tuple[int, int, int]]]:
    """Four shapes with random starting points and velocities, drawn from `random()` alone."""

    def between(low: int, high: int) -> int:
        # `random()` is the one call whose stream Python guarantees; `randint` is built on
        # `getrandbits` and carries no such promise.
        return low + int(rng.random() * (high - low + 1))

    shapes = []
    for kind, colour in zip(("triangle", "disc", "rectangle", "diamond"), _DISTRACTOR_COLOURS, strict=True):
        velocity_x = between(3, 7) * (1 if rng.random() < 0.5 else -1)
        velocity_y = between(2, 6) * (1 if rng.random() < 0.5 else -1)
        shapes.append({
            "kind": kind,
            "colour": colour,
            "x": between(30, WIDTH - 30),
            "y": between(30, HEIGHT - 30),
            "vx": velocity_x,
            "vy": velocity_y,
            "size": between(11, 17),
        })
    return shapes


def _background(rng: random.Random) -> np.ndarray:
    """A static textured ground -- a fixed camera -- so the model is not segmenting on flat colour."""
    ys, xs = np.mgrid[0:HEIGHT, 0:WIDTH]
    image = np.empty((HEIGHT, WIDTH, 3), dtype=np.int32)
    image[..., 0] = 88 + (xs * 40) // WIDTH
    image[..., 1] = 108 + (ys * 30) // HEIGHT
    image[..., 2] = 98 + ((xs + ys) * 16) // (WIDTH + HEIGHT)
    noise = np.array([int(rng.random() * 17) - 8 for _ in range(WIDTH * HEIGHT)], dtype=np.int32)
    image += noise.reshape(HEIGHT, WIDTH)[..., None]
    return np.clip(image, 0, 255).astype(np.uint8)


def _shape_mask(kind: str, cx: int, cy: int, size: int, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    if kind == "disc":
        return (xs - cx) ** 2 + (ys - cy) ** 2 <= size * size
    if kind == "rectangle":
        return (np.abs(xs - cx) <= size + size // 2) & (np.abs(ys - cy) <= size - size // 3)
    if kind == "diamond":
        return np.abs(xs - cx) + np.abs(ys - cy) <= size
    if kind == "triangle":
        # Upward-pointing: inside all three half-planes, by integer cross products.
        ax, ay = cx, cy - size
        bx, by = cx - size, cy + size
        cx2, cy2 = cx + size, cy + size

        def side(px: int, py: int, qx: int, qy: int) -> np.ndarray:
            return (qx - px) * (ys - py) - (qy - py) * (xs - px)

        d1, d2, d3 = side(ax, ay, bx, by), side(bx, by, cx2, cy2), side(cx2, cy2, ax, ay)
        negative = (d1 < 0) | (d2 < 0) | (d3 < 0)
        positive = (d1 > 0) | (d2 > 0) | (d3 > 0)
        return ~(negative & positive)
    raise ValueError(f"unknown shape {kind!r}")


def disc_centre(frame: int) -> tuple[int, int]:
    """Left to right at 10 px a frame, wobbling vertically."""
    return 40 + 10 * frame, 120 + _WOBBLE[frame % len(_WOBBLE)]


def square_corner(frame: int) -> tuple[int, int]:
    """Top-left corner. Down the left side at 11 px a frame, drifting right; gone from frame 20."""
    return 16 + frame, 20 + 11 * frame


def blue_decoy_corner(frame: int) -> tuple[int, int]:
    """Top-left corner. Diagonally down-left under the tracked square, touching it on frames 3-6."""
    return 120 - 22 * frame, 48 + 11 * frame


def yellow_decoy_centre(frame: int) -> tuple[int, int]:
    """Straight down through the tracked disc's path, overlapping it on frames 9-15."""
    return 168, -30 + 12 * frame


def bar_centre(frame: int) -> int:
    """Right to left at 14 px a frame, level with the disc's centre on frame 15."""
    return 400 - 14 * frame


def render(seed: int = SEED, frames: int = FRAMES) -> Clip:
    rng = random.Random(seed)
    background = _background(rng)
    shapes = _distractors(rng)
    ys, xs = np.mgrid[0:HEIGHT, 0:WIDTH]

    out: list[tuple[str, np.ndarray]] = []
    visible: list[dict[int, np.ndarray]] = []
    for frame in range(frames):
        image = background.copy()
        labels = np.zeros((HEIGHT, WIDTH), dtype=np.int8)

        # Drawn back to front: distractors, the square, the disc, then the bar over everything.
        for shape in shapes:
            size = int(shape["size"])
            cx = _bounce(int(shape["x"]), int(shape["vx"]), size, WIDTH - 1 - size, frame)
            cy = _bounce(int(shape["y"]), int(shape["vy"]), size, HEIGHT - 1 - size, frame)
            mask = _shape_mask(str(shape["kind"]), cx, cy, size, xs, ys)
            image[mask] = shape["colour"]
            labels[mask] = _DISTRACTOR

        # The decoys are distractors too, so they go under the objects they imitate: each object
        # stays whole, and what the model sees is one same-coloured blob where they touch.
        left, top = blue_decoy_corner(frame)
        decoy = (xs >= left) & (xs < left + _SQUARE_SIDE) & (ys >= top) & (ys < top + _SQUARE_SIDE)
        image[decoy] = _SQUARE_COLOUR
        labels[decoy] = _DISTRACTOR

        cx, cy = yellow_decoy_centre(frame)
        decoy = (xs - cx) ** 2 + (ys - cy) ** 2 <= _DISC_RADIUS * _DISC_RADIUS
        image[decoy] = _DISC_COLOUR
        labels[decoy] = _DISTRACTOR

        left, top = square_corner(frame)
        square = (xs >= left) & (xs < left + _SQUARE_SIDE) & (ys >= top) & (ys < top + _SQUARE_SIDE)
        image[square] = _SQUARE_COLOUR
        labels[square] = SQUARE

        cx, cy = disc_centre(frame)
        disc = (xs - cx) ** 2 + (ys - cy) ** 2 <= _DISC_RADIUS * _DISC_RADIUS
        image[disc] = _DISC_COLOUR
        labels[disc] = DISC

        centre = bar_centre(frame)
        bar = (
            (xs >= centre - _BAR_HALF_WIDTH) & (xs <= centre + _BAR_HALF_WIDTH)
            & (ys >= _BAR_TOP) & (ys < _BAR_BOTTOM)
        )
        image[bar] = _BAR_COLOUR
        labels[bar] = _BAR

        out.append((f"frame_{frame:03d}.png", image))
        visible.append({obj: labels == obj for obj in (DISC, SQUARE)})
    return Clip(frames=out, visible=visible)


def encoded(rgb: np.ndarray, suffix: str = ".png", quality: int | None = None) -> bytes:
    """One frame as the file a variant stores it in.

    JPEG at `quality` through OpenCV, as legacy writes its own staging (`sam2_model.py:803`). The
    bytes are the encoder's, not a law of nature: another OpenCV may write different ones, which is
    why a JPEG golden records the digest of every file and its test regenerates and compares them.
    """
    import cv2

    params = [cv2.IMWRITE_JPEG_QUALITY, int(quality)] if quality is not None else []
    ok, data = cv2.imencode(suffix, rgb[:, :, ::-1], params)
    if not ok:
        raise OSError(f"OpenCV could not encode a frame as {suffix}")
    return data.tobytes()


def render_variant(variant: Variant) -> Clip:
    """The clip a variant is of, its frames named with the variant's suffix."""
    clip = render(frames=variant.frames)
    stem = [pathlib.PurePath(name).stem for name, _ in clip.frames]
    return Clip(
        frames=[(name + variant.suffix, rgb) for name, (_, rgb) in zip(stem, clip.frames, strict=True)],
        visible=clip.visible,
    )


def write(
    clip: Clip, folder: pathlib.Path, variant: Variant | None = None
) -> tuple[pathlib.Path, list[pathlib.Path]]:
    """The frames and the reference masks, in separate folders; the masks are always PNG.

    Separate so that a frames folder holds nothing but frames: the capture script takes every image
    in it, and a mask sitting among them would be propagated through as frame 25.
    """
    import cv2

    variant = variant or VARIANTS["synthetic-shapes"]
    frames_dir = folder / "frames"
    reference_dir = folder / "reference"
    frames_dir.mkdir(parents=True, exist_ok=True)
    reference_dir.mkdir(parents=True, exist_ok=True)

    for name, rgb in clip.frames:
        (frames_dir / name).write_bytes(encoded(rgb, pathlib.PurePath(name).suffix, variant.quality))

    masks = []
    for obj, mask in clip.reference_masks(variant.reference).items():
        path = reference_dir / f"object{obj}_class{CLASSES[obj]}.png"
        if not cv2.imwrite(str(path), mask.astype(np.uint8) * 255):
            raise OSError(f"could not write {path}")
        masks.append(path)
    return frames_dir, masks


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", required=True, type=pathlib.Path)
    parser.add_argument("--variant", default="synthetic-shapes", choices=sorted(VARIANTS))
    args = parser.parse_args()

    variant = VARIANTS[args.variant]
    clip = render_variant(variant)
    frames_dir, masks = write(clip, args.out, variant)
    print(f"wrote {len(clip.frames)} frames to {frames_dir}")
    references = " ".join(
        f"--reference {variant.reference}:{CLASSES[obj]}:{path}"
        for obj, path in zip(clip.reference_masks(variant.reference), masks, strict=True)
    )
    labeled = f" --labeled {','.join(map(str, variant.labeled))}" if variant.labeled else ""
    scenarios = "" if variant.scenarios == SCENARIOS else f" --scenarios {','.join(variant.scenarios)}"
    window = "" if variant.window == 250 else f" --window {variant.window}"
    print("capture with:")
    print(f"  python capture_propagation_goldens.py --frames {frames_dir} {references}{labeled}"
          f"{scenarios}{window} --checkpoint <sam2.1_hiera_large.pt> --out <goldens>/{variant.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
