"""Every path that loads a checkpoint checks it against the manifest first.

SEC-17, and the two defects walking it turned up. The manifest promises that a listed checkpoint
"is hash-checked before it is read", and `InferenceService.backend` keeps that promise. The two
load paths written later -- the video predictor a propagation job builds, and the embedder Find
Archetypes builds -- went straight to their loaders. Both load with `weights_only=True`, so a
swapped file could never execute code; what it could do is produce results attributed to a model
that did not make them, and a truncated download failed deep inside torch instead of with the
one-line reason the check already knows how to give.

The same walk found Find Archetypes choosing its model by POSITION. With no model named -- and the
browser never names one -- it took the manifest's first entry whatever its family, and the embedder
loader refuses anything that is not an embedder. Every manifest that lists SAM first, the example
included, failed Find Archetypes on every call.
"""

from __future__ import annotations

import ast
import hashlib
import json
import pathlib

import pytest

from lazylabel_inference import archetypes, backends, service
from lazylabel_inference.config import Config
from lazylabel_inference.log import Logger
from lazylabel_inference.manifest import parse_manifest
from lazylabel_inference.prompts import ModelNotLoadedError
from lazylabel_inference.propagation import PropagationRequest
from lazylabel_inference.server import build_deps

SOURCE = pathlib.Path(__file__).resolve().parents[1] / "src" / "lazylabel_inference"

#: Everything that reads a checkpoint into a model. A new one belongs here.
LOADERS = {"load_backend", "load_video_predictor", "load_embedder"}


class Loaded(Exception):
    """What the stand-in loaders raise, so a test sees what reached them without a real model."""


def listed(directory, name, family, size, filename, *, content=b"weights", claims=None):
    """Write a checkpoint file and return its manifest entry.

    `claims` is the content the MANIFEST vouches for. Left out, it is the file's own content and the
    entry verifies; given, the file is not what the manifest describes.
    """
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


def sam2(directory, **overrides):
    return listed(directory, "SAM 2.1 large", "sam2", "large", "sam2.pt", **overrides)


def embedder(directory, name="MobileNetV3 small", filename="mobilenet.pth", **overrides):
    return listed(directory, name, "embedder", "mobilenet_v3_small", filename, **overrides)


@pytest.fixture
def seen(monkeypatch):
    """Replace every loader with one that records the entry it was given and stops there.

    Patched on the MODULES, before `build_deps` runs: the job builders import their loader when they
    are built, so a patch applied afterwards would never be the function they hold.
    """
    names: list[str] = []

    def stand_in(entry, model_dir, *, device=None):
        names.append(entry.name)
        raise Loaded(entry.name)

    monkeypatch.setattr(service, "load_backend", stand_in)
    monkeypatch.setattr(backends, "load_video_predictor", stand_in)
    monkeypatch.setattr(archetypes, "load_embedder", stand_in)
    return names


def deps_for(tmp_path, entries):
    config = Config(
        model_dir=tmp_path,
        manifest_path=tmp_path / "manifest.json",
        host="127.0.0.1",
        port=8788,
        dataset_root=tmp_path,
    )
    return build_deps(config, parse_manifest(json.dumps({"models": entries})), Logger())


def propagate(deps):
    return deps.propagator(PropagationRequest(("a.png", "b.png"), (0,)), None)


def find_archetypes(deps, wanted=None):
    return deps.archetyper(("a.png",), wanted)


class TestEveryLoadPathChecksTheHashFirst:
    """A file that is not the one the manifest vouches for never reaches a loader."""

    def test_the_prompt_backend(self, tmp_path, seen) -> None:
        # The path that always did. Pinned so it cannot quietly stop.
        deps = deps_for(tmp_path, [sam2(tmp_path, claims=b"other!!")])

        with pytest.raises(ModelNotLoadedError, match="cannot be used"):
            deps.service.backend("SAM 2.1 large")
        assert seen == []

    def test_the_video_predictor_a_propagation_builds(self, tmp_path, seen) -> None:
        deps = deps_for(tmp_path, [sam2(tmp_path, claims=b"other!!")])

        with pytest.raises(ModelNotLoadedError, match="cannot be used"):
            propagate(deps)
        assert seen == []

    def test_the_embedder_find_archetypes_builds(self, tmp_path, seen) -> None:
        deps = deps_for(tmp_path, [embedder(tmp_path, claims=b"other!!")])

        with pytest.raises(ModelNotLoadedError, match="cannot be used"):
            find_archetypes(deps)
        assert seen == []

    def test_a_truncated_download_is_named_as_one(self, tmp_path, seen) -> None:
        # The failure an operator actually meets. Without the check it surfaced as an unpickling
        # error from inside torch; with it, the message says what happened and what usually causes it.
        deps = deps_for(tmp_path, [embedder(tmp_path, content=b"half", claims=b"the whole file")])

        with pytest.raises(ModelNotLoadedError, match="partial download"):
            find_archetypes(deps)
        assert seen == []

    @pytest.mark.parametrize(
        "load",
        [
            lambda deps: deps.service.backend("SAM 2.1 large"),
            propagate,
            find_archetypes,
        ],
        ids=["prompt backend", "video predictor", "embedder"],
    )
    def test_a_file_that_matches_does_reach_its_loader(self, tmp_path, seen, load) -> None:
        # The control. Without it every refusal above could be passing for some other reason --
        # a missing file, a wrong family -- and would go on passing with the check deleted.
        deps = deps_for(tmp_path, [sam2(tmp_path), embedder(tmp_path)])

        with pytest.raises(Loaded):
            load(deps)
        assert len(seen) == 1


