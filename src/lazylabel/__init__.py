"""LazyLabel - AI-assisted image segmentation tool."""

__author__ = "Deniz N. Cakan"
__email__ = "deniz.n.cakan@gmail.com"


def _get_version() -> str:
    """Get version using multiple fallback strategies.

    Priority:
    1. importlib.metadata (works for pip-installed packages)
    2. Read pyproject.toml (works in development)
    3. Bundled _version.py (works in PyInstaller .exe)
    4. Hardcoded fallback
    """
    # Try importlib.metadata first (works for installed packages)
    try:
        from importlib.metadata import version

        return version("lazylabel-gui")
    except Exception:
        pass

    # Try reading pyproject.toml (development mode)
    try:
        import re
        from pathlib import Path

        # Go up from __init__.py to project root
        project_root = Path(__file__).parent.parent.parent
        pyproject_path = project_root / "pyproject.toml"

        if pyproject_path.exists():
            content = pyproject_path.read_text(encoding="utf-8")
            match = re.search(r'version\s*=\s*"([^"]+)"', content)
            if match:
                return match.group(1)
    except Exception:
        pass

    # Try bundled _version.py (PyInstaller bundle)
    try:
        from lazylabel._version import __version__ as bundled_version

        return bundled_version
    except Exception:
        pass

    # Ultimate fallback
    return "unknown"


__version__ = _get_version()

from .main import main  # noqa: E402

__all__ = ["main", "__version__"]
