import pytest

from lazylabel.ui.widgets.adjustments_widget import AdjustmentsWidget


@pytest.fixture
def adjustments_widget(qtbot):
    """Fixture for AdjustmentsWidget."""
    widget = AdjustmentsWidget()
    qtbot.addWidget(widget)
    return widget


def test_adjustments_widget_creation(adjustments_widget):
    """Test that the AdjustmentsWidget can be created."""
    assert adjustments_widget is not None
