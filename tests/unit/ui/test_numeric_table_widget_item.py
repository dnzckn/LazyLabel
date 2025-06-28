import pytest

from lazylabel.ui.numeric_table_widget_item import NumericTableWidgetItem


@pytest.fixture
def numeric_table_widget_item(qtbot):
    """Fixture for NumericTableWidgetItem."""
    item = NumericTableWidgetItem(123)
    return item


def test_numeric_table_widget_item_creation(numeric_table_widget_item):
    """Test that the NumericTableWidgetItem can be created."""
    assert numeric_table_widget_item is not None
