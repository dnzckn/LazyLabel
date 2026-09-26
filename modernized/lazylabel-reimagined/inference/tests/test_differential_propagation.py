"""Phase 3 exit criterion 2: propagation matches legacy's, frame for frame and flag for flag.

`test_propagation_live.py` runs the port against the real SAM 2 video predictor and proves the
staging layout and the index map are right. It does not prove the port agrees with LEGACY, which is
a different claim and the one the exit criterion actually makes: the same masks within tolerance,
and *the same frames flagged* at the 0.99 confidence threshold.

The second half is the one worth the setup. Confidence decides which frames a user is told to check
by hand, so a port that tracks the object perfectly but flags a different set of frames has changed
the feature in the way the user would actually notice.

Run it with:

    LAZYLABEL_TEST_CHECKPOINT=/path/to/sam2.1_hiera_large.pt \\
    PYTHONPATH=/path/to/legacy/lazylabel/src \\
    python -m pytest tests/test_differential_propagation.py -v

The sequence below is PNG, which both sides write again at quality 95. A JPEG they both hand SAM 2
as it is (`sam2_model.py:788-796`): until 2026-09-26 the port re-encoded it, and SAM 2 saw
recompressed pixels on a JPEG dataset (SEQUENCE_PARITY.md SP-08). `test_differential_staging.py`
compares the two stagings byte for byte for every format the service opens, and the
`synthetic-shapes-jpeg` golden holds the port to legacy's answers on a JPEG clip.
"""

from __future__ import annotations

import importlib.util
import os
import pathlib

import pytest

CHECKPOINT = os.environ.get("LAZYLABEL_TEST_CHECKPOINT", "")
SIZE = os.environ.get("LAZYLABEL_TEST_CHECKPOINT_SIZE", "large")

pytestmark = [
    pytest.mark.skipif(
        not CHECKPOINT or not pathlib.Path(CHECKPOINT).is_file(),
        reason="set LAZYLABEL_TEST_CHECKPOINT to a SAM 2 checkpoint to run this",
    ),
    pytest.mark.skipif(importlib.util.find_spec("sam2") is None, reason="sam2 is not installed"),
    pytest.mark.skipif(
        importlib.util.find_spec("lazylabel") is None,
        reason="put the legacy package on PYTHONPATH to compare against it",
    ),
]

HEIGHT, WIDTH = 96, 128
BOX = 40
STEP = 10
FRAMES = 6
SEED_POINT = [[30, 50]]  # inside the rectangle on frame 0
CONFIDENCE_THRESHOLD = 0.99  # RULE-016


def iou(a, b) -> float:
    import numpy as np

    a = np.asarray(a).astype(bool)
    b = np.asarray(b).astype(bool)
    union = (a | b).sum()
    return 1.0 if union == 0 else float((a & b).sum() / union)


@pytest.fixture(scope="module")
def frames():
    """A 40x40 rectangle sliding right by 10 pixels a frame, as (key, RGB array)."""
    import numpy as np

    images = []
    for index in range(FRAMES):
        frame = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
        left = 10 + index * STEP
        frame[30 : 30 + BOX, left : left + BOX] = (220, 60, 60)
        images.append((f"f{index:03d}.png", frame))
    return images


@pytest.fixture(scope="module")
def on_disk(frames, tmp_path_factory):
    """The same frames as PNG files, because legacy's entry point takes paths."""
    import cv2

    directory = tmp_path_factory.mktemp("source")
    paths = []
    for key, array in frames:
        path = directory / key
        assert cv2.imwrite(str(path), array[:, :, ::-1])
        paths.append(str(path))
    return paths


@pytest.fixture(scope="module")
def legacy_run(on_disk):
    """Legacy's propagation, run to completion and then unloaded.

    Sequential rather than side by side: two SAM 2 video predictors held at once is twice the
    weights for no benefit, and this way a machine that can run legacy can run the comparison.
    """
    import gc

    from lazylabel.models.sam2_model import Sam2Model

    import numpy as np

    model = Sam2Model(model_path=CHECKPOINT)
    assert model.is_loaded, "the legacy Sam2Model did not load the checkpoint"
    assert model.init_video_state(on_disk), "the legacy Sam2Model did not stage the sequence"

    seeded = model.add_video_points(
        frame_idx=0,
        obj_id=1,
        points=np.array(SEED_POINT, dtype=np.float32),
        labels=np.array([1], dtype=np.int32),
    )
    assert seeded is not None, "the legacy Sam2Model rejected the seed prompt"

    results = [
        (frame_idx, obj_id, mask, confidence)
        for frame_idx, obj_id, mask, confidence in model.propagate_in_video()
    ]

    model.cleanup_video_state()
    del model
    gc.collect()
    return results


