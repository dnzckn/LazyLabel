import pytest

from lazylabel.ui.widgets.status_bar import StatusBar


@pytest.fixture
def status_bar(qtbot):
    """Fixture for StatusBar."""
    bar = StatusBar()
    qtbot.addWidget(bar)
    return bar


def test_status_bar_creation(status_bar):
    """Test that the StatusBar can be created."""
    assert status_bar is not None
