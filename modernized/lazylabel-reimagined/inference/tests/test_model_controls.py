"""Legacy's model controls: Refresh, Load, Unload, and what "Current: …" reports (CP-49).

Legacy's Model Selection section has Refresh, which scans the models folder again; Load, which puts
the selected model in memory at once rather than on first use, freeing the one there; and Unload,
which drops the model and empties the CUDA cache (L ui/main_window.py:1204-1305). Its "Current: …"
line names the model in memory. The service loaded models on first use and never let one go.

No real model is loaded here. The loader is a stand-in, and the checkpoints are small files whose
hashes the manifest records, so the SHA-256 check runs for real on every load.
"""

from __future__ import annotations

import gc
import hashlib
import json
import weakref
from pathlib import Path

import pytest

from lazylabel_inference import service as service_module
from lazylabel_inference.app import Deps, Request, create_app
from lazylabel_inference.config import Config
from lazylabel_inference.log import Logger
from lazylabel_inference.manifest import ModelEntry, parse_manifest
from lazylabel_inference.prompts import InvalidPromptError, ModelNotLoadedError, Point, Prediction, Prompt
from lazylabel_inference.propagation import PropagationRequest
from lazylabel_inference.server import build_deps
from lazylabel_inference.service import InferenceService


class FakeBackend:
    """Stands where SAM does: holds one encoded image and answers from it."""

    def __init__(self, entry: ModelEntry) -> None:
        self.entry = entry
        self.holding = None
        self.encoded = 0

    def set_image(self, image) -> None:
        self.holding = int(image[0, 0, 0])
        self.encoded += 1

    def export_state(self):
        return self.holding

    def restore_state(self, state) -> None:
        self.holding = state

    def predict(self, prompt):
        return Prediction(mask=None, score=float(self.holding))


def listed(directory: Path, name: str, family: str = "sam2", size: str = "large", *, content: bytes | None = None,
           claims: bytes | None = None) -> dict:
    """A checkpoint file and its manifest entry. `claims` is what the manifest vouches for."""
    content = content if content is not None else name.encode() * 3
    filename = name.replace(" ", "_") + ".pt"
    (directory / filename).write_bytes(content)
    vouched = content if claims is None else claims
    return {
        "name": name,
        "family": family,
        "size": size,
        "filename": filename,
        "sha256": hashlib.sha256(vouched).hexdigest(),
        "bytes": len(vouched),
    }


@pytest.fixture
def loads(monkeypatch):
    """Every backend the stand-in loader built, in order."""
    built: list[FakeBackend] = []

    def stand_in(entry, model_dir, *, device=None):
        backend = FakeBackend(entry)
        built.append(backend)
        return backend

    monkeypatch.setattr(service_module, "load_backend", stand_in)
    return built


def service_with(tmp_path: Path, *entries: dict) -> tuple[InferenceService, list[str]]:
    released: list[str] = []
    service = InferenceService(
        models=parse_manifest(json.dumps({"models": list(entries)})),
        model_dir=tmp_path,
        dataset_root=tmp_path,
        release=lambda: released.append("released"),
    )
    return service, released


def image(tmp_path: Path, name: str = "a.png", shade: int = 10) -> str:
    from PIL import Image

    Image.new("RGB", (8, 6), (shade, shade, shade)).save(tmp_path / name)
    return name


CLICK = Prompt(points=(Point(1, 1),))


