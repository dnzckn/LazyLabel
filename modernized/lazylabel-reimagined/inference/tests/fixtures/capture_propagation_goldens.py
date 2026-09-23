"""Capture legacy's sequence propagation as golden data: the model's answers AND what the user saw.

Phase 6's exit criterion 2 reads "Flagged frames, Keep Flagged Masks, Skip Labeled and Save All
outputs match the legacy golden outputs within tolerance". Three of those four are not the model's
behaviour at all. They are MainWindow's: which frames it paints red, which masks it throws away,
which frames it refuses to touch, which files Save All writes. So a golden of the model's output
alone -- which is what this script captured until 2026-09-23 -- could never prove them, and it was
seeded by clicked points besides, which is not how either app seeds a sequence: legacy registers the
user's drawn masks (`add_video_mask`) and so does the port (`seed_mask`).

    PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src python capture_propagation_goldens.py \\
        --frames     <folder of frames> \\
        --reference  8:1:disc.png --reference 8:2:square.png \\
        --labeled    5,15,21 \\
        --checkpoint E:/models/sam2.1_hiera_large.pt \\
        --out        goldens/propagation/synthetic-shapes

`--reference FRAME:CLASS:MASK` is the user's drawing: the mask's non-zero pixels, labelled CLASS, on
timeline frame FRAME. Objects are numbered 1, 2, ... in the order given, which is legacy's order for
the segments of one frame. `--labeled` names the frames that already have annotations for the Skip
Labeled scenarios. `synthetic_clip.py` writes a clip and prints the whole command.

HOW LEGACY RUNS WITHOUT ITS WINDOW. The sequence feature is MainWindow methods driving
`SequenceViewMode`, `PropagationManager` and legacy's `Sam2Model`, and the methods only reach the
widgets through a handful of attributes. So this builds an object carrying legacy's OWN methods,
unmodified -- `_on_propagate_requested`, `_start_propagation`, `_on_propagation_frame_done`,
`_commit_frame_buffer`, `_on_save_all_propagated` and the rest -- with the timeline and sequence
widgets replaced by recorders. Three substitutions, each at a boundary rather than inside a rule:

- Worker threads run their `run()` on the calling thread. The same code, in the same order, without
  an event loop to deliver the signals.
- The reference frame's annotations come from `--reference` rather than from a sidecar on disk,
  which is what `_load_segments_for_reference_frame` would otherwise read.
- Save All's write (`_save_output_to_npz`) is recorded rather than performed. WHICH frames are
  written and with WHICH masks and classes is the behaviour; the NPZ bytes themselves are Phase 1's,
  proven by the exporter goldens.

Each scenario starts a fresh session on the same loaded model. The scenarios are the four
combinations the two checkboxes make with and without labelled frames:

    defaults        Keep Flagged off, Skip Labeled on  (legacy's defaults), nothing labelled
    keep-flagged    Keep Flagged on,  Skip Labeled on,  nothing labelled
    skip-labeled    Keep Flagged off, Skip Labeled on,  --labeled frames have sidecars
    overwrite       Keep Flagged off, Skip Labeled off, --labeled frames have sidecars

WHAT IS WRITTEN. `<out>.json` holds everything a reader without numpy needs: the frames' pixel
digests, the references, every object's score on every frame, and per scenario the timeline as the
user saw it, the confidences it showed, which masks each frame kept, the engine's own sets, and
what Save All wrote. `<out>.npz` holds the masks, packed bits keyed "frame:object".

It never writes into the legacy worktree, never downloads anything, and loads the checkpoint from
the path given rather than letting legacy resolve its default, which would pull 2.4 GB into the
read-only worktree.
"""

from __future__ import annotations

import argparse
import datetime
import gc
import hashlib
import json
import os
import pathlib
import shutil
import sys
import tempfile
import types
from dataclasses import dataclass

import numpy as np

# The fixtures folder is not a package, so its neighbour is imported by path.
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from synthetic_clip import digest as pixel_digest  # noqa: E402

# Legacy's own default, and the one RULE-060's card is written against.
DEFAULT_THRESHOLD = 0.99

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}


@dataclass(frozen=True)
class Reference:
    frame: int
    class_id: int
    path: pathlib.Path


@dataclass(frozen=True)
class Scenario:
    name: str
    keep_flagged: bool
    skip_labeled: bool
    labeled: tuple[int, ...]


