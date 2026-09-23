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
        **(
            {}
            if service is None
            else {
                "propagator": _propagator_for(service, models, logger),
                "archetyper": _archetyper_for(service, models, logger),
            }
        ),
    )


def _archetyper_for(service, models, logger):
    """C10's feature extractor, bound to this service.

    A different model from the prompt and video ones: archetype finding embeds whole FRAMES to find
    scenes, which is a feature extractor's job rather than a segmenter's. `load_embedder` builds it
    with `weights=None` so nothing is fetched from the network, and `service.verified` runs first,
    so the only bytes that reach it are the ones the manifest vouched for.
    """
    from .archetypes import find_archetypes, load_embedder
    from .prompts import ModelNotLoadedError

    loaded: dict[str, object] = {}

    def find(sequence, wanted):
        entry = _embedder_entry(models, wanted)
        if entry.name not in loaded:
            service.verified(entry)
            logger.log("info", "loading the archetype embedder", model=entry.name)
            loaded[entry.name] = load_embedder(entry, service.model_dir, device=service.device)

        images = [(key, service.read_image(key)) for key in sequence]
        return find_archetypes(images, loaded[entry.name])

    def _embedder_entry(entries, wanted):
        """The feature extractor to embed frames with: the one asked for, else the only one listed.

        Chosen by FAMILY. This used to take the manifest's first entry whatever it was, on the
        theory that any entry would do, and `load_embedder` refuses anything that is not an
        embedder. So every manifest listing SAM first, the example included, failed Find Archetypes
        on every call. The browser never names a model here, so the default is the path that runs.

        Several embedders are not chosen between, for the reason `_video_entry` gives: which
        weights embedded the frames decides which frames get suggested. With none, this fails when
        the call runs rather than when the service starts, because which checkpoints are usable can
        change while it runs.
        """
        embedders = [each for each in entries if each.family == "embedder"]
        if wanted is not None:
            for each in embedders:
                if each.name == wanted:
                    return each
            raise ModelNotLoadedError(f"no embedder called {wanted!r} is in the manifest")
        if not embedders:
            raise ModelNotLoadedError(
                "no embedder is in the manifest. Find Archetypes needs the MobileNetV3 small "
                'checkpoint listed with family "embedder" and size "mobilenet_v3_small"'
            )
        if len(embedders) > 1:
            raise ModelNotLoadedError(
                "several embedders are listed ("
                + ", ".join(each.name for each in embedders)
                + "); name the one to use"
            )
        return embedders[0]

    return find


def _propagator_for(service, models, logger):
    """What runs inside a propagation job, bound to this service.

    Built here rather than inside the runner because the runner is index arithmetic and takes a
    predictor and a reader -- which is what lets its numbering be tested against a fake instead of
    against a GPU. This is the three lines that turn those arguments into real ones.

    The VIDEO predictor, not the image one: `load_backend` builds `SAM2ImagePredictor`, which
    answers a prompt on one picture and has no notion of a sequence.
    """
    from .backends import load_video_predictor
    from .prompts import ModelNotLoadedError
    from .runner import run_propagation

    loaded: dict[str, object] = {}

    def propagate_job(request, cancel):
        entry = _video_entry(models, request.model)
        if entry.name not in loaded:
            service.verified(entry)
            logger.log("info", "loading the video predictor", model=entry.name)
            loaded[entry.name] = load_video_predictor(entry, service.model_dir, device=service.device)

        return run_propagation(
            loaded[entry.name],
            service.read_image,
            request,
            list(request.objects),
            cancel,
        )

    def _video_entry(entries, wanted):
        """The model to propagate with: the one asked for, else the only video-capable one.

        Refusing to GUESS between several is deliberate. Which checkpoint produced a mask changes
        the mask, and picking one alphabetically would make a propagation's results depend on a
        detail nobody chose.
        """
        capable = [each for each in entries if each.is_video_capable]
        if wanted is not None:
            for each in capable:
                if each.name == wanted:
                    return each
            raise ModelNotLoadedError(
                f"no video-capable model called {wanted!r} is in the manifest"
            )
        if not capable:
            raise ModelNotLoadedError("no video-capable model is in the manifest")
        if len(capable) > 1:
            raise ModelNotLoadedError(
                "several models can propagate ("
                + ", ".join(each.name for each in capable)
                + "); name the one to use"
            )
        return capable[0]

    return propagate_job


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
