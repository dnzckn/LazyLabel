"""Find Archetypes against the real MobileNetV3 weights.

`test_archetypes_embedding.py` uses a stand-in model, which makes its assertions exact and its
coverage of the real thing zero. This is the other half: the actual checkpoint, the actual
torchvision transform chain, the actual HDBSCAN.

Run it with:

    LAZYLABEL_TEST_EMBEDDER=/path/to/mobilenetv3_small_tv.pth \\
    python -m pytest tests/test_archetypes_live.py -v

What only the real model can prove: that the checkpoint loads strictly into the architecture, that
removing the classifier head yields 576 dimensions rather than 1000, and that a sequence with
visibly distinct scenes clusters into them. A stand-in yields whatever it is told to.

The scenes are synthetic and deliberately crude -- flat colours and simple shapes. Real footage
would make the assertions a matter of taste, and taste is not a test.
"""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path

import pytest

CHECKPOINT = os.environ.get("LAZYLABEL_TEST_EMBEDDER", "")

pytestmark = [
    pytest.mark.skipif(
        not CHECKPOINT or not Path(CHECKPOINT).is_file(),
        reason="set LAZYLABEL_TEST_EMBEDDER to the MobileNetV3 checkpoint to run this",
    ),
    pytest.mark.skipif(
        importlib.util.find_spec("torchvision") is None, reason="torchvision is not installed"
    ),
]


def manifest_entry():
    import json

    from lazylabel_inference.manifest import parse_manifest

    path = Path(CHECKPOINT)
    return parse_manifest(
        json.dumps(
            {
                "models": [
                    {
                        "name": "MobileNetV3 small",
                        "family": "embedder",
                        "size": "mobilenet_v3_small",
                        "filename": path.name,
                        "sha256": "b" * 64,
                        "bytes": path.stat().st_size,
                    }
                ]
            }
        )
    )[0]


@pytest.fixture(scope="module")
def embedder():
    from lazylabel_inference.archetypes import load_embedder

    return load_embedder(manifest_entry(), Path(CHECKPOINT).parent, device="cpu")


def scene(kind: str, jitter: int):
    """One frame of one of three visibly different scenes, with a little per-frame variation."""
    import numpy as np

    img = np.zeros((180, 240, 3), dtype=np.uint8)
    if kind == "indoor":
        img[:, :] = (150 + jitter, 140 + jitter, 120)
        img[60:140, 80:170] = (40, 40, 45)
    elif kind == "outdoor":
        img[:90, :] = (110, 150 + jitter, 220)
        img[90:, :] = (60, 130 + jitter, 60)
    else:  # "closeup"
        img[:, :] = (30, 30, 30)
        ys, xs = np.mgrid[0:180, 0:240]
        img[((ys - 90) ** 2 + (xs - 120) ** 2) < (55 + jitter) ** 2] = (230, 200, 180)
    return img


@pytest.fixture(scope="module")
def sequence():
    """Thirty frames of each of three scenes, interleaved as a real timeline would be."""
    images = []
    for index in range(30):
        for kind in ("indoor", "outdoor", "closeup"):
            images.append((f"{kind}_{index:03d}.png", scene(kind, index % 7)))
    return images


def test_the_checkpoint_loads_strictly(embedder) -> None:
    # strict=True is what makes a partly-matching checkpoint an error rather than a model with
    # randomly initialised layers producing plausible-looking features.
    assert embedder.entry.family == "embedder"
    assert embedder.device == "cpu"


def test_the_head_is_gone_and_the_width_is_576(embedder, sequence) -> None:
    from lazylabel_inference.archetypes import EMBEDDING_DIM, embed

    embedded = embed(sequence[:8], embedder)

    # 1000 here would mean the classifier survived and we are clustering ImageNet class scores.
    assert embedded.features.shape == (8, EMBEDDING_DIM)


def test_features_are_unit_length(embedder, sequence) -> None:
    import numpy as np

    from lazylabel_inference.archetypes import embed

    embedded = embed(sequence[:8], embedder)

    assert np.allclose(np.linalg.norm(embedded.features, axis=1), 1.0, atol=1e-5)


def test_it_separates_scenes_that_look_different(embedder, sequence) -> None:
    """The real claim of the feature: frames of the same scene land together.

    Asserted as PURITY rather than "exactly three clusters", because HDBSCAN is entitled to split
    one scene in two or call some frames noise, and neither is wrong. What would be wrong is a
    cluster mixing an indoor frame with a close-up.
    """
    from lazylabel_inference.archetypes import cluster, counts_of, embed

    embedded = embed(sequence, embedder)
    labels = cluster(embedded.features, len(sequence))

    assert counts_of(labels), "the real model found no clusters in three distinct scenes"

    members: dict[int, set[str]] = {}
    for key, label in zip(embedded.keys, labels):
        if int(label) == -1:
            continue
        members.setdefault(int(label), set()).add(key.split("_")[0])

    impure = {label: kinds for label, kinds in members.items() if len(kinds) > 1}
    assert not impure, f"clusters mixed scenes that look nothing alike: {impure}"


def test_it_suggests_frames_from_every_scene(embedder, sequence) -> None:
    from lazylabel_inference.archetypes import find_archetypes

    result = find_archetypes(sequence, embedder)

    # A scene with no suggested reference is a stretch of the sequence propagating from nothing,
    # which is the failure the whole feature exists to prevent.
    assert {key.split("_")[0] for key in result.suggested} == {"indoor", "outdoor", "closeup"}
    assert result.unreadable == ()
    assert not result.fell_short


def test_the_same_sequence_gives_the_same_suggestions(embedder, sequence) -> None:
    # A user re-running Find Archetypes should be offered the same frames. Legacy breaks distance
    # ties with np.argsort, which is quicksort and not stable.
    from lazylabel_inference.archetypes import find_archetypes

    first = find_archetypes(sequence, embedder)
    second = find_archetypes(sequence, embedder)

    assert first.suggested == second.suggested
