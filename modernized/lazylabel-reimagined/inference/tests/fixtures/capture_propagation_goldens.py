"""Capture legacy's propagation outputs on a REAL sequence, as golden data.

Phase 6's third entry criterion is "at least one recorded image sequence has legacy propagation
outputs saved as golden data". This is the script that produces it, so the criterion is one
command rather than a research task.

    E:/venv/lazylabel/Scripts/python.exe capture_propagation_goldens.py \\
        --frames  D:/sequences/cells_2024 \\
        --seed    0:1:412,318 \\
        --checkpoint E:/models/sam2.1_hiera_large.pt \\
        --out     cells_2024.npz

WHY A SCRIPT AND NOT A TEST. `test_differential_propagation.py` already compares the port against
legacy live, on a sequence it generates. That proves the two agree on synthetic frames today; it
does not give Phase 6 anything to build against, because it needs the legacy app, the checkpoint
and several minutes every time it runs. Golden data is the other half: captured ONCE from a real
recording, committed, and thereafter compared against by a suite that needs no GPU and no legacy
install. Phase 1's exporters and Phase 5's FFT and CLAHE are all proven this way, and it is the
only reason CI means anything for them.

WHAT IT CAPTURES, AND WHY EACH PIECE. Every frame's mask, its confidence, and whether legacy would
have flagged it at the threshold in force. The flags are the part worth insisting on: RULE-060
decides which frames a user is told to check by hand, so a port that tracks the object perfectly
and flags a different set has changed the feature in the way a user would actually notice. Masks
alone would not catch that.

The masks go into an NPZ as a packed bit array rather than a JSON list. A 2-megapixel frame is two
million bytes as JSON digits and 250 KB packed, and a sequence has hundreds of frames.

WHAT IT DOES NOT DO: it never writes into the legacy worktree, never downloads anything, and loads
the checkpoint from the path given on the command line rather than letting legacy resolve its
default -- which would pull a 2.4 GB file into the read-only worktree.
"""

from __future__ import annotations

import argparse
import datetime
import gc
import hashlib
import json
import pathlib
import sys

import numpy as np

# Legacy's own default, and the one RULE-060's card is written against.
DEFAULT_THRESHOLD = 0.99

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}


def parse_seed(text: str) -> tuple[int, int, list[tuple[float, float]]]:
    """`frame:objectId:x,y[;x,y...]` — where propagation is seeded from.

    Positive points only, which is what the sequence seeding path offers: legacy's
    `add_video_points` takes labels, and the sequence UI never sends a negative one.
    """
    try:
        frame_text, obj_text, points_text = text.split(":", 2)
        points = []
        for pair in points_text.split(";"):
            x_text, y_text = pair.split(",")
            points.append((float(x_text), float(y_text)))
        if not points:
            raise ValueError("no points")
        return int(frame_text), int(obj_text), points
    except Exception as cause:  # noqa: BLE001 - the message matters more than the type
        raise SystemExit(
            f"--seed must look like frame:objectId:x,y[;x,y], got {text!r} ({cause})"
        ) from cause