class TestLoad:
    def test_it_loads_the_model_now_without_an_image(self, tmp_path, loads) -> None:
        service, _ = service_with(tmp_path, listed(tmp_path, "SAM 2.1 large"))

        assert service.load("SAM 2.1 large") == ["SAM 2.1 large"]
        assert [each.entry.name for each in loads] == ["SAM 2.1 large"]
        assert service.loaded() == ["SAM 2.1 large"]

    def test_loading_another_frees_the_one_in_memory(self, tmp_path, loads) -> None:
        # Legacy holds one model: its Load unloads the one there first (main_window.py:1259-1261).
        service, released = service_with(
            tmp_path, listed(tmp_path, "SAM 2.1 large"), listed(tmp_path, "SAM 1 huge", "sam1", "vit_h")
        )
        service.load("SAM 2.1 large")
        first = weakref.ref(loads.pop(0))

        assert service.load("SAM 1 huge") == ["SAM 1 huge"]
        gc.collect()
        assert first() is None
        assert released == ["released"]

    def test_loading_the_one_already_loaded_does_not_load_it_again(self, tmp_path, loads) -> None:
        service, released = service_with(tmp_path, listed(tmp_path, "SAM 2.1 large"))
        service.load("SAM 2.1 large")

        assert service.load("SAM 2.1 large") == ["SAM 2.1 large"]
        assert len(loads) == 1
        assert released == []

    def test_a_checkpoint_that_fails_its_hash_never_reaches_the_loader(self, tmp_path, loads) -> None:
        service, _ = service_with(tmp_path, listed(tmp_path, "SAM 2.1 large", claims=b"another file"))

        with pytest.raises(ModelNotLoadedError, match="cannot be used"):
            service.load("SAM 2.1 large")
        assert loads == []
        assert service.loaded() == []

    def test_a_model_the_manifest_does_not_list_is_refused(self, tmp_path, loads) -> None:
        service, _ = service_with(tmp_path, listed(tmp_path, "SAM 2.1 large"))

        with pytest.raises(ModelNotLoadedError, match="no model called"):
            service.load("my_download.pth")
        assert loads == []

    def test_the_embedder_is_refused_as_a_model_to_segment_with(self, tmp_path, loads) -> None:
        service, _ = service_with(tmp_path, listed(tmp_path, "MobileNetV3 small", "embedder", "mobilenet_v3_small"))

        with pytest.raises(InvalidPromptError, match="cannot segment"):
            service.load("MobileNetV3 small")
        assert loads == []

    def test_first_use_of_another_model_frees_the_one_in_memory_too(self, tmp_path, loads) -> None:
        # Legacy's lazy switch goes through the same load (model_manager.py:121-131).
        service, _ = service_with(
            tmp_path, listed(tmp_path, "SAM 2.1 large"), listed(tmp_path, "SAM 1 huge", "sam1", "vit_h")
        )
        key = image(tmp_path)
        service.embed(key, "SAM 2.1 large")
        service.embed(key, "SAM 1 huge")

        assert service.loaded() == ["SAM 1 huge"]


class TestUnload:
    def test_it_frees_the_model_and_empties_the_cuda_cache(self, tmp_path, loads) -> None:
        service, released = service_with(tmp_path, listed(tmp_path, "SAM 2.1 large"))
        service.embed(image(tmp_path), "SAM 2.1 large")
        model = weakref.ref(loads.pop(0))

        assert service.unload() == ["SAM 2.1 large"]
        assert service.loaded() == []
        assert released == ["released"]
        # Nothing still holds it: not the registry, and not the session of the image encoded.
        gc.collect()
        assert model() is None

    def test_the_next_click_loads_it_again_without_encoding_the_image_again(self, tmp_path, loads) -> None:
        # Legacy's next AI click after Unload loads the model again (sam_single_view_manager.py:218-229).
        service, _ = service_with(tmp_path, listed(tmp_path, "SAM 2.1 large"))
        handle, _ = service.embed(image(tmp_path, shade=42), "SAM 2.1 large")
        service.unload()

        assert service.segment(handle, CLICK).score == 42.0
        assert len(loads) == 2
        assert loads[1].encoded == 0
        assert service.loaded() == ["SAM 2.1 large"]

    def test_with_nothing_loaded_it_frees_nothing_and_says_so(self, tmp_path, loads) -> None:
        service, released = service_with(tmp_path, listed(tmp_path, "SAM 2.1 large"))

        assert service.unload() == []
        assert released == []

    def test_a_named_one_leaves_the_others(self, tmp_path, loads) -> None:
        service, _ = service_with(tmp_path, listed(tmp_path, "SAM 2.1 large"))
        service.load("SAM 2.1 large")

        assert service.unload("SAM 1 huge") == []
        assert service.loaded() == ["SAM 2.1 large"]


