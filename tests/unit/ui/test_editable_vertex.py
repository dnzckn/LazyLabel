import pytest
from PyQt6.QtWidgets import QGraphicsScene

from lazylabel.ui.editable_vertex import EditableVertexItem
from lazylabel.ui.main_window import MainWindow


@pytest.fixture
def editable_vertex_item(qtbot):
    """Fixture for EditableVertexItem."""
    main_window = MainWindow()
    # EditableVertexItem requires main_window, segment_index, vertex_index, x, y, w, h
    vertex = EditableVertexItem(main_window, 0, 0, 0, 0, 10, 10)
    # Add to a scene to make it visible for testing if needed, though not strictly required for instantiation test
    scene = QGraphicsScene()
    scene.addItem(vertex)
    qtbot.addWidget(main_window)  # Add main_window to qtbot for proper cleanup
    return vertex


def test_editable_vertex_item_creation(editable_vertex_item):
    """Test that the EditableVertexItem can be created."""
    assert editable_vertex_item is not None
