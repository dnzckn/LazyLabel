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
