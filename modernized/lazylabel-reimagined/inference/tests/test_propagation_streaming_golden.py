"""Legacy's streaming mode, recorded, against the port: its windows, seams and overlaps.

`goldens/propagation/synthetic-shapes-streaming` is legacy's sequence mode run headless by
`fixtures/capture_propagation_goldens.py` on the synthetic clip drawn on to 34 frames, with the
reference on frame 12 and the Stream window set to 10 (`fixtures/synthetic_clip.py`, the variant of
the same name). 34 frames is more than the window, so legacy took its streaming path
(`propagation_manager.py:594-598`): every window is a SAM 2 state of its own, with the references
outside it staged beside its frames (`propagation_manager.py:987-1031`), and each window overlaps
the one before by five frames (RULE-026). Four windows run forward from the reference and two back.

SEQUENCE_PARITY.md SP-09, MEASURED. Legacy stages a window's outside references FIRST in both
directions and walks with no start frame (`propagation_manager.py:1016, 1062`), which SAM 2 takes
to be the earliest seeded frame: index 0, the reference. A reverse walk from index 0 processes
nothing (`sam2_video_predictor.py:571-576`). So legacy's second backward window stages
[12, 0-7], walks, and answers NOTHING, and frames 0-2, which no earlier window covered, stay
pending and are never written. The port stages the reference after a backward window's frames
and walks down from it (`runner.py:107-133, 497-502`), so it propagates them. That is the one
difference this golden is allowed to show about the windows, and the tests below pin both sides of
it: it is kept, per the parity audit's recommendation, and recorded for the owner.

Everything else must be legacy's: which frames each window stages, in which order, with which
bytes; and, with a checkpoint, every answer the port keeps -- mask, emptiness, flag and score --
against legacy's answer from the SAME window.

    LAZYLABEL_TEST_CHECKPOINT=/path/to/sam2.1_hiera_large.pt python -m pytest tests/test_propagation_streaming_golden.py
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import pathlib
import sys

import numpy as np
import pytest

HERE = pathlib.Path(__file__).parent
GOLDEN = HERE / "goldens" / "propagation" / "synthetic-shapes-streaming"

sys.path.insert(0, str(HERE / "fixtures"))
import synthetic_clip  # noqa: E402 - the fixtures folder is not a package

CHECKPOINT = os.environ.get("LAZYLABEL_TEST_CHECKPOINT", "")
SIZE = os.environ.get("LAZYLABEL_TEST_CHECKPOINT_SIZE", "large")
VARIANT = synthetic_clip.VARIANTS["synthetic-shapes-streaming"]

#: Decision 10's tolerance for SAM masks.
IOU = 0.98
#: As in `test_propagation_goldens.py`: a score this close to Min Conf could change its flag on
#: another PyTorch, so there flags are compared only away from it.
MARGIN = 0.005
#: The answers within MARGIN of Min Conf, as (window, frame, object).
NEAR_THRESHOLD = {(3, 22, 2), (3, 31, 2), (5, 10, 1)}
#: How far a score moved when this clip was captured in legacy's own venv as well (PyTorch 2.7.1
#: against the golden's 2.10), measured 2026-09-26: 0.0034 at most, with no flag and no empty
#: object changed, and the lowest mask IoU 0.9975.
ACROSS_PYTORCH = MARGIN

#: The frames of legacy's second backward window that no earlier window covered: SP-09's frames.
PENDING_IN_LEGACY = [0, 1, 2]


@pytest.fixture(scope="module")
def golden() -> dict:
    return json.loads(GOLDEN.with_suffix(".json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def masks(golden) -> dict[str, np.ndarray]:
    height, width = golden["height"], golden["width"]
    with np.load(GOLDEN.with_suffix(".npz")) as packed:
        return {
            key: np.unpackbits(packed[key])[: height * width].reshape(height, width).astype(bool)
            for key in packed.files
        }


@pytest.fixture(scope="module")
def clip() -> synthetic_clip.Clip:
    return synthetic_clip.render_variant(VARIANT)


def references_of(golden: dict) -> set[int]:
    return {reference["frame"] for reference in golden["references"]}


def port_windows(golden: dict):
    """The windows the port's runner runs for this clip, in its order, and each one's new frames."""
    from lazylabel_inference.propagation import PropagationRequest
    from lazylabel_inference.runner import _windows_for
    from lazylabel_inference.windows import novel_frames

    request = PropagationRequest(
        sequence=tuple(golden["frames"]),
        references=tuple(sorted(references_of(golden))),
        window=golden["window"],
    )
    windows = _windows_for(request)
    return windows, novel_frames(windows)


def first_window(golden: dict) -> dict[int, int]:
    """Frame -> the number, from 1, of the first window that covers it: the one whose answer the port keeps."""
    windows, novel = port_windows(golden)
    return {frame: number for number, fresh in enumerate(novel, start=1) for frame in fresh}


class TestTheGoldenItself:
    def test_it_is_of_the_clip_the_generator_draws(self, golden, clip) -> None:
        assert golden["frames"] == [name for name, _ in clip.frames]
        assert golden["frameDigests"] == [synthetic_clip.digest(rgb) for _, rgb in clip.frames]
        # PNG, and so staged by re-encoding: the frames' own bytes are never what SAM 2 reads here.
        assert all(name.endswith(".png") for name in golden["frames"])

    def test_its_references_are_the_clip_s_own_drawing(self, golden, clip) -> None:
        drawn = clip.reference_masks(VARIANT.reference)

        assert [(r["frame"], r["object"], r["class"]) for r in golden["references"]] == [
            (VARIANT.reference, obj, synthetic_clip.CLASSES[obj]) for obj in sorted(drawn)
        ]
        for reference in golden["references"]:
            packed = np.packbits(drawn[reference["object"]])
            assert reference["maskDigest"] == hashlib.sha256(packed.tobytes()).hexdigest()

    def test_every_result_has_its_mask_and_agrees_with_it(self, golden, masks) -> None:
        assert set(masks) == {f"{r['window']}:{r['frame']}:{r['object']}" for r in golden["results"]}
        for result in golden["results"]:
            mask = masks[f"{result['window']}:{result['frame']}:{result['object']}"]
            assert int(mask.sum()) == result["pixels"]
            assert result["empty"] == (result["pixels"] == 0)

    def test_it_says_what_it_was_captured_on(self, golden) -> None:
        environment = golden["environment"]

        assert {"python", "torch", "cuda", "device", "sam2", "opencv"} <= set(environment)
        assert environment["sam2"] == "2b90b9f5ceec907a1c18123530e92e794ad901a4"

    def test_legacy_took_its_streaming_path(self, golden) -> None:
        # One staging and one walk per window: legacy's streaming mode, not its full-context one,
        # which stages the clip once and walks it twice.
        assert golden["window"] == VARIANT.window == 10
        assert golden["streaming"] is True
        assert [walk["staging"] for walk in golden["walks"]] == list(range(len(golden["stagings"])))

    def test_its_windows_are_the_port_s_with_the_outside_references_first(self, golden) -> None:
        """RULE-026's windows as legacy walked them, against the port's plan for the same clip.

        Legacy stages each window as its outside references, in frame order, then its own frames
        (`propagation_manager.py:987-1016`). So each recorded staging is the port's window with
        the references it does not contain in front -- which is also the check that the port's
        windows are legacy's, frame for frame, on a real run rather than on arithmetic alone.
        """
        windows, _ = port_windows(golden)
        references = sorted(references_of(golden))

        assert len(windows) == len(golden["stagings"]) == 6
        for window, staging in zip(windows, golden["stagings"], strict=True):
            outside = [frame for frame in references if not window.start <= frame <= window.end]
            assert staging["frames"] == [*outside, *window.frames()], window
        assert [window.reverse for window in windows] == [False] * 4 + [True] * 2

    def test_the_answers_near_the_threshold_are_the_known_ones(self, golden) -> None:
        near = {
            (r["window"], r["frame"], r["object"])
            for r in golden["results"]
            if not r["empty"] and abs(r["confidence"] - golden["threshold"]) < MARGIN
        }

        assert near == NEAR_THRESHOLD

    def test_it_still_exercises_what_it_exists_for(self, golden) -> None:
        """A recapture that lost any of these would pass every comparison and prove less.

        Forward windows after the first, which stage the reference from outside; two backward
        windows; flagged and empty answers among those the port keeps; a backward window that
        legacy walks and gets nothing from (SP-09); and a frame the engine hands the window twice,
        from two windows (SP-36).
        """
        keeps = first_window(golden)
        kept = [r for r in golden["results"] if keeps.get(r["frame"]) == r["window"]]
        walks = golden["walks"]

        assert sum(1 for walk in walks if not walk["reverse"]) >= 2
        assert sum(1 for walk in walks if walk["reverse"]) >= 2
        assert any(r["flagged"] for r in kept)
        assert any(r["empty"] for r in kept)
        assert any(walk["reverse"] and not walk["frames"] for walk in walks)
        assert any(scenario.get("redelivered") for scenario in golden["scenarios"].values())


class TestLegacysSecondBackwardWindow:
    """SP-09's evidence: what legacy's own streaming mode did with the backward windows."""

    def test_it_stages_the_reference_first_and_walks_with_no_start(self, golden) -> None:
        # The layout the reading predicted (`propagation_manager.py:1016, 1062`): the outside
        # reference at index 0, a reverse walk, no start frame -- so SAM 2 starts at index 0.
        walk = golden["walks"][5]
        staging = golden["stagings"][walk["staging"]]

        assert walk["reverse"] is True
        assert walk["start"] is None
        assert staging["frames"] == [12, *range(0, 8)]

    def test_it_answers_nothing(self, golden) -> None:
        # SAM 2 does not walk backward from index 0 (`sam2_video_predictor.py:573-576`).
        assert golden["walks"][5]["frames"] == []
        assert not [r for r in golden["results"] if r["window"] == 6]

    def test_the_first_backward_window_does_answer(self, golden) -> None:
        # Its reference is inside it, at its top, so SAM 2's earliest seeded frame is where a
        # backward walk should start. Only the windows that stage the reference first go empty.
        walk = golden["walks"][4]

        assert walk["reverse"] is True
        assert walk["frames"] == [12, *range(11, 2, -1)]

    @pytest.mark.parametrize("scenario", ["defaults", "keep-flagged"])
    def test_its_new_frames_stay_pending_and_are_never_written(self, golden, scenario) -> None:
        record = golden["scenarios"][scenario]
        written = {write["frame"] for write in record["saveAll"]["written"]}

        for frame in PENDING_IN_LEGACY:
            assert record["timeline"][frame] == "pending"
            assert record["view"][frame] == "pending"
            assert record["saveAll"]["timeline"][frame] == "pending"
            assert str(frame) not in record["keptMasks"]
            assert str(frame) not in record["timelineConfidence"]
            assert frame not in written
            assert frame not in record["engine"]["propagated"] + record["engine"]["flagged"]
        assert PENDING_IN_LEGACY == [
            frame for frame, window in first_window(golden).items() if window == 6
        ]


class Recorder:
    """Stands in for SAM 2's video predictor, keeping the digests of every staging it is handed."""

    device = "cpu"

    def __init__(self) -> None:
        self.stagings: list[list[str]] = []

    def init_state(self, video_path, **_options):
        paths = sorted(pathlib.Path(video_path).glob("*.jpg"), key=lambda path: int(path.stem))
        self.stagings.append([hashlib.sha256(path.read_bytes()).hexdigest() for path in paths])
        return {}

    def add_new_mask(self, **kwargs):
        import torch

        return kwargs["frame_idx"], [kwargs["obj_id"]], torch.full((1, 1, 2, 2), 3.0)

    def propagate_in_video(self, **_kwargs):
        return iter(())


