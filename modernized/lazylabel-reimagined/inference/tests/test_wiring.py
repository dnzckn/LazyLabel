"""What production actually builds — the line no unit test was looking at.

Every other test in this suite constructs its own `Deps`, which is why they all passed while the
deployed service answered 503 on every route that reads an image: nothing constructed
`InferenceService` at all. `Deps.service` defaulted to None, `main()` never set it, and a machine
with checkpoints, a manifest and a GPU could not segment anything.

That is this project's recurring defect one level up from the code — a thing that works, a test
that proves it works, and nothing calling it. These tests exist so the WIRING is a thing with a
caller too.
"""

from __future__ import annotations

import pathlib

import pytest

from lazylabel_inference.app import Request, create_app
from lazylabel_inference.config import Config, ConfigError, load_config
from lazylabel_inference.log import Logger
from lazylabel_inference.server import build_deps


def config(tmp_path: pathlib.Path, *, root: pathlib.Path | None) -> Config:
    return Config(
        model_dir=tmp_path,
        manifest_path=tmp_path / "manifest.json",
        host="127.0.0.1",
        port=8788,
        dataset_root=root,
    )


class TestTheServiceIsActuallyBuilt:
    def test_a_configured_dataset_root_produces_a_service(self, tmp_path: pathlib.Path) -> None:
        # The assertion that was missing. It is one line and it is the difference between a
        # deployment that works and one that answers 503 to everything.
        deps = build_deps(config(tmp_path, root=tmp_path), [], Logger())

        assert deps.service is not None

    def test_the_service_is_pointed_at_that_root(self, tmp_path: pathlib.Path) -> None:
        # Not merely non-None: pointed at the configured folder. A service built against the wrong
        # root fails on the first image with a message about a file nobody asked for.
        root = tmp_path / "images"
        root.mkdir()

        deps = build_deps(config(tmp_path, root=root), [], Logger())

        assert deps.service is not None
        assert deps.service.dataset_root == root

    def test_the_manifest_and_model_dir_travel_with_it(self, tmp_path: pathlib.Path) -> None:
        deps = build_deps(config(tmp_path, root=tmp_path), [], Logger())

        assert deps.model_dir == tmp_path
        assert deps.service is not None
        assert deps.service.model_dir == tmp_path


class TestWithNoDatasetRoot:
    def test_there_is_no_service_and_that_is_a_real_configuration(
        self, tmp_path: pathlib.Path
    ) -> None:
        # Not a failure to start. An operator installing checkpoints needs /health and /models
        # before anything else can work, and refusing to start would hide both.
        deps = build_deps(config(tmp_path, root=None), [], Logger())

        assert deps.service is None

    def test_health_still_answers(self, tmp_path: pathlib.Path) -> None:
        deps = build_deps(config(tmp_path, root=None), [], Logger())

        response = create_app(deps)(Request(method="GET", path="/health"))

        assert response.status in (200, 503)

    def test_the_routes_that_read_images_say_503_and_why(self, tmp_path: pathlib.Path) -> None:
        deps = build_deps(config(tmp_path, root=None), [], Logger())

        response = create_app(deps)(
            Request(method="POST", path="/inference/embeddings", body=b'{"image":"a.png","model":"SAM 2.1 large"}')
        )

        assert response.status == 503
        assert "dataset root" in response.body


class TestReadingItFromTheEnvironment:
    def test_the_root_is_optional(self, tmp_path: pathlib.Path) -> None:
        loaded = load_config({"LAZYLABEL_MODEL_DIR": str(tmp_path)})

        assert loaded.dataset_root is None

    def test_a_configured_root_is_resolved(self, tmp_path: pathlib.Path) -> None:
        loaded = load_config(
            {"LAZYLABEL_MODEL_DIR": str(tmp_path), "LAZYLABEL_DATASET_ROOT": str(tmp_path)}
        )

        assert loaded.dataset_root == tmp_path.resolve()

    def test_a_root_that_is_not_a_directory_is_refused_at_STARTUP(
        self, tmp_path: pathlib.Path
    ) -> None:
        # Rather than on the first image, where it would look like a problem with that image.
        with pytest.raises(ConfigError, match="not a directory"):
            load_config(
                {
                    "LAZYLABEL_MODEL_DIR": str(tmp_path),
                    "LAZYLABEL_DATASET_ROOT": str(tmp_path / "nowhere"),
                }
            )


class TestPropagationIsWiredNow:
    """The propagator is built too, and this test used to assert the opposite.

    It said "no propagator exists and the route says 503" -- true when the job API was built and
    what ran inside a job was not. Inverting it is what closing that slice looks like. What is
    still missing is a CHECKPOINT, which is a different thing from a missing implementation and
    fails differently.
    """

    def test_a_dataset_root_produces_a_propagator(self, tmp_path: pathlib.Path) -> None:
        deps = build_deps(config(tmp_path, root=tmp_path), [], Logger())

        assert deps.propagator is not None

    def test_without_a_root_there_is_none_and_the_route_says_503(
        self, tmp_path: pathlib.Path
    ) -> None:
        # A propagation reads a whole sequence, so with nowhere to read from there is nothing to
        # run. The route says so rather than starting a job that could never produce a frame.
        deps = build_deps(config(tmp_path, root=None), [], Logger())

        assert deps.propagator is None

        response = create_app(deps)(
            Request(
                method="POST",
                path="/inference/propagations",
                body=b'{"sequence":["a.png","b.png"],"references":[0]}',
            )
        )

        assert response.status == 503

    def test_an_empty_manifest_fails_when_the_JOB_runs_not_when_it_starts(
        self, tmp_path: pathlib.Path
    ) -> None:
        """A manifest with no video-capable model is a job that FAILS, not a route that refuses.

        Deliberate, and worth stating. Which checkpoints are usable can change while the service
        runs -- a file is installed, a hash starts matching -- so the route would be answering a
        question whose answer it cannot hold. The job's failure carries the reason and the frames
        it managed, which is the machinery that already exists for exactly this.
        """
        from lazylabel_inference.prompts import ModelNotLoadedError
        from lazylabel_inference.propagation import PropagationRequest

        deps = build_deps(config(tmp_path, root=tmp_path), [], Logger())
        assert deps.propagator is not None

        with pytest.raises(ModelNotLoadedError, match="no video-capable model"):
            deps.propagator(PropagationRequest(("a.png", "b.png"), (0,)), None)
