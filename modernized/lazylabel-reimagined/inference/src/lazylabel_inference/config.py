"""Configuration, from the environment.

Nothing is downloaded at runtime, so there is no model URL here and no token to fetch one with. The
manifest names what should exist and the checkpoints are put there by the build pipeline
(SEC-03, SEC-05, SEC-17, RULE-087).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


class ConfigError(Exception):
    """The service cannot start with this configuration."""


@dataclass(frozen=True)
class Config:
    model_dir: Path
    manifest_path: Path
    host: str
    port: int
    """Where the images are, so the service can read the pixels it is asked to segment.

    OPTIONAL, and absent is a real configuration rather than a mistake: a deployment with no
    dataset root can still answer /health and /models, which is what an operator installing
    checkpoints needs before anything else works. Every route that has to READ an image says 503
    and why, rather than failing on the first pixel.

    It was missing entirely until this was noticed -- nothing constructed the service, so every AI
    route answered 503 in production while the whole suite passed. A configuration key that is
    never read has exactly the shape of a function that is never called.

    It is the root at STARTUP. The launcher starts the service with none when LazyLabel opens with
    no folder, and the API sets one whenever the app opens a folder (POST /dataset-root, `app.py`).
    """
    dataset_root: Path | None = None


def load_config(env: dict[str, str] | None = None) -> Config:
    environ = os.environ if env is None else env

    raw_dir = environ.get("LAZYLABEL_MODEL_DIR", "").strip()
    if not raw_dir:
        raise ConfigError(
            "LAZYLABEL_MODEL_DIR must name the directory holding the model checkpoints; "
            "this service will not guess, and it never downloads one"
        )
    model_dir = Path(raw_dir).resolve()

    raw_port = environ.get("LAZYLABEL_INFERENCE_PORT", "8788")
    try:
        port = int(raw_port)
    except ValueError as exc:
        raise ConfigError(f"LAZYLABEL_INFERENCE_PORT must be a number, got {raw_port!r}") from exc
    if not 1 <= port <= 65535:
        raise ConfigError(f"LAZYLABEL_INFERENCE_PORT must be a port number, got {port}")

    manifest = environ.get("LAZYLABEL_MODEL_MANIFEST", "").strip()
    raw_root = environ.get("LAZYLABEL_DATASET_ROOT", "").strip()
    if raw_root:
        dataset_root = Path(raw_root).resolve()
        if not dataset_root.is_dir():
            raise ConfigError(
                f"LAZYLABEL_DATASET_ROOT names {dataset_root}, which is not a directory; "
                "an unreadable root would fail on the first image rather than at startup"
            )
    else:
        dataset_root = None

    return Config(
        dataset_root=dataset_root,
        model_dir=model_dir,
        manifest_path=Path(manifest).resolve() if manifest else model_dir / "manifest.json",
        # Loopback by default: only the API talks to this service, and decision 3 is one trusted
        # user per deployment. A model endpoint on every interface is not something to default into.
        host=environ.get("LAZYLABEL_INFERENCE_HOST", "127.0.0.1"),
        port=port,
    )
