"""The port against legacy's recorded propagation: Phase 6's exit criterion 2, the model's half.

`goldens/propagation/synthetic-shapes` is legacy's sequence mode, run headless by
`fixtures/capture_propagation_goldens.py` on the clip `fixtures/synthetic_clip.py` draws: two
tracked objects, the reference mid-clip, same-coloured decoys that make the model unsure in both
passes, and an object that leaves the picture. It records every object's mask and score on every
frame, and -- per scenario -- what legacy's window did with them.

Two halves, and neither needs the legacy app:

- WITHOUT A GPU, the golden is held to itself: it is of THIS clip (the frames regenerate to the
  pixel digests it recorded), its masks agree with its own records, and it still exercises what it
  exists for. A golden nobody can trust is worse than none, because it passes.
- WITH A SAM 2 CHECKPOINT (LAZYLABEL_TEST_CHECKPOINT), the port's runner on the regenerated clip
  must give legacy's masks within decision 10's IoU of 0.98, empty where legacy's were empty, and
  flag exactly the objects legacy flagged. This is the test that found the backward pass walking
  the wrong way on its first run: IoU 0.00 on frame 0.

The other half of the criterion -- which frames the timeline flags, what Keep Flagged Masks keeps,
what Skip Labeled leaves alone and what Save All writes -- is the web app's behaviour, and
`web/test/acceptance/c11.goldens.test.tsx` holds it against the same file.

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
GOLDEN = HERE / "goldens" / "propagation" / "synthetic-shapes"

sys.path.insert(0, str(HERE / "fixtures"))
import synthetic_clip  # noqa: E402 - the fixtures folder is not a package

CHECKPOINT = os.environ.get("LAZYLABEL_TEST_CHECKPOINT", "")
SIZE = os.environ.get("LAZYLABEL_TEST_CHECKPOINT_SIZE", "large")

#: Decision 10's tolerance for SAM masks.
IOU = 0.98
#: How close to Min Conf any score in the golden may sit. Flags are compared EXACTLY, so a score
#: this near the threshold could flip on another GPU for reasons that have nothing to do with the
#: port; the closest in this golden is frame 4's disc at 0.9956.
MARGIN = 0.005


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
    return synthetic_clip.render()


class TestTheGoldenItself:
    def test_it_is_of_the_clip_the_generator_draws(self, golden, clip) -> None:
        # Every comparison below regenerates the clip rather than reading committed frames, so this
        # is the check that the two are still the same pictures.
        assert golden["frames"] == [name for name, _ in clip.frames]
        assert golden["frameDigests"] == [synthetic_clip.digest(rgb) for _, rgb in clip.frames]

    def test_its_references_are_the_clip_s_own_drawing(self, golden, clip) -> None:
        drawn = clip.reference_masks()

        assert [(r["frame"], r["object"], r["class"]) for r in golden["references"]] == [
            (synthetic_clip.REFERENCE_FRAME, obj, synthetic_clip.CLASSES[obj]) for obj in sorted(drawn)
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
        another passes (Keep Flagged Masks' whole subject), an object that left the picture, and a
        labelled frame that would otherwise have been flagged.
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
        assert set(golden["scenarios"]["skip-labeled"]["labeled"]) & {r["frame"] for r in flagged}

    def test_no_score_sits_on_the_threshold(self, golden) -> None:
        threshold = golden["threshold"]
        for result in golden["results"]:
            if result["empty"]:
                continue
            assert abs(result["confidence"] - threshold) >= MARGIN, result


needs_the_model = [
    pytest.mark.skipif(
        not CHECKPOINT or not pathlib.Path(CHECKPOINT).is_file(),
        reason="set LAZYLABEL_TEST_CHECKPOINT to a SAM 2 checkpoint to run this",
    ),
    pytest.mark.skipif(importlib.util.find_spec("sam2") is None, reason="sam2 is not installed"),
]


@pytest.fixture(scope="module")
def ported(golden, clip, tmp_path_factory) -> dict[tuple[int, int], object]:
    """The port's runner on the regenerated clip, seeded with the golden's references."""
    import gc

    import torch
    from conftest import ensure_sam2_hydra
    from lazylabel_inference.backends import SAM2_CONFIGS
    from lazylabel_inference.propagation import PropagationRequest, ReferenceObject
    from lazylabel_inference.runner import run_propagation
    from sam2.build_sam import build_sam2_video_predictor

    # Legacy's Sam2Model, built by the differential suites earlier in the same process, clears the
    # Hydra registration sam2's builders need; `conftest.py` has the whole story.
    ensure_sam2_hydra()
    images = dict(clip.frames)
    names = [name for name, _ in clip.frames]
    drawn = clip.reference_masks()
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
            lambda key: images[key],
            request,
            list(objects),
            staging_root=tmp_path_factory.mktemp("staged"),
        )
    )
    del predictor
    gc.collect()
    return {(names.index(result.source), result.object_id): result for result in results}


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

    def test_the_same_objects_are_flagged(self, golden, ported) -> None:
        # The half of the criterion a user actually sees: which frames they are told to check.
        threshold = golden["threshold"]
        legacy = {(r["frame"], r["object"]) for r in golden["results"] if r["flagged"]}
        port = {
            key for key, result in ported.items()
            if np.asarray(result.mask).any() and result.confidence < threshold
            and key[0] not in {r["frame"] for r in golden["references"]}
        }

        assert port == legacy

    def test_every_score_is_legacy_s(self, golden, ported) -> None:
        """RULE-016's score, within what another GPU's arithmetic can move it.

        On the machine the golden was captured on the difference is exactly 0.0 for every object.
        The tolerance is for a different GPU, or a CPU, doing the same bfloat16 work. A port that
        scored differently -- the mean over every logit rather than the positive ones, say -- moves
        scores by far more than this and fails. A fifth of `MARGIN`, so no score that passes this
        can have crossed the threshold.
        """
        for r in golden["results"]:
            assert ported[(r["frame"], r["object"])].confidence == pytest.approx(
                r["confidence"], abs=MARGIN / 5
            ), f"frame {r['frame']} object {r['object']}"
