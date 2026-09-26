"""The files SAM 2 reads, against legacy's own staging, byte for byte (SEQUENCE_PARITY.md SP-08).

Legacy's `Sam2Model.init_video_state` stages a sequence BEFORE it touches the model: a JPEG is
linked into the folder, or copied where the link is refused, and anything else is read with
`cv2.imread` and written at quality 95 (`sam2_model.py:776-803`). Only then does it call the video
predictor's `init_state`. So its staging runs with a recorder in the predictor's place, and needs no
checkpoint and no GPU: what the recorder finds in the folder is what SAM 2 would have read.

The port stages through the service's `read_frame` and the runner, and the two folders are compared
file by file, for a JPEG under each name legacy treats as one and for each other format the service
opens. Until 2026-09-26 the port decoded and re-encoded every frame, so every JPEG case here failed:
SAM 2 read recompressed pixels where legacy's reads the file.

    PYTHONPATH=/path/to/legacy/lazylabel/src python -m pytest tests/test_differential_staging.py
"""

from __future__ import annotations

import importlib.util
import pathlib

import numpy as np
import pytest

pytestmark = [
    pytest.mark.skipif(
        importlib.util.find_spec("lazylabel") is None,
        reason="put the legacy package on PYTHONPATH to compare against it",
    ),
    pytest.mark.skipif(
        importlib.util.find_spec("torch") is None or importlib.util.find_spec("cv2") is None,
        reason="both stagings write with cv2, and legacy's calls the predictor under torch's autocast",
    ),
]

HEIGHT, WIDTH = 24, 32


class Recorder:
    """Stands in for SAM 2's video predictor, and keeps what the staging folder holds when it is read.

    The port's runner goes on to seed and walk; this answers both without a model, because nothing
    here is about the model.
    """

    device = "cpu"

    def __init__(self) -> None:
        self.staged: list[bytes] = []

    def init_state(self, video_path, **_options):
        files = sorted(pathlib.Path(video_path).glob("*.jpg"), key=lambda path: int(path.stem))
        # Read through any link, as SAM 2's loader does.
        self.staged = [path.read_bytes() for path in files]
        return {"frames": len(files)}

    def add_new_mask(self, **kwargs):
        import torch

        return kwargs["frame_idx"], [kwargs["obj_id"]], torch.full((1, 1, 2, 2), 3.0)

    def propagate_in_video(self, **_kwargs):
        return iter(())


def legacy_staging(paths: list[pathlib.Path]) -> list[bytes]:
    """What legacy's own `init_video_state` stages, with no checkpoint loaded."""
    from lazylabel.models.sam2_model import Sam2Model

    # Not `Sam2Model(...)`, which loads a checkpoint. `init_video_state` reads the predictor, the
    # device for its autocast, and its temporary folder, and nothing else of the instance.
    model = object.__new__(Sam2Model)
    model.video_predictor = Recorder()
    model.device = "cpu"
    model._video_temp_dir = None
    try:
        assert model.init_video_state([str(path) for path in paths]), model.last_error
        return model.video_predictor.staged
    finally:
        model._cleanup_temp_dir()


def port_staging(root: pathlib.Path, names: list[str], staging: pathlib.Path) -> list[bytes]:
    """What the port stages for the same files: the service's reader, the runner, the staging."""
    from lazylabel_inference.propagation import PropagationRequest, ReferenceObject
    from lazylabel_inference.runner import run_propagation
    from lazylabel_inference.service import InferenceService

    service = InferenceService(models=[], model_dir=root, dataset_root=root)
    recorder = Recorder()
    mask = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    mask[4:12, 4:12] = 1
    list(
        run_propagation(
            recorder,
            service.read_frame,
            PropagationRequest(sequence=tuple(names), references=(0,)),
            [ReferenceObject(frame=0, object_id=1, mask=mask)],
            staging_root=staging,
        )
    )
    return recorder.staged


def picture(seed: int) -> np.ndarray:
    """Detail an encoder cannot keep exactly, different per frame. RGB."""
    ys, xs = np.mgrid[0:HEIGHT, 0:WIDTH]
    return np.stack(
        [(xs * 7 + seed * 13) % 256, (ys * 11 + seed * 5) % 256, (xs * ys + seed) % 256], axis=-1
    ).astype(np.uint8)


def encode(rgb: np.ndarray, kind: str) -> bytes:
    import cv2

    bgr = np.ascontiguousarray(rgb[:, :, ::-1])
    if kind == "jpeg":
        return cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes()
    if kind == "png-16":
        return cv2.imencode(".png", bgr.astype(np.uint16) * 257)[1].tobytes()
    if kind == "png-grey":
        return cv2.imencode(".png", rgb[:, :, 1])[1].tobytes()
    if kind == "png-rgba":
        alpha = np.full((HEIGHT, WIDTH, 1), 128, dtype=np.uint8)
        return cv2.imencode(".png", np.concatenate([bgr, alpha], axis=-1))[1].tobytes()
    return cv2.imencode("." + kind, bgr)[1].tobytes()


#: (file names, how their bytes are made). Each case is a two-frame sequence of one kind of file.
CASES = {
    "jpg": (["f0.jpg", "f1.jpg"], "jpeg"),
    "jpeg": (["f0.jpeg", "f1.jpeg"], "jpeg"),
    # Legacy lower-cases the suffix before it looks (`sam2_model.py:788`).
    "JPG in capitals": (["f0.JPG", "f1.JPG"], "jpeg"),
    "png": (["f0.png", "f1.png"], "png"),
    "16-bit png": (["f0.png", "f1.png"], "png-16"),
    "grey png": (["f0.png", "f1.png"], "png-grey"),
    "png with alpha": (["f0.png", "f1.png"], "png-rgba"),
    "bmp": (["f0.bmp", "f1.bmp"], "bmp"),
    "tiff": (["f0.tif", "f1.tif"], "tiff"),
    "webp": (["f0.webp", "f1.webp"], "webp"),
}


@pytest.mark.parametrize("case", sorted(CASES))
def test_the_port_stages_what_legacy_stages(tmp_path: pathlib.Path, case: str) -> None:
    names, kind = CASES[case]
    root = tmp_path / "dataset"
    root.mkdir()
    sources = []
    for seed, name in enumerate(names):
        (root / name).write_bytes(encode(picture(seed), kind))
        sources.append(root / name)

    legacy = legacy_staging(sources)
    port = port_staging(root, names, tmp_path / "staged")

    assert len(port) == len(legacy) == len(names)
    for index, (ours, theirs) in enumerate(zip(port, legacy, strict=True)):
        assert ours == theirs, f"{case}: frame {index} is not the file legacy stages"


@pytest.mark.parametrize("case", ["jpg", "jpeg", "JPG in capitals"])
def test_a_jpeg_is_staged_as_the_file_itself(tmp_path: pathlib.Path, case: str) -> None:
    # The same comparison from the other side: what both stage for a JPEG is its own bytes.
    names, kind = CASES[case]
    root = tmp_path / "dataset"
    root.mkdir()
    for seed, name in enumerate(names):
        (root / name).write_bytes(encode(picture(seed), kind))

    port = port_staging(root, names, tmp_path / "staged")

    assert port == [(root / name).read_bytes() for name in names]
