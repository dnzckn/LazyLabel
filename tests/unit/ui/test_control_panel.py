import pytest

from lazylabel.ui.control_panel import ControlPanel


@pytest.fixture
def control_panel(qtbot):
    """Fixture for ControlPanel."""
    panel = ControlPanel()
    qtbot.addWidget(panel)
    return panel


def test_control_panel_creation(control_panel):
    """Test that the ControlPanel can be created."""
    assert control_panel is not None
