"""C11's job API over HTTP — start, watch, cancel — with no checkpoint anywhere.

This is the point of injecting the propagator: every state a CALLER can observe is a state of the
job, not of the model, so the whole contract in AI_NATIVE_SPEC.md section 3 is testable against a
fake that yields three frames and then does whatever the test needs. A real model cannot be asked
to die on frame 40, and that is the case most worth having.

What a checkpoint is still needed for is proving the RESULTS match legacy's, which is Phase 6's
exit criterion 2 and a different claim from this one.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

import numpy as np
import pytest

from lazylabel_inference.app import Deps, Request, create_app
from lazylabel_inference.availability import Availability
from lazylabel_inference.jobs import JobRegistry
from lazylabel_inference.propagation import FrameResult


def available() -> Availability:
    return Availability(True, "2.7.1", "PyTorch 2.7.1 and segment-anything are available.", True)


def call(deps: Deps, method: str, path: str, **kwargs) -> tuple[int, dict]:
    response = create_app(deps)(Request(method=method, path=path, **kwargs))
    return response.status, json.loads(response.body) if response.body else {}


def frame(source: str, object_id: int = 1, confidence: float = 0.9) -> FrameResult:
    return FrameResult(
        source=source,
        object_id=object_id,
        mask=np.zeros((4, 4), dtype=np.uint8),
        confidence=confidence,
    )


SEQUENCE = [f"frame-{index:03d}.png" for index in range(10)]


def body(**overrides) -> bytes:
    request = {"sequence": SEQUENCE, "references": [0], **overrides}
    return json.dumps(request).encode("utf-8")


def deps_with(propagator, *, jobs: JobRegistry | None = None, tmp_path: Path | None = None) -> Deps:
    return Deps(
        model_dir=tmp_path or Path("."),
        availability=available,
        jobs=jobs or JobRegistry(),
        propagator=propagator,
    )


def yields(*results):
    """A propagator that produces these results and stops. Runs on the registry's own thread."""

    def propagate(_request, _cancel):
        yield from results

    return propagate


def finished(deps: Deps, job_id: str, timeout: float = 5.0) -> None:
    assert deps.jobs.get(job_id).wait(timeout), "the job did not finish"


class TestStarting:
    def test_accepts_a_propagation_and_returns_a_job(self, tmp_path: Path) -> None:
        # The worker is held so the answer is observed while the job is genuinely running. Without
        # that, a one-frame job finishes before the response is built and the route looks
        # synchronous -- which is the opposite of what is being claimed here.
        release = threading.Event()

        def slow(_request, _cancel):
            release.wait(5)
            yield frame("frame-001.png")

        deps = deps_with(slow, tmp_path=tmp_path)

        status, answer = call(deps, "POST", "/inference/propagations", body=body())

        # 202, not 200: accepted and running, with nowhere to look yet but the job itself.
        assert status == 202
        assert answer["state"] == "running"
        assert answer["id"]
        assert answer["results"] == []
        release.set()
        finished(deps, answer["id"])

    def test_the_job_carries_how_many_frames_it_expects(self, tmp_path: Path) -> None:
        # The progress denominator, from RULE-026's window plan rather than from the sequence
        # length: the overlap frames are covered twice and counted once.
        deps = deps_with(yields(), tmp_path=tmp_path)

        _, answer = call(deps, "POST", "/inference/propagations", body=body())

        assert answer["total"] == 10

    def test_503_when_no_video_capable_model_is_configured(self, tmp_path: Path) -> None:
        # The same answer the prompt routes give, and for the same reason. Not a 501: the route is
        # built, this machine cannot honour it.
        deps = Deps(model_dir=tmp_path, availability=available, propagator=None)

        status, answer = call(deps, "POST", "/inference/propagations", body=body())

        assert status == 503
        assert answer["code"] == "inference_unavailable"

    @pytest.mark.parametrize(
        ("payload", "expected"),
        [
            ({"references": [0]}, "non-empty 'sequence'"),
            ({"sequence": [], "references": [0]}, "non-empty 'sequence'"),
            ({"sequence": SEQUENCE}, "at least one reference"),
            ({"sequence": SEQUENCE, "references": []}, "at least one reference"),
            ({"sequence": SEQUENCE, "references": [99]}, "within the sequence"),
            ({"sequence": SEQUENCE, "references": [0], "window": 0}, "positive frame count"),
            ({"sequence": SEQUENCE, "references": [0], "start": 99}, "frame position"),
            ({"sequence": SEQUENCE, "references": [0], "streaming": "yes"}, "true or false"),
        ],
    )
    def test_refuses_a_request_it_cannot_honour_before_starting_anything(
        self, tmp_path: Path, payload: dict, expected: str
    ) -> None:
        # Every refusal here is a 400 the caller can fix. The alternative is discovering it three
        # minutes into a GPU job -- and legacy, given no references, runs the whole sequence and
        # produces empty masks for every frame.
        started: list[str] = []

        def records(_request, _cancel):
            started.append("ran")
            yield frame("a.png")

        deps = deps_with(records, tmp_path=tmp_path)

        status, answer = call(
            deps, "POST", "/inference/propagations", body=json.dumps(payload).encode("utf-8")
        )

        assert status == 400
        assert expected in answer["message"]
        assert started == []

    def test_an_empty_body_is_a_400_not_a_crash(self, tmp_path: Path) -> None:
        deps = deps_with(yields(), tmp_path=tmp_path)

        status, _ = call(deps, "POST", "/inference/propagations", body=b"")

        assert status == 400


