"""Application settings and configuration."""

import os
from dataclasses import dataclass, asdict
from typing import Dict, Any
import json


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
    
    # Model Settings
    default_model_type: str = "vit_h"
    default_model_filename: str = "sam_vit_h_4b8939.pth"
    
    # Save Settings
    auto_save: bool = True
    save_npz: bool = True
    save_txt: bool = True
    save_class_aliases: bool = False
    yolo_use_alias: bool = True
    
    # UI State
    annotation_size_multiplier: float = 1.0
    
    def save_to_file(self, filepath: str) -> None:
        """Save settings to JSON file."""
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'w') as f:
            json.dump(asdict(self), f, indent=4)
    
    @classmethod
    def load_from_file(cls, filepath: str) -> 'Settings':
        """Load settings from JSON file."""
        if not os.path.exists(filepath):
            return cls()
        
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
            return cls(**data)
        except (json.JSONDecodeError, TypeError):
            return cls()
    
    def update(self, **kwargs) -> None:
        """Update settings with new values."""
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)


# Default settings instance
DEFAULT_SETTINGS = Settings()