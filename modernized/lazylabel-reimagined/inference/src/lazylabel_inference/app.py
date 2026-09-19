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

from .availability import Availability, check_availability
from .capabilities import CAPABILITIES
from .log import Logger, silent_logger
from .manifest import CheckpointStatus, ManifestError, ModelEntry, check_checkpoint
from .prompts import (
    Box,
    ImageNotSetError,
    InferenceError,
    InvalidPromptError,
    ModelNotLoadedError,
    Point,
    Prompt,
)
from .service import ImageUnreadableError, InferenceService, UnknownHandleError, encode_mask

MAX_BODY_BYTES = 64 * 1024 * 1024


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
    logger: Logger = field(default_factory=lambda: silent_logger)
    availability: Callable[[], Availability] = check_availability
    manifest_error: ManifestError | None = None
    """Skip hashing gigabytes on every health probe; the models route still verifies in full."""
    verify_on_health: bool = False
    """Present once a dataset root is configured; None leaves the prompt routes reporting 503."""
    service: InferenceService | None = None


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

    if path == "/inference/embeddings" and method == "POST":
        return _embeddings(deps, request)
    if path == "/inference/segment" and method == "POST":
        return _segment(deps, request)

    # Still Phase 6. The contract is fixed in AI_NATIVE_SPEC.md section 3.
    not_built = {
        ("/inference/embeddings", "POST"): ("C3", "prepare an image for interactive segmentation"),
        ("/inference/segment", "POST"): ("C3", "one SAM prediction from clicks or a box"),
        ("/inference/propagations", "POST"): ("C11", "start a propagation job over a sequence"),
        ("/inference/propagations", "GET"): ("C11", "job state and per-frame results"),
        ("/inference/archetypes", "POST"): ("C10", "find archetype frames in a sequence"),
    }
    if (path, method) in not_built:
        capability, summary = not_built[(path, method)]
        raise _pending(capability, summary)

    if method == "DELETE" and _PROPAGATION_JOB.match(path):
        raise _pending("C11", "cancel a running propagation, keeping frames already committed")

    allowed = sorted({m for p, m in not_built if p == path} | _fixed_methods(path))
    if allowed:
        raise HttpError(405, "method_not_allowed", f"use {' or '.join(allowed)} here")

    raise HttpError(404, "not_found", f"no route for {request.path}")


def _fixed_methods(path: str) -> set[str]:
    if path in ("/health", "/models"):
        return {"GET"}
    if path in ("/inference/embeddings", "/inference/segment"):
        return {"POST"}
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

    try:
        handle, cached = _service(deps).embed(image, model, adjustments)
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
    return _json(
        200,
        {
            "models": [
                {
                    "name": s.entry.name,
                    "family": s.entry.family,
                    "size": s.entry.size,
                    "videoCapable": s.entry.is_video_capable,
                    "present": s.present,
                    "verified": s.verified,
                    "detail": s.detail,
                }
                for s in statuses
            ]
        },
    )


def _statuses(deps: Deps, *, verify: bool) -> list[CheckpointStatus]:
    return [check_checkpoint(entry, deps.model_dir, verify_hash=verify) for entry in deps.models]


def _json(status: int, body: Any) -> Response:
    return Response(status, json.dumps(body), {"content-type": "application/json; charset=utf-8"})


def _problem(error: HttpError) -> Response:
    body: dict[str, Any] = {"status": error.status, "code": error.code, "message": error.message}
    if error.detail is not None:
        body["detail"] = error.detail
    return _json(error.status, body)
