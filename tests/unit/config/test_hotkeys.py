"""Unit tests for the HotkeyManager class."""

import tempfile

from lazylabel.config.hotkeys import HotkeyManager


class TestHotkeyManager:
    """Tests for the HotkeyManager class."""

    def test_init(self):
        """Test initialization of HotkeyManager."""
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = HotkeyManager(temp_dir)

            # Check that default hotkeys are initialized
            assert "sam_mode" in manager.actions
            assert "polygon_mode" in manager.actions
            assert "selection_mode" in manager.actions

            # Check a specific default hotkey
            assert manager.actions["sam_mode"].primary_key == "1"
            assert manager.actions["polygon_mode"].primary_key == "2"

    def test_get_action(self):
        """Test getting an action by name."""
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = HotkeyManager(temp_dir)

            # Get an existing action
            action = manager.get_action("sam_mode")
            assert action is not None
            assert action.name == "sam_mode"
            assert action.primary_key == "1"

            # Get a non-existent action
            action = manager.get_action("nonexistent")
            assert action is None

    def test_get_actions_by_category(self):
        """Test getting actions grouped by category."""
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = HotkeyManager(temp_dir)

            categories = manager.get_actions_by_category()

            # Check that categories exist
            assert "Modes" in categories
            assert "Actions" in categories
            assert "Navigation" in categories

            # Check that actions are in the right categories
            assert any(action.name == "sam_mode" for action in categories["Modes"])
            assert any(
                action.name == "save_segment" for action in categories["Actions"]
            )
            assert any(
                action.name == "load_next_image" for action in categories["Navigation"]
            )

    def test_set_primary_key(self):
        """Test setting the primary key for an action."""
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = HotkeyManager(temp_dir)

            # Set a new primary key for an action
            result = manager.set_primary_key("sam_mode", "F1")
            assert result is True
            assert manager.actions["sam_mode"].primary_key == "F1"

            # Try to set a primary key for a mouse-related action (should fail)
            result = manager.set_primary_key("left_click", "F2")
            assert result is False
            assert manager.actions["left_click"].primary_key == "Left Click"

    def test_set_secondary_key(self):
        """Test setting the secondary key for an action."""
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = HotkeyManager(temp_dir)

            # Set a new secondary key for an action
            result = manager.set_secondary_key("sam_mode", "F1")
            assert result is True
            assert manager.actions["sam_mode"].secondary_key == "F1"

            # Try to set a secondary key for a mouse-related action (should fail)
            result = manager.set_secondary_key("left_click", "F2")
            assert result is False
            assert manager.actions["left_click"].secondary_key is None

    def test_get_key_for_action(self):
        """Test getting the keys for an action."""
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = HotkeyManager(temp_dir)

            # Get keys for an existing action
            primary, secondary = manager.get_key_for_action("sam_mode")
            assert primary == "1"
            assert secondary is None

            # Set a secondary key
            manager.set_secondary_key("sam_mode", "F1")
            primary, secondary = manager.get_key_for_action("sam_mode")
            assert primary == "1"
            assert secondary == "F1"

            # Get keys for a non-existent action
            primary, secondary = manager.get_key_for_action("nonexistent")
            assert primary is None
            assert secondary is None

    def test_is_key_in_use(self):
        """Test checking if a key is already in use."""
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = HotkeyManager(temp_dir)

            # Check a key that is in use
            action_name = manager.is_key_in_use("1")
            assert action_name == "sam_mode"

            # Check a key that is not in use
            action_name = manager.is_key_in_use("X")
            assert action_name is None

            # Check a key that is in use but exclude the action
            action_name = manager.is_key_in_use("1", exclude_action="sam_mode")
            assert action_name is None

    def test_save_and_load_hotkeys(self):
        """Test saving and loading hotkeys."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create a manager and modify some hotkeys
            manager = HotkeyManager(temp_dir)
            manager.set_primary_key("sam_mode", "F1")
            manager.set_secondary_key("polygon_mode", "F2")

            # Save hotkeys
            manager.save_hotkeys()

            # Create a new manager that should load the saved hotkeys
            new_manager = HotkeyManager(temp_dir)

            # Check that the hotkeys were loaded
            assert new_manager.actions["sam_mode"].primary_key == "F1"
            assert new_manager.actions["polygon_mode"].secondary_key == "F2"

    def test_reset_to_defaults(self):
        """Test resetting hotkeys to defaults."""
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = HotkeyManager(temp_dir)

            # Modify some hotkeys
            manager.set_primary_key("sam_mode", "F1")
            manager.set_secondary_key("polygon_mode", "F2")

            # Reset to defaults
            manager.reset_to_defaults()

            # Check that the hotkeys were reset
            assert manager.actions["sam_mode"].primary_key == "1"
            assert manager.actions["polygon_mode"].primary_key == "2"
            assert manager.actions["polygon_mode"].secondary_key is None