class TestFindArchetypesUsesTheEmbedder:
    """Chosen by family, because the browser never names one and position means nothing."""

    def test_it_is_found_when_it_is_not_listed_first(self, tmp_path, seen) -> None:
        # The defect. SAM first is the ordinary manifest -- the example lists it first.
        deps = deps_for(tmp_path, [sam2(tmp_path), embedder(tmp_path)])

        with pytest.raises(Loaded):
            find_archetypes(deps)
        assert seen == ["MobileNetV3 small"]

    def test_with_none_listed_it_says_what_to_add(self, tmp_path, seen) -> None:
        # Not "SAM 2.1 large is a sam2 checkpoint, not an embedder", which is what this said when
        # it tried the first entry -- true, and no help to someone who never asked for SAM.
        deps = deps_for(tmp_path, [sam2(tmp_path)])

        with pytest.raises(ModelNotLoadedError, match='family "embedder"'):
            find_archetypes(deps)
        assert seen == []

    def test_a_named_model_that_is_not_an_embedder_is_refused(self, tmp_path, seen) -> None:
        deps = deps_for(tmp_path, [sam2(tmp_path), embedder(tmp_path)])

        with pytest.raises(ModelNotLoadedError, match="no embedder called 'SAM 2.1 large'"):
            find_archetypes(deps, "SAM 2.1 large")
        assert seen == []

    def test_several_are_not_chosen_between_silently(self, tmp_path, seen) -> None:
        # For the reason propagation gives: which weights embedded the frames decides which frames
        # are suggested, so picking one would make the answer depend on a detail nobody chose.
        deps = deps_for(
            tmp_path,
            [embedder(tmp_path), embedder(tmp_path, name="Retrained", filename="retrained.pth")],
        )

        with pytest.raises(ModelNotLoadedError, match="name the one to use"):
            find_archetypes(deps)
        assert seen == []

    def test_a_named_one_is_the_one_used(self, tmp_path, seen) -> None:
        deps = deps_for(
            tmp_path,
            [embedder(tmp_path), embedder(tmp_path, name="Retrained", filename="retrained.pth")],
        )

        with pytest.raises(Loaded):
            find_archetypes(deps, "Retrained")
        assert seen == ["Retrained"]


def _own_calls(function: ast.AST) -> list[tuple[int, str]]:
    """Calls made by this function's own body, not by functions nested inside it."""
    found: list[tuple[int, str]] = []
    pending = list(ast.iter_child_nodes(function))
    while pending:
        node = pending.pop()
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
            continue
        if isinstance(node, ast.Call):
            callee = node.func
            name = callee.id if isinstance(callee, ast.Name) else getattr(callee, "attr", None)
            if name is not None:
                found.append((node.lineno, name))
        pending.extend(ast.iter_child_nodes(node))
    return found


def test_no_load_path_can_skip_the_check() -> None:
    """The same question asked of the whole source, so a fourth path cannot repeat this.

    Two of three paths skipping the check is the shape this project keeps finding: a guarantee kept
    where it was first written and nowhere it was copied to. Asking each path by hand found it;
    asking the source finds the next one.
    """
    sites: list[str] = []
    unchecked: list[str] = []
    for path in sorted(SOURCE.glob("*.py")):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if node.name in LOADERS:
                continue
            calls = _own_calls(node)
            loads = [line for line, name in calls if name in LOADERS]
            if not loads:
                continue
            where = f"{path.name}:{node.name}"
            sites.append(where)
            checks = [line for line, name in calls if name == "verified"]
            if not checks or min(checks) > min(loads):
                unchecked.append(where)

    # An empty sweep would pass vacuously. The prompt backend, the propagation job and the archetype
    # job are the three that exist.
    assert len(sites) >= 3, sites
    assert unchecked == [], (
        f"these load a checkpoint without first calling `verified`: {unchecked}. A file that is not "
        "the one the manifest vouches for would reach the model."
    )