class TestWatching:
    def test_results_come_back_with_the_cursor_to_ask_with_next(self, tmp_path: Path) -> None:
        deps = deps_with(yields(frame("frame-001.png"), frame("frame-002.png")), tmp_path=tmp_path)
        _, started = call(deps, "POST", "/inference/propagations", body=body())
        finished(deps, started["id"])

        status, answer = call(
            deps, "GET", "/inference/propagations", query={"id": started["id"], "cursor": "0"}
        )

        assert status == 200
        assert [each["source"] for each in answer["results"]] == ["frame-001.png", "frame-002.png"]
        assert answer["cursor"] == 2

    def test_a_second_poll_returns_only_what_is_new(self, tmp_path: Path) -> None:
        deps = deps_with(yields(frame("frame-001.png")), tmp_path=tmp_path)
        _, started = call(deps, "POST", "/inference/propagations", body=body())
        finished(deps, started["id"])
        _, first = call(deps, "GET", "/inference/propagations", query={"id": started["id"]})

        _, second = call(
            deps,
            "GET",
            "/inference/propagations",
            query={"id": started["id"], "cursor": str(first["cursor"])},
        )

        assert second["results"] == []
        assert second["state"] == "completed"

    def test_a_frame_carries_its_mask_and_confidence(self, tmp_path: Path) -> None:
        # RULE-016's confidence is what decides which frames a user is told to check by hand, so a
        # result without it is not a result.
        deps = deps_with(yields(frame("frame-003.png", object_id=7, confidence=0.42)), tmp_path=tmp_path)
        _, started = call(deps, "POST", "/inference/propagations", body=body())
        finished(deps, started["id"])

        _, answer = call(deps, "GET", "/inference/propagations", query={"id": started["id"]})

        assert answer["results"][0]["objectId"] == 7
        assert answer["results"][0]["confidence"] == pytest.approx(0.42)
        assert answer["results"][0]["mask"]

    def test_a_failure_is_a_state_with_its_reason_not_a_short_result(self, tmp_path: Path) -> None:
        # Legacy's `except Exception: return` makes a run that died on frame 40 of 200
        # indistinguishable from a run that was 39 frames long.
        def explodes(_request, _cancel):
            yield frame("frame-001.png")
            raise RuntimeError("CUDA out of memory")

        deps = deps_with(explodes, tmp_path=tmp_path)
        _, started = call(deps, "POST", "/inference/propagations", body=body())
        finished(deps, started["id"])

        _, answer = call(deps, "GET", "/inference/propagations", query={"id": started["id"]})

        assert answer["state"] == "failed"
        assert answer["error"] == "CUDA out of memory"
        assert answer["completed"] == 1
        assert len(answer["results"]) == 1

    def test_410_when_the_client_fell_further_behind_than_the_buffer(self, tmp_path: Path) -> None:
        # They existed and are gone. Not a 404 -- the job is right here -- and emphatically not a
        # 200 with later frames, which would hide the gap the client most needs to know about.
        deps = deps_with(
            yields(*[frame(f"frame-{index:03d}.png") for index in range(20)]),
            jobs=JobRegistry(buffer=5),
            tmp_path=tmp_path,
        )
        _, started = call(deps, "POST", "/inference/propagations", body=body())
        finished(deps, started["id"])

        status, answer = call(
            deps, "GET", "/inference/propagations", query={"id": started["id"], "cursor": "0"}
        )

        assert status == 410
        assert answer["detail"]["earliest"] == 15

    def test_the_410_says_where_to_resume_and_resuming_works(self, tmp_path: Path) -> None:
        deps = deps_with(
            yields(*[frame(f"frame-{index:03d}.png") for index in range(20)]),
            jobs=JobRegistry(buffer=5),
            tmp_path=tmp_path,
        )
        _, started = call(deps, "POST", "/inference/propagations", body=body())
        finished(deps, started["id"])
        _, refused = call(
            deps, "GET", "/inference/propagations", query={"id": started["id"], "cursor": "0"}
        )

        status, answer = call(
            deps,
            "GET",
            "/inference/propagations",
            query={"id": started["id"], "cursor": str(refused["detail"]["earliest"])},
        )

        assert status == 200
        assert len(answer["results"]) == 5

    def test_404_for_a_job_that_does_not_exist(self, tmp_path: Path) -> None:
        deps = deps_with(yields(), tmp_path=tmp_path)

        status, answer = call(deps, "GET", "/inference/propagations", query={"id": "nope"})

        assert status == 404
        assert answer["code"] == "unknown_job"

    def test_a_cursor_that_was_never_issued_is_a_400(self, tmp_path: Path) -> None:
        deps = deps_with(yields(frame("frame-001.png")), tmp_path=tmp_path)
        _, started = call(deps, "POST", "/inference/propagations", body=body())
        finished(deps, started["id"])

        status, _ = call(
            deps, "GET", "/inference/propagations", query={"id": started["id"], "cursor": "900"}
        )

        assert status == 400

    def test_a_cursor_that_is_not_a_number_is_a_400(self, tmp_path: Path) -> None:
        deps = deps_with(yields(), tmp_path=tmp_path)
        _, started = call(deps, "POST", "/inference/propagations", body=body())

        status, _ = call(
            deps, "GET", "/inference/propagations", query={"id": started["id"], "cursor": "soon"}
        )

        assert status == 400

    def test_without_an_id_it_lists_the_jobs(self, tmp_path: Path) -> None:
        # What a client that has just reconnected needs. The alternative is a running propagation
        # nobody holds a handle to.
        deps = deps_with(yields(frame("frame-001.png")), tmp_path=tmp_path)
        _, first = call(deps, "POST", "/inference/propagations", body=body())
        _, second = call(deps, "POST", "/inference/propagations", body=body())
        finished(deps, first["id"])
        finished(deps, second["id"])

        status, answer = call(deps, "GET", "/inference/propagations")

        assert status == 200
        assert [each["id"] for each in answer["jobs"]] == [first["id"], second["id"]]