@pytest.fixture(scope="module")
def port_run(frames, tmp_path_factory):
    import gc

    import numpy as np
    import torch
    from sam2.build_sam import build_sam2_video_predictor

    from conftest import ensure_sam2_hydra

    from lazylabel_inference.backends import SAM2_CONFIGS
    from lazylabel_inference.propagation import (
        initialise_state,
        propagate,
        seed_points,
        stage_sequence,
    )

    # Legacy has just run and left global Hydra cleared; see conftest.ensure_sam2_hydra.
    ensure_sam2_hydra()

    staged = stage_sequence(frames, tmp_path_factory.mktemp("staged"))
    predictor = build_sam2_video_predictor(
        SAM2_CONFIGS[SIZE], CHECKPOINT, device="cuda" if torch.cuda.is_available() else "cpu"
    )
    state = initialise_state(predictor, staged)
    predictor.reset_state(state)
    seed_points(
        predictor,
        state,
        staged,
        frame_index=0,
        object_id=1,
        points=np.array(SEED_POINT, dtype=np.float32),
        labels=np.array([1], dtype=np.int32),
    )

    results = list(propagate(predictor, state, staged))

    del predictor, state
    gc.collect()
    return staged, results


def test_the_same_number_of_frames_comes_back(legacy_run, port_run) -> None:
    _, ported = port_run
    assert len(ported) == len(legacy_run) == FRAMES


def test_every_mask_matches_legacy(legacy_run, port_run) -> None:
    _, ported = port_run

    for (frame_idx, _, legacy_mask, _), result in zip(legacy_run, ported):
        # An empty mask on both sides would score 1.0, so tracking has to be confirmed separately.
        assert legacy_mask.sum() > 0, f"frame {frame_idx}: legacy tracked nothing to compare against"
        overlap = iou(result.mask, legacy_mask)
        assert overlap >= 0.98, f"frame {frame_idx}: IoU {overlap:.4f} is below the 0.98 tolerance"


def test_every_confidence_matches_legacy(legacy_run, port_run) -> None:
    _, ported = port_run

    for (frame_idx, _, _, legacy_confidence), result in zip(legacy_run, ported):
        assert result.confidence == pytest.approx(legacy_confidence, abs=1e-6), (
            f"frame {frame_idx}: confidence {result.confidence} against legacy's {legacy_confidence}"
        )


def test_the_same_frames_are_flagged_at_the_threshold(legacy_run, port_run) -> None:
    """The half of the exit criterion that is about the USER, not the model.

    Confidence decides which frames a user is told to check by hand. Comparing the flagged SETS
    rather than the raw numbers is the assertion that matches what they experience: two ports could
    differ in the sixth decimal and still flag identically, or agree closely and straddle the
    threshold on one frame, and only the second is a behaviour change.
    """
    _, ported = port_run

    legacy_flagged = {
        frame_idx for frame_idx, _, _, confidence in legacy_run if confidence < CONFIDENCE_THRESHOLD
    }
    ported_flagged = {
        index
        for index, result in enumerate(ported)
        if result.confidence < CONFIDENCE_THRESHOLD
    }

    assert ported_flagged == legacy_flagged


def test_the_object_id_survives_on_both_sides(legacy_run, port_run) -> None:
    _, ported = port_run

    assert {obj_id for _, obj_id, _, _ in legacy_run} == {1}
    assert {result.object_id for result in ported} == {1}


def test_each_mask_is_attributed_to_the_image_it_came_from(frames, port_run) -> None:
    """Where the port and legacy differ by design rather than by tolerance.

    Legacy returns a bare frame index and the caller looks it up in `video_image_paths`, which holds
    every path it was given -- including any it failed to read and SKIPPED without writing a staged
    file (`sam2_model.py:801-802`). One unreadable frame therefore leaves a gap in the dense
    numbering while the path list keeps its length, and every frame after the gap is attributed to
    the wrong image. The port carries the source through the result instead, so there is no lookup
    to get wrong.
    """
    _, ported = port_run

    assert [result.source for result in ported] == [key for key, _ in frames]
