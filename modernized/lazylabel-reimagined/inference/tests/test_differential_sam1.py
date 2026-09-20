"""Phase 3 exit criterion 1, the other half: the ported backend matches legacy `SamModel`.

The SAM 2 half lives in `test_differential_sam2.py`. This is the same comparison against the other
family, and it is worth running separately rather than folding in: the two legacy wrappers are
different classes, and a port that happened to agree with one could still disagree with the other.

Run it with:

    LAZYLABEL_TEST_SAM1_CHECKPOINT=/path/to/sam_vit_h_4b8939.pth \\
    PYTHONPATH=/path/to/legacy/lazylabel/src \\
    python -m pytest tests/test_differential_sam1.py -v

Decision 10 sets the tolerance at IoU >= 0.98 rather than exact equality, because GPU kernels are
not bit-reproducible. In practice both paths run the same weights through the same package, so the
masks come back identical and the tolerance is headroom -- the assertions report the actual IoU
either way, so drift inside it is still visible.

What is under test is not the model. It is the things a port gets wrong around one: the ORDER
points are passed in, which of the three candidates is chosen, and whether a failure is reported or
swallowed.
"""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path

import pytest

CHECKPOINT = os.environ.get("LAZYLABEL_TEST_SAM1_CHECKPOINT", "")
VARIANT = os.environ.get("LAZYLABEL_TEST_SAM1_VARIANT", "vit_h")

pytestmark = [
    pytest.mark.skipif(
        not CHECKPOINT or not Path(CHECKPOINT).is_file(),
        reason="set LAZYLABEL_TEST_SAM1_CHECKPOINT to a SAM 1 checkpoint to run this",
    ),
    pytest.mark.skipif(
        importlib.util.find_spec("segment_anything") is None,
        reason="segment-anything is not installed",
    ),
    pytest.mark.skipif(
        importlib.util.find_spec("lazylabel") is None,
        reason="put the legacy package on PYTHONPATH to compare against it",
    ),
]


def iou(a, b) -> float:
    import numpy as np

    a = np.asarray(a).astype(bool)
    b = np.asarray(b).astype(bool)
    union = (a | b).sum()
    return 1.0 if union == 0 else float((a & b).sum() / union)


@pytest.fixture(scope="module")
def image():
    """Two rectangles and a disc, so a click has something to find and something to exclude."""
    import numpy as np

    img = np.zeros((256, 320, 3), dtype=np.uint8)
    img[40:120, 30:140] = (200, 60, 60)
    img[150:230, 180:300] = (60, 200, 60)
    ys, xs = np.mgrid[0:256, 0:320]
    img[((ys - 80) ** 2 + (xs - 240) ** 2) < 35**2] = (60, 60, 220)
    return img


@pytest.fixture(scope="module")
def ported(image):
    from lazylabel_inference.backends import PredictorBackend
    from lazylabel_inference.manifest import ModelEntry

    import torch
    from segment_anything import SamPredictor, sam_model_registry

    model = sam_model_registry[VARIANT](checkpoint=CHECKPOINT)
    model.to("cuda" if torch.cuda.is_available() else "cpu")

    entry = ModelEntry(
        "test", "sam1", VARIANT, Path(CHECKPOINT).name, "0" * 64, Path(CHECKPOINT).stat().st_size
    )
    backend = PredictorBackend(_entry=entry, _predictor=SamPredictor(model))
    backend.set_image(image)
    return backend


@pytest.fixture(scope="module")
def legacy(image):
    from lazylabel.models.sam_model import SamModel

    # custom_model_path rather than the default: the default looks beside the legacy package and
    # would DOWNLOAD a 2.4 GB checkpoint into a worktree that must stay untouched.
    model = SamModel(model_type=VARIANT, custom_model_path=CHECKPOINT)
    assert model.is_loaded, "the legacy SamModel did not load the checkpoint"
    assert model.set_image_from_array(image), "the legacy SamModel did not accept the image"
    return model


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
    # Without this, two empty masks would score IoU 1.0 and the test would pass while proving
    # nothing. An agreement test has to know the difference between agreeing and finding nothing.
    assert legacy_mask.sum() > 0, f"{label}: the legacy mask is empty, so there is nothing to compare"

    prompt = Prompt(
        points=tuple(Point(x, y, True) for x, y in positive)
        + tuple(Point(x, y, False) for x, y in negative)
    )
    prediction = ported.predict(prompt)

    overlap = iou(prediction.mask, legacy_mask)
    assert overlap >= 0.98, f"{label}: IoU {overlap:.4f} is below the 0.98 tolerance"
    assert prediction.score == pytest.approx(float(legacy_score), abs=1e-6)


def test_box_prompts_match_legacy(ported, legacy):
    from lazylabel_inference.prompts import Box, Prompt

    box = [30, 40, 140, 120]
    legacy_result = legacy.predict_from_box(box)
    assert legacy_result is not None
    legacy_mask, legacy_score, _ = legacy_result
    assert legacy_mask.sum() > 0, "the legacy mask is empty, so there is nothing to compare"

    prediction = ported.predict(Prompt(box=Box(*box)))

    overlap = iou(prediction.mask, legacy_mask)
    assert overlap >= 0.98, f"box: IoU {overlap:.4f} is below the 0.98 tolerance"
    assert prediction.score == pytest.approx(float(legacy_score), abs=1e-6)


def test_the_ported_backend_picks_the_same_candidate(ported):
    """RULE-020: of the three candidates, the highest-scoring one wins.

    Asserting the chosen INDEX rather than only the mask catches a port that happens to agree on
    this image and would diverge on another. np.argmax takes the FIRST maximum on a tie.
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

    with pytest.raises(InvalidPromptError, match="at least one point or a box"):
        ported.predict(Prompt())
