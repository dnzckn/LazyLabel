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
    assert hasattr(settings_widget, "chk_operate_on_view")
    assert not settings_widget.chk_operate_on_view.isChecked()


def test_get_settings_includes_operate_on_view(settings_widget):
    """Test that get_settings includes the operate_on_view status."""
    settings_widget.chk_operate_on_view.setChecked(True)
    settings = settings_widget.get_settings()
    assert settings["operate_on_view"] is True

    settings_widget.chk_operate_on_view.setChecked(False)
    settings = settings_widget.get_settings()
    assert settings["operate_on_view"] is False


def test_set_settings_sets_operate_on_view(settings_widget):
    """Test that set_settings correctly applies the operate_on_view status."""
    settings_to_set = {
        "auto_save": True,
        "save_npz": True,
        "save_txt": True,
        "yolo_use_alias": True,
        "save_class_aliases": False,
        "operate_on_view": True,
    }
    settings_widget.set_settings(settings_to_set)
    assert settings_widget.chk_operate_on_view.isChecked()

    settings_to_set["operate_on_view"] = False
    settings_widget.set_settings(settings_to_set)
    assert not settings_widget.chk_operate_on_view.isChecked()


def test_pixel_priority_default_state(settings_widget):
    """Test that pixel priority starts in the correct default state."""
    assert not settings_widget.chk_pixel_priority_enabled.isChecked()
    assert settings_widget.radio_priority_ascending.isChecked()
    assert not settings_widget.radio_priority_ascending.isEnabled()
    assert not settings_widget.radio_priority_descending.isEnabled()


def test_pixel_priority_enable_disables_radio_buttons(settings_widget):
    """Test that enabling pixel priority enables the radio buttons."""
    settings_widget.chk_pixel_priority_enabled.setChecked(True)
    assert settings_widget.radio_priority_ascending.isEnabled()
    assert settings_widget.radio_priority_descending.isEnabled()

    settings_widget.chk_pixel_priority_enabled.setChecked(False)
    assert not settings_widget.radio_priority_ascending.isEnabled()
    assert not settings_widget.radio_priority_descending.isEnabled()


def test_get_settings_includes_pixel_priority(settings_widget):
    """Test that get_settings includes pixel priority settings."""
    # Test disabled state
    settings = settings_widget.get_settings()
    assert settings["pixel_priority_enabled"] is False
    assert settings["pixel_priority_ascending"] is True

    # Test enabled + ascending
    settings_widget.chk_pixel_priority_enabled.setChecked(True)
    settings_widget.radio_priority_ascending.setChecked(True)
    settings = settings_widget.get_settings()
    assert settings["pixel_priority_enabled"] is True
    assert settings["pixel_priority_ascending"] is True

    # Test enabled + descending
    settings_widget.radio_priority_descending.setChecked(True)
    settings = settings_widget.get_settings()
    assert settings["pixel_priority_enabled"] is True
    assert settings["pixel_priority_ascending"] is False


def test_set_settings_sets_pixel_priority(settings_widget):
    """Test that set_settings correctly applies pixel priority settings."""
    # Test setting to enabled + ascending
    settings_widget.set_settings(
        {
            "pixel_priority_enabled": True,
            "pixel_priority_ascending": True,
        }
    )
    assert settings_widget.chk_pixel_priority_enabled.isChecked()
    assert settings_widget.radio_priority_ascending.isChecked()
    assert not settings_widget.radio_priority_descending.isChecked()
    assert settings_widget.radio_priority_ascending.isEnabled()

    # Test setting to enabled + descending
    settings_widget.set_settings(
        {
            "pixel_priority_enabled": True,
            "pixel_priority_ascending": False,
        }
    )
    assert settings_widget.chk_pixel_priority_enabled.isChecked()
    assert not settings_widget.radio_priority_ascending.isChecked()
    assert settings_widget.radio_priority_descending.isChecked()
    assert settings_widget.radio_priority_ascending.isEnabled()

    # Test setting to disabled
    settings_widget.set_settings(
        {
            "pixel_priority_enabled": False,
            "pixel_priority_ascending": True,
        }
    )
    assert not settings_widget.chk_pixel_priority_enabled.isChecked()
    assert not settings_widget.radio_priority_ascending.isEnabled()
    assert not settings_widget.radio_priority_descending.isEnabled()


def test_reset_to_default_resets_pixel_priority(settings_widget, qtbot):
    """Test that reset to default resets pixel priority to default values."""
    # Change pixel priority settings
    settings_widget.chk_pixel_priority_enabled.setChecked(True)
    settings_widget.radio_priority_descending.setChecked(True)

    # Click reset button
    with qtbot.waitSignal(settings_widget.settings_changed):
        settings_widget.btn_reset_to_default.click()

    # Verify reset to defaults
    assert not settings_widget.chk_pixel_priority_enabled.isChecked()
    assert settings_widget.radio_priority_ascending.isChecked()
    assert not settings_widget.radio_priority_ascending.isEnabled()


def test_pixel_priority_persistence_round_trip(settings_widget):
    """Test that pixel priority settings persist through get/set cycle."""
    # Set to enabled + descending
    settings_widget.chk_pixel_priority_enabled.setChecked(True)
    settings_widget.radio_priority_descending.setChecked(True)

    # Get settings
    settings = settings_widget.get_settings()

    # Create new widget and apply settings
    new_widget = SettingsWidget()
    new_widget.set_settings(settings)

    # Verify state was preserved
    assert new_widget.chk_pixel_priority_enabled.isChecked()
    assert new_widget.radio_priority_descending.isChecked()
    assert not new_widget.radio_priority_ascending.isChecked()
    assert new_widget.radio_priority_ascending.isEnabled()
