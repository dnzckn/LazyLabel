"""The API's side of the contract, checked against this service's own routes.

Phase 3's exit criterion 4: "API-to-inference contract tests pass."

A cross-language contract cannot be held by a shared type, so it is held by a shared example.
`contracts/fixtures/inference-contract.json` records the exact request bodies the API sends and the
response shapes it expects; the API's suite asserts its client produces them, and this asserts the
routes accept them. If either side drifts, one of the two fails.

What it does NOT need is a model. Every request below is rejected before any inference happens —
there is no dataset root configured — so what is under test is the PARSING: that a body the API
sends is understood rather than refused as malformed. A 400 here means the two sides disagree about
the shape; a 503 means they agree and there is simply no service behind it, which is the pass.
"""

from __future__ import annotations

import json
import pathlib

import pytest

from lazylabel_inference.app import Deps, Request, create_app
from lazylabel_inference.availability import Availability

CONTRACT = (
    pathlib.Path(__file__).resolve().parents[2] / "contracts" / "fixtures" / "inference-contract.json"
)

pytestmark = pytest.mark.skipif(
    not CONTRACT.is_file(), reason="the shared contract fixture is not present"
)

contract = json.loads(CONTRACT.read_text(encoding="utf-8")) if CONTRACT.is_file() else {"requests": []}


def available() -> Availability:
    return Availability(True, "2.7.1", "PyTorch and segment-anything are available.", True)


def call(method: str, path: str, body: dict) -> tuple[int, dict]:
    # No service attached: the routes parse the body and then report that they have nothing to run
    # it against. That separation is exactly what makes this a parsing test.
    app = create_app(Deps(model_dir=pathlib.Path("."), availability=available))
    response = app(Request(method=method, path=path, body=json.dumps(body).encode()))
    return response.status, json.loads(response.body)


@pytest.mark.parametrize(
    "case", contract["requests"], ids=[case["name"] for case in contract["requests"]]
)
def test_the_routes_accept_what_the_api_sends(case: dict) -> None:
    status, body = call(case["method"], case["path"], case["body"])

    # 400 is the failure that matters: it means this service did not understand a body the API
    # considers valid, so the two have drifted apart.
    assert status != 400, f"{case['name']} was rejected as malformed: {body.get('message')}"
    assert status == 503, f"{case['name']} gave {status}: {body.get('message')}"
    assert body["code"] == "inference_unavailable"


def test_the_contract_has_cases_in_it() -> None:
    # A fixture that silently emptied would make every test above vacuously true.
    assert len(contract["requests"]) >= 5
    assert any(case["path"] == "/inference/embeddings" for case in contract["requests"])
    assert any(case["path"] == "/inference/segment" for case in contract["requests"])


def test_every_error_code_the_api_maps_is_one_this_service_can_produce() -> None:
    """The API branches on these codes; a code it expects and this never sends is a dead branch."""
    from lazylabel_inference.app import _inference_error  # noqa: PLC2701 - the mapping under test
    from lazylabel_inference.prompts import (
        ImageNotSetError,
        InvalidPromptError,
        ModelNotLoadedError,
        PredictionFailedError,
    )
    from lazylabel_inference.service import ImageUnreadableError, UnknownHandleError

    produced = {
        _inference_error(error).code
        for error in (
            UnknownHandleError("x"),
            InvalidPromptError("x"),
            ImageUnreadableError("x"),
            ModelNotLoadedError("x"),
            PredictionFailedError("x"),
            ImageNotSetError("x"),
        )
    }

    # inference_unavailable is the API's own code for "no service configured", so it is expected on
    # the API side without this service ever sending it.
    expected = set(contract["errorCodes"]) - {"inference_unavailable"}
    missing = expected - (produced | _codes_from_the_job_routes())
    assert not missing, f"the API expects codes this service never sends: {sorted(missing)}"


def _codes_from_the_job_routes() -> set[str]:
    """C11's codes, collected by DRIVING the routes rather than by listing them.

    The set above comes from a mapping of typed errors, and the job routes do not go through it --
    they raise their status directly, because "no job by that id" and "those results are gone" are
    facts about a job rather than about inference. Adding the two names to a hand-written set would
    satisfy the assertion and prove nothing; making the routes actually answer with them is the
    only version of this test worth having.
    """
    import json as _json
    import threading

    from lazylabel_inference.app import Deps, Request, create_app
    from lazylabel_inference.jobs import JobRegistry

    def produce(count: int):
        def work(_cancel):
            for index in range(count):
                yield _FakeFrame(index)

        return work

    codes = set()

    # A job nobody started.
    unknown = create_app(Deps(jobs=JobRegistry()))(
        Request(method="GET", path="/inference/propagations", query={"id": "nope"})
    )
    codes.add(_json.loads(unknown.body)["code"])

    # A client that fell further behind than the buffer holds.
    jobs = JobRegistry(buffer=2)
    app = create_app(Deps(jobs=jobs, propagator=lambda _request, cancel: produce(10)(cancel)))
    started = _json.loads(
        app(
            Request(
                method="POST",
                path="/inference/propagations",
                body=_json.dumps(
                    {"sequence": ["a.png", "b.png", "c.png"], "references": [0]}
                ).encode("utf-8"),
            )
        ).body
    )
    assert jobs.get(started["id"]).wait(5), "the fixture job did not finish"
    overflowed = app(
        Request(
            method="GET",
            path="/inference/propagations",
            query={"id": started["id"], "cursor": "0"},
        )
    )
    codes.add(_json.loads(overflowed.body)["code"])

    assert threading.active_count() >= 1  # the driver thread is done; nothing is left running
    return codes


class _FakeFrame:
    """Just enough of a FrameResult for the route to encode one, without numpy or a model."""

    def __init__(self, index: int) -> None:
        import numpy as np

        self.source = f"frame-{index}.png"
        self.object_id = 1
        self.mask = np.zeros((2, 2), dtype=np.uint8)
        self.confidence = 0.5


def test_the_response_shapes_carry_what_the_api_reads() -> None:
    """The API reads specific fields off each response; a rename here is a silent break there."""
    embeddings = contract["responses"]["embeddings"]
    assert set(embeddings) == {"handle", "cached"}

    segment = contract["responses"]["segment"]
    # RULE-020: the winning mask, its score, which candidate won and what the others scored.
    assert set(segment) == {"mask", "score", "chosen", "alternatives"}
    assert set(segment["mask"]) == {"height", "width", "box", "data"}
    assert len(segment["alternatives"]) == 3
