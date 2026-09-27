"""The inference service's routes, as a transport-free request handler.

Same shape as the Node API's, and for the same reason: ``handle`` takes a plain request and returns
a plain response, so the contract is tested where it is decided and the HTTP binding has no logic to
get wrong.

Phase 2 scaffolds this service; Phase 3 builds it. What works now is everything that can be correct
without a model loaded -- health, availability, and the manifest that decides whether a checkpoint is
trustworthy. The prompt and propagation routes answer **501**, which is the honest status: the route
exists, the contract is fixed, and the implementation is not here yet. Answering 200 with an empty
mask would be the failure `ASSESSMENT.md` 5.4 records of the legacy code, where a failure is
presented as a successful empty result and the caller cannot tell the difference.
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .availability import Accelerator, Availability, check_availability, describe_accelerator
from .capabilities import CAPABILITIES
from .log import Logger, silent_logger
from .manifest import CheckpointStatus, ManifestError, ModelEntry, check_checkpoint, load_manifest
from .prompts import (
    Box,
    ImageNotSetError,
    InferenceError,
    InvalidPromptError,
    ModelNotLoadedError,
    Point,
    Prompt,
)
from .jobs import (
    Job,
    JobRegistry,
    ResultsOverflowedError,
    UnknownJobError,
)
from .archetypes import TooFewFrames
from .propagation import PropagationRequest, ReferenceObject
from .service import (
    ImageUnreadableError,
    InferenceService,
    UnknownHandleError,
    decode_mask,
    encode_mask,
)
from .windows import DEFAULT_WINDOW, effective, novel_frames, plan

# The largest body the service accepts: refused before it is read (server.py), and checked here.
#
# Sized for the largest body its one client legitimately sends, which is RULE-089's rendered picture:
# the API posts it as a base64 PNG inside JSON. At the spec's supported working size of 50 megapixels,
# an incompressible 8-bit RGB picture is 150 MB as PNG and 200 MB as base64. The cap was 64 MiB until
# 2026-09-23, and a 50-megapixel colour photograph -- measured at 112 MB as PNG, 149 MB as base64 --
# was refused, so Operate On View failed on exactly the images the spec calls supported. It is still
# a bound, which is what SEC-06 asks of an allocation; nothing asks that the bound be small.
MAX_BODY_BYTES = 256 * 1024 * 1024


@dataclass(frozen=True)
class Request:
    method: str
    path: str
    query: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes = b""


@dataclass(frozen=True)
class Response:
    status: int
    body: str
    headers: dict[str, str] = field(default_factory=dict)


class HttpError(Exception):
    def __init__(self, status: int, code: str, message: str, detail: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.detail = detail


@dataclass
class Deps:
    """What the app needs to answer. Injectable so every branch is testable without a model."""

    models: list[ModelEntry] = field(default_factory=list)
    model_dir: Path = Path(".")
    """Where the manifest is read from again when the model list is refreshed. None: it cannot be."""
    manifest_path: Path | None = None
    logger: Logger = field(default_factory=lambda: silent_logger)
    availability: Callable[[], Availability] = check_availability
    """Which device inference runs on. Separate from availability: a machine can have a GPU and no
    PyTorch, or PyTorch and no GPU, and one failing must not make the other unanswerable."""
    accelerator: Callable[[], Accelerator] = describe_accelerator
    manifest_error: ManifestError | None = None
    """Skip hashing gigabytes on every health probe; the models route still verifies in full."""
    verify_on_health: bool = False
    """Present once a dataset root is configured; None leaves the prompt routes reporting 503."""
    service: InferenceService | None = None
    """Propagation jobs this process is running. In memory, because decision 3 is single-user."""
    jobs: JobRegistry = field(default_factory=JobRegistry)
    """What actually propagates: given a parsed request and a cancel event, yields frame results.

    Injected rather than reached for, so the job ROUTES are testable without a checkpoint -- which
    is most of C11, since every state a caller can observe is a state of the job rather than of the
    model. None means no video-capable model is configured, and the route says 503."""
    propagator: Callable[[Any, Any], Any] | None = None
    """C10, bound the same way and for the same reason: injected so the route is testable without
    a checkpoint. None means no dataset root, and the route says 503."""
    archetyper: Callable[[Any, Any], Any] | None = None


_PROPAGATION_JOB = re.compile(r"^/inference/propagations/([^/]+)$")


def create_app(deps: Deps) -> Callable[[Request], Response]:
    """Build the request handler."""

    def handle(request: Request) -> Response:
        correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
        scoped = deps.logger.child(
            correlation_id=correlation_id, method=request.method, path=request.path
        )

        try:
            if len(request.body) > MAX_BODY_BYTES:
                raise HttpError(413, "payload_too_large", f"the body exceeds {MAX_BODY_BYTES} bytes")

            response = _route(deps, request)
            scoped.log("info", "request handled", status=response.status)
        except HttpError as error:
            scoped.log("warn", "request failed", status=error.status, code=error.code)
            response = _problem(error)
        except Exception as cause:  # noqa: BLE001 - the boundary; nothing escapes as a stack trace
            scoped.log("error", "request raised", reason=str(cause), kind=type(cause).__name__)
            response = _problem(HttpError(500, "internal", str(cause)))

        return Response(
            response.status,
            response.body,
            {**response.headers, "x-correlation-id": correlation_id},
        )

    return handle


def _route(deps: Deps, request: Request) -> Response:
    path, method = request.path.rstrip("/") or "/", request.method

    if path == "/health" and method == "GET":
        return _health(deps)
    if path == "/models" and method == "GET":
        return _models(deps)

    # Legacy's model controls (CP-49): Refresh, Load, Unload, and what "Current: …" reports.
    if path == "/inference/models/loaded" and method == "GET":
        return _json(200, {"loaded": _loaded(deps)})
    if path == "/inference/models/load" and method == "POST":
        return _load_model(deps, request)
    if path == "/inference/models/unload" and method == "POST":
        return _unload_model(deps, request)
    if path == "/inference/models/refresh" and method == "POST":
        return _refresh_models(deps)

    if path == "/inference/embeddings" and method == "POST":
        return _embeddings(deps, request)
    if path == "/inference/segment" and method == "POST":
        return _segment(deps, request)

    # C11's three, built. What a caller observes of a propagation is the state of the JOB rather
    # than of the model, so all of it is testable with an injected propagator and no checkpoint;
    # what still needs one is proving the RESULTS match legacy, which is Phase 6 criterion 2.
    if path == "/inference/propagations" and method == "POST":
        return _start_propagation(deps, request)
    if path == "/inference/propagations" and method == "GET":
        return _propagation_state(deps, request)

    job_id = _PROPAGATION_JOB.match(path)
    if job_id is not None and method == "DELETE":
        return _cancel_propagation(deps, job_id.group(1))

    # C10's module is complete and differential-tested; what is missing is the route's own
    # contract. C3's and C11's entries used to live here and came off as each was built -- which
    # is the only thing this table is for. It is NOT a place to park a built route: the handlers
    # above return first, so an entry for one would never fire, and it would sit waiting to
    # resurrect the moment someone moved a handler below it.
    if path == "/inference/archetypes" and method == "POST":
        return _archetypes(deps, request)

    # Empty, and kept rather than deleted: it is the shape a route takes while its contract is
    # fixed and its implementation is not, and the next capability to reach that state needs a
    # line rather than a decision. It must NOT be used to park a built route -- the handlers above
    # return first, so an entry for one would never fire and would sit waiting to resurrect the
    # moment someone moved a handler below it.
    not_built: dict[tuple[str, str], tuple[str, str]] = {}
    if (path, method) in not_built:
        capability, summary = not_built[(path, method)]
        raise _pending(capability, summary)

    allowed = sorted({m for p, m in not_built if p == path} | _fixed_methods(path))
    if allowed:
        raise HttpError(405, "method_not_allowed", f"use {' or '.join(allowed)} here")

    raise HttpError(404, "not_found", f"no route for {request.path}")


def _fixed_methods(path: str) -> set[str]:
    if path in ("/health", "/models", "/inference/models/loaded"):
        return {"GET"}
    if path in ("/inference/models/load", "/inference/models/unload", "/inference/models/refresh"):
        return {"POST"}
    if path in ("/inference/embeddings", "/inference/segment"):
        return {"POST"}
    if path == "/inference/propagations":
        return {"POST", "GET"}
    if path == "/inference/archetypes":
        return {"POST"}
    if _PROPAGATION_JOB.match(path):
        return {"DELETE"}
    return set()


def _body(request: Request) -> dict[str, Any]:
    if not request.body:
        raise HttpError(400, "bad_request", "the request body is empty")
    try:
        parsed = json.loads(request.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as cause:
        raise HttpError(400, "bad_request", f"the request body is not JSON: {cause}") from cause
    if not isinstance(parsed, dict):
        raise HttpError(400, "bad_request", "the request body must be a JSON object")
    return parsed


def _service(deps: Deps) -> InferenceService:
    if deps.service is None:
        raise HttpError(
            503,
            "inference_unavailable",
            "this service has no dataset root configured, so it cannot read images",
        )
    return deps.service


def _inference_error(cause: InferenceError) -> HttpError:
    """Map a typed inference failure onto a status a client can act on.

    Every branch is a DIFFERENT status on purpose. Phase 3 exit criterion 4 is not satisfied by
    replacing legacy's None with a single 500: a bad prompt, an expired handle and a model that
    will not load need three different things from the caller.
    """
    if isinstance(cause, UnknownHandleError):
        return HttpError(404, "unknown_handle", str(cause))
    if isinstance(cause, (InvalidPromptError,)):
        return HttpError(422, "invalid_prompt", str(cause))
    if isinstance(cause, ImageUnreadableError):
        return HttpError(422, "image_unreadable", str(cause))
    if isinstance(cause, ImageNotSetError):
        return HttpError(409, "image_not_set", str(cause))
    if isinstance(cause, ModelNotLoadedError):
        return HttpError(503, "model_unavailable", str(cause))
    return HttpError(500, "prediction_failed", str(cause))


def _embeddings(deps: Deps, request: Request) -> Response:
    body = _body(request)
    image = body.get("image")
    model = body.get("model")
    if not isinstance(image, str) or not isinstance(model, str):
        raise HttpError(400, "bad_request", "an embedding request needs 'image' and 'model' strings")

    adjustments = body.get("adjustments")
    if adjustments is not None and not isinstance(adjustments, dict):
        raise HttpError(400, "bad_request", "'adjustments' must be an object of numbers")

    # RULE-089: the API has rendered what the user can SEE and posted it, so the file on disk is
    # not read. Absent is the rule's default -- the model segments the original.
    pixels = body.get("pixels")
    if pixels is not None and not isinstance(pixels, str):
        raise HttpError(400, "bad_request", "'pixels' must be a base64 PNG string")

    # The processing chain those pixels went through. Part of the view, so part of the cache key:
    # without it, a changed rescale with unchanged adjustments answered from the old encoding.
    processing = body.get("processing")
    if processing is not None and not isinstance(processing, str):
        raise HttpError(400, "bad_request", "'processing' must be the pixels route's query string")

    try:
        handle, cached = _service(deps).embed(image, model, adjustments, pixels, processing)
    except InferenceError as cause:
        raise _inference_error(cause) from cause

    # Saying whether it was cached is not a statistic: a cold encode is seconds, and the client
    # shows a progress state for it rather than hiding it (RULE-074).
    return _json(200, {"handle": handle, "cached": cached})


def _segment(deps: Deps, request: Request) -> Response:
    body = _body(request)
    handle = body.get("handle")
    if not isinstance(handle, str):
        raise HttpError(400, "bad_request", "a segment request needs a 'handle' string")

    points: list[Point] = []
    for raw in body.get("points") or []:
        if not isinstance(raw, dict) or not isinstance(raw.get("x"), (int, float)) or not isinstance(
            raw.get("y"), (int, float)
        ):
            raise HttpError(400, "bad_request", "each point needs numeric 'x' and 'y'")
        points.append(Point(float(raw["x"]), float(raw["y"]), bool(raw.get("positive", True))))

    box = None
    raw_box = body.get("box")
    if raw_box is not None:
        if not isinstance(raw_box, list) or len(raw_box) != 4 or not all(
            isinstance(v, (int, float)) for v in raw_box
        ):
            raise HttpError(400, "bad_request", "'box' must be four numbers, [x1, y1, x2, y2]")
        box = Box(*(float(v) for v in raw_box))

    try:
        prediction = _service(deps).segment(handle, Prompt(points=tuple(points), box=box))
    except InferenceError as cause:
        raise _inference_error(cause) from cause

    return _json(
        200,
        {
            "mask": encode_mask(prediction.mask),
            "score": prediction.score,
            # RULE-020 chose one of three. Reporting all three lets a client show that it was close
            # rather than presenting a marginal mask as a confident one.
            "chosen": prediction.chosen,
            "alternatives": list(prediction.alternatives),
        },
    )


def _propagation_request(body: dict[str, Any]) -> PropagationRequest:
    """Parse and CHECK a propagation body, before a model is loaded or a thread is started.

    Every refusal here is a 400 the caller can fix. The alternative -- accepting a request with no
    references and discovering it three minutes into a GPU job -- is the shape of failure this
    service exists to stop.
    """
    raw_sequence = body.get("sequence")
    if not isinstance(raw_sequence, list) or not raw_sequence:
        raise HttpError(400, "bad_request", "a propagation needs a non-empty 'sequence' of images")
    if not all(isinstance(each, str) and each for each in raw_sequence):
        raise HttpError(400, "bad_request", "every entry in 'sequence' must be an image key")
    sequence = tuple(raw_sequence)

    raw_references = body.get("references")
    if not isinstance(raw_references, list) or not raw_references:
        # Nothing to carry. Legacy starts the job anyway and produces empty masks for every frame.
        raise HttpError(
            400, "bad_request", "a propagation needs at least one reference frame to carry from"
        )
    references = []
    for each in raw_references:
        if not isinstance(each, int) or isinstance(each, bool) or not 0 <= each < len(sequence):
            raise HttpError(
                400,
                "bad_request",
                f"each reference must be a frame position within the sequence; got {each!r}",
            )
        references.append(each)

    def bound(name: str) -> int | None:
        value = body.get(name)
        if value is None:
            return None
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value < len(sequence):
            raise HttpError(400, "bad_request", f"'{name}' must be a frame position, got {value!r}")
        return value

    window = body.get("window", DEFAULT_WINDOW)
    if not isinstance(window, int) or isinstance(window, bool) or window <= 0:
        raise HttpError(400, "bad_request", f"'window' must be a positive frame count, got {window!r}")

    streaming = body.get("streaming", True)
    if not isinstance(streaming, bool):
        raise HttpError(400, "bad_request", "'streaming' must be true or false")

    model = body.get("model")
    if model is not None and not isinstance(model, str):
        raise HttpError(400, "bad_request", "'model' must be a model name")

    return PropagationRequest(
        objects=_reference_objects(body, len(sequence)),
        sequence=sequence,
        references=tuple(sorted(set(references))),
        start=bound("start"),
        end=bound("end"),
        streaming=streaming,
        window=window,
        model=model,
    )


def _reference_objects(body: dict[str, Any], length: int) -> tuple[ReferenceObject, ...]:
    """The masks to carry, decoded here so no layer below this one parses a wire format.

    They are the user's OWN annotations rather than prompts re-derived from them: legacy seeds
    propagation with `add_new_mask`, and re-clicking an object someone already drew gives a mask
    close to theirs and not theirs.
    """
    raw = body.get("objects")
    if raw is None:
        return ()
    if not isinstance(raw, list):
        raise HttpError(400, "bad_request", "'objects' must be a list of reference masks")

    objects: list[ReferenceObject] = []
    for entry in raw:
        if not isinstance(entry, dict):
            raise HttpError(400, "bad_request", "each reference object must be an object")

        frame = entry.get("frame")
        if not isinstance(frame, int) or isinstance(frame, bool) or not 0 <= frame < length:
            raise HttpError(
                400, "bad_request", f"a reference object needs a frame position, got {frame!r}"
            )

        object_id = entry.get("objectId")
        if not isinstance(object_id, int) or isinstance(object_id, bool):
            raise HttpError(400, "bad_request", "a reference object needs an integer 'objectId'")

        try:
            mask = decode_mask(entry.get("mask"))
        except InferenceError as cause:
            raise _inference_error(cause) from cause

        objects.append(ReferenceObject(frame=frame, object_id=object_id, mask=mask))

    return tuple(objects)


def _frames_to_cover(wanted: PropagationRequest) -> int:
    """How many frames the job will actually produce results for -- the progress denominator.

    RULE-025 runs BOTH ways from the earliest reference, and RULE-026 windows each pass. Counting
    each window's full span would exceed the sequence length, because overlap frames are covered
    twice and kept once; `novel_frames` is what each window contributes.

    Over BOTH passes at once, because the reference frame opens both and is reported once. Counted
    per pass, as it was until 2026-09-23, a reference mid-sequence made the total one more than the
    frames the job could ever complete, so its progress stopped one short of the end.
    """
    window, overlap = effective(
        len(wanted.sequence), wanted.window, streaming=wanted.streaming
    )
    lowest = wanted.lowest_reference
    passes = [
        *plan(lowest, wanted.end if wanted.end is not None else len(wanted.sequence) - 1,
              window=window, overlap=overlap),
        *plan(lowest, wanted.start if wanted.start is not None else 0,
              window=window, overlap=overlap, reverse=True),
    ]
    return sum(len(each) for each in novel_frames(passes))


def _start_propagation(deps: Deps, request: Request) -> Response:
    wanted = _propagation_request(_body(request))

    if deps.propagator is None:
        # The same 503 the prompt routes give, and for the same reason: the route exists and the
        # contract holds, and this machine has no video-capable model to honour it with.
        raise HttpError(
            503,
            "inference_unavailable",
            "no video-capable model is configured, so nothing can be propagated",
        )

    propagator = deps.propagator
    job = deps.jobs.start(
        lambda cancel: propagator(wanted, cancel),
        total=_frames_to_cover(wanted),
    )
    # 202: accepted and running, with nowhere to look yet but the job itself.
    return _json(202, {**job.snapshot(), "results": []})


def _propagation_state(deps: Deps, request: Request) -> Response:
    """Job state, and the results produced since the caller's cursor.

    Without an id this lists the jobs, which is what a client that has just reconnected needs: the
    alternative is a running propagation nobody holds a handle to.
    """
    job_id = request.query.get("id")
    if job_id is None:
        return _json(200, {"jobs": [each.snapshot() for each in deps.jobs.list()]})

    job = _job(deps, job_id)

    raw_cursor = request.query.get("cursor", "0")
    try:
        cursor = int(raw_cursor)
    except ValueError as cause:
        raise HttpError(400, "bad_request", f"'cursor' must be a number, got {raw_cursor!r}") from cause

    try:
        results, next_cursor = job.results_since(cursor)
    except ResultsOverflowedError as cause:
        # 410: they existed and are gone. Not a 404 (the job is right here) and emphatically not a
        # 200 with later frames, which would hide the gap the client most needs to know about.
        raise HttpError(
            410,
            "results_overflowed",
            str(cause),
            {"earliest": cause.earliest, "requested": cause.requested},
        ) from cause
    except ValueError as cause:
        raise HttpError(400, "bad_request", str(cause)) from cause

    return _json(
        200,
        {**job.snapshot(), "cursor": next_cursor, "results": [_frame(each) for each in results]},
    )


def _cancel_propagation(deps: Deps, job_id: str) -> Response:
    """Ask a job to stop, keeping what it has done. RULE-063.

    Returns at once: the frame in flight still finishes, so the job reports `cancelling` until it
    does. A route that blocked until the worker noticed would make Cancel feel as unresponsive as
    the thing being cancelled.
    """
    return _json(200, _job(deps, job_id, cancel=True).snapshot())


def _job(deps: Deps, job_id: str, *, cancel: bool = False) -> Job:
    try:
        return deps.jobs.cancel(job_id) if cancel else deps.jobs.get(job_id)
    except UnknownJobError as cause:
        raise HttpError(404, "unknown_job", str(cause)) from cause


def _frame(result: Any) -> dict[str, Any]:
    """One propagated object on one frame, as the wire carries it."""
    return {
        "source": result.source,
        "objectId": result.object_id,
        "mask": encode_mask(result.mask),
        "confidence": result.confidence,
    }


def _archetypes(deps: Deps, request: Request) -> Response:
    """C10: which frames of a sequence are worth annotating by hand.

    One request and one answer rather than a job, unlike propagation. It is a single pass that
    embeds every frame once: there is no per-frame result to stream and nothing a partial answer
    would be good for -- half the clusters is not half the suggestions, it is a different set.
    """
    body = _body(request)

    raw = body.get("sequence")
    if not isinstance(raw, list) or not raw:
        raise HttpError(400, "bad_request", "finding archetypes needs a non-empty 'sequence'")
    if not all(isinstance(each, str) and each for each in raw):
        raise HttpError(400, "bad_request", "every entry in 'sequence' must be an image key")

    model = body.get("model")
    if model is not None and not isinstance(model, str):
        raise HttpError(400, "bad_request", "'model' must be a model name")

    if deps.archetyper is None:
        raise HttpError(
            503,
            "inference_unavailable",
            "this service has no dataset root configured, so it cannot read the sequence",
        )

    try:
        found = deps.archetyper(tuple(raw), model)
    except TooFewFrames as cause:
        # 422, not 400: the request is well formed and this sequence cannot answer it. A user with
        # four frames has made no mistake, and a 400 would tell them they had.
        raise HttpError(422, "too_few_frames", str(cause)) from cause
    except InferenceError as cause:
        raise _inference_error(cause) from cause

    return _json(
        200,
        {
            "suggested": list(found.suggested),
            "budget": found.budget,
            "clusters": found.clusters,
            "noise": found.noise,
            # Legacy computes this comparison to pick a progress message and throws it away. It is
            # the difference between "here are your twenty frames" and "this sequence is too
            # uniform to find twenty distinct ones", and a user who cannot tell those apart will
            # assume the feature is broken.
            "fellShort": found.fell_short,
            "unreadable": [{"key": key, "reason": reason} for key, reason in found.unreadable],
        },
    )


def _pending(capability: str, summary: str) -> HttpError:
    entry = next((c for c in CAPABILITIES if c.id == capability), None)
    phase = entry.phase if entry else "a later phase"
    return HttpError(
        501,
        "not_implemented",
        f"{summary} is built in {phase}",
        {"capability": capability, "phase": phase},
    )


def _health(deps: Deps) -> Response:
    availability = deps.availability()
    statuses = _statuses(deps, verify=deps.verify_on_health)
    usable = [s for s in statuses if s.usable] if deps.verify_on_health else [s for s in statuses if s.present]

    # Three separate facts, because they fail independently and the caller acts differently on each.
    # A service with PyTorch and no checkpoints is a configuration problem; one with checkpoints and
    # no PyTorch is an installation problem; collapsing them into "unhealthy" helps nobody.
    ready = availability.available and bool(usable)
    return _json(
        200 if ready else 503,
        {
            "status": "ok" if ready else "unavailable",
            "ai": {
                "available": availability.available,
                "reason": availability.reason,
                "torchVersion": availability.torch_version,
                "videoCapable": availability.video_capable,
                # Which device the model runs on. The browser cannot find this out for itself --
                # the model is on a server it cannot see -- and it is the answer to "why is every
                # click slow", which is otherwise unanswerable to the person experiencing it.
                "accelerator": deps.accelerator().summary,
            },
            "models": {
                "declared": len(deps.models),
                "usable": len(usable),
                "manifestError": str(deps.manifest_error) if deps.manifest_error else None,
            },
            # The API turns this into "AI tools disabled, and here is why" rather than a dead button.
            "reason": None if ready else _why_not(availability, deps, statuses),
        },
    )


def _why_not(availability: Availability, deps: Deps, statuses: list[CheckpointStatus]) -> str:
    if deps.manifest_error is not None:
        return f"The model manifest could not be read: {deps.manifest_error}"
    if not availability.available:
        return f"{availability.reason} {availability.install_hint}"
    if not deps.models:
        return "No models are declared in the manifest."
    broken = [s for s in statuses if not s.usable]
    if broken:
        return "No usable checkpoint: " + "; ".join(f"{s.entry.name}: {s.detail}" for s in broken)
    return "Not ready."


def _models(deps: Deps) -> Response:
    if deps.manifest_error is not None:
        raise HttpError(503, "manifest_unreadable", str(deps.manifest_error))

    # Verified in full here. This route is what an operator calls to find out whether the install is
    # sound, so it does the expensive check rather than the cheap one.
    statuses = _statuses(deps, verify=True)
    loaded = set(_loaded(deps))
    return _json(
        200,
        {
            "models": [
                {
                    "name": s.entry.name,
                    "family": s.entry.family,
                    "size": s.entry.size,
                    "videoCapable": s.entry.is_video_capable,
                    # Whether it answers prompts. The embedder Find Archetypes uses is in the same
                    # manifest and does not; the picker offered it for the AI tool until 2026-09-23.
                    "segmenter": s.entry.is_segmenter,
                    "present": s.present,
                    "verified": s.verified,
                    "detail": s.detail,
                    # In memory now: legacy's "Current: …" (CP-49).
                    "loaded": s.entry.name in loaded,
                }
                for s in statuses
            ]
        },
    )


def _loaded(deps: Deps) -> list[str]:
    """The models in memory. None without a service, which is the only thing that loads them."""
    return [] if deps.service is None else deps.service.loaded()


def _model_name(body: dict[str, Any]) -> str:
    model = body.get("model")
    if not isinstance(model, str) or not model:
        raise HttpError(400, "bad_request", "'model' must be a model name")
    return model


def _load_model(deps: Deps, request: Request) -> Response:
    """Legacy's Load (L ui/main_window.py:1234-1279): the model in memory now, and only it.

    Nothing is fetched: a model the manifest does not list, or whose file fails its hash, is
    refused the way its first use would refuse it.
    """
    model = _model_name(_body(request))
    service = _service(deps)
    try:
        loaded = service.load(model)
    except InferenceError as cause:
        raise _inference_error(cause) from cause
    return _json(200, {"loaded": loaded})


def _unload_model(deps: Deps, request: Request) -> Response:
    """Legacy's Unload (L ui/main_window.py:1281-1305): the model out of memory, and the GPU's too.

    The named model, or all of them with no body. Nothing loaded is an answer, not an error:
    `unloaded` is empty and the browser says legacy's "No model loaded".
    """
    body = _body(request) if request.body else {}
    model = None if body.get("model") is None else _model_name(body)
    service = _service(deps)
    unloaded = service.unload(model)
    return _json(200, {"unloaded": unloaded, "loaded": service.loaded()})


def _refresh_models(deps: Deps) -> Response:
    """Legacy's Refresh (L ui/main_window.py:1204-1212): the list read again, then answered as
    `/models` answers.

    Legacy scans its models folder for files; here the manifest is read again, because a checkpoint
    the manifest does not list is not loadable. When it cannot be read, the list in force stays, as
    legacy keeps its list when the folder has gone, and the reason is the answer.
    """
    if deps.manifest_path is None:
        raise HttpError(503, "manifest_unreadable", "no model manifest is configured")
    try:
        entries = load_manifest(deps.manifest_path)
    except ManifestError as cause:
        raise HttpError(503, "manifest_unreadable", str(cause)) from cause

    deps.manifest_error = None
    if deps.service is not None:
        deps.service.replace_models(entries)
    if deps.service is None or deps.models is not deps.service.models:
        deps.models[:] = entries
    return _models(deps)


def _statuses(deps: Deps, *, verify: bool) -> list[CheckpointStatus]:
    return [check_checkpoint(entry, deps.model_dir, verify_hash=verify) for entry in deps.models]


def _json(status: int, body: Any) -> Response:
    return Response(status, json.dumps(body), {"content-type": "application/json; charset=utf-8"})


def _problem(error: HttpError) -> Response:
    body: dict[str, Any] = {"status": error.status, "code": error.code, "message": error.message}
    if error.detail is not None:
        body["detail"] = error.detail
    return _json(error.status, body)
