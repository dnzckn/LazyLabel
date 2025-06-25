"""Configuration management for LazyLabel."""

from .settings import Settings, DEFAULT_SETTINGS
from .paths import Paths
from .hotkeys import HotkeyManager, HotkeyAction

__all__ = ['Settings', 'DEFAULT_SETTINGS', 'Paths', 'HotkeyManager', 'HotkeyAction']