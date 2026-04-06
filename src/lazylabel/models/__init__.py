"""Model-related modules."""

try:
    from .sam_model import SamModel
except Exception:
    SamModel = None

__all__ = ["SamModel"]
