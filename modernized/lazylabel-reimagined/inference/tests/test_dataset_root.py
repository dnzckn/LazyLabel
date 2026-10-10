"""POST /dataset-root: the folder of images the service reads, set by the API when the app opens one.

The owner's request of 2026-09-29, "in the gui the user should be able to select a folder to load".
The service reads images itself, from a root of its own, so the API tells it each folder the app
opens (its POST /folder). Everything here runs without PyTorch: the model is a stand-in that says
which picture it was given, which is the one thing a changed root can get wrong.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

import pytest

from lazylabel_inference.app import Deps, Request, create_app
from lazylabel_inference.config import Config
from lazylabel_inference.log import Logger
from lazylabel_inference.manifest import ModelEntry
from lazylabel_inference.server import build_deps
from lazylabel_inference.service import InferenceService

ENTRY = ModelEntry(name="m", family="sam2", size="tiny", filename="m.pt", sha256="0" * 64, bytes=1)
JSON = {"content-type": "application/json"}


class Encoder:
    """Stands where SAM does, and remembers the first pixel of the picture it was given."""

    entry = ENTRY

    def __init__(self) -> None:
        self.seen: list[int] = []

    def set_image(self, image) -> None:
        self.seen.append(int(image[0, 0, 0]))

    def export_state(self):
        return self.seen[-1]

    def restore_state(self, state) -> None:
        pass


@pytest.fixture
def folders(tmp_path: Path) -> tuple[Path, Path]:
    """Two folders holding an a.png each, dark in the first and light in the second."""
    from PIL import Image

    first, second = tmp_path / "first set", tmp_path / "second set"
    first.mkdir()
    second.mkdir()
    Image.new("RGB", (8, 6), (10, 10, 10)).save(first / "a.png")
    Image.new("RGB", (8, 6), (200, 200, 200)).save(second / "a.png")
    return first, second


def call(deps: Deps, path: str, body: dict, headers: dict[str, str] | None = None) -> tuple[int, dict]:
    response = create_app(deps)(
        Request(method="POST", path=path, headers=JSON if headers is None else headers, body=json.dumps(body).encode())
    )
    return response.status, json.loads(response.body) if response.body else {}


def config(tmp_path: Path, root: Path | None) -> Config:
    return Config(
        model_dir=tmp_path, manifest_path=tmp_path / "manifest.json", host="127.0.0.1", port=8788, dataset_root=root
    )


class TestWhoMaySetIt:
    def test_a_request_with_an_origin_is_refused(self, folders: tuple[Path, Path]) -> None:
        # A browser names the page every request comes from; only the API, from Node, names none.
        first, second = folders
        service = InferenceService(models=[ENTRY], model_dir=first, dataset_root=first)

        status, body = call(
            Deps(service=service), "/dataset-root", {"path": str(second)}, {**JSON, "origin": "http://127.0.0.1:8787"}
        )

        assert status == 403 and body["code"] == "forbidden"
        assert service.dataset_root == first

    def test_a_body_that_is_not_json_is_refused(self, folders: tuple[Path, Path]) -> None:
        first, second = folders
        service = InferenceService(models=[ENTRY], model_dir=first, dataset_root=first)

        status, _ = call(Deps(service=service), "/dataset-root", {"path": str(second)}, {"content-type": "text/plain"})

        assert status == 415
        assert service.dataset_root == first

    def test_only_post(self, tmp_path: Path) -> None:
        response = create_app(Deps())(Request(method="GET", path="/dataset-root"))

        assert response.status == 405


class TestWhatItAccepts:
    def test_a_path_that_is_not_a_folder_is_refused(self, folders: tuple[Path, Path], tmp_path: Path) -> None:
        first, _ = folders
        service = InferenceService(models=[ENTRY], model_dir=first, dataset_root=first)
        (tmp_path / "notes.txt").write_text("not a folder")

        for asked in [tmp_path / "nowhere", tmp_path / "notes.txt"]:
            status, body = call(Deps(service=service), "/dataset-root", {"path": str(asked)})
            assert status == 400 and "is not a folder" in body["message"], asked

        for payload in [{"path": "first set"}, {"path": ""}, {"path": 7}, {}]:
            status, _ = call(Deps(service=service), "/dataset-root", payload)
            assert status == 400, payload
        assert service.dataset_root == first

    def test_a_service_that_cannot_open_a_root_says_503(self, folders: tuple[Path, Path]) -> None:
        _, second = folders

        status, body = call(Deps(), "/dataset-root", {"path": str(second)})

        assert status == 503 and body["code"] == "inference_unavailable"


class TestReadingTheNewFolder:
    def test_sets_the_root_and_an_image_route_then_reads_from_it(self, folders: tuple[Path, Path], tmp_path: Path) -> None:
        first, second = folders
        deps = build_deps(config(tmp_path, first), [ENTRY], Logger(sink=lambda _line: None))
        encoder = Encoder()
        assert deps.service is not None
        deps.service._backends["m"] = encoder

        embed = lambda: call(deps, "/inference/embeddings", {"image": "a.png", "model": "m"})  # noqa: E731
        assert embed()[0] == 200

        status, body = call(deps, "/dataset-root", {"path": str(second)})

        assert status == 200 and body == {"datasetRoot": str(second.resolve())}
        assert embed()[0] == 200
        # The first folder's a.png, then the second's: the same name, read from the root set.
        assert encoder.seen == [10, 200]

    def test_a_service_started_with_no_root_is_built_for_the_one_set(
        self, folders: tuple[Path, Path], tmp_path: Path
    ) -> None:
        # Where the launcher starts it when LazyLabel opens with no folder.
        _, second = folders
        deps = build_deps(config(tmp_path, None), [ENTRY], Logger(sink=lambda _line: None))
        assert deps.service is not None and deps.service.dataset_root is None
        assert call(deps, "/inference/embeddings", {"image": "a.png", "model": "m"})[0] == 503

        status, _ = call(deps, "/dataset-root", {"path": str(second)})

        assert status == 200
        assert deps.service is not None and deps.service.dataset_root == second.resolve()
        # Built as startup builds it: propagation and Find Archetypes read through it too.
        assert deps.propagator is not None and deps.archetyper is not None
        encoder = Encoder()
        deps.service._backends["m"] = encoder
        assert call(deps, "/inference/embeddings", {"image": "a.png", "model": "m"})[0] == 200
        assert encoder.seen == [200]

    def test_a_running_propagation_is_cancelled_and_keeps_its_frames(self, folders: tuple[Path, Path]) -> None:
        # It reads its frames as it reaches them, so left running it would read the rest of its
        # sequence from the new folder under the old folder's names.
        first, second = folders
        release = threading.Event()

        def propagator(_request, cancel):
            yield "frame 0"
            release.wait(5)
            if not cancel.is_set():
                yield "frame 1"

        deps = Deps(service=InferenceService(models=[ENTRY], model_dir=first, dataset_root=first))
        job = deps.jobs.start(lambda cancel: propagator(None, cancel), total=2)

        status, _ = call(deps, "/dataset-root", {"path": str(second)})
        release.set()
        job.wait(5)

        assert status == 200
        assert job.snapshot()["state"] == "cancelled"
        assert job.completed == 1
