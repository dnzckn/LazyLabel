"""A click is answered from ITS image's encoding after another image is encoded -- with real SAM.

A predictor holds one encoded image, and the service caches several: RULE-091 encodes the
neighbours of the open image before anyone asks. Reproduced on 2026-09-23 with SAM 2.1 large: a
click on a disc gave the disc (20,031 pixels) until a same-sized neighbour was encoded, then
286,131 -- the neighbour's background -- with no error, and asking for the embedding again said
"cached" and changed nothing. The unit tests in `test_service.py` hold the service's logic with a
fake predictor; these hold the part a fake cannot, that each family's encoding really comes back
out of the predictor and goes back in.

Run with real checkpoints (they skip themselves otherwise, like every live suite here):

    LAZYLABEL_TEST_CHECKPOINT=/path/to/sam2.1_hiera_large.pt \\
    LAZYLABEL_TEST_SAM1_CHECKPOINT=/path/to/sam_vit_h_4b8939.pth \\
    python -m pytest tests/test_live_encoding_cache.py -v
"""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path

import pytest

SAM2 = os.environ.get("LAZYLABEL_TEST_CHECKPOINT", "")
SAM2_SIZE = os.environ.get("LAZYLABEL_TEST_CHECKPOINT_SIZE", "large")
SAM1 = os.environ.get("LAZYLABEL_TEST_SAM1_CHECKPOINT", "")
SAM1_VARIANT = os.environ.get("LAZYLABEL_TEST_SAM1_VARIANT", "vit_h")


def _disc(centre_x: int):
    """A disc on a dark ground. Two of these, discs apart, are one folder's two frames."""
    import numpy as np

    image = np.full((240, 320, 3), 40, np.uint8)
    ys, xs = np.mgrid[0:240, 0:320]
    image[(xs - centre_x) ** 2 + (ys - 120) ** 2 < 45**2] = (230, 200, 60)
    return image


def _answers_each_image_from_its_own_encoding(tmp_path: Path, backend) -> None:
    import numpy as np
    from PIL import Image

    from lazylabel_inference.prompts import Point, Prompt
    from lazylabel_inference.service import InferenceService

    Image.fromarray(_disc(90)).save(tmp_path / "a.png")
    Image.fromarray(_disc(230)).save(tmp_path / "b.png")
    name = backend.entry.name
    service = InferenceService(models=[backend.entry], model_dir=tmp_path, dataset_root=tmp_path)
    service._backends[name] = backend
    click = Prompt(points=(Point(90, 120),))  # the centre of a.png's disc

    a, _ = service.embed("a.png", name)
    alone = np.array(service.segment(a, click).mask, copy=True)
    service.embed("b.png", name)  # what the prefetch does next

    assert np.array_equal(service.segment(a, click).mask, alone)

    again, cached = service.embed("a.png", name)
    assert cached is True
    assert np.array_equal(service.segment(again, click).mask, alone)


@pytest.mark.skipif(not SAM2 or not Path(SAM2).is_file(),
                    reason="set LAZYLABEL_TEST_CHECKPOINT to a SAM 2 checkpoint to run this")
@pytest.mark.skipif(importlib.util.find_spec("sam2") is None, reason="sam2 is not installed")
def test_sam2_answers_each_image_from_its_own_encoding(tmp_path: Path) -> None:
    import torch
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    from conftest import ensure_sam2_hydra

    from lazylabel_inference.backends import SAM2_CONFIGS, PredictorBackend
    from lazylabel_inference.manifest import ModelEntry

    # Legacy's Sam2Model, built by the differential suites earlier in the same process, clears the
    # Hydra registration sam2's builders need; `conftest.py` has the whole story.
    ensure_sam2_hydra()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = build_sam2(SAM2_CONFIGS[SAM2_SIZE], SAM2, device=device)
    entry = ModelEntry("sam2", "sam2", SAM2_SIZE, Path(SAM2).name, "0" * 64, Path(SAM2).stat().st_size)
    _answers_each_image_from_its_own_encoding(
        tmp_path, PredictorBackend(_entry=entry, _predictor=SAM2ImagePredictor(model))
    )


@pytest.mark.skipif(not SAM1 or not Path(SAM1).is_file(),
                    reason="set LAZYLABEL_TEST_SAM1_CHECKPOINT to a SAM 1 checkpoint to run this")
@pytest.mark.skipif(importlib.util.find_spec("segment_anything") is None,
                    reason="segment-anything is not installed")
def test_sam1_answers_each_image_from_its_own_encoding(tmp_path: Path) -> None:
    import torch
    from segment_anything import SamPredictor, sam_model_registry

    from lazylabel_inference.backends import PredictorBackend
    from lazylabel_inference.manifest import ModelEntry

    model = sam_model_registry[SAM1_VARIANT](checkpoint=SAM1)
    model.to("cuda" if torch.cuda.is_available() else "cpu")
    entry = ModelEntry("sam1", "sam1", SAM1_VARIANT, Path(SAM1).name, "0" * 64, Path(SAM1).stat().st_size)
    _answers_each_image_from_its_own_encoding(
        tmp_path, PredictorBackend(_entry=entry, _predictor=SamPredictor(model))
    )
