"""Starting, watching and stopping a propagation — RULE-063 as a state machine.

The worker is a callable returning an iterator, so every case here runs with a fake that yields
what the test needs and then does what the test needs: raises, hangs, or stops. That is the only
way to reach the states that matter most, because a real model cannot be asked to die on frame 40.

What is being proven, in order of how much it would cost to get wrong:

1. Cancelling KEEPS the frames already done (RULE-063). Legacy's promise, and the reason
   `propagate()` is a generator at all.
2. A failure is a state, not a short result. Legacy's `except Exception: return` makes a run that
   died on frame 40 of 200 indistinguishable from a run that was 39 frames long.
3. A client that falls behind is TOLD, rather than handed a later frame as though the gap were not
   there.
"""

from __future__ import annotations

import threading
import time

import pytest

from lazylabel_inference.jobs import (
    JobRegistry,
    JobState,
    ResultsOverflowedError,
    UnknownJobError,
)


def inline(work):
    """Run the worker on the calling thread, so every assertion is deterministic."""
    work()


def yields(*values):
    def work(_cancel):
        yield from values

    return work


def registry(**kwargs) -> JobRegistry:
    return JobRegistry(**kwargs)


class TestFinishing:
    def test_a_job_that_runs_to_the_end_completes(self):
        job = registry().start(yields("a", "b", "c"), total=3, run=inline)

        assert job.state is JobState.COMPLETED
        assert job.completed == 3
        assert job.error is None

    def test_results_come_back_in_order(self):
        job = registry().start(yields("a", "b", "c"), run=inline)

        results, cursor = job.results_since(0)

        assert results == ["a", "b", "c"]
        assert cursor == 3

    def test_a_poll_from_the_last_cursor_returns_what_is_new(self):
        job = registry().start(yields("a", "b", "c"), run=inline)
        _, cursor = job.results_since(0)

        assert job.results_since(cursor) == ([], 3)

    def test_a_job_with_no_frames_completes_rather_than_failing(self):
        # An empty range is RULE-026's zero-length case and is not an error.
        job = registry().start(yields(), run=inline)

        assert job.state is JobState.COMPLETED
        assert job.completed == 0

    def test_total_is_carried_so_progress_has_a_denominator(self):
        job = registry().start(yields("a"), total=200, run=inline)

        assert job.snapshot()["total"] == 200

    def test_total_may_be_unknown_rather_than_guessed(self):
        assert registry().start(yields("a"), run=inline).snapshot()["total"] is None


class TestFailing:
    def test_a_worker_that_raises_leaves_a_FAILED_job_with_the_reason(self):
        def explodes(_cancel):
            yield "a"
            yield "b"
            raise RuntimeError("CUDA out of memory")

        job = registry().start(explodes, total=200, run=inline)

        assert job.state is JobState.FAILED
        assert job.error == "CUDA out of memory"

    def test_the_frames_it_managed_are_still_there(self):
        # Legacy's `except Exception: return` loses exactly this: a run that died on frame 40 of
        # 200 ends looking like a run that was 39 frames long.
        def explodes(_cancel):
            yield "a"
            yield "b"
            raise RuntimeError("boom")

        job = registry().start(explodes, total=200, run=inline)

        assert job.completed == 2
        assert job.results_since(0)[0] == ["a", "b"]

    def test_a_failure_with_no_message_still_names_itself(self):
        def explodes(_cancel):
            raise RuntimeError()
            yield  # pragma: no cover - unreachable, makes it a generator

        assert registry().start(explodes, run=inline).error == "RuntimeError"

    def test_progress_and_failure_are_distinguishable(self):
        # The whole point: 2 of 200 and FAILED is a different thing from 2 of 2 and COMPLETED, and
        # a caller must be able to tell without counting.
        def explodes(_cancel):
            yield "a"
            yield "b"
            raise RuntimeError("boom")

        failed = registry().start(explodes, total=200, run=inline).snapshot()
        completed = registry().start(yields("a", "b"), total=2, run=inline).snapshot()

        assert (failed["state"], failed["completed"]) == ("failed", 2)
        assert (completed["state"], completed["completed"]) == ("completed", 2)


