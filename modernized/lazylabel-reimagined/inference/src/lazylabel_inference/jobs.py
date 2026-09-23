"""Propagation as a job you can watch and stop — the half of C11 that is not the algorithm.

`propagate()` is a generator, and that was a deliberate choice rather than a stylistic one: the
frames it has already yielded are the frames already done, so stopping the loop keeps them. This is
the machinery that turns that property into RULE-063's promise — cancel a propagation and the work
it finished is still yours.

Legacy runs the loop on a worker thread and sets `_cancel_requested`; the loop checks it between
chunks. That much is copied. What is not copied is what happens when it FAILS: legacy's
`propagate_in_video` wraps the whole thing in `except Exception: return`, so a run that dies on
frame 40 of 200 ends looking exactly like a run that was 39 frames long. Here a failure is a state
a caller can see, with the frame it reached.

WHY A BOUNDED BUFFER, and why overflow is an error rather than a silent skip. Results are delivered
by cursor: a client polls, says which result it has seen, and gets what came after. A 10,000-frame
job produces 10,000 masks, and holding them all so that a client which stopped polling an hour ago
could still catch up is how a long job becomes an out-of-memory. So the buffer is bounded -- and
when a client falls further behind than the buffer, it is told `results_overflowed` with the cursor
it would need, instead of being handed a later frame as though nothing were missing. A gap the
client cannot see is the failure mode this project keeps finding; a gap it is told about is an
inconvenience.

NOTHING HERE IMPORTS TORCH. The worker is a callable returning an iterator, which is what
`propagate()` is, so every state transition in this file is testable with a fake that yields three
frames and then raises -- including the transitions a real model cannot be made to perform on
demand.
"""

from __future__ import annotations

import itertools
import threading
import uuid
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Iterator


class JobState(str, Enum):
    """Where a job is. A string enum so it serialises as itself."""

    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"

    @property
    def finished(self) -> bool:
        return self is not JobState.RUNNING


class UnknownJobError(Exception):
    """No job by that id: never started, or evicted after finishing."""


class ResultsOverflowedError(Exception):
    """The client fell further behind than the buffer holds, so results were dropped.

    Carries the earliest cursor still available, because "you have missed some" is only actionable
    with "and here is where you can resume".
    """

    def __init__(self, requested: int, earliest: int) -> None:
        super().__init__(
            f"results from cursor {requested} are no longer buffered; the earliest still held is "
            f"{earliest}"
        )
        self.requested = requested
        self.earliest = earliest


@dataclass
class Job:
    """One propagation, and everything a caller can ask about it."""

    id: str
    #: How many frames the plan expects, when it can be known. None when it cannot.
    total: int | None
    state: JobState = JobState.RUNNING
    #: Frames whose results have been produced. The progress numerator.
    completed: int = 0
    #: Why it failed, or why it was cancelled. Never None on a FAILED job.
    error: str | None = None

    _results: deque = field(default_factory=deque, repr=False)
    #: The cursor one past the last result ever appended -- NOT the buffer's length.
    _next_cursor: int = 0
    _cancel: threading.Event = field(default_factory=threading.Event, repr=False)
    _lock: threading.RLock = field(default_factory=threading.RLock, repr=False)
    _done: threading.Event = field(default_factory=threading.Event, repr=False)

    @property
    def cancelling(self) -> bool:
        """Asked to stop but not yet stopped. A real state: the frame in flight still finishes."""
        return self._cancel.is_set() and self.state is JobState.RUNNING

    def snapshot(self) -> dict[str, Any]:
        """State without results, which is what a progress poll actually needs."""
        with self._lock:
            return {
                "id": self.id,
                "state": self.state.value,
                "completed": self.completed,
                "total": self.total,
                "cursor": self._next_cursor,
                "cancelling": self.cancelling,
                "error": self.error,
            }

    def results_since(self, cursor: int) -> tuple[list[Any], int]:
        """Results appended at or after `cursor`, and the cursor to ask with next.

        Raises {@link ResultsOverflowedError} when `cursor` is older than the buffer holds, rather
        than returning later frames as though the gap were not there.
        """
        with self._lock:
            if cursor < 0 or cursor > self._next_cursor:
                # A cursor this job never issued. Not an overflow -- an overflow means results
                # existed and are gone, and telling the two apart is the difference between "poll
                # again from here" and "your client has a bug".
                raise ValueError(
                    f"cursor {cursor} was never issued by job {self.id}; it has reached "
                    f"{self._next_cursor}"
                )
            if cursor < self._earliest():
                raise ResultsOverflowedError(cursor, self._earliest())
            skip = cursor - self._earliest()
            return list(itertools.islice(self._results, skip, None)), self._next_cursor

    def _earliest(self) -> int:
        return self._next_cursor - len(self._results)

    def wait(self, timeout: float | None = None) -> bool:
        """Block until the job finishes. For tests and for a synchronous caller; never for a route."""
        return self._done.wait(timeout)