class TestAPropagationsModel:
    def test_counts_as_loaded_and_is_freed_by_unload(self, tmp_path, monkeypatch) -> None:
        # Legacy's video predictor belongs to its one model, and goes with it (main_window.py:1289-1293).
        from lazylabel_inference import backends, runner

        class Predictor:
            pass

        predictors: list[Predictor] = []

        def stand_in(entry, model_dir, *, device=None):
            predictors.append(Predictor())
            return predictors[-1]

        monkeypatch.setattr(backends, "load_video_predictor", stand_in)
        monkeypatch.setattr(runner, "run_propagation", lambda *args: iter(()))
        entries = [listed(tmp_path, "SAM 2.1 large")]
        config = Config(model_dir=tmp_path, manifest_path=tmp_path / "manifest.json", host="127.0.0.1",
                        port=8788, dataset_root=tmp_path)
        deps = build_deps(config, parse_manifest(json.dumps({"models": entries})), Logger())
        deps.service.release = lambda: None

        deps.propagator(PropagationRequest(("a.png", "b.png"), (0,)), None)
        assert deps.service.loaded() == ["SAM 2.1 large"]
        predictor = weakref.ref(predictors[0])
        predictors.clear()

        assert deps.service.unload() == ["SAM 2.1 large"]
        gc.collect()
        assert predictor() is None


class TestRefresh:
    def manifest(self, tmp_path: Path, *entries: dict) -> Path:
        path = tmp_path / "manifest.json"
        path.write_text(json.dumps({"models": list(entries)}), encoding="utf-8")
        return path

    def app(self, tmp_path: Path, *entries: dict):
        path = self.manifest(tmp_path, *entries)
        config = Config(model_dir=tmp_path, manifest_path=path, host="127.0.0.1", port=8788,
                        dataset_root=tmp_path)
        deps = build_deps(config, parse_manifest(path.read_text(encoding="utf-8")), Logger())
        deps.service.release = lambda: None
        return deps, create_app(deps)

    def test_a_checkpoint_added_to_the_manifest_is_listed(self, tmp_path, loads) -> None:
        large = listed(tmp_path, "SAM 2.1 large")
        deps, app = self.app(tmp_path, large)
        self.manifest(tmp_path, large, listed(tmp_path, "SAM 2.1 tiny", size="tiny"))

        response = app(Request("POST", "/inference/models/refresh"))

        assert response.status == 200
        assert [each["name"] for each in json.loads(response.body)["models"]] == ["SAM 2.1 large", "SAM 2.1 tiny"]
        # One list, read by the prompt routes and the job builders alike.
        assert [each.name for each in deps.service.models] == ["SAM 2.1 large", "SAM 2.1 tiny"]
        assert deps.models is deps.service.models

    def test_a_loaded_model_whose_entry_changed_is_unloaded(self, tmp_path, loads) -> None:
        deps, app = self.app(tmp_path, listed(tmp_path, "SAM 2.1 large"), listed(tmp_path, "SAM 2.1 tiny", size="tiny"))
        deps.service.load("SAM 2.1 large")
        self.manifest(
            tmp_path, listed(tmp_path, "SAM 2.1 large", content=b"retrained"), listed(tmp_path, "SAM 2.1 tiny", size="tiny")
        )

        app(Request("POST", "/inference/models/refresh"))

        assert deps.service.loaded() == []

    def test_an_unchanged_one_stays_loaded(self, tmp_path, loads) -> None:
        large = listed(tmp_path, "SAM 2.1 large")
        deps, app = self.app(tmp_path, large)
        deps.service.load("SAM 2.1 large")

        app(Request("POST", "/inference/models/refresh"))

        assert deps.service.loaded() == ["SAM 2.1 large"]
        assert len(loads) == 1

    def test_an_unreadable_manifest_keeps_the_list_in_force_and_says_why(self, tmp_path, loads) -> None:
        deps, app = self.app(tmp_path, listed(tmp_path, "SAM 2.1 large"))
        (tmp_path / "manifest.json").write_text("{ not json", encoding="utf-8")

        response = app(Request("POST", "/inference/models/refresh"))

        assert response.status == 503
        assert json.loads(response.body)["code"] == "manifest_unreadable"
        assert [each.name for each in deps.models] == ["SAM 2.1 large"]

    def test_nothing_is_fetched_for_a_listed_file_that_is_missing(self, tmp_path, loads) -> None:
        deps, app = self.app(tmp_path, listed(tmp_path, "SAM 2.1 large"))
        entry = listed(tmp_path, "SAM 2.1 tiny", size="tiny")
        (tmp_path / entry["filename"]).unlink()
        self.manifest(tmp_path, listed(tmp_path, "SAM 2.1 large"), entry)

        models = json.loads(app(Request("POST", "/inference/models/refresh")).body)["models"]

        assert models[1]["present"] is False
        assert not (tmp_path / entry["filename"]).exists()