def write_clip(clip: synthetic_clip.Clip, root: pathlib.Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    for name, rgb in clip.frames:
        (root / name).write_bytes(synthetic_clip.encoded(rgb, ".png"))


def request_for(golden: dict, objects=()):
    from lazylabel_inference.propagation import PropagationRequest

    return PropagationRequest(
        sequence=tuple(golden["frames"]),
        references=tuple(sorted(references_of(golden))),
        objects=tuple(objects),
        window=golden["window"],
    )


@pytest.fixture(scope="module")
def staged(golden, clip, tmp_path_factory) -> list[list[str]]:
    """The digests of every staging the port's runner makes for the clip, window by window."""
    pytest.importorskip("cv2")
    pytest.importorskip("torch")
    import cv2

    from lazylabel_inference.propagation import ReferenceObject
    from lazylabel_inference.runner import run_propagation
    from lazylabel_inference.service import InferenceService

    if golden["environment"]["opencv"] != cv2.__version__:
        # A PNG frame is staged as OpenCV's JPEG of its pixels, so the bytes are the encoder's.
        # Measured 2026-09-26: OpenCV 4.12 and 5.0 write these identically, but nothing promises it.
        pytest.skip(f"the golden's staging is OpenCV {golden['environment']['opencv']}'s, this is {cv2.__version__}")
    root = tmp_path_factory.mktemp("dataset")
    write_clip(clip, root)
    mask = np.zeros((golden["height"], golden["width"]), dtype=np.uint8)
    mask[:4, :4] = 1
    recorder = Recorder()
    list(
        run_propagation(
            recorder,
            InferenceService(models=[], model_dir=root, dataset_root=root).read_frame,
            request_for(golden),
            [ReferenceObject(frame=VARIANT.reference, object_id=1, mask=mask)],
            staging_root=tmp_path_factory.mktemp("staged"),
        )
    )
    return recorder.stagings


class TestTheStagingAgainstLegacys:
    """The files each window hands SAM 2, against legacy's recorded digests, without a model."""

    def legacy(self, golden) -> list[list[str]]:
        return [[entry["sha256"] for entry in staging["staged"]] for staging in golden["stagings"]]

    def test_every_forward_window_and_the_first_backward_one_stage_legacy_s_files(
        self, golden, staged
    ) -> None:
        # Byte for byte and in legacy's order, the prepended reference included.
        assert len(staged) == len(golden["stagings"])
        for number in range(5):
            assert staged[number] == self.legacy(golden)[number], f"window {number + 1}"

    def test_the_second_backward_window_stages_the_same_files_with_the_reference_last(
        self, golden, staged
    ) -> None:
        # SP-09's one staging difference: the same eight frames and the same reference, but the
        # reference goes after the frames, where a walk down from it covers them.
        theirs = self.legacy(golden)[5]

        assert staged[5] == [*theirs[1:], theirs[0]]


needs_the_model = [
    pytest.mark.skipif(
        not CHECKPOINT or not pathlib.Path(CHECKPOINT).is_file(),
        reason="set LAZYLABEL_TEST_CHECKPOINT to a SAM 2 checkpoint to run this",
    ),
    pytest.mark.skipif(importlib.util.find_spec("sam2") is None, reason="sam2 is not installed"),
]


@pytest.fixture(scope="module")
def ported(golden, clip, tmp_path_factory) -> dict[tuple[int, int, int], object]:
    """The port's runner on the clip, windowed as legacy windowed it, keyed (window, frame, object).

    Each answer is keyed by the window the port keeps it from: the first that covers its frame.
    """
    import gc

    import torch
    from conftest import ensure_sam2_hydra
    from lazylabel_inference.backends import SAM2_CONFIGS
    from lazylabel_inference.propagation import ReferenceObject
    from lazylabel_inference.runner import run_propagation
    from lazylabel_inference.service import InferenceService
    from sam2.build_sam import build_sam2_video_predictor

    root = tmp_path_factory.mktemp("dataset")
    write_clip(clip, root)
    ensure_sam2_hydra()
    drawn = clip.reference_masks(VARIANT.reference)
    objects = [
        ReferenceObject(frame=r["frame"], object_id=r["object"], mask=drawn[r["object"]])
        for r in golden["references"]
    ]
    predictor = build_sam2_video_predictor(
        SAM2_CONFIGS[SIZE], CHECKPOINT, device="cuda" if torch.cuda.is_available() else "cpu"
    )
    results = list(
        run_propagation(
            predictor,
            InferenceService(models=[], model_dir=root, dataset_root=root).read_frame,
            request_for(golden, objects),
            objects,
            staging_root=tmp_path_factory.mktemp("staged"),
        )
    )
    del predictor
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    keeps = first_window(golden)
    names = golden["frames"]
    by_key: dict[tuple[int, int, int], object] = {}
    for result in results:
        frame = names.index(result.source)
        key = (keeps[frame], frame, result.object_id)
        assert key not in by_key, f"the port answered {key} twice"
        by_key[key] = result
    return by_key


def same_pytorch(golden: dict) -> tuple[bool, str]:
    import torch

    captured = golden["environment"]["torch"]
    minor = lambda version: ".".join(version.split("+")[0].split(".")[:2])  # noqa: E731
    if minor(captured) != minor(torch.__version__):
        return False, f"the golden's masks are PyTorch {captured}'s and this is {torch.__version__}"
    return True, ""


def iou(a, b) -> float:
    a, b = np.asarray(a).astype(bool), np.asarray(b).astype(bool)
    union = (a | b).sum()
    return 1.0 if union == 0 else float((a & b).sum() / union)


def compared(golden: dict, ported: dict) -> list[dict]:
    """Legacy's answers that the port also keeps: the same window, frame and object."""
    references = references_of(golden)
    return [
        r for r in golden["results"]
        if r["frame"] not in references and (r["window"], r["frame"], r["object"]) in ported
    ]


class TestThePortAgainstIt:
    pytestmark = needs_the_model

    def test_it_keeps_legacy_s_answer_from_the_same_window_for_every_frame_legacy_answers(
        self, golden, ported
    ) -> None:
        # Every frame legacy's engine can hand its window, the port answers from the window whose
        # answer it keeps -- the first to cover the frame -- and legacy has that window's answer.
        keeps = first_window(golden)
        references = references_of(golden)
        legacy = {
            (r["window"], r["frame"], r["object"])
            for r in golden["results"]
            if keeps.get(r["frame"]) == r["window"]
        }
        port = {key for key in ported if key[1] not in references and key[0] != 6}

        assert port == legacy

    def test_every_mask_is_within_decision_10(self, golden, masks, ported) -> None:
        same, why = same_pytorch(golden)
        if not same:
            pytest.skip(why)
        worst = min(
            (iou(ported[(r["window"], r["frame"], r["object"])].mask,
                 masks[f"{r['window']}:{r['frame']}:{r['object']}"]), r["window"], r["frame"], r["object"])
            for r in compared(golden, ported)
        )
        assert worst[0] >= IOU, f"window {worst[1]} frame {worst[2]} object {worst[3]}: IoU {worst[0]:.4f}"

    def test_the_same_objects_come_back_empty(self, golden, ported) -> None:
        answers = compared(golden, ported)
        legacy = {(r["window"], r["frame"], r["object"]) for r in answers if r["empty"]}
        port = {
            (r["window"], r["frame"], r["object"]) for r in answers
            if not np.asarray(ported[(r["window"], r["frame"], r["object"])].mask).any()
        }

        assert port == legacy

    def test_the_same_objects_are_flagged(self, golden, ported) -> None:
        same, _ = same_pytorch(golden)
        fragile = set() if same else NEAR_THRESHOLD
        threshold = golden["threshold"]
        answers = [r for r in compared(golden, ported) if (r["window"], r["frame"], r["object"]) not in fragile]
        legacy = {(r["window"], r["frame"], r["object"]) for r in answers if r["flagged"]}
        port = set()
        for r in answers:
            result = ported[(r["window"], r["frame"], r["object"])]
            if np.asarray(result.mask).any() and result.confidence < threshold:
                port.add((r["window"], r["frame"], r["object"]))

        assert port == legacy

    def test_every_score_is_legacy_s(self, golden, ported) -> None:
        same, _ = same_pytorch(golden)
        tolerance = 1e-4 if same else ACROSS_PYTORCH
        for r in compared(golden, ported):
            assert ported[(r["window"], r["frame"], r["object"])].confidence == pytest.approx(
                r["confidence"], abs=tolerance
            ), f"window {r['window']} frame {r['frame']} object {r['object']}"

    def test_it_propagates_the_frames_legacy_leaves_pending(self, golden, ported) -> None:
        """SP-09, kept: the port's second backward window answers the frames legacy's cannot.

        Legacy's walk for that window returned nothing, and its timeline leaves frames 0-2 pending
        in every scenario (`TestLegacysSecondBackwardWindow`). The port answers every object on
        each of them, from that window, and nothing else of that window: its other frames were
        answered by the first backward window, whose answers are legacy's.
        """
        from_the_second_backward_window = {key for key in ported if key[0] == 6}

        assert from_the_second_backward_window == {
            (6, frame, reference["object"])
            for frame in PENDING_IN_LEGACY
            for reference in golden["references"]
        }
