"""Application settings and configuration."""

import json
import os
from dataclasses import asdict, dataclass, field


def _default_export_formats() -> list[str]:
    return ["NPZ", "YOLO_DETECTION"]


@dataclass
class Settings:
    """Application settings with defaults."""

    # UI Settings
    window_width: int = 1600
    window_height: int = 900
    left_panel_width: int = 250
    right_panel_width: int = 350

    # Annotation Settings
    point_radius: float = 0.3
    line_thickness: float = 0.5
    pan_multiplier: float = 1.0
    polygon_join_threshold: int = 2
    fragment_threshold: int = 0

    # Auto-Polygon Conversion Settings
    auto_polygon_enabled: bool = False
    polygon_resolution: int = 80  # Slider value 1-100, maps to epsilon factor

    # Image Adjustment Settings
    brightness: float = 0.0
    contrast: float = 0.0
    gamma: float = 1.0
    saturation: float = 1.0  # 0.0 = grayscale, 1.0 = normal, 2.0 = double saturation

    # Model Settings
    default_model_type: str = "vit_h"
    default_model_filename: str = "sam_vit_h_4b8939.pth"
    operate_on_view: bool = False

    # Save Settings
    auto_save: bool = True
    export_formats: list[str] = field(default_factory=_default_export_formats)

    # UI State
    annotation_size_multiplier: float = 1.0

    # Multi-view Settings
    multi_view_grid_mode: str = "2_view"  # "2_view" or "4_view"

    # Pixel Priority Settings
    pixel_priority_enabled: bool = False
    pixel_priority_ascending: bool = True

    # File Manager Display Settings
    file_manager_show_name: bool = True
    file_manager_show_npz: bool = True
    file_manager_show_txt: bool = True
    file_manager_show_seg: bool = False
    file_manager_show_coco: bool = False
    file_manager_show_voc: bool = False
    file_manager_show_cm: bool = False
    file_manager_show_cml: bool = False
    file_manager_show_modified: bool = True
    file_manager_show_size: bool = True
    file_manager_sort_order: int = 0  # 0=Name(A-Z), 1=Name(Z-A), 2=Date(Oldest), etc.

    def save_to_file(self, filepath: str) -> None:
        """Save settings to JSON file."""
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, "w") as f:
            json.dump(asdict(self), f, indent=4)

    @classmethod
    def load_from_file(cls, filepath: str) -> "Settings":
        """Load settings from JSON file."""
        if not os.path.exists(filepath):
            return cls()

        try:
            with open(filepath) as f:
                data = json.load(f)

            # Migrate legacy save booleans -> export_formats list
            data = cls._migrate_legacy_save_settings(data)

            return cls(**data)
        except (json.JSONDecodeError, TypeError):
            return cls()

    @staticmethod
    def _migrate_legacy_save_settings(data: dict) -> dict:
        """Convert old save_npz/save_txt/bb_use_alias/save_class_aliases to export_formats."""
        legacy_keys = {"save_npz", "save_txt", "bb_use_alias", "save_class_aliases"}
        if not legacy_keys.intersection(data):
            return data

        formats: list[str] = []
        if data.pop("save_npz", True):
            formats.append("NPZ")
        if data.pop("save_txt", True):
            formats.append("YOLO_DETECTION")

        # Remove remaining legacy keys that have no direct equivalent
        data.pop("bb_use_alias", None)
        data.pop("save_class_aliases", None)

        data["export_formats"] = formats if formats else ["NPZ"]
        return data

    def update(self, **kwargs) -> None:
        """Update settings with new values."""
        for key, value in kwargs.items():
            if hasattr(self, key):
                # Ensure export_formats is always stored as list[str] for JSON serialization
                if key == "export_formats" and isinstance(value, set):
                    from lazylabel.core.exporters import ExportFormat

                    value = sorted(
                        f.value if isinstance(f, ExportFormat) else str(f)
                        for f in value
                    )
                setattr(self, key, value)


# Default settings instance
DEFAULT_SETTINGS = Settings()