def parse_reference(text: str) -> Reference:
    """`frame:class:mask.png` -- a Windows path keeps its drive colon, so split twice from the left."""
    try:
        frame_text, class_text, path_text = text.split(":", 2)
        if not path_text:
            raise ValueError("no mask file")
        return Reference(int(frame_text), int(class_text), pathlib.Path(path_text))
    except Exception as cause:  # noqa: BLE001 - the message matters more than the type
        raise SystemExit(
            f"--reference must look like frame:class:mask.png, got {text!r} ({cause})"
        ) from cause


def parse_frames(text: str) -> tuple[int, ...]:
    """`5,15,21`, or empty for none."""
    try:
        return tuple(sorted({int(part) for part in text.split(",") if part.strip()}))
    except ValueError as cause:
        raise SystemExit(f"--labeled must be frame numbers separated by commas, got {text!r}") from cause


def scenarios_for(labeled: tuple[int, ...]) -> list[Scenario]:
    """The two checkboxes, at legacy's defaults and against them, with and without labelled frames."""
    return [
        Scenario("defaults", keep_flagged=False, skip_labeled=True, labeled=()),
        Scenario("keep-flagged", keep_flagged=True, skip_labeled=True, labeled=()),
        Scenario("skip-labeled", keep_flagged=False, skip_labeled=True, labeled=labeled),
        Scenario("overwrite", keep_flagged=False, skip_labeled=False, labeled=labeled),
    ]


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


def read_rgb(path: pathlib.Path) -> np.ndarray:
    import cv2

    bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if bgr is None:
        raise SystemExit(f"could not read {path}")
    return bgr[:, :, ::-1]


def read_mask(path: pathlib.Path) -> np.ndarray:
    import cv2

    mask = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if mask is None:
        raise SystemExit(f"could not read the mask {path}")
    return mask > 0


def pack(mask: np.ndarray) -> np.ndarray:
    return np.packbits(np.asarray(mask, dtype=bool))


