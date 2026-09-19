"""Phase 3 exit criterion 1: the ported backend matches legacy Sam2Model on the same prompts.

This is the only test here that needs a real checkpoint, and it skips itself cleanly without one,
so the ordinary suite stays dependency-free. Run it with:

    LAZYLABEL_TEST_CHECKPOINT=/path/to/sam2.1_hiera_large.pt \\
    LAZYLABEL_TEST_CHECKPOINT_SIZE=large \\
    PYTHONPATH=/path/to/legacy/lazylabel/src \\
    python -m pytest tests/test_differential_sam2.py -v

Decision 10 sets the tolerance at IoU >= 0.98 rather than exact equality, because GPU kernels are
not bit-reproducible. In practice both paths run the same weights through the same package, so the
masks come back identical and the tolerance is headroom rather than slack - the assertions report
the actual IoU either way, so a drift that stays inside the tolerance is still visible.

What is actually under test is not the model - it is ours only in the sense that we call it - but
the things around it that a port gets wrong: the order points are passed in, which candidate mask
is chosen, and how a failure is reported.
"""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path

import pytest

CHECKPOINT = os.environ.get("LAZYLABEL_TEST_CHECKPOINT", "")
SIZE = os.environ.get("LAZYLABEL_TEST_CHECKPOINT_SIZE", "large")

pytestmark = [
    pytest.mark.skipif(not CHECKPOINT or not Path(CHECKPOINT).is_file(),
                       reason="set LAZYLABEL_TEST_CHECKPOINT to a SAM 2 checkpoint to run this"),
    pytest.mark.skipif(importlib.util.find_spec("sam2") is None, reason="sam2 is not installed"),
    pytest.mark.skipif(importlib.util.find_spec("lazylabel") is None,
                       reason="put the legacy package on PYTHONPATH to compare against it"),
]


def iou(a, b) -> float:
    import numpy as np

    a = np.asarray(a).astype(bool)
    b = np.asarray(b).astype(bool)
    union = (a | b).sum()
    return 1.0 if union == 0 else float((a & b).sum() / union)


@pytest.fixture(scope="module")
def image():
    """A synthetic scene: two rectangles and a disc, so a click has something to find."""
    import numpy as np

    img = np.zeros((256, 320, 3), dtype=np.uint8)
    img[40:120, 30:140] = (200, 60, 60)
    img[150:230, 180:300] = (60, 200, 60)
    ys, xs = np.mgrid[0:256, 0:320]
    img[((ys - 80) ** 2 + (xs - 240) ** 2) < 35**2] = (60, 60, 220)
    return img


@pytest.fixture(scope="module")
def ported(image):
    from lazylabel_inference.backends import Sam2Backend, SAM2_CONFIGS
    from lazylabel_inference.manifest import ModelEntry

    import torch
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = build_sam2(SAM2_CONFIGS[SIZE], CHECKPOINT, device=device)
    entry = ModelEntry("test", "sam2", SIZE, Path(CHECKPOINT).name, "0" * 64, Path(CHECKPOINT).stat().st_size)
    backend = Sam2Backend(_entry=entry, _predictor=SAM2ImagePredictor(model))
    backend.set_image(image)
    return backend


@pytest.fixture(scope="module")
def legacy(image):
    from lazylabel.models.sam2_model import Sam2Model

    model = Sam2Model(CHECKPOINT)
    assert model.is_loaded, "the legacy Sam2Model did not load the checkpoint"
    assert model.set_image_from_array(image), "the legacy Sam2Model did not accept the image"
    return model


# Each case is a prompt both implementations must agree on. The negative-point and box cases are
# where an ordering or argument mistake in the port would show up.
POINT_CASES = [
    ("one point on the red rectangle", [(85, 80)], []),
    ("one point on the green rectangle", [(240, 190)], []),
    ("one point on the blue disc", [(240, 80)], []),
    ("two points on one rectangle", [(60, 60), (120, 100)], []),
    ("a positive with a negative beside it", [(85, 80)], [(240, 190)]),
    ("two positives and two negatives", [(85, 80), (60, 100)], [(240, 190), (240, 80)]),
]


@pytest.mark.parametrize(("label", "positive", "negative"), POINT_CASES, ids=[c[0] for c in POINT_CASES])
def test_point_prompts_match_legacy(ported, legacy, label, positive, negative):
    from lazylabel_inference.prompts import Point, Prompt

    legacy_result = legacy.predict(positive, negative)
    assert legacy_result is not None, "the legacy model returned None for a valid prompt"
    legacy_mask, legacy_score, _ = legacy_result

    prompt = Prompt(
        points=tuple(Point(x, y, True) for x, y in positive)
        + tuple(Point(x, y, False) for x, y in negative)
    )
    prediction = ported.predict(prompt)

    overlap = iou(prediction.mask, legacy_mask)
    assert overlap >= 0.98, f"{label}: IoU {overlap:.4f} is below the 0.98 tolerance"
    # The score comes straight from the model, so any difference means a different mask was chosen.
    assert prediction.score == pytest.approx(float(legacy_score), abs=1e-6)


def test_box_prompts_match_legacy(ported, legacy):
    from lazylabel_inference.prompts import Box, Prompt

    box = [30, 40, 140, 120]
    legacy_result = legacy.predict_from_box(box)
    assert legacy_result is not None
    legacy_mask, legacy_score, _ = legacy_result

    prediction = ported.predict(Prompt(box=Box(*box)))

    overlap = iou(prediction.mask, legacy_mask)
    assert overlap >= 0.98, f"box: IoU {overlap:.4f} is below the 0.98 tolerance"
    assert prediction.score == pytest.approx(float(legacy_score), abs=1e-6)


def test_the_ported_backend_picks_the_same_candidate(ported, legacy):
    """RULE-020: of the three candidates, the highest-scoring one wins.

    Legacy uses np.argmax, which takes the FIRST maximum on a tie. Asserting the chosen INDEX, not
    just the mask, catches a port that happens to agree on this image and would diverge on another.
    """
    import numpy as np
    from lazylabel_inference.prompts import Point, Prompt

    prediction = ported.predict(Prompt(points=(Point(85, 80),)))
    assert len(prediction.alternatives) == 3
    assert prediction.chosen == int(np.argmax(prediction.alternatives))
    assert prediction.score == max(prediction.alternatives)


def test_a_failure_is_an_error_here_and_a_none_in_legacy(ported, legacy):
    """Phase 3 exit criterion 4, shown as a difference rather than asserted in the abstract."""
    from lazylabel_inference.prompts import InvalidPromptError, Prompt

    # Legacy: an empty prompt is indistinguishable from a crash. Both are None.
    assert legacy.predict([], []) is None

    # Here it is a typed error saying what was wrong with the request.
    with pytest.raises(InvalidPromptError, match="at least one point or a box"):
        ported.predict(Prompt())
