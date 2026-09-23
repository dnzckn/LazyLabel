"""The service's routes: health, models, and the honest 501 for what Phase 3 builds."""

from __future__ import annotations

import hashlib
import inspect
import json
from pathlib import Path

import pytest

from lazylabel_inference import app as app_module
from lazylabel_inference.app import MAX_BODY_BYTES, Deps, Request, create_app
from lazylabel_inference.availability import Availability
from lazylabel_inference.log import Logger
from lazylabel_inference.manifest import ManifestError, parse_manifest


def available() -> Availability:
    return Availability(True, "2.7.1", "PyTorch 2.7.1 and segment-anything are available.", True)


def unavailable() -> Availability:
    return Availability(False, None, "PyTorch is not installed.")


def model_entry(tmp_path: Path, *, intact: bool = True):
    content = b"weights" * 100
    (tmp_path / "model.pth").write_bytes(content if intact else b"short")
    return parse_manifest(
        json.dumps(
            {
                "models": [
                    {
                        "name": "SAM 1 huge",
                        "family": "sam1",
                        "size": "vit_h",
                        "filename": "model.pth",
                        "sha256": hashlib.sha256(content).hexdigest(),
                        "bytes": len(content),
                    }
                ]
            }
        )
    )


def call(deps: Deps, method: str, path: str, **kwargs) -> tuple[int, dict]:
    response = create_app(deps)(Request(method=method, path=path, **kwargs))
    return response.status, json.loads(response.body) if response.body else {}


class TestHealth:
    def test_ready_when_the_stack_and_a_verified_checkpoint_are_both_there(self, tmp_path: Path) -> None:
        deps = Deps(
            models=model_entry(tmp_path),
            model_dir=tmp_path,
            availability=available,
            verify_on_health=True,
        )
        status, body = call(deps, "GET", "/health")

        assert status == 200
        assert body["status"] == "ok"
        assert body["models"]["usable"] == 1

    def test_reports_the_three_failures_separately(self, tmp_path: Path) -> None:
        # A service with PyTorch and no checkpoints is a configuration problem; one with checkpoints
        # and no PyTorch is an installation problem. Collapsing them into "unhealthy" helps nobody.
        no_torch = Deps(models=model_entry(tmp_path), model_dir=tmp_path, availability=unavailable)
        status, body = call(no_torch, "GET", "/health")
        assert status == 503
        assert not body["ai"]["available"]
        assert "pip install" in body["reason"]

        no_models = Deps(models=[], model_dir=tmp_path, availability=available)
        status, body = call(no_models, "GET", "/health")
        assert status == 503
        assert body["ai"]["available"]
        assert "No models are declared" in body["reason"]

        broken = Deps(
            models=model_entry(tmp_path, intact=False),
            model_dir=tmp_path,
            availability=available,
            verify_on_health=True,
        )
        status, body = call(broken, "GET", "/health")
        assert status == 503
        assert "partial download" in body["reason"].lower()

    def test_says_when_the_manifest_itself_could_not_be_read(self, tmp_path: Path) -> None:
        deps = Deps(
            model_dir=tmp_path,
            availability=available,
            manifest_error=ManifestError("models[0] is missing sha256"),
        )
        status, body = call(deps, "GET", "/health")

        # Starting and reporting why it cannot work beats refusing to start, which looks exactly
        # like not being deployed.
        assert status == 503
        assert "missing sha256" in body["reason"]

    def test_reports_whether_propagation_is_possible_at_all(self, tmp_path: Path) -> None:
        deps = Deps(models=model_entry(tmp_path), model_dir=tmp_path, availability=available)
        _, body = call(deps, "GET", "/health")
        assert body["ai"]["videoCapable"] is True