def sha256_file(path: pathlib.Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            hasher.update(block)
    return hasher.hexdigest()


class TimelineRecorder:
    """Stands in for `TimelineWidget`: remembers the last thing the window painted on each frame."""

    def __init__(self) -> None:
        self.status: dict[int, str] = {}
        self.confidence: dict[int, float] = {}

    def clear_statuses(self) -> None:
        self.status.clear()

    def set_frame_status(self, index: int, status: str, immediate: bool = False) -> None:
        self.status[int(index)] = str(status)

    def set_frame_confidence(self, index: int, confidence: float) -> None:
        self.confidence[int(index)] = float(confidence)

    def set_confidence_scores(self, scores: dict[int, float]) -> None:
        for index, confidence in scores.items():
            self.confidence[int(index)] = float(confidence)


class SequenceWidgetRecorder:
    """Stands in for `SequenceWidget`: the checkbox and spin values legacy reads, and the counts it shows."""

    def __init__(self, threshold: float) -> None:
        self._is_propagating = False
        self.flagged_count: int | None = None
        self.propagated_count: int | None = None
        self.confidence_spin = types.SimpleNamespace(value=lambda: threshold, setValue=lambda _: None)
        # Legacy's checkbox is on; with a sequence no longer than the window it changes nothing.
        self.streaming_checkbox = types.SimpleNamespace(isChecked=lambda: True)
        self.stream_window_spin = types.SimpleNamespace(value=lambda: 250)

    def start_propagation(self) -> None:
        self._is_propagating = True

    def end_propagation(self) -> None:
        self._is_propagating = False

    def set_propagation_status(self, message: str) -> None:
        pass

    def set_propagation_progress(self, current: int, total: int) -> None:
        pass

    def set_flagged_count(self, count: int) -> None:
        self.flagged_count = int(count)

    def set_propagated_count(self, count: int) -> None:
        self.propagated_count = int(count)


def headless_window_class(main_window_class: type) -> type:
    """A class carrying legacy's own sequence methods, and nothing else of MainWindow."""
    names = [
        "_on_propagate_requested",
        "_on_sequence_init_progress",
        "_on_sequence_init_finished",
        "_on_sequence_init_error",
        "_start_propagation",
        "_on_reference_progress",
        "_on_reference_annotations_finished",
        "_on_reference_annotations_error",
        "_safe_stop_worker",
        "_on_propagation_status",
        "_on_propagation_progress",
        "_on_propagation_frame_done",
        "_commit_frame_buffer",
        "_finalize_propagation_frame_color",
        "_on_propagation_finished",
        "_on_propagation_error",
        "_cleanup_propagation_worker",
        "_on_save_all_propagated",
    ]
    return type("HeadlessWindow", (), {name: getattr(main_window_class, name) for name in names})


def run_scenario(legacy: types.SimpleNamespace, model, scenario: Scenario, source_frames: list[pathlib.Path],
                 masks: list[tuple[Reference, np.ndarray]], threshold: float, shape: tuple[int, int]) -> dict:
    """One fresh session: enter sequence mode, mark the references, Propagate, then Save All."""
    workdir = pathlib.Path(tempfile.mkdtemp(prefix=f"lazylabel-golden-{scenario.name}-"))
    try:
        paths = []
        for source in source_frames:
            target = workdir / source.name
            shutil.copyfile(source, target)
            paths.append(str(target))
        # "Already labelled" is an existence probe over legacy's load chain (RULE-081), so an empty
        # file under the chain's first suffix is exactly what the check sees for a real annotation.
        first_suffix = legacy.FileManager._LOAD_CHAIN[0][0]
        for index in scenario.labeled:
            pathlib.Path(os.path.splitext(paths[index])[0] + first_suffix).write_bytes(b"")

        if getattr(model, "is_video_initialized", False):
            model.cleanup_video_state()

        raw: list[dict] = []
        original = model.propagate_in_video

        def spy(*args, **kwargs):
            reverse = bool(kwargs.get("reverse", False))
            for frame_idx, obj_id, mask, confidence in original(*args, **kwargs):
                raw.append({
                    "frame": int(frame_idx),
                    "object": int(obj_id),
                    "confidence": float(confidence),
                    "reverse": reverse,
                    "mask": np.array(mask, dtype=bool, copy=True).squeeze(),
                })
                yield frame_idx, obj_id, mask, confidence

        model.propagate_in_video = spy

        window = legacy.HeadlessWindow()
        segments_by_path: dict[str, list[dict]] = {}
        for reference, mask in masks:
            segments_by_path.setdefault(paths[reference.frame], []).append(
                {"mask": mask.copy(), "class_id": reference.class_id, "type": "Polygon"}
            )
        notifications: list[str] = []
        saved: list[dict] = []

        window.model_manager = types.SimpleNamespace(sam_model=model, is_model_available=lambda: True)
        window.segment_manager = legacy.SegmentManager()
        window.timeline_widget = TimelineRecorder()
        window.sequence_widget = SequenceWidgetRecorder(threshold)
        window._sequence_init_worker = None
        window._reference_worker = None
        window._propagation_worker = None
        window._pending_propagation = None
        window._show_notification = notifications.append
        window._load_segments_for_reference_frame = lambda path: segments_by_path.get(str(path), [])
        window._load_sequence_frame_segments = lambda path: None

        def record_save() -> None:
            saved.append({
                "path": window.current_image_path,
                "segments": [
                    {"class": int(segment["class_id"]), "mask": np.asarray(segment["mask"], dtype=bool)}
                    for segment in window.segment_manager.segments
                ],
            })

        window._save_output_to_npz = record_save

        view = legacy.SequenceViewMode(window)
        window.sequence_view_mode = view
        window.propagation_manager = legacy.PropagationManager(window)
        view.set_image_paths(paths)
        for frame in sorted({reference.frame for reference, _ in masks}):
            annotations = [
                legacy.ViewReference(frame_idx=frame, obj_id=number, mask=mask.copy(), class_id=reference.class_id)
                for number, (reference, mask) in enumerate(masks, start=1)
                if reference.frame == frame
            ]
            if not view.set_reference_frame(frame, annotations=annotations, image_dimensions=shape):
                raise SystemExit(f"legacy refused frame {frame} as a reference")
        # The user is looking at the first reference frame when they press Propagate.
        window.current_image_path = paths[min(reference.frame for reference, _ in masks)]

        total = len(paths)
        window._on_propagate_requested("both", 0, total - 1, scenario.keep_flagged, scenario.skip_labeled)
        if window.sequence_widget.flagged_count is None:
            raise SystemExit(f"{scenario.name}: legacy never finished propagating: {notifications}")

        engine = window.propagation_manager.state
        after_propagation = {
            "timeline": [window.timeline_widget.status.get(i, "pending") for i in range(total)],
            "timelineConfidence": {str(i): c for i, c in sorted(window.timeline_widget.confidence.items())},
            "view": [view.get_frame_status(i) for i in range(total)],
            "viewConfidence": {str(i): c for i, c in sorted(view.get_all_confidence_scores().items())},
            "keptMasks": {
                str(i): sorted(int(obj) for obj in (view.get_propagated_masks(i) or {}))
                for i in range(total)
                if view.get_propagated_masks(i)
            },
            "engine": {
                "propagated": sorted(int(i) for i in engine.propagated_frames),
                "flagged": sorted(int(i) for i in engine.flagged_frames),
            },
            "counts": {
                "flagged": window.sequence_widget.flagged_count,
                "propagated": window.sequence_widget.propagated_count,
            },
        }
        kept = {
            (i, int(obj)): np.asarray(mask, dtype=bool)
            for i in range(total)
            for obj, mask in (view.get_propagated_masks(i) or {}).items()
        }

        propagation_notices = list(notifications)
        notifications.clear()
        window._on_save_all_propagated()

        index_of = {path: i for i, path in enumerate(paths)}
        writes = []
        for write in saved:
            frame = index_of[write["path"]]
            segments = []
            for segment in write["segments"]:
                owner = [obj for (i, obj), mask in kept.items() if i == frame and np.array_equal(mask, segment["mask"])]
                if len(owner) != 1:
                    raise SystemExit(f"{scenario.name}: Save All wrote a mask on frame {frame} that no kept mask matches")
                segments.append({"class": segment["class"], "object": owner[0], "pixels": int(segment["mask"].sum())})
            writes.append({"frame": frame, "segments": segments})

        return {
            "raw": raw,
            "record": {
                "keepFlagged": scenario.keep_flagged,
                "skipLabeled": scenario.skip_labeled,
                "labeled": list(scenario.labeled),
                **after_propagation,
                "propagationNotices": propagation_notices,
                "saveAll": {
                    "written": writes,
                    "timeline": [window.timeline_widget.status.get(i, "pending") for i in range(total)],
                    "notices": list(notifications),
                },
            },
        }
    finally:
        # The spy was an attribute on the instance; removing it leaves legacy's own method.
        vars(model).pop("propagate_in_video", None)
        shutil.rmtree(workdir, ignore_errors=True)


def model_results(raw: list[dict], reference_frames: set[int], threshold: float) -> tuple[list[dict], dict[str, np.ndarray]]:
    """Every object on every non-reference frame, once, as the model produced it.

    Reference frames are left out: legacy's engine skips them (RULE-081) and their mask is the
    user's own drawing, not an answer to compare. Every other frame appears in exactly one pass --
    forward for those after the earliest reference, backward for those before it.
    """
    results: list[dict] = []
    masks: dict[str, np.ndarray] = {}
    seen: set[tuple[int, int]] = set()
    for entry in raw:
        key = (entry["frame"], entry["object"])
        if entry["frame"] in reference_frames:
            continue
        if key in seen:
            raise SystemExit(f"frame {entry['frame']} object {entry['object']} came back twice")
        seen.add(key)
        mask = entry["mask"]
        empty = not mask.any()
        results.append({
            "frame": entry["frame"],
            "object": entry["object"],
            "pass": "backward" if entry["reverse"] else "forward",
            "confidence": entry["confidence"],
            "empty": bool(empty),
            # RULE-060: strictly below, and an empty mask is not a low-confidence one.
            "flagged": bool(not empty and entry["confidence"] < threshold),
            "pixels": int(mask.sum()),
        })
        masks[f"{entry['frame']}:{entry['object']}"] = pack(mask)
    results.sort(key=lambda r: (r["frame"], r["object"]))
    return results, masks


def same_answers(first: list[dict], other: list[dict]) -> str | None:
    """Why two runs of the model disagree, or None. Every scenario must see the same model output."""
    if [(e["frame"], e["object"], e["reverse"]) for e in first] != [(e["frame"], e["object"], e["reverse"]) for e in other]:
        return "they produced different frames or objects"
    for a, b in zip(first, other, strict=True):
        if not np.array_equal(a["mask"], b["mask"]):
            return f"frame {a['frame']} object {a['object']} came back with a different mask"
        if abs(a["confidence"] - b["confidence"]) > 1e-6:
            return f"frame {a['frame']} object {a['object']} scored {a['confidence']} then {b['confidence']}"
    return None


def environment() -> dict:
    """What the golden was captured ON, because SAM 2's answer moves with it.

    Measured 2026-09-23: the same clip, legacy and the same weights, on PyTorch 2.10 rather than
    2.7.1, moved 8 of 46 masks slightly and one -- frame 1's square, where it touches its
    same-coloured decoy -- to IoU 0.93. No flag changed and no score moved past the fourth decimal.
    So a golden's MASKS are only comparable on the PyTorch they were captured on, and the test reads
    this to know when that is.
    """
    import importlib.metadata
    import platform

    import torch

    sam2 = "unknown"
    try:
        direct = json.loads(importlib.metadata.distribution("SAM-2").read_text("direct_url.json") or "{}")
        sam2 = direct.get("vcs_info", {}).get("commit_id", sam2)
    except importlib.metadata.PackageNotFoundError:
        pass
    return {
        "python": platform.python_version(),
        "torch": torch.__version__,
        "cuda": torch.version.cuda,
        "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
        "sam2": sam2,
    }


def load_legacy() -> types.SimpleNamespace:
    """Legacy's classes, with its worker threads made to run on the calling thread."""
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    # PyTorch before legacy, because legacy loads Qt: on Windows, PyTorch 2.10 cannot load its DLLs
    # once PyQt6 6.9 is loaded (tests/conftest.py has the measurement).
    import torch  # noqa: F401
    try:
        from lazylabel.core import FileManager, SegmentManager
        from lazylabel.models.sam2_model import Sam2Model
        from lazylabel.ui.main_window import MainWindow
        from lazylabel.ui.managers.propagation_manager import PropagationManager
        from lazylabel.ui.modes.sequence_view_mode import (
            ReferenceAnnotation as ViewReference,
        )
        from lazylabel.ui.modes.sequence_view_mode import SequenceViewMode
        from lazylabel.ui.workers import propagation_worker
    except ImportError as cause:
        raise SystemExit(
            "put the legacy package on PYTHONPATH, e.g. "
            "PYTHONPATH=E:/GitHub/LazyLabel/legacy/lazylabel/src"
        ) from cause

    # The one change to how legacy runs: `start()` would put `run()` on a thread whose signals need
    # an event loop to arrive. Run on this thread, every signal is a direct call, in the same order.
    for worker in (
        propagation_worker.SequenceInitWorker,
        propagation_worker.ReferenceAnnotationWorker,
        propagation_worker.PropagationWorker,
    ):
        worker.start = worker.run

    return types.SimpleNamespace(
        FileManager=FileManager,
        SegmentManager=SegmentManager,
        Sam2Model=Sam2Model,
        PropagationManager=PropagationManager,
        SequenceViewMode=SequenceViewMode,
        ViewReference=ViewReference,
        HeadlessWindow=headless_window_class(MainWindow),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--frames", required=True, type=pathlib.Path)
    parser.add_argument("--reference", required=True, action="append", type=parse_reference,
                        help="frame:class:mask.png -- repeat for several objects")
    parser.add_argument("--labeled", default="", type=parse_frames,
                        help="frames that already have annotations, for the Skip Labeled scenarios")
    parser.add_argument("--checkpoint", required=True, type=pathlib.Path)
    parser.add_argument("--out", required=True, type=pathlib.Path,
                        help="output path without a suffix: .json and .npz are written beside each other")
    parser.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD)
    args = parser.parse_args()

    # Everything that can be wrong with the inputs is checked BEFORE the model loads: a mistyped
    # frame number should cost a second, not a 2.4 GB load.
    if not args.checkpoint.is_file():
        raise SystemExit(f"no checkpoint at {args.checkpoint}")
    frames = frames_in(args.frames)
    pictures = [read_rgb(path) for path in frames]
    shape = pictures[0].shape[:2]
    masks: list[tuple[Reference, np.ndarray]] = []
    for reference in args.reference:
        if not 0 <= reference.frame < len(frames):
            raise SystemExit(f"reference frame {reference.frame} is outside {len(frames)} frames")
        mask = read_mask(reference.path)
        if mask.shape != pictures[reference.frame].shape[:2]:
            raise SystemExit(f"{reference.path} is {mask.shape}, frame {reference.frame} is "
                             f"{pictures[reference.frame].shape[:2]}")
        if not mask.any():
            raise SystemExit(f"{reference.path} selects no pixels")
        masks.append((reference, mask))
    reference_frames = {reference.frame for reference, _ in masks}
    for index in args.labeled:
        if not 0 <= index < len(frames):
            raise SystemExit(f"labelled frame {index} is outside {len(frames)} frames")
        if index in reference_frames:
            raise SystemExit(f"frame {index} is a reference; legacy never counts a reference as labelled")

    legacy = load_legacy()
    print(f"{len(frames)} frames, {len(masks)} object(s), threshold {args.threshold}")

    # `model_path` explicitly: letting legacy resolve its default downloads a 2.4 GB checkpoint
    # into the read-only worktree.
    model = legacy.Sam2Model(model_path=str(args.checkpoint))
    if not model.is_loaded:
        raise SystemExit("the legacy Sam2Model did not load the checkpoint")

    runs = {}
    for scenario in scenarios_for(args.labeled):
        print(f"\n{scenario.name}: keep flagged {scenario.keep_flagged}, skip labelled "
              f"{scenario.skip_labeled}, labelled {list(scenario.labeled)}")
        runs[scenario.name] = run_scenario(legacy, model, scenario, frames, masks, args.threshold, shape)
        record = runs[scenario.name]["record"]
        print(f"  timeline      {' '.join(status[:4] for status in record['timeline'])}")
        print(f"  after save    {' '.join(status[:4] for status in record['saveAll']['timeline'])}")
        print(f"  saved frames  {[write['frame'] for write in record['saveAll']['written']]}")

    model.cleanup_video_state()
    del model
    gc.collect()

    first = next(iter(runs.values()))["raw"]
    for name, run in runs.items():
        problem = same_answers(first, run["raw"])
        if problem:
            raise SystemExit(f"the model answered differently in {name}: {problem}. A golden needs one answer.")

    results, packed = model_results(first, reference_frames, args.threshold)
    print("\nper object:")
    for result in results:
        print(f"  frame {result['frame']:>3} obj {result['object']} {result['pass']:<8} "
              f"conf {result['confidence']:.4f} px {result['pixels']:>5}"
              f"{' EMPTY' if result['empty'] else ''}{' FLAGGED' if result['flagged'] else ''}")

    height, width = shape
    metadata = {
        "source": "legacy lazylabel sequence mode (MainWindow, SequenceViewMode, PropagationManager, "
                  "Sam2Model) at snapshot 2a7d5d8, run headless by capture_propagation_goldens.py",
        "captured": datetime.date.today().isoformat(),
        "checkpoint": args.checkpoint.name,
        "checkpointSha256": sha256_file(args.checkpoint),
        "environment": environment(),
        "threshold": args.threshold,
        "height": int(height),
        "width": int(width),
        "frames": [path.name for path in frames],
        "frameDigests": [pixel_digest(picture) for picture in pictures],
        "references": [
            {
                "frame": reference.frame,
                "object": number,
                "class": reference.class_id,
                "pixels": int(mask.sum()),
                "maskDigest": hashlib.sha256(pack(mask).tobytes()).hexdigest(),
            }
            for number, (reference, mask) in enumerate(masks, start=1)
        ],
        "direction": "both",
        "results": results,
        "scenarios": {name: run["record"] for name, run in runs.items()},
        "note": (
            "Masks are in the .npz beside this file as packed bits, one entry per 'frame:object', "
            "unpacked with np.unpackbits(...)[: height * width].reshape(height, width). Reference "
            "frames have no entry: legacy's engine skips them. An EMPTY mask is not a low-confidence "
            "one: RULE-060 drops it before the threshold check. Timelines list what the timeline "
            "widget last painted on each frame, 'pending' where it painted nothing."
        ),
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    json_path = args.out.with_suffix(".json")
    npz_path = args.out.with_suffix(".npz")
    json_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    np.savez_compressed(npz_path, **packed)

    flagged = sorted({r["frame"] for r in results if r["flagged"]})
    empty = sorted({r["frame"] for r in results if r["empty"]})
    print(f"\nwrote {json_path} and {npz_path} ({npz_path.stat().st_size / 1e3:.0f} kB): "
          f"{len(results)} object results, flagged frames {flagged}, empty on {empty}")
    if not flagged:
        # A golden where nothing is flagged cannot prove the flagging rule. Said rather than
        # failed: the capture is still valid, it just does not exercise RULE-060.
        print("NOTE: no frame was flagged, so this sequence does not exercise RULE-060's threshold.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
