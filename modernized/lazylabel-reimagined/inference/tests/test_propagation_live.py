"""Propagation against the real SAM 2 video predictor.

Skips itself without a checkpoint, like the prompt differential. Run it with:

    LAZYLABEL_TEST_CHECKPOINT=/path/to/sam2.1_hiera_large.pt python -m pytest tests/test_propagation_live.py -v

What this proves that the unit tests cannot: that the staging layout SAM 2's loader expects is the
one `stage_sequence` writes, and that the frame indices coming back resolve through the map to the
images they actually came from. A fake predictor yields whatever it is told to; only the real one
can disagree about the file naming.

The sequence is synthetic on purpose. A rectangle of known size sliding a known distance per frame
means the assertions can be exact -- a tracked mask is either the rectangle or it is not, with no
tolerance to hide behind.
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
]

HEIGHT, WIDTH = 96, 128
BOX = 40
STEP = 12
FRAMES = 6


@pytest.fixture(scope="module")
def sequence():
    """A 40x40 rectangle sliding right by 12 pixels a frame."""
    import numpy as np

    images = []
    for i in range(FRAMES):
        frame = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
        left = 10 + i * STEP
        frame[30 : 30 + BOX, left : left + BOX] = (220, 60, 60)
        images.append((f"frames/f{i:03d}.png", frame))
    return images


@pytest.fixture(scope="module")
def propagated(sequence, tmp_path_factory):
    import numpy as np
    import torch
    from sam2.build_sam import build_sam2_video_predictor

    from lazylabel_inference.backends import SAM2_CONFIGS
    from lazylabel_inference.propagation import propagate, stage_sequence

    staged = stage_sequence(sequence, tmp_path_factory.mktemp("staged"))

    predictor = build_sam2_video_predictor(
        SAM2_CONFIGS[SIZE], CHECKPOINT, device="cuda" if torch.cuda.is_available() else "cpu"
    )
    state = predictor.init_state(video_path=str(staged.directory))
    predictor.reset_state(state)

    # One click in the middle of the rectangle on the first frame.
    predictor.add_new_points_or_box(
        inference_state=state,
        frame_idx=0,
        obj_id=1,
        points=np.array([[30, 50]], dtype=np.float32),
        labels=np.array([1], dtype=np.int32),
    )

    return staged, list(propagate(predictor, state, staged))


def test_returns_one_result_per_frame(sequence, propagated) -> None:
    _, results = propagated
    assert len(results) == FRAMES


def test_each_mask_is_attributed_to_the_image_it_came_from(sequence, propagated) -> None:
    _, results = propagated

    # RULE-017's whole point, checked against the real loader rather than a fake: the file naming
    # `stage_sequence` writes has to be the one SAM 2 sorts, or these come back shifted.
    assert [result.source for result in results] == [key for key, _ in sequence]


def test_it_tracks_the_rectangle_exactly(propagated) -> None:
    import numpy as np

    _, results = propagated
    for index, result in enumerate(results):
        pixels = int(result.mask.sum())
        assert pixels == BOX * BOX, f"frame {index} matched {pixels} pixels, not {BOX * BOX}"

        xs = np.nonzero(result.mask)[1]
        assert int(xs.min()) == 10 + index * STEP, f"frame {index} found the box in the wrong place"


def test_every_frame_is_confident(propagated) -> None:
    _, results = propagated

    # An unambiguous rectangle on a black field should not be a marginal call. A low score here
    # would mean the confidence is not measuring what it is supposed to.
    assert all(result.confidence > 0.9 for result in results)
    assert all(0.0 <= result.confidence <= 1.0 for result in results)


def test_the_object_id_survives_the_round_trip(propagated) -> None:
    _, results = propagated
    assert {result.object_id for result in results} == {1}
