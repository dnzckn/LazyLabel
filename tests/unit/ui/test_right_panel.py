import pytest

from lazylabel.ui.right_panel import RightPanel


@pytest.fixture
def right_panel(qtbot):
    """Fixture for RightPanel."""
    panel = RightPanel()
    qtbot.addWidget(panel)
    return panel


def test_right_panel_creation(right_panel):
    """Test that the RightPanel can be created."""
    assert right_panel is not None
