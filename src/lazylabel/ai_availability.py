"""Central AI dependency availability detection."""

from .utils.logger import logger

_ai_available: bool | None = None


def is_ai_available() -> bool:
    """Check if AI dependencies (torch, segment-anything) are installed."""
    global _ai_available
    if _ai_available is None:
        try:
            import segment_anything  # noqa: F401
            import torch  # noqa: F401

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
