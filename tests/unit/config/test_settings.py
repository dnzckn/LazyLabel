"""Unit tests for the Settings class."""

import tempfile
from pathlib import Path

from lazylabel.config.settings import Settings


class TestSettings:
    """Tests for the Settings class."""

    def test_init_with_defaults(self):
        """Test initialization with default values."""
        settings = Settings()
        assert settings.window_width == 1600
        assert settings.window_height == 900
        assert settings.left_panel_width == 250
        assert settings.right_panel_width == 350
        assert settings.point_radius == 0.3
        assert settings.line_thickness == 0.5
        assert settings.default_model_type == "vit_h"

    def test_save_and_load(self):
        """Test saving and loading settings."""
        with tempfile.TemporaryDirectory() as temp_dir:
            settings_file = Path(temp_dir) / "settings.json"

            # Create settings with custom values
            settings = Settings()
            settings.window_width = 1200
            settings.window_height = 800
            settings.point_radius = 0.5

            # Save settings
            settings.save_to_file(str(settings_file))

            # Check that the file exists
            assert settings_file.exists()

            # Load settings
            loaded_settings = Settings.load_from_file(str(settings_file))

            # Check that the loaded settings match the saved settings
            assert loaded_settings.window_width == 1200
            assert loaded_settings.window_height == 800
            assert loaded_settings.point_radius == 0.5

            # Other values should be default
            assert loaded_settings.left_panel_width == 250

    def test_load_nonexistent_file(self):
        """Test loading from a nonexistent file returns default settings."""
        with tempfile.TemporaryDirectory() as temp_dir:
            nonexistent_file = Path(temp_dir) / "nonexistent.json"

            # Load settings from nonexistent file
            settings = Settings.load_from_file(str(nonexistent_file))

            # Should get default settings
            assert settings.window_width == 1600
            assert settings.window_height == 900

    def test_load_invalid_json(self):
        """Test loading from an invalid JSON file returns default settings."""
        with tempfile.TemporaryDirectory() as temp_dir:
            invalid_file = Path(temp_dir) / "invalid.json"

            # Create an invalid JSON file
            with open(invalid_file, "w") as f:
                f.write("{invalid json")

            # Load settings from invalid file
            settings = Settings.load_from_file(str(invalid_file))

            # Should get default settings
            assert settings.window_width == 1600
            assert settings.window_height == 900

    def test_update_settings(self):
        """Test updating settings with new values."""
        settings = Settings()

        # Update some settings
        settings.update(window_width=1000, window_height=700, point_radius=0.8)

        # Check that the settings were updated
        assert settings.window_width == 1000
        assert settings.window_height == 700
        assert settings.point_radius == 0.8

        # Other settings should remain default
        assert settings.left_panel_width == 250
