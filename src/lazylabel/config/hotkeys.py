"""Hotkey management system."""

import json
import os
from dataclasses import dataclass

from PyQt6.QtGui import QKeySequence


@dataclass
class HotkeyAction:
    """Represents a hotkey action with primary and secondary keys."""

    name: str
    description: str
    primary_key: str
    secondary_key: str | None = None
    category: str = "General"
    mouse_related: bool = False  # Cannot be reassigned if True


class HotkeyManager:
    """Manages application hotkeys with persistence."""

    def __init__(self, config_dir: str):
        self.config_dir = config_dir
        self.hotkeys_file = os.path.join(config_dir, "hotkeys.json")
        self.actions: dict[str, HotkeyAction] = {}
        self._initialize_default_hotkeys()
        self.load_hotkeys()

    def _initialize_default_hotkeys(self):
        """Initialize default hotkey mappings."""
        default_hotkeys = [
            # Navigation
            HotkeyAction(
                "load_next_image", "Load Next Image", "Right", category="Navigation"
            ),
            HotkeyAction(
                "load_previous_image",
                "Load Previous Image",
                "Left",
                category="Navigation",
            ),
            HotkeyAction("fit_view", "Fit View", ".", category="Navigation"),
            # Modes
            HotkeyAction("sam_mode", "Point Mode (SAM)", "1", category="Modes"),
            HotkeyAction("polygon_mode", "Polygon Mode", "2", category="Modes"),
            HotkeyAction("bbox_mode", "Bounding Box Mode", "3", category="Modes"),
            HotkeyAction("selection_mode", "Selection Mode", "E", category="Modes"),
            HotkeyAction("pan_mode", "Pan Mode", "Q", category="Modes"),
            HotkeyAction("edit_mode", "Edit Mode", "R", category="Modes"),
            # Actions
            HotkeyAction(
                "clear_points", "Clear Points/Vertices", "C", category="Actions"
            ),
            HotkeyAction(
                "save_segment", "Save Current Segment", "Space", category="Actions"
            ),
            HotkeyAction("save_output", "Save Output", "Return", category="Actions"),
            HotkeyAction(
                "save_output_alt", "Save Output (Alt)", "Enter", category="Actions"
            ),
            HotkeyAction("undo", "Undo Last Action", "Ctrl+Z", category="Actions"),
            HotkeyAction(
                "redo", "Redo Last Action", "Ctrl+Y", "Ctrl+Shift+Z", category="Actions"
            ),
            HotkeyAction(
                "escape", "Cancel/Clear Selection", "Escape", category="Actions"
            ),
            # Segments
            HotkeyAction(
                "merge_segments", "Merge Selected Segments", "M", category="Segments"
            ),
            HotkeyAction(
                "delete_segments", "Delete Selected Segments", "V", category="Segments"
            ),
            HotkeyAction(
                "delete_segments_alt",
                "Delete Selected Segments (Alt)",
                "Backspace",
                category="Segments",
            ),
            HotkeyAction(
                "select_all", "Select All Segments", "Ctrl+A", category="Segments"
            ),
            # View
            HotkeyAction("zoom_in", "Zoom In", "Ctrl+Plus", category="View"),
            HotkeyAction("zoom_out", "Zoom Out", "Ctrl+Minus", category="View"),
            # Movement (WASD)
            HotkeyAction("pan_up", "Pan Up", "W", category="Movement"),
            HotkeyAction("pan_down", "Pan Down", "S", category="Movement"),
            HotkeyAction("pan_left", "Pan Left", "A", category="Movement"),
            HotkeyAction("pan_right", "Pan Right", "D", category="Movement"),
            # Mouse-related (cannot be reassigned)
            HotkeyAction(
                "left_click",
                "Add Positive Point / Select",
                "Left Click",
                category="Mouse",
                mouse_related=True,
            ),
            HotkeyAction(
                "right_click",
                "Add Negative Point",
                "Right Click",
                category="Mouse",
                mouse_related=True,
            ),
            HotkeyAction(
                "mouse_drag",
                "Drag/Pan",
                "Mouse Drag",
                category="Mouse",
                mouse_related=True,
            ),
        ]

        for action in default_hotkeys:
            self.actions[action.name] = action

    def get_action(self, action_name: str) -> HotkeyAction | None:
        """Get hotkey action by name."""
        return self.actions.get(action_name)

    def get_actions_by_category(self) -> dict[str, list[HotkeyAction]]:
        """Get actions grouped by category."""
        categories = {}
        for action in self.actions.values():
            if action.category not in categories:
                categories[action.category] = []
            categories[action.category].append(action)
        return categories

    def set_primary_key(self, action_name: str, key: str) -> bool:
        """Set primary key for an action."""
        if action_name in self.actions and not self.actions[action_name].mouse_related:
            self.actions[action_name].primary_key = key
            return True
        return False

    def set_secondary_key(self, action_name: str, key: str | None) -> bool:
        """Set secondary key for an action."""
        if action_name in self.actions and not self.actions[action_name].mouse_related:
            self.actions[action_name].secondary_key = key
            return True
        return False

    def get_key_for_action(self, action_name: str) -> tuple[str | None, str | None]:
        """Get primary and secondary keys for an action."""
        action = self.actions.get(action_name)
        if action:
            return action.primary_key, action.secondary_key
        return None, None

    def is_key_in_use(self, key: str, exclude_action: str = None) -> str | None:
        """Check if a key is already in use by another action."""
        for name, action in self.actions.items():
            if name == exclude_action:
                continue
            if action.primary_key == key or action.secondary_key == key:
                return name
        return None

    def reset_to_defaults(self):
        """Reset all hotkeys to default values."""
        self._initialize_default_hotkeys()

    def save_hotkeys(self):
        """Save hotkeys to file."""
        os.makedirs(self.config_dir, exist_ok=True)

        # Convert to serializable format
        data = {}
        for name, action in self.actions.items():
            if not action.mouse_related:  # Don't save mouse-related actions
                data[name] = {
                    "primary_key": action.primary_key,
                    "secondary_key": action.secondary_key,
                }

        with open(self.hotkeys_file, "w") as f:
            json.dump(data, f, indent=4)

    def load_hotkeys(self):
        """Load hotkeys from file."""
        if not os.path.exists(self.hotkeys_file):
            return

        try:
            with open(self.hotkeys_file) as f:
                data = json.load(f)

            for name, keys in data.items():
                if name in self.actions and not self.actions[name].mouse_related:
                    self.actions[name].primary_key = keys.get("primary_key", "")
                    self.actions[name].secondary_key = keys.get("secondary_key")
        except (json.JSONDecodeError, KeyError, FileNotFoundError):
            # If loading fails, keep defaults
            pass

    def key_sequence_to_string(self, key_sequence: QKeySequence) -> str:
        """Convert QKeySequence to string representation."""
        return key_sequence.toString()

    def string_to_key_sequence(self, key_string: str) -> QKeySequence:
        """Convert string to QKeySequence."""
        return QKeySequence(key_string)
