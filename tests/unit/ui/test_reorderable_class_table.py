import pytest

from lazylabel.ui.reorderable_class_table import ReorderableClassTable


@pytest.fixture
def reorderable_class_table(qtbot):
    """Fixture for ReorderableClassTable."""
    table = ReorderableClassTable()
    qtbot.addWidget(table)
    return table


def test_reorderable_class_table_creation(reorderable_class_table):
    """Test that the ReorderableClassTable can be created."""
    assert reorderable_class_table is not None
