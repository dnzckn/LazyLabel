from unittest.mock import MagicMock

import pytest

from lazylabel.ui.hotkey_dialog import HotkeyDialog


@pytest.fixture
def hotkey_dialog(qtbot):
    """Fixture for HotkeyDialog."""
    mock_hotkey_manager = MagicMock()
    dialog = HotkeyDialog(mock_hotkey_manager)
    qtbot.addWidget(dialog)
    return dialog


def test_hotkey_dialog_creation(hotkey_dialog):
    """Test that the HotkeyDialog can be created."""
    assert hotkey_dialog is not None
