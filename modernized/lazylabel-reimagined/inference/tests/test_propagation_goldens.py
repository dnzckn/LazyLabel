"""The port against legacy's recorded propagation: Phase 6's exit criterion 2, the model's half.

`goldens/propagation/synthetic-shapes` is legacy's sequence mode, run headless by
`fixtures/capture_propagation_goldens.py` on the clip `fixtures/synthetic_clip.py` draws: two
tracked objects, the reference mid-clip, same-coloured decoys that make the model unsure in both
passes, and an object that leaves the picture. It records every object's mask and score on every
frame, and -- per scenario -- what legacy's window did with them.

`synthetic-shapes-jpeg` is the same clip stored as JPEG (SEQUENCE_PARITY.md SP-08). Legacy hands
SAM 2 a JPEG's own file and writes anything else again at quality 95 (`sam2_model.py:788-803`), so
only a JPEG clip can show whether the port does the same. Until 2026-09-26 it did not: it decoded
and re-encoded every frame. Measured on this golden, that moved scores by up to 0.141, put the
square's mask on its same-coloured decoy on frames 0-3 (IoU 0.00 against legacy's on frame 0), and
flagged frames 2 and 3, which legacy does not; staging the files themselves gives legacy's answers
exactly. Both goldens are legacy's full-context mode, the whole clip in one SAM 2 state; the
streaming golden, answered per window, is `test_propagation_streaming_golden.py`'s.

Two halves, and neither needs the legacy app:

- WITHOUT A GPU, each golden is held to itself: it is of THIS clip (the frames regenerate to the
  digests it recorded), its masks agree with its own records, and it still exercises what it
  exists for. A golden nobody can trust is worse than none, because it passes.
- WITH A SAM 2 CHECKPOINT (LAZYLABEL_TEST_CHECKPOINT), the port's runner on the regenerated clip,
  read through the service as a propagation job reads it, must give legacy's masks within decision
  10's IoU of 0.98, empty where legacy's were empty, and flag exactly the objects legacy flagged.
  This is the test that found the backward pass walking the wrong way on its first run: IoU 0.00
  on frame 0.

The other half of the criterion -- which frames the timeline flags, what Keep Flagged Masks keeps,
what Skip Labeled leaves alone and what Save All writes -- is the web app's behaviour, and
`web/test/acceptance/c11.goldens.test.tsx` holds it against the same files.

    LAZYLABEL_TEST_CHECKPOINT=/path/to/sam2.1_hiera_large.pt python -m pytest tests/test_propagation_goldens.py
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
GOLDENS = HERE / "goldens" / "propagation"

sys.path.insert(0, str(HERE / "fixtures"))
import synthetic_clip  # noqa: E402 - the fixtures folder is not a package

CHECKPOINT = os.environ.get("LAZYLABEL_TEST_CHECKPOINT", "")
SIZE = os.environ.get("LAZYLABEL_TEST_CHECKPOINT_SIZE", "large")

#: Legacy's full-context goldens: the whole clip in one SAM 2 state.
FULL_CONTEXT = ("synthetic-shapes", "synthetic-shapes-jpeg")

#: Decision 10's tolerance for SAM masks.
IOU = 0.98
#: How close to Min Conf a score may sit before its flag could flip on another GPU or PyTorch for
#: reasons that have nothing to do with the port. Flags are compared exactly on the PyTorch a golden
#: was captured on, and away from the threshold everywhere else.
MARGIN = 0.005

#: The scores within MARGIN of Min Conf, per golden, as (frame, object). Named, so a recapture that
#: moves another score into the band is noticed rather than making a flag fragile unannounced.
NEAR_THRESHOLD = {
    "synthetic-shapes": set(),
    # Frame 4's disc at 0.9872, where the blue decoy crosses the square.
    "synthetic-shapes-jpeg": {(4, 1)},
}

#: How far a score may move on another PyTorch. Measured 2026-09-26 by capturing each clip in
#: legacy's own venv (PyTorch 2.7.1) as well as the golden's (2.10): at most 0.0009 on the PNG clip
#: and 0.0030 on the JPEG one. No flag, and no empty object, moved on either.
ACROSS_PYTORCH = {"synthetic-shapes": MARGIN / 2, "synthetic-shapes-jpeg": MARGIN}


@pytest.fixture(scope="module", params=FULL_CONTEXT)
def name(request) -> str:
    return request.param


def load_golden(name: str) -> dict:
    return json.loads((GOLDENS / f"{name}.json").read_text(encoding="utf-8"))


def load_masks(golden: dict, name: str) -> dict[str, np.ndarray]:
    height, width = golden["height"], golden["width"]
    with np.load(GOLDENS / f"{name}.npz") as packed:
        return {
            key: np.unpackbits(packed[key])[: height * width].reshape(height, width).astype(bool)
            for key in packed.files
        }


@pytest.fixture(scope="module")
def golden(name) -> dict:
    return load_golden(name)


@pytest.fixture(scope="module")
def masks(golden, name) -> dict[str, np.ndarray]:
    return load_masks(golden, name)


@pytest.fixture(scope="module")
def variant(name) -> synthetic_clip.Variant:
    return synthetic_clip.VARIANTS[name]


@pytest.fixture(scope="module")
def clip(variant) -> synthetic_clip.Clip:
    return synthetic_clip.render_variant(variant)


def files_of(clip: synthetic_clip.Clip, variant: synthetic_clip.Variant) -> list[tuple[str, bytes]]:
    """The frames as the files the golden was captured from, written the way the generator writes them."""
    return [
        (name, synthetic_clip.encoded(rgb, pathlib.PurePath(name).suffix, variant.quality))
        for name, rgb in clip.frames
    ]


def not_regenerated(golden: dict, files: list[tuple[str, bytes]]) -> str | None:
    """Why this OpenCV cannot write the golden's files byte for byte, or None when it does.

    Only goldens that record their files can say: a JPEG's bytes are its encoder's, and another
    OpenCV may choose others, which would make every comparison below one of a different clip.
    """
    recorded = golden.get("fileDigests")
    if recorded is None:
        return None
    if recorded != [hashlib.sha256(data).hexdigest() for _, data in files]:
        import cv2

        return (
            f"OpenCV {cv2.__version__} does not write the golden's files byte for byte (it was "
            f"captured with {golden['environment'].get('opencv', 'an unrecorded version')})"
        )
    return None


def decoded(data: bytes) -> np.ndarray:
    import cv2

    return cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)[:, :, ::-1]


class TestTheGoldenItself:
    def test_it_is_of_the_clip_the_generator_draws(self, golden, clip, variant) -> None:
        # Every comparison below regenerates the clip rather than reading committed frames, so this
        # is the check that the two are still the same pictures -- and, for a JPEG, the same files.
        files = files_of(clip, variant)
        assert golden["frames"] == [name for name, _ in clip.frames]
        why = not_regenerated(golden, files)
        assert why is None, why
        assert golden["frameDigests"] == [synthetic_clip.digest(decoded(data)) for _, data in files]

    def test_its_references_are_the_clip_s_own_drawing(self, golden, clip, variant) -> None:
        drawn = clip.reference_masks(variant.reference)

        assert [(r["frame"], r["object"], r["class"]) for r in golden["references"]] == [
            (variant.reference, obj, synthetic_clip.CLASSES[obj]) for obj in sorted(drawn)
        ]
        for reference in golden["references"]:
            packed = np.packbits(drawn[reference["object"]])
            assert reference["maskDigest"] == hashlib.sha256(packed.tobytes()).hexdigest()

    def test_every_result_has_its_mask_and_agrees_with_it(self, golden, masks) -> None:
        assert set(masks) == {f"{r['frame']}:{r['object']}" for r in golden["results"]}
        for result in golden["results"]:
            mask = masks[f"{result['frame']}:{result['object']}"]
            assert int(mask.sum()) == result["pixels"]
            assert result["empty"] == (result["pixels"] == 0)

    def test_it_still_exercises_what_it_exists_for(self, golden) -> None:
        """A recapture that flagged nothing would still pass every comparison, and prove nothing.

        So the branches are pinned: a flag in each pass, a frame where one object fails while
        another passes (Keep Flagged Masks' whole subject), and an object that left the picture.
        """
        results = golden["results"]
        flagged = [r for r in results if r["flagged"]]

        assert {r["pass"] for r in flagged} == {"forward", "backward"}
        partial = {
            r["frame"] for r in flagged
            if any(o["frame"] == r["frame"] and not o["flagged"] and not o["empty"] for o in results)
        }
        assert partial, "no frame where one object fails and another passes"
        assert any(r["empty"] for r in results)

    def test_it_says_what_it_was_captured_on(self, golden) -> None:
        # Without it the mask comparison can only skip: SAM 2's answer moves with PyTorch, and a
        # golden that does not say which one it came from cannot be compared with any.
        environment = golden["environment"]

        assert {"python", "torch", "cuda", "device", "sam2"} <= set(environment)
        assert environment["sam2"] == "2b90b9f5ceec907a1c18123530e92e794ad901a4"

    def test_the_scores_near_the_threshold_are_the_known_ones(self, golden, name) -> None:
        threshold = golden["threshold"]
        near = {
            (r["frame"], r["object"])
            for r in golden["results"]
            if not r["empty"] and abs(r["confidence"] - threshold) < MARGIN
        }

        assert near == NEAR_THRESHOLD[name]


class TestTheFirstGolden:
    def test_a_labelled_frame_is_one_that_would_otherwise_be_flagged(self) -> None:
        # Skip Labeled's scenarios are this golden's alone, and they prove nothing unless a frame
        # they protect is one the run would have flagged.
        golden = load_golden("synthetic-shapes")
        flagged = {r["frame"] for r in golden["results"] if r["flagged"]}

        assert set(golden["scenarios"]["skip-labeled"]["labeled"]) & flagged


class TestTheJpegGolden:
    """SP-08's evidence, recorded from legacy and held to the port without a model."""

    def golden(self) -> dict:
        return load_golden("synthetic-shapes-jpeg")

    def files(self) -> list[tuple[str, bytes]]:
        variant = synthetic_clip.VARIANTS["synthetic-shapes-jpeg"]
        return files_of(synthetic_clip.render_variant(variant), variant)

    def test_every_frame_is_a_jpeg_file(self) -> None:
        assert all(name.endswith(".jpg") for name in self.golden()["frames"])

    def test_legacy_handed_sam2_the_files_themselves(self) -> None:
        # Measured, not read: every file legacy's staging put in front of SAM 2 has the digest of
        # the frame's own file. Linked or copied -- on Windows without the privilege to link, it
        # copies (`sam2_model.py:790-796`) -- the bytes are the file's.
        golden = self.golden()
        (staging,) = golden["stagings"]

        assert staging["frames"] == list(range(len(golden["frames"])))
        assert [staged["sha256"] for staged in staging["staged"]] == golden["fileDigests"]

    def test_the_port_stages_the_same_files(self, tmp_path: pathlib.Path) -> None:
        """The port's staging of the clip, through the service's reader, against legacy's recorded one.

        Until 2026-09-26 every frame here was a re-encode at quality 95, and none matched.
        """
        pytest.importorskip("cv2")
        pytest.importorskip("torch")
        golden = self.golden()
        files = self.files()
        why = not_regenerated(golden, files)
        if why is not None:
            pytest.skip(why)

        staged = stage_through_the_service(golden, files, tmp_path)

        assert [hashlib.sha256(data).hexdigest() for data in staged] == [
            entry["sha256"] for entry in golden["stagings"][0]["staged"]
        ]


def stage_through_the_service(golden: dict, files: list[tuple[str, bytes]], tmp_path: pathlib.Path) -> list[bytes]:
    """What the port hands SAM 2 for a golden's clip: the service's reader, the runner, the staging."""
    from lazylabel_inference.propagation import PropagationRequest, ReferenceObject
    from lazylabel_inference.runner import run_propagation
    from lazylabel_inference.service import InferenceService

    class Recorder:
        device = "cpu"
        staged: list[bytes] = []

        def init_state(self, video_path, **_options):
            paths = sorted(pathlib.Path(video_path).glob("*.jpg"), key=lambda path: int(path.stem))
            Recorder.staged = [path.read_bytes() for path in paths]
            return {}

        def add_new_mask(self, **kwargs):
            import torch

            return kwargs["frame_idx"], [kwargs["obj_id"]], torch.full((1, 1, 2, 2), 3.0)

        def propagate_in_video(self, **_kwargs):
            return iter(())

    root = tmp_path / "dataset"
    root.mkdir()
    for name, data in files:
        (root / name).write_bytes(data)
    reference = golden["references"][0]["frame"]
    mask = np.zeros((golden["height"], golden["width"]), dtype=np.uint8)
    mask[:4, :4] = 1
    list(
        run_propagation(
            Recorder(),
            InferenceService(models=[], model_dir=root, dataset_root=root).read_frame,
            PropagationRequest(sequence=tuple(golden["frames"]), references=(reference,)),
            [ReferenceObject(frame=reference, object_id=1, mask=mask)],
            staging_root=tmp_path / "staged",
        )
    )
    return Recorder.staged


needs_the_model = [
    pytest.mark.skipif(
        not CHECKPOINT or not pathlib.Path(CHECKPOINT).is_file(),
        reason="set LAZYLABEL_TEST_CHECKPOINT to a SAM 2 checkpoint to run this",
    ),
    pytest.mark.skipif(importlib.util.find_spec("sam2") is None, reason="sam2 is not installed"),
]


@pytest.fixture(scope="module")
def ported(golden, clip, variant, tmp_path_factory) -> dict[tuple[int, int], object]:
    """The port's runner on the regenerated clip, seeded with the golden's references.

    The frames are read as a propagation job reads them, through the service's `read_frame`, so
    what SAM 2 is handed is what production hands it: a JPEG's own file, anything else written again.
    """
    import gc

    import torch
    from conftest import ensure_sam2_hydra
    from lazylabel_inference.backends import SAM2_CONFIGS
    from lazylabel_inference.propagation import PropagationRequest, ReferenceObject
    from lazylabel_inference.runner import run_propagation
    from lazylabel_inference.service import InferenceService
    from sam2.build_sam import build_sam2_video_predictor

    files = files_of(clip, variant)
    why = not_regenerated(golden, files)
    if why is not None:
        pytest.skip(why)
    root = tmp_path_factory.mktemp("dataset")
    for file_name, data in files:
        (root / file_name).write_bytes(data)

    # Legacy's Sam2Model, built by the differential suites earlier in the same process, clears the
    # Hydra registration sam2's builders need; `conftest.py` has the whole story.
    ensure_sam2_hydra()
    names = [file_name for file_name, _ in clip.frames]
    drawn = clip.reference_masks(variant.reference)
    objects = tuple(
        ReferenceObject(frame=r["frame"], object_id=r["object"], mask=drawn[r["object"]])
        for r in golden["references"]
    )
    request = PropagationRequest(
        sequence=tuple(names),
        references=tuple(sorted({r["frame"] for r in golden["references"]})),
        objects=objects,
    )
    predictor = build_sam2_video_predictor(
        SAM2_CONFIGS[SIZE], CHECKPOINT, device="cuda" if torch.cuda.is_available() else "cpu"
    )
    results = list(
        run_propagation(
            predictor,
            InferenceService(models=[], model_dir=root, dataset_root=root).read_frame,
            request,
            list(objects),
            staging_root=tmp_path_factory.mktemp("staged"),
        )
    )
    del predictor
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return {(names.index(result.source), result.object_id): result for result in results}


def same_pytorch(golden: dict) -> tuple[bool, str]:
    """Whether this is the PyTorch the golden was captured on, to the minor version, and why not.

    SAM 2's answer moves with PyTorch where the model is unsure. Measured 2026-09-23 on this clip:
    2.10 against 2.7.1 moved 8 of 46 masks slightly and one -- frame 1's square, where it touches its
    same-coloured decoy -- to IoU 0.93, while every flag and empty object stayed the same and no
    score moved by more than 0.0009. So the golden's masks, and its scores to four decimals, are
    compared only on its own PyTorch; across versions, `test_differential_propagation.py` holds the
    masks to legacy by running both on the same one.
    """
    import torch

    captured = golden.get("environment", {}).get("torch")
    if captured is None:
        return False, "the golden does not record the PyTorch it was captured on"
    minor = lambda version: ".".join(version.split("+")[0].split(".")[:2])  # noqa: E731
    if minor(captured) != minor(torch.__version__):
        return False, f"the golden's masks are PyTorch {captured}'s and this is {torch.__version__}"
    return True, ""


def iou(a: np.ndarray, b: np.ndarray) -> float:
    a, b = np.asarray(a).astype(bool), np.asarray(b).astype(bool)
    union = (a | b).sum()
    return 1.0 if union == 0 else float((a & b).sum() / union)


class TestThePortAgainstIt:
    pytestmark = needs_the_model

    def test_every_object_on_every_frame_comes_back(self, golden, ported) -> None:
        references = {r["frame"] for r in golden["references"]}
        answered = {key for key in ported if key[0] not in references}

        assert answered == {(r["frame"], r["object"]) for r in golden["results"]}

    def test_every_mask_is_within_decision_10(self, golden, masks, ported) -> None:
        same, why = same_pytorch(golden)
        if not same:
            pytest.skip(why)
        worst = min(
            (iou(ported[(r["frame"], r["object"])].mask, masks[f"{r['frame']}:{r['object']}"]),
             r["frame"], r["object"])
            for r in golden["results"]
        )
        assert worst[0] >= IOU, f"frame {worst[1]} object {worst[2]}: IoU {worst[0]:.4f}"

    def test_the_same_objects_come_back_empty(self, golden, ported) -> None:
        # RULE-060 treats an empty mask as no answer at all, so an object the port loses where
        # legacy kept it is a different timeline, not a small difference.
        legacy = {(r["frame"], r["object"]) for r in golden["results"] if r["empty"]}
        port = {key for key, result in ported.items() if not np.asarray(result.mask).any()}

        assert port == legacy

    def test_the_same_objects_are_flagged(self, golden, ported, name) -> None:
        # The half of the criterion a user actually sees: which frames they are told to check.
        # Exactly on the golden's own PyTorch; elsewhere, away from the threshold.
        threshold = golden["threshold"]
        same, _ = same_pytorch(golden)
        fragile = set() if same else NEAR_THRESHOLD[name]
        references = {r["frame"] for r in golden["references"]}
        legacy = {(r["frame"], r["object"]) for r in golden["results"] if r["flagged"]} - fragile
        port = {
            key for key, result in ported.items()
            if np.asarray(result.mask).any() and result.confidence < threshold
            and key[0] not in references
        } - fragile

        assert port == legacy

    def test_every_score_is_legacy_s(self, golden, ported, name) -> None:
        """RULE-016's score: to 1e-4 on the golden's own PyTorch, and within what another moves it.

        On the machine and PyTorch the golden was captured on, the difference is exactly 0.0 for
        every object. Another PyTorch moves scores slightly (`ACROSS_PYTORCH`). A port that scored
        differently -- the mean over every logit rather than the positive ones, say -- or that fed
        SAM 2 other pixels, as the JPEG re-encode did, moves scores by far more and fails.
        """
        same, _ = same_pytorch(golden)
        tolerance = 1e-4 if same else ACROSS_PYTORCH[name]
        for r in golden["results"]:
            assert ported[(r["frame"], r["object"])].confidence == pytest.approx(
                r["confidence"], abs=tolerance
            ), f"frame {r['frame']} object {r['object']}"
