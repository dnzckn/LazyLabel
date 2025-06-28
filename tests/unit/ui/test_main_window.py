import pytest

from lazylabel.ui.main_window import MainWindow


@pytest.fixture
def main_window(qtbot):
    """Fixture for MainWindow."""
    window = MainWindow()
    qtbot.addWidget(window)
    return window


def test_main_window_creation(main_window):
    """Test that the MainWindow can be created."""
    assert main_window is not None
