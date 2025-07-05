"""Configuration management for LazyLabel."""

from .hotkeys import HotkeyAction, HotkeyManager
from .paths import Paths
from .settings import DEFAULT_SETTINGS, Settings

__all__ = ["Settings", "DEFAULT_SETTINGS", "Paths", "HotkeyManager", "HotkeyAction"]