class JobRegistry:
    """The jobs this process knows about, and the threads running them.

    Single-user and self-hosted (decision 3), so this is a dict in memory rather than a queue in a
    database. A restart loses running jobs, which is correct for a process that also loses the GPU
    state they depend on -- and the frames already committed were written to sidecars as they
    arrived, which is the whole point of committing as you go.
    """

    def __init__(self, *, buffer: int = 500, keep_finished: int = 8) -> None:
        if buffer <= 0:
            raise ValueError(f"the result buffer must hold at least one result, not {buffer}")
        self._buffer = buffer
        self._keep_finished = keep_finished
        self._jobs: dict[str, Job] = {}
        self._order: list[str] = []
        self._lock = threading.RLock()

    def start(
        self,
        work: Callable[[threading.Event], Iterator[Any]],
        *,
        total: int | None = None,
        job_id: str | None = None,
        run: Callable[[Callable[[], None]], None] | None = None,
    ) -> Job:
        """Begin a job and return it immediately, already running.

        `work` receives the cancel event so a worker doing more than one pass can check it between
        them; a worker that only iterates need not look at it, because the driver below stops
        pulling. `run` is how the worker is scheduled -- a thread by default, and in tests a
        function that calls it inline, which makes every assertion deterministic.
        """
        job = Job(id=job_id or uuid.uuid4().hex, total=total)
        job._results = deque(maxlen=self._buffer)

        with self._lock:
            if job.id in self._jobs:
                raise ValueError(f"a job with id {job.id} already exists")
            self._jobs[job.id] = job
            self._order.append(job.id)
            self._evict()

        def drive() -> None:
            try:
                # A propagation yields each OBJECT on each frame, and a frame is the unit: it is
                # what `completed` counts -- it counted objects until 2026-09-23, so two objects
                # over 40 frames read "80 frames" -- and it is what a cancel keeps whole.
                current: object = None
                in_flight: object = None
                for result in work(job._cancel):
                    frame = getattr(result, "source", None)
                    if frame is not None and job._cancel.is_set():
                        # RULE-063: the frame in flight when the cancel arrived finishes, WHOLE.
                        # Stopping between two objects of one frame kept half of it, which Save All
                        # would then write as that frame's entire annotation.
                        if in_flight is None:
                            in_flight = frame
                        if frame != in_flight:
                            break
                    with job._lock:
                        job._results.append(result)
                        job._next_cursor += 1
                        if frame is None or frame != current:
                            job.completed += 1
                    current = frame
                    # A result with no frame is its own unit. Checked AFTER appending, so the one
                    # in flight when cancel arrived is kept -- losing it would be the opposite of
                    # what RULE-063 asks for.
                    if frame is None and job._cancel.is_set():
                        break
                self._finish(job, JobState.CANCELLED if job._cancel.is_set() else JobState.COMPLETED)
            except BaseException as cause:  # noqa: BLE001 - the boundary; a dead worker must show
                self._finish(job, JobState.FAILED, str(cause) or type(cause).__name__)

        if run is None:
            threading.Thread(target=drive, name=f"propagation-{job.id}", daemon=True).start()
        else:
            run(drive)
        return job

    def _finish(self, job: Job, state: JobState, error: str | None = None) -> None:
        with job._lock:
            job.state = state
            if error is not None:
                job.error = error
            elif state is JobState.CANCELLED:
                frames = "1 frame" if job.completed == 1 else f"{job.completed} frames"
                kept = "that frame is" if job.completed == 1 else "those frames are"
                job.error = f"cancelled after {frames}; {kept} kept"
        job._done.set()

    def get(self, job_id: str) -> Job:
        with self._lock:
            job = self._jobs.get(job_id)
        if job is None:
            raise UnknownJobError(f"no job {job_id}")
        return job

    def cancel(self, job_id: str) -> Job:
        """Ask a job to stop. Returns immediately; the frame in flight still finishes.

        Cancelling a job that has already finished is not an error -- the caller wanted it stopped
        and it is stopped, and reporting a race as a failure would make an honest client retry.
        """
        job = self.get(job_id)
        job._cancel.set()
        return job

    def list(self) -> list[Job]:
        with self._lock:
            return [self._jobs[each] for each in self._order if each in self._jobs]

    def _evict(self) -> None:
        """Forget the oldest FINISHED jobs past the keep limit. Running ones are never evicted."""
        finished = [each for each in self._order if self._jobs[each].state.finished]
        for each in finished[: max(0, len(finished) - self._keep_finished)]:
            del self._jobs[each]
            self._order.remove(each)
