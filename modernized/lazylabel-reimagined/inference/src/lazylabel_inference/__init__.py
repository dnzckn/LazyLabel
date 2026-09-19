"""LazyLabel inference service.

SAM 1 and SAM 2.1 prompts, propagation jobs and archetype finding. Phase 2 scaffolds the service;
Phase 3 builds the model work.

What is correct today is everything that does not need a model loaded: the manifest that decides
whether a checkpoint is trustworthy, the availability check that decides whether the AI stack can
run at all, and the routes' contract. The prompt and propagation routes answer 501 rather than a
plausible empty result.
"""

from .app import Deps, Request, Response, create_app
from .availability import Availability, MIN_TORCH_VERSION, check_availability, parse_version
from .capabilities import CAPABILITIES, Capability, capability
from .config import Config, ConfigError, load_config
from .log import Logger, silent_logger
from .manifest import (
    CheckpointStatus,
    ManifestError,
    ModelEntry,
    check_checkpoint,
    load_manifest,
    parse_manifest,
    sha256_of,
)

__all__ = [
    "Availability",
    "CAPABILITIES",
    "Capability",
    "CheckpointStatus",
    "Config",
    "ConfigError",
    "Deps",
    "Logger",
    "MIN_TORCH_VERSION",
    "ManifestError",
    "ModelEntry",
    "Request",
    "Response",
    "capability",
    "check_availability",
    "check_checkpoint",
    "create_app",
    "load_config",
    "load_manifest",
    "parse_manifest",
    "parse_version",
    "sha256_of",
    "silent_logger",
]
