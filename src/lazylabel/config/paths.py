"""Path management for LazyLabel."""

from pathlib import Path


class Paths:
    """Centralized path management."""

    def __init__(self):
        self.app_dir = Path(__file__).parent.parent
        self.models_dir = self.app_dir / "models"
        self.config_dir = Path.home() / ".config" / "lazylabel"
        self.cache_dir = Path.home() / ".cache" / "lazylabel"

        # Ensure directories exist
        self.models_dir.mkdir(exist_ok=True)
        self.config_dir.mkdir(parents=True, exist_ok=True)

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