class TestModels:
    def test_verifies_every_declared_checkpoint_in_full(self, tmp_path: Path) -> None:
        deps = Deps(models=model_entry(tmp_path), model_dir=tmp_path, availability=available)
        status, body = call(deps, "GET", "/models")

        assert status == 200
        assert body["models"][0]["verified"] is True
        assert body["models"][0]["family"] == "sam1"
        # It answers prompts; the picker offers only the models that do.
        assert body["models"][0]["segmenter"] is True

    def test_reports_a_checkpoint_that_does_not_match_its_hash(self, tmp_path: Path) -> None:
        entries = model_entry(tmp_path)
        (tmp_path / "model.pth").write_bytes(b"X" * entries[0].bytes)  # right size, wrong bytes

        deps = Deps(models=entries, model_dir=tmp_path, availability=available)
        _, body = call(deps, "GET", "/models")

        # The failure Content-Length cannot see: corruption on disk, or a tampered mirror.
        assert body["models"][0]["present"] is True
        assert body["models"][0]["verified"] is False
        assert "hashes to" in body["models"][0]["detail"]

    def test_503s_when_the_manifest_is_unreadable(self, tmp_path: Path) -> None:
        deps = Deps(model_dir=tmp_path, manifest_error=ManifestError("not valid JSON"))
        status, body = call(deps, "GET", "/models")
        assert status == 503 and body["code"] == "manifest_unreadable"


class TestThePromptRoutes:
    """Built in Phase 3. The model itself is exercised in test_differential_sam2.py, which needs a
    checkpoint; what is checked here is the envelope around it, which does not."""

    def test_503s_when_no_dataset_root_is_configured(self, tmp_path: Path) -> None:
        deps = Deps(model_dir=tmp_path, availability=available)
        status, body = call(deps, "POST", "/inference/embeddings", body=b'{"image":"a.png","model":"m"}')
        assert status == 503 and body["code"] == "inference_unavailable"

    def test_refuses_an_embedding_request_missing_its_fields(self, tmp_path: Path) -> None:
        deps = Deps(model_dir=tmp_path, availability=available)
        for payload in [b"{}", b'{"image":"a.png"}', b'{"model":"m"}', b'{"image":1,"model":"m"}']:
            status, _ = call(deps, "POST", "/inference/embeddings", body=payload)
            assert status == 400, payload

    def test_refuses_a_processing_chain_that_is_not_the_query_string(self, tmp_path: Path) -> None:
        deps = Deps(model_dir=tmp_path, availability=available)
        for payload in [
            b'{"image":"a.png","model":"m","processing":5}',
            b'{"image":"a.png","model":"m","processing":{"rescaleMin":1}}',
        ]:
            status, body = call(deps, "POST", "/inference/embeddings", body=payload)
            assert status == 400 and "processing" in body["message"], payload

    def test_refuses_a_segment_request_with_no_handle(self, tmp_path: Path) -> None:
        deps = Deps(model_dir=tmp_path, availability=available)
        status, _ = call(deps, "POST", "/inference/segment", body=b'{"points":[]}')
        assert status == 400

    def test_refuses_a_malformed_point_or_box(self, tmp_path: Path) -> None:
        deps = Deps(model_dir=tmp_path, availability=available)
        for payload in [
            b'{"handle":"h","points":[{"x":"left","y":2}]}',
            b'{"handle":"h","box":[1,2,3]}',
            b'{"handle":"h","box":"everything"}',
        ]:
            status, _ = call(deps, "POST", "/inference/segment", body=payload)
            assert status == 400, payload

    def test_405_names_the_method_for_a_BUILT_route_too(self, tmp_path: Path) -> None:
        """The allowed methods come from `_fixed_methods`, not from the not-built table.

        C3's two routes were once listed in that table as well. Those entries were dead -- the
        handlers above return first -- and they would have resurrected as a 501 on a BUILT endpoint
        the moment a route was reordered. Removing them must not cost the 405, and the message has
        to still name the method, so this pins both.
        """
        deps = Deps(model_dir=tmp_path, availability=available)

        status, body = call(deps, "GET", "/inference/segment")

        assert status == 405
        assert "POST" in body["message"]

    def test_405_rather_than_404_for_the_wrong_method(self, tmp_path: Path) -> None:
        deps = Deps(model_dir=tmp_path, availability=available)
        status, _ = call(deps, "GET", "/inference/segment")
        assert status == 405


