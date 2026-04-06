"""Central AI dependency availability detection."""

from .utils.logger import logger

_ai_available: bool | None = None


MIN_TORCH_VERSION = "2.7.1"


def _parse_version(version_str: str) -> tuple[int, ...]:
    """Parse a version string into a tuple of ints for comparison."""
    # Strip local version identifiers like +cu130
    base_version = version_str.split("+")[0]
    return tuple(int(x) for x in base_version.split(".")[:3])


def is_ai_available() -> bool:
    """Check if AI dependencies (torch, segment-anything) are installed and compatible."""
    global _ai_available
    if _ai_available is None:
        try:
            import segment_anything  # noqa: F401
            import torch

            if _parse_version(torch.__version__) < _parse_version(MIN_TORCH_VERSION):
                logger.info(
                    f"PyTorch {torch.__version__} found but >={MIN_TORCH_VERSION} "
                    f"is required for AI features."
                )
                _ai_available = False
            else:
                _ai_available = True
        except ImportError:
            _ai_available = False
    return _ai_available


AI_AVAILABLE = is_ai_available()

INSTALL_HINT = (
    "AI features require additional packages. "
    "Install with: pip install lazylabel-gui[include-ai]"
)

if not AI_AVAILABLE:
    logger.info(INSTALL_HINT)
