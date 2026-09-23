"""Find Archetypes against legacy's own ReferenceFinderWorker -- C10's last claim not yet made.

Legacy's worker (`ui/workers/reference_finder_worker.py`) embeds every frame with MobileNetV3,
clusters with HDBSCAN and picks the frames nearest each cluster's centre. The port does the same in
`archetypes.py`. Both run here on the live test's sequence -- ninety frames, three visibly different
scenes -- with the same checkpoint, on the same device, and must suggest the same frames. Until this
file, the capability table said so in its own words: "NOT claimed: that the suggested frames match
legacy's".

LEGACY IS FENCED OFF FROM THE NETWORK AND THE WORKTREE. It loads its embedder from
`Paths().models_dir`, which on this path is inside the read-only legacy worktree; when the file is
missing it DOWNLOADS it there, and when the file fails to load it DELETES it first. So its module's
`Paths` is replaced for the duration with one pointing at a temporary copy of the checkpoint --
nothing reaches the network, nothing touches the worktree, and the real checkpoint cannot be
deleted by a load that goes wrong.

    LAZYLABEL_TEST_EMBEDDER=/path/to/mobilenetv3_small_tv.pth \\
    PYTHONPATH=/path/to/legacy/lazylabel/src python -m pytest tests/test_differential_archetypes.py
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
        importlib.util.find_spec("torchvision") is None or importlib.util.find_spec("sklearn") is None,
        reason="torchvision and scikit-learn are needed on both sides",
    ),
    pytest.mark.skipif(
        importlib.util.find_spec("lazylabel") is None,
        reason="put the legacy package on PYTHONPATH to compare against it",
    ),
]


@pytest.fixture(scope="module")
def sequence():
    """The live test's ninety frames: thirty of each of three scenes, interleaved."""
    from test_archetypes_live import scene

    return [
        (f"{kind}_{index:03d}.png", scene(kind, index % 7))
        for index in range(30)
        for kind in ("indoor", "outdoor", "closeup")
    ]


@pytest.fixture(scope="module")
def device() -> str:
    """Whatever legacy will pick, which is CUDA when there is one: both sides must embed alike."""
    import torch

    return "cuda" if torch.cuda.is_available() else "cpu"


@pytest.fixture(scope="module")
def legacy(sequence, tmp_path_factory) -> list[int]:
    """Legacy's suggestions, as the sorted frame indices its worker emits."""
    import shutil
    import types

    from PIL import Image

    from lazylabel.ui.workers import reference_finder_worker as worker_module

    frames = tmp_path_factory.mktemp("frames")
    paths = []
    for key, rgb in sequence:
        Image.fromarray(rgb).save(frames / key)
        paths.append(str(frames / key))

    models = tmp_path_factory.mktemp("legacy-models")
    shutil.copyfile(CHECKPOINT, models / worker_module._MOBILENET_FILENAME)
    original = worker_module.Paths
    worker_module.Paths = lambda: types.SimpleNamespace(models_dir=models)
    found: list[list[int]] = []
    errors: list[str] = []
    try:
        worker = worker_module.ReferenceFinderWorker(paths)
        worker.finished_analysis.connect(found.append)
        worker.error.connect(errors.append)
        # The worker's own body, on this thread: `start()` would need an event loop to deliver
        # the result signal, and the capture script makes the same substitution for the same reason.
        worker._run_analysis()
    finally:
        worker_module.Paths = original

    assert not errors, errors
    assert found, "legacy's worker finished without reporting any result"
    return [int(index) for index in found[0]]


@pytest.fixture(scope="module")
def ported(sequence, device):
    from lazylabel_inference.archetypes import find_archetypes, load_embedder
    from test_archetypes_live import manifest_entry

    embedder = load_embedder(manifest_entry(), Path(CHECKPOINT).parent, device=device)
    return find_archetypes(sequence, embedder)


def test_legacy_found_something_to_compare(legacy) -> None:
    # Two empty lists would agree perfectly and prove nothing.
    assert len(legacy) > 0


def test_the_same_frames_are_suggested(sequence, legacy, ported) -> None:
    keys = [key for key, _ in sequence]
    assert sorted(keys.index(key) for key in ported.suggested) == legacy