class TestCancelling:
    def test_cancelling_keeps_the_frames_already_done(self, tmp_path: Path) -> None:
        # RULE-063, end to end over HTTP.
        release = threading.Event()

        def slow(_request, _cancel):
            yield frame("frame-001.png")
            yield frame("frame-002.png")
            release.wait(5)
            yield frame("frame-003.png")

        deps = deps_with(slow, tmp_path=tmp_path)
        _, started = call(deps, "POST", "/inference/propagations", body=body())
        while deps.jobs.get(started["id"]).completed < 2:
            pass

        status, cancelled = call(deps, "DELETE", f"/inference/propagations/{started['id']}")
        release.set()
        finished(deps, started["id"])

        assert status == 200
        # Returns at once, so the frame in flight has not landed yet. A route that blocked until
        # the worker noticed would make Cancel feel as unresponsive as the thing being cancelled.
        assert cancelled["cancelling"] is True

        _, answer = call(deps, "GET", "/inference/propagations", query={"id": started["id"]})
        assert answer["state"] == "cancelled"
        assert len(answer["results"]) == 3
        assert "kept" in answer["error"]

    def test_404_for_an_unknown_job(self, tmp_path: Path) -> None:
        deps = deps_with(yields(), tmp_path=tmp_path)

        status, answer = call(deps, "DELETE", "/inference/propagations/nope")

        assert status == 404
        assert answer["code"] == "unknown_job"

    def test_cancelling_a_finished_job_is_not_an_error(self, tmp_path: Path) -> None:
        # The caller wanted it stopped and it is stopped. Reporting the race as a failure would
        # make an honest client retry something it has already achieved.
        deps = deps_with(yields(frame("frame-001.png")), tmp_path=tmp_path)
        _, started = call(deps, "POST", "/inference/propagations", body=body())
        finished(deps, started["id"])

        status, answer = call(deps, "DELETE", f"/inference/propagations/{started['id']}")

        assert status == 200
        assert answer["state"] == "completed"


class TestTheRoutesThemselves:
    @pytest.mark.parametrize(
        ("method", "path", "allowed"),
        [
            ("PUT", "/inference/propagations", "GET or POST"),
            ("POST", "/inference/propagations/job-1", "DELETE"),
        ],
    )
    def test_405_names_what_is_allowed(
        self, tmp_path: Path, method: str, path: str, allowed: str
    ) -> None:
        deps = deps_with(yields(), tmp_path=tmp_path)

        status, answer = call(deps, method, path)

        assert status == 405
        assert allowed in answer["message"]
