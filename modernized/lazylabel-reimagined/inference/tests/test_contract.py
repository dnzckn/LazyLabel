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
    missing = expected - produced
    assert not missing, f"the API expects codes this service never sends: {sorted(missing)}"


def test_the_response_shapes_carry_what_the_api_reads() -> None:
    """The API reads specific fields off each response; a rename here is a silent break there."""
    embeddings = contract["responses"]["embeddings"]
    assert set(embeddings) == {"handle", "cached"}

    segment = contract["responses"]["segment"]
    # RULE-020: the winning mask, its score, which candidate won and what the others scored.
    assert set(segment) == {"mask", "score", "chosen", "alternatives"}
    assert set(segment["mask"]) == {"height", "width", "box", "data"}
    assert len(segment["alternatives"]) == 3