class TestTheEnvelope:
    def test_returns_a_correlation_id_and_honours_a_supplied_one(self, tmp_path: Path) -> None:
        deps = Deps(model_dir=tmp_path, availability=available)
        app = create_app(deps)

        minted = app(Request("GET", "/health"))
        assert len(minted.headers["x-correlation-id"]) == 36

        passed = app(Request("GET", "/health", headers={"x-correlation-id": "trace-abc"}))
        assert passed.headers["x-correlation-id"] == "trace-abc"

    def test_logs_one_structured_line_per_request(self, tmp_path: Path) -> None:
        lines: list[str] = []
        deps = Deps(
            model_dir=tmp_path,
            availability=available,
            logger=Logger(sink=lines.append),
        )
        create_app(deps)(Request("GET", "/health", headers={"x-correlation-id": "trace-xyz"}))

        assert len(lines) == 1
        record = json.loads(lines[0])
        assert record["correlationId"] == "trace-xyz" and record["path"] == "/health"

    def test_404_and_405_are_typed_problems(self, tmp_path: Path) -> None:
        deps = Deps(model_dir=tmp_path, availability=available)

        status, body = call(deps, "GET", "/nope")
        assert status == 404 and body["code"] == "not_found"

        status, body = call(deps, "POST", "/health")
        assert status == 405 and body["code"] == "method_not_allowed"

    def test_refuses_an_oversized_body(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        # The mechanism, at a size a test can afford to allocate; the next test holds the value.
        monkeypatch.setattr(app_module, "MAX_BODY_BYTES", 1024)
        deps = Deps(model_dir=tmp_path, availability=available)
        status, body = call(deps, "POST", "/inference/segment", body=b"x" * 1025)
        assert status == 413 and body["code"] == "payload_too_large"

    def test_the_cap_admits_operate_on_view_at_the_supported_working_size(self) -> None:
        """The largest body the API legitimately sends is RULE-089's rendered picture.

        At 64 MiB a 50-megapixel colour photograph was refused -- measured at a 112 MB PNG, 149 MB
        as base64 -- while the spec calls 50 megapixels the supported working size. The worst case
        is a picture PNG cannot compress at all: three bytes a pixel, one filter byte a row, base64.
        """
        working_size = 50_000_000  # pixels: AI_NATIVE_SPEC's NFR table
        worst_png = working_size * 3 + 50_000  # plus row filters and zlib's framing, generously
        worst_body = -(-worst_png // 3) * 4 + 64 * 1024  # base64, and the JSON around it
        assert MAX_BODY_BYTES >= worst_body

    def test_an_unexpected_error_is_a_typed_500_not_a_stack_trace(self, tmp_path: Path) -> None:
        def explode() -> Availability:
            raise RuntimeError("the GPU fell over")

        status, body = call(Deps(model_dir=tmp_path, availability=explode), "GET", "/health")
        assert status == 500 and body["code"] == "internal"


class TestNothingIsLeftUnbuilt:
    """Every route this service fixes a contract for now answers it.

    This class used to parametrize over the routes that returned 501, and it emptied one capability
    at a time -- C3's prompt routes, then C11's three, then C10's. 501 was the honest answer while
    it was true: the route exists, its contract is fixed in AI_NATIVE_SPEC.md section 3, and the
    implementation is not here. A 200 with an empty mask would have been the failure ASSESSMENT.md
    5.4 records of the legacy code, where a failure is presented as a successful empty result.

    What is kept is the MECHANISM, because the next capability to reach that state should cost a
    line rather than a decision, and because a 501 helper nothing exercises would quietly rot.
    """

    def test_the_unbuilt_table_is_empty(self) -> None:
        from lazylabel_inference.app import _route  # noqa: PLC2701 - the table under test

        source = inspect.getsource(_route)
        assert "not_built: dict[tuple[str, str], tuple[str, str]] = {}" in source

    def test_the_501_helper_still_names_a_capability_and_its_phase(self) -> None:
        # Exercised directly, since no route uses it today. A helper with no caller is the defect
        # this project keeps finding; a helper with a test is at least a checked one.
        from lazylabel_inference.app import _pending  # noqa: PLC2701 - the helper under test

        error = _pending("C10", "find archetype frames in a sequence")

        assert error.status == 501
        assert error.detail["capability"] == "C10"
        assert error.detail["phase"] == "P3"

    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("POST", "/inference/embeddings"),
            ("POST", "/inference/segment"),
            ("POST", "/inference/propagations"),
            ("GET", "/inference/propagations"),
            ("POST", "/inference/archetypes"),
        ],
    )
    def test_no_route_answers_501_any_more(self, tmp_path: Path, method: str, path: str) -> None:
        deps = Deps(model_dir=tmp_path, availability=available)

        status, _ = call(deps, method, path, body=b"{}")

        # 400 for a body this fixture does not fill in, 503 for no dataset root, 200 for a GET that
        # can answer. Any of those is a built route; 501 is the one answer that is not.
        assert status != 501