class TestTheRoutes:
    def app(self, tmp_path: Path, **overrides):
        service, _ = service_with(tmp_path, listed(tmp_path, "SAM 2.1 large"), listed(tmp_path, "SAM 1 huge", "sam1", "vit_h"))
        deps = Deps(models=service.models, model_dir=tmp_path, service=service, **overrides)
        return service, create_app(deps)

    @staticmethod
    def post(app, path: str, body: dict | None = None):
        response = app(Request("POST", path, body=b"" if body is None else json.dumps(body).encode()))
        return response.status, json.loads(response.body)

    def test_models_says_which_is_loaded(self, tmp_path, loads) -> None:
        service, app = self.app(tmp_path)
        service.load("SAM 1 huge")

        models = json.loads(app(Request("GET", "/models")).body)["models"]

        assert {each["name"]: each["loaded"] for each in models} == {"SAM 2.1 large": False, "SAM 1 huge": True}

    def test_load_answers_with_what_is_loaded(self, tmp_path, loads) -> None:
        _, app = self.app(tmp_path)

        assert self.post(app, "/inference/models/load", {"model": "SAM 2.1 large"}) == (200, {"loaded": ["SAM 2.1 large"]})
        loaded = json.loads(app(Request("GET", "/inference/models/loaded")).body)
        assert loaded == {"loaded": ["SAM 2.1 large"]}

    def test_load_refuses_what_it_cannot_load_with_the_reason(self, tmp_path, loads) -> None:
        _, app = self.app(tmp_path)

        status, body = self.post(app, "/inference/models/load", {"model": "nothing.pth"})
        assert (status, body["code"]) == (503, "model_unavailable")
        assert self.post(app, "/inference/models/load", {})[0] == 400

    def test_unload_answers_with_what_it_freed(self, tmp_path, loads) -> None:
        service, app = self.app(tmp_path)
        service.load("SAM 2.1 large")

        assert self.post(app, "/inference/models/unload") == (200, {"unloaded": ["SAM 2.1 large"], "loaded": []})
        assert self.post(app, "/inference/models/unload") == (200, {"unloaded": [], "loaded": []})

    def test_they_need_a_service_as_the_prompt_routes_do(self, tmp_path) -> None:
        app = create_app(Deps(model_dir=tmp_path))

        assert self.post(app, "/inference/models/load", {"model": "SAM 2.1 large"})[1]["code"] == "inference_unavailable"
        assert self.post(app, "/inference/models/unload")[1]["code"] == "inference_unavailable"
        assert json.loads(app(Request("GET", "/inference/models/loaded")).body) == {"loaded": []}

    def test_wrong_methods_are_named(self, tmp_path) -> None:
        app = create_app(Deps(model_dir=tmp_path))

        assert app(Request("GET", "/inference/models/load")).status == 405
        assert app(Request("POST", "/inference/models/loaded")).status == 405
