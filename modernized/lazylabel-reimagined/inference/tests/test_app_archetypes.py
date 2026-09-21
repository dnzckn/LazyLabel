"""C10's route over HTTP — which frames of a sequence are worth annotating by hand.

One request and one answer rather than a job, unlike propagation. It is a single pass that embeds
every frame once: there is no per-frame result to stream and nothing a partial answer would be good
for, because half the clusters is not half the suggestions -- it is a different set.

The archetyper is injected, as the propagator is, so every case here runs without a checkpoint.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from lazylabel_inference.app import Deps, Request, create_app
from lazylabel_inference.archetypes import Archetypes, TooFewFrames
from lazylabel_inference.availability import Availability
from lazylabel_inference.prompts import ModelNotLoadedError


def available() -> Availability:
    return Availability(True, "2.7.1", "PyTorch 2.7.1 and segment-anything are available.", True)


def call(deps: Deps, body: dict | None = None) -> tuple[int, dict]:
    raw = b"" if body is None else json.dumps(body).encode("utf-8")
    response = create_app(deps)(
        Request(method="POST", path="/inference/archetypes", body=raw)
    )
    return response.status, json.loads(response.body) if response.body else {}


SEQUENCE = [f"frames/f{index:03d}.png" for index in range(10)]


def found(**overrides) -> Archetypes:
    return Archetypes(
        suggested=overrides.pop("suggested", (SEQUENCE[0], SEQUENCE[4])),
        budget=overrides.pop("budget", 2),
        clusters=overrides.pop("clusters", 2),
        noise=overrides.pop("noise", 0),
        unreadable=overrides.pop("unreadable", ()),
    )


def deps_with(archetyper, tmp_path: Path) -> Deps:
    return Deps(model_dir=tmp_path, availability=available, archetyper=archetyper)


class TestFindingThem:
    def test_returns_the_suggested_frames(self, tmp_path: Path) -> None:
        status, body = call(deps_with(lambda _seq, _model: found(), tmp_path), {"sequence": SEQUENCE})

        assert status == 200
        assert body["suggested"] == [SEQUENCE[0], SEQUENCE[4]]

    def test_passes_the_sequence_through_in_order(self, tmp_path: Path) -> None:
        seen: list[tuple] = []

        def archetyper(sequence, _model):
            seen.append(sequence)
            return found()

        call(deps_with(archetyper, tmp_path), {"sequence": SEQUENCE})

        assert list(seen[0]) == SEQUENCE

    def test_names_the_model_when_one_is_asked_for(self, tmp_path: Path) -> None:
        seen: list = []

        def archetyper(_sequence, model):
            seen.append(model)
            return found()

        call(deps_with(archetyper, tmp_path), {"sequence": SEQUENCE, "model": "SAM 2.1 large"})

        assert seen == ["SAM 2.1 large"]

    def test_says_when_it_FELL_SHORT_of_the_budget(self, tmp_path: Path) -> None:
        # Legacy computes this comparison to pick a progress message and throws it away. It is the
        # difference between "here are your twenty frames" and "this sequence is too uniform to
        # find twenty distinct ones", and a user who cannot tell those apart assumes it is broken.
        status, body = call(
            deps_with(lambda _s, _m: found(suggested=(SEQUENCE[0],), budget=20), tmp_path),
            {"sequence": SEQUENCE},
        )

        assert status == 200
        assert body["fellShort"] is True

    def test_reports_the_clustering_so_the_answer_can_explain_itself(self, tmp_path: Path) -> None:
        _, body = call(
            deps_with(lambda _s, _m: found(clusters=3, noise=4), tmp_path), {"sequence": SEQUENCE}
        )

        assert body["clusters"] == 3
        assert body["noise"] == 4

    def test_names_every_frame_it_could_not_read(self, tmp_path: Path) -> None:
        # Never silently dropped: they change the budget, because legacy sizes it from the TOTAL
        # frame count including the ones it failed on.
        _, body = call(
            deps_with(lambda _s, _m: found(unreadable=(("frames/f003.png", "corrupt"),)), tmp_path),
            {"sequence": SEQUENCE},
        )

        assert body["unreadable"] == [{"key": "frames/f003.png", "reason": "corrupt"}]

    def test_an_empty_suggestion_list_is_a_200_not_a_failure(self, tmp_path: Path) -> None:
        # Every frame was noise: the sequence is too uniform to have scenes. Nothing failed.
        status, body = call(
            deps_with(lambda _s, _m: found(suggested=(), clusters=0, noise=10), tmp_path),
            {"sequence": SEQUENCE},
        )

        assert status == 200
        assert body["suggested"] == []


class TestRefusals:
    @pytest.mark.parametrize(
        ("body", "expected"),
        [
            ({}, "non-empty 'sequence'"),
            ({"sequence": []}, "non-empty 'sequence'"),
            ({"sequence": [1, 2]}, "must be an image key"),
            ({"sequence": SEQUENCE, "model": 7}, "must be a model name"),
        ],
    )
    def test_a_body_that_cannot_work_is_refused_before_anything_loads(
        self, tmp_path: Path, body: dict, expected: str
    ) -> None:
        ran: list[str] = []

        def archetyper(_sequence, _model):
            ran.append("ran")
            return found()

        status, answer = call(deps_with(archetyper, tmp_path), body)

        assert status == 400
        assert expected in answer["message"]
        assert ran == []

    def test_an_empty_body_is_a_400(self, tmp_path: Path) -> None:
        assert call(deps_with(lambda _s, _m: found(), tmp_path), None)[0] == 400

    def test_too_few_frames_is_422_because_the_REQUEST_was_fine(self, tmp_path: Path) -> None:
        # A user with four frames has made no mistake, and a 400 would tell them they had.
        def archetyper(_sequence, _model):
            raise TooFewFrames("4 frames is fewer than the 5 this needs to say anything")

        status, body = call(deps_with(archetyper, tmp_path), {"sequence": SEQUENCE[:4]})

        assert status == 422
        assert body["code"] == "too_few_frames"

    def test_no_dataset_root_is_503_with_a_reason(self, tmp_path: Path) -> None:
        status, body = call(Deps(model_dir=tmp_path, availability=available), {"sequence": SEQUENCE})

        assert status == 503
        assert body["code"] == "inference_unavailable"

    def test_a_model_that_will_not_load_keeps_its_own_status(self, tmp_path: Path) -> None:
        # Not flattened into a 500: "install a checkpoint" and "this service is broken" need
        # different things from whoever reads it.
        def archetyper(_sequence, _model):
            raise ModelNotLoadedError("no model called 'nope' is in the manifest")

        status, body = call(deps_with(archetyper, tmp_path), {"sequence": SEQUENCE})

        assert status != 500
        assert "nope" in body["message"]


class TestTheRouteItself:
    def test_405_names_what_is_allowed(self, tmp_path: Path) -> None:
        deps = deps_with(lambda _s, _m: found(), tmp_path)

        response = create_app(deps)(Request(method="GET", path="/inference/archetypes"))

        assert response.status == 405
        assert "POST" in response.body
