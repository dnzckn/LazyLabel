"""Binding the app onto the standard library's HTTP server.

Deliberately thin, and deliberately stdlib. Phase 3 may well adopt an async framework once the model
stack lands -- a SAM encode is seconds of GPU work and wants a real concurrency story -- but the
scaffold should not carry a dependency it does not yet need. `app.py` speaks plain requests, so that
change touches this file and nothing else.
"""

from __future__ import annotations

import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable
from urllib.parse import parse_qs, urlparse

from .app import MAX_BODY_BYTES, Request, Response
from .log import Logger


def serve(handle: Callable[[Request], Response], host: str, port: int, logger: Logger) -> None:
    """Listen until interrupted."""

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _respond(self) -> None:
            parsed = urlparse(self.path)
            length = int(self.headers.get("content-length") or 0)

            if length > MAX_BODY_BYTES:
                # Refuse before reading. Buffering an unbounded body and checking afterwards is the
                # check that cannot work: the memory is already spent by the time it runs.
                self._write(Response(413, '{"status":413,"code":"payload_too_large",'
                                          '"message":"the body is too large"}',
                                     {"content-type": "application/json"}))
                return

            request = Request(
                method=self.command,
                path=parsed.path,
                query={k: v[0] for k, v in parse_qs(parsed.query).items()},
                headers={k.lower(): v for k, v in self.headers.items()},
                body=self.rfile.read(length) if length else b"",
            )
            self._write(handle(request))

        def _write(self, response: Response) -> None:
            payload = response.body.encode("utf-8")
            self.send_response(response.status)
            for name, value in response.headers.items():
                self.send_header(name, value)
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        do_GET = _respond
        do_POST = _respond
        do_PUT = _respond
        do_DELETE = _respond

        def log_message(self, fmt: str, *args: object) -> None:
            # The app already logs one structured line per request; the default here would add an
            # unstructured second one on stderr.
            pass

    server = ThreadingHTTPServer((host, port), Handler)
    logger.log("info", "listening", host=host, port=port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.log("info", "shutting down", signal="SIGINT")
    finally:
        server.server_close()


def build_deps(config, models, logger, manifest_error=None):
    """Turn a configuration into the dependencies the app runs on.

    ITS OWN FUNCTION SO IT CAN BE TESTED, and that is not a style preference. Until it existed the
    wiring lived inline in `main()`, `Deps.service` defaulted to None, and nothing constructed the
    service at all -- so a machine with checkpoints, a manifest and a GPU answered 503 on every
    route that reads an image. The whole suite passed throughout, because every test builds its own
    `Deps` and never ran the line that production runs.

    That is this project's recurring defect at the process level: a thing that works, a test that
    proves it works, and nothing calling it. The wiring is the part no unit test was looking at.
    """
    from .app import Deps
    from .service import InferenceService

    # None when no root is configured -- the honest state, not a failure. /health and /models still
    # answer, and they are what an operator installing checkpoints needs before anything else.
    service = (
        None
        if config.dataset_root is None
        else InferenceService(
            models=models, model_dir=config.model_dir, dataset_root=config.dataset_root
        )
    )
    if service is None:
        logger.log(
            "warn",
            "no dataset root is configured, so the routes that read images will answer 503",
            hint="set LAZYLABEL_DATASET_ROOT to the folder holding your images",
        )

    return Deps(
        models=models,
        model_dir=config.model_dir,
        logger=logger,
        manifest_error=manifest_error,
        service=service,
    )


def main() -> int:
    """Entry point: read the configuration, load the manifest, listen."""
    from .app import Deps, create_app
    from .config import ConfigError, load_config
    from .manifest import ManifestError, load_manifest

    logger = Logger()
    try:
        config = load_config()
    except ConfigError as exc:
        logger.log("error", "the inference service could not start", reason=str(exc))
        return 1

    models = []
    manifest_error: ManifestError | None = None
    try:
        models = load_manifest(config.manifest_path)
    except ManifestError as exc:
        # Start anyway, and say so on /health. A service that refuses to start is indistinguishable
        # from one that is not deployed; one that starts and reports why it cannot work is something
        # an operator can act on.
        manifest_error = exc
        logger.log("error", "the model manifest could not be read", reason=str(exc))

    handle = create_app(build_deps(config, models, logger, manifest_error))
    serve(handle, config.host, config.port, logger)
    return 0


if __name__ == "__main__":
    sys.exit(main())