class TestCancelling:
    def test_cancelling_keeps_the_frames_already_done(self):
        # RULE-063, and the reason propagate() is a generator.
        jobs = registry()
        started = threading.Event()
        proceed = threading.Event()

        def slow(cancel):
            yield "a"
            yield "b"
            started.set()
            proceed.wait(5)
            yield "c"
            yield "d"

        job = jobs.start(slow, total=4)
        started.wait(5)
        jobs.cancel(job.id)
        proceed.set()
        job.wait(5)

        assert job.state is JobState.CANCELLED
        # "c" was in flight when the cancel arrived, and it is kept -- dropping it would be the
        # opposite of what the rule asks for.
        assert job.results_since(0)[0] == ["a", "b", "c"]

    def test_a_cancelled_job_says_what_it_kept(self):
        # The error field on a cancelled job is not a failure -- it is the sentence a UI shows, and
        # "those frames are kept" is the part a user needs before they trust the button.
        jobs = registry()
        release = threading.Event()

        def slow(_cancel):
            yield "a"
            yield "b"
            release.wait(5)
            yield "c"

        job = jobs.start(slow, total=3)
        while job.completed < 2:
            time.sleep(0.005)
        jobs.cancel(job.id)
        release.set()
        job.wait(5)

        assert job.error == "cancelled after 3 frames; those frames are kept"

    def test_says_one_frame_when_one_was_kept(self):
        # A real run on 2026-09-23 read "cancelled after 1 frames".
        jobs = registry()
        release = threading.Event()

        def slow(_cancel):
            yield "a"
            release.wait(5)

        job = jobs.start(slow, total=3)
        while job.completed < 1:
            time.sleep(0.005)
        jobs.cancel(job.id)
        release.set()
        job.wait(5)

        assert job.error == "cancelled after 1 frame; that frame is kept"

    def test_cancel_stops_the_worker_being_pulled(self):
        # Not merely "the state says cancelled": the generator must stop being advanced, because
        # each pull is a frame of GPU work nobody is waiting for any more.
        jobs = registry()
        pulled: list[int] = []
        reached_two = threading.Event()
        release = threading.Event()

        def counts(_cancel):
            for index in range(100):
                pulled.append(index)
                if index == 1:
                    reached_two.set()
                    release.wait(5)
                yield index

        job = jobs.start(counts, total=100)
        reached_two.wait(5)
        jobs.cancel(job.id)
        release.set()
        job.wait(5)

        assert job.state is JobState.CANCELLED
        # Pulled twice, not a hundred times. The exact count is the generator's own position when
        # the cancel landed, so the claim is "it stopped early", not a particular number.
        assert len(pulled) < 100
        assert job.completed == len(pulled)

    def test_the_worker_can_see_the_cancel_itself(self):
        # A worker doing more than one window checks between them rather than mid-window.
        seen = []

        def watches(cancel):
            yield "a"
            seen.append(cancel.is_set())

        jobs = registry()
        job = jobs.start(watches, run=inline)

        assert job.state in (JobState.COMPLETED, JobState.CANCELLED)
        assert seen == [False]

    def test_cancelling_an_unknown_job_is_an_error(self):
        with pytest.raises(UnknownJobError):
            registry().cancel("nope")

    def test_cancelling_a_finished_job_is_not_an_error(self):
        # The caller wanted it stopped and it is stopped. Reporting the race as a failure would
        # make an honest client retry something it has already achieved.
        jobs = registry()
        job = jobs.start(yields("a"), run=inline)

        assert jobs.cancel(job.id).state is JobState.COMPLETED