def frames_in(folder: pathlib.Path) -> list[pathlib.Path]:
    """The sequence, in the order legacy stages it.

    Sorted by NAME, which is what legacy's file manager does, and the reason a sequence numbered
    without zero padding (frame_2 before frame_10) propagates in an order nobody intended. That is
    the dataset's problem and not this script's, but it is captured faithfully -- a golden that
    quietly reordered the frames would hide the very thing a user would report.
    """
    found = sorted(
        (path for path in folder.iterdir() if path.suffix.lower() in IMAGE_SUFFIXES),
        key=lambda path: path.name,
    )
    if not found:
        raise SystemExit(f"no images under {folder}")
    return found


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frames", required=True, type=pathlib.Path)
    parser.add_argument("--seed", required=True, action="append",
                        help="frame:objectId:x,y[;x,y] — repeat for several objects")
    parser.add_argument("--checkpoint", required=True, type=pathlib.Path)
    parser.add_argument("--out", required=True, type=pathlib.Path)
    parser.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD)
    args = parser.parse_args()

    if not args.checkpoint.is_file():
        raise SystemExit(f"no checkpoint at {args.checkpoint}")

    frames = frames_in(args.frames)
    seeds = [parse_seed(text) for text in args.seed]

    try:
        from lazylabel.models.sam2_model import Sam2Model
    except ImportError as cause:
        raise SystemExit(
            "put the legacy package on PYTHONPATH, e.g. "
            "PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src"
        ) from cause

    print(f"{len(frames)} frames, {len(seeds)} seed object(s), threshold {args.threshold}")

    # `model_path` explicitly: letting legacy resolve its default downloads a 2.4 GB checkpoint
    # into the read-only worktree.
    model = Sam2Model(model_path=str(args.checkpoint))
    if not model.is_loaded:
        raise SystemExit("the legacy Sam2Model did not load the checkpoint")
    if not model.init_video_state([str(path) for path in frames]):
        raise SystemExit("the legacy Sam2Model did not stage the sequence")

    for frame_idx, obj_id, points in seeds:
        seeded = model.add_video_points(
            frame_idx=frame_idx,
            obj_id=obj_id,
            points=np.array(points, dtype=np.float32),
            labels=np.array([1] * len(points), dtype=np.int32),
        )
        if seeded is None:
            raise SystemExit(f"the legacy Sam2Model rejected the seed on frame {frame_idx}")

    height, width = None, None
    masks: dict[str, np.ndarray] = {}
    records: list[dict[str, object]] = []

    for frame_idx, obj_id, mask, confidence in model.propagate_in_video():
        binary = np.asarray(mask).astype(bool)
        if height is None:
            height, width = binary.shape
        elif binary.shape != (height, width):
            raise SystemExit(
                f"frame {frame_idx} object {obj_id} came back {binary.shape}, expected "
                f"{(height, width)} — the sequence is not one size, which legacy would have "
                "marked Skipped rather than propagated"
            )

        # RULE-060: an EMPTY mask is not a low-confidence one. Legacy drops it before the
        # threshold check, so it neither flags the frame nor lowers its minimum. Captured as a
        # fact about the object rather than folded away, because a port that treats the two alike
        # flags and by default wipes every frame an object walks out of.
        empty = not binary.any()

        key = f"{frame_idx}:{obj_id}"
        masks[key] = np.packbits(binary)
        records.append({
            "frame": int(frame_idx),
            "object": int(obj_id),
            "confidence": float(confidence),
            "empty": bool(empty),
            # Strictly less than, which is why a score of exactly the threshold is NOT flagged.
            "flagged": bool(not empty and float(confidence) < args.threshold),
            "pixels": int(binary.sum()),
        })
        print(f"  frame {frame_idx:>5} obj {obj_id}: conf {confidence:.4f}"
              f"{' EMPTY' if empty else ''}{' FLAGGED' if records[-1]['flagged'] else ''}")

    model.cleanup_video_state()
    del model
    gc.collect()

    if height is None:
        raise SystemExit("propagation returned nothing at all")

    # The frame's own status, which is what RULE-060 is really about: the minimum over the objects
    # that produced a non-empty mask, and no status at all when every object was empty.
    by_frame: dict[int, list[dict[str, object]]] = {}
    for record in records:
        by_frame.setdefault(int(record["frame"]), []).append(record)

    frame_status = []
    for frame_idx in sorted(by_frame):
        scored = [r for r in by_frame[frame_idx] if not r["empty"]]
        if not scored:
            # Never committed: legacy leaves it PENDING with no score.
            frame_status.append({"frame": frame_idx, "status": "pending", "confidence": None})
            continue
        lowest = min(float(r["confidence"]) for r in scored)
        frame_status.append({
            "frame": frame_idx,
            "status": "flagged" if lowest < args.threshold else "propagated",
            "confidence": lowest,
        })

    metadata = {
        "source": "legacy lazylabel Sam2Model.propagate_in_video at snapshot 2a7d5d8",
        "captured": datetime.date.today().isoformat(),
        "checkpoint": args.checkpoint.name,
        "checkpointSha256": sha256(args.checkpoint),
        "threshold": args.threshold,
        "height": int(height),
        "width": int(width),
        "frames": [path.name for path in frames],
        "seeds": [
            {"frame": frame, "object": obj, "points": points} for frame, obj, points in seeds
        ],
        "results": records,
        "frameStatus": frame_status,
        "note": (
            "Masks are packed bits, one entry per 'frame:object', unpack with "
            "np.unpackbits(...)[: height * width].reshape(height, width). An EMPTY mask is not a "
            "low-confidence one: RULE-060 drops it before the threshold check, so it neither flags "
            "its frame nor lowers the frame minimum."
        ),
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.out, metadata=json.dumps(metadata), **masks)

    flagged = sum(1 for f in frame_status if f["status"] == "flagged")
    pending = sum(1 for f in frame_status if f["status"] == "pending")
    print(
        f"\nwrote {args.out} ({args.out.stat().st_size / 1e6:.1f} MB): "
        f"{len(frame_status)} frames, {flagged} flagged, {pending} never committed"
    )
    if flagged == 0:
        # A golden where nothing is flagged cannot prove the flagging rule. Said rather than
        # failed: the capture is still valid, it just does not exercise RULE-060.
        print(
            "NOTE: no frame was flagged, so this sequence does not exercise RULE-060's threshold. "
            "Capture one with a harder stretch, or re-run with a higher --threshold, if the "
            "flagging behaviour is what you mean to pin."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
