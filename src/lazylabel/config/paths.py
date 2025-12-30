"""Path management for LazyLabel."""

import sys
from pathlib import Path


class Paths:
    """Centralized path management."""

    def __init__(self):
        # Detect if running in PyInstaller bundle
        if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
            # Running in PyInstaller bundle
            self.app_dir = Path(sys._MEIPASS)
        else:
            # Running in normal Python environment
            self.app_dir = Path(__file__).parent.parent

        self.models_dir = self.app_dir / "models"
        self.config_dir = Path.home() / ".config" / "lazylabel"
        self.cache_dir = Path.home() / ".cache" / "lazylabel"

        # Ensure directories exist (only for writable directories)
        self.config_dir.mkdir(parents=True, exist_ok=True)

        # Only try to create models_dir if not in frozen bundle
        if not getattr(sys, "frozen", False):
            self.models_dir.mkdir(parents=True, exist_ok=True)

    @property
    def settings_file(self) -> Path:
        """Path to settings file."""
        return self.config_dir / "settings.json"

    @property
    def demo_pictures_dir(self) -> Path:
        """Path to demo pictures directory."""
        return self.app_dir / "demo_pictures"

    @property
    def logo_path(self) -> Path:
        """Path to application logo."""
        return self.demo_pictures_dir / "logo2.png"

    def get_model_path(self, filename: str) -> Path:
        """Get path for a model file."""
        return self.models_dir / filename

    def get_old_cache_model_path(self, filename: str) -> Path:
        """Get path for model in old cache location."""
        return self.cache_dir / filename
