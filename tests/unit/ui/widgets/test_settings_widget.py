import pytest

from lazylabel.ui.widgets.settings_widget import SettingsWidget


@pytest.fixture
def settings_widget(qtbot):
    """Fixture for SettingsWidget."""
    widget = SettingsWidget()
    qtbot.addWidget(widget)
    return widget


def test_settings_widget_creation(settings_widget):
    """Test that the SettingsWidget can be created."""
    assert settings_widget is not None
