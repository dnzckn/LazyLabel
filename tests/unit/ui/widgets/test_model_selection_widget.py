import pytest

from lazylabel.ui.widgets.model_selection_widget import ModelSelectionWidget


@pytest.fixture
def model_selection_widget(qtbot):
    """Fixture for ModelSelectionWidget."""
    widget = ModelSelectionWidget()
    qtbot.addWidget(widget)
    return widget


def test_model_selection_widget_creation(model_selection_widget):
    """Test that the ModelSelectionWidget can be created."""
    assert model_selection_widget is not None