class TestTheResultBuffer:
    def test_a_client_that_falls_behind_is_TOLD(self):
        # Not handed frame 20 as though 0-19 had never existed.
        jobs = registry(buffer=5)
        job = jobs.start(yields(*range(20)), run=inline)

        with pytest.raises(ResultsOverflowedError) as raised:
            job.results_since(0)

        assert raised.value.earliest == 15

    def test_the_error_says_where_to_resume_from(self):
        # "You have missed some" is only actionable with "and here is where you can carry on".
        jobs = registry(buffer=5)
        job = jobs.start(yields(*range(20)), run=inline)

        try:
            job.results_since(3)
        except ResultsOverflowedError as raised:
            assert job.results_since(raised.earliest)[0] == [15, 16, 17, 18, 19]

    def test_a_client_keeping_up_never_overflows(self):
        jobs = registry(buffer=5)
        job = jobs.start(yields(*range(4)), run=inline)

        assert job.results_since(0)[0] == [0, 1, 2, 3]

    def test_the_cursor_counts_everything_ever_produced_not_what_is_held(self):
        # Otherwise a client that polls after an overflow would silently re-read old frames.
        jobs = registry(buffer=5)
        job = jobs.start(yields(*range(20)), run=inline)

        assert job.snapshot()["cursor"] == 20
        assert job.snapshot()["completed"] == 20

    def test_a_cursor_the_job_never_issued_is_a_bad_request_not_an_overflow(self):
        # An overflow means results existed and are gone. This means the client has a bug, and
        # telling them apart is the difference between "poll again" and "fix your client".
        job = registry().start(yields("a"), run=inline)

        with pytest.raises(ValueError, match="never issued"):
            job.results_since(99)

    def test_a_buffer_must_hold_something(self):
        with pytest.raises(ValueError, match="at least one"):
            registry(buffer=0)


class TestTheRegistry:
    def test_a_job_can_be_found_by_id(self):
        jobs = registry()
        job = jobs.start(yields("a"), run=inline)

        assert jobs.get(job.id) is job

    def test_an_unknown_id_is_an_error_rather_than_a_None(self):
        with pytest.raises(UnknownJobError):
            registry().get("nope")

    def test_ids_are_distinct(self):
        jobs = registry()
        made = {jobs.start(yields(), run=inline).id for _ in range(20)}

        assert len(made) == 20

    def test_finished_jobs_are_forgotten_oldest_first(self):
        jobs = registry(keep_finished=2)
        old = [jobs.start(yields("a"), run=inline) for _ in range(4)]
        jobs.start(yields("a"), run=inline)

        with pytest.raises(UnknownJobError):
            jobs.get(old[0].id)
        assert jobs.get(old[-1].id).state is JobState.COMPLETED

    def test_a_RUNNING_job_is_never_evicted(self):
        # Evicting one would lose the only handle to work still burning a GPU.
        jobs = registry(keep_finished=0)
        held = threading.Event()

        def waits(_cancel):
            held.wait(5)
            yield "a"

        running = jobs.start(waits, total=1)
        for _ in range(10):
            jobs.start(yields("x"), run=inline)

        assert jobs.get(running.id) is running
        held.set()
        running.wait(5)

    def test_listing_gives_them_in_the_order_they_started(self):
        jobs = registry()
        made = [jobs.start(yields("a"), run=inline) for _ in range(3)]

        assert [each.id for each in jobs.list()] == [each.id for each in made]


class TestOnARealThread:
    def test_start_returns_before_the_work_finishes(self):
        # The route must not block: a propagation runs for minutes.
        jobs = registry()
        release = threading.Event()

        def slow(_cancel):
            release.wait(5)
            yield "a"

        began = time.monotonic()
        job = jobs.start(slow, total=1)
        elapsed = time.monotonic() - began

        assert elapsed < 1.0
        assert job.state is JobState.RUNNING
        release.set()
        assert job.wait(5) is True
        assert job.state is JobState.COMPLETED

    def test_cancelling_reports_itself_before_the_worker_notices(self):
        # "Cancelling" is a real state: the frame in flight still has to finish, and a UI that
        # showed "running" until it did would look like the button had not worked.
        jobs = registry()
        release = threading.Event()

        def slow(_cancel):
            yield "a"
            release.wait(5)
            yield "b"

        job = jobs.start(slow, total=2)
        while job.completed < 1:
            time.sleep(0.005)
        jobs.cancel(job.id)

        assert job.snapshot()["cancelling"] is True
        release.set()
        job.wait(5)
        assert job.snapshot()["cancelling"] is False
        assert job.state is JobState.CANCELLED
