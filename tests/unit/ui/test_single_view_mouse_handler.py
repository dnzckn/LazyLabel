"""Tests for SingleViewMouseHandler to ensure property accessors work correctly."""

from unittest.mock import Mock

import pytest
from PyQt6.QtCore import QPointF, Qt

from lazylabel.ui.handlers.single_view_mouse_handler import SingleViewMouseHandler


@pytest.fixture
def mock_main_window():
    """Create a mock main window with required attributes."""
    mw = Mock()

    # Mock the drawing state manager with actual dict for drag_initial_vertices
    mw.drawing_state = Mock()
    mw.drawing_state._drag_initial_vertices = {}
    mw.drawing_state.drag_initial_vertices = mw.drawing_state._drag_initial_vertices

    # Property accessors that delegate to drawing_state
    type(mw).drag_initial_vertices = property(
        lambda self: self.drawing_state._drag_initial_vertices,
        lambda self, v: setattr(self.drawing_state, "_drag_initial_vertices", v),
    )
    type(mw).is_dragging_polygon = property(
        lambda self: getattr(self, "_is_dragging_polygon", False),
        lambda self, v: setattr(self, "_is_dragging_polygon", v),
    )
    type(mw).drag_start_pos = property(
        lambda self: getattr(self, "_drag_start_pos", None),
        lambda self, v: setattr(self, "_drag_start_pos", v),
    )

    # Mock segment manager
    mw.segment_manager = Mock()
    mw.segment_manager.segments = [
        {
            "type": "Polygon",
            "vertices": [[10, 10], [50, 10], [50, 50], [10, 50]],
            "class_id": 0,
        }
    ]

    # Mock right panel
    mw.right_panel = Mock()
    mw.right_panel.get_selected_segment_indices.return_value = [0]

    # Mock undo/redo manager
    mw.undo_redo_manager = Mock()

    # Mock viewer (accessed via mw.viewer property)
    mw.viewer = Mock()
    mw.viewer._pixmap_item = Mock()
    mw.viewer._pixmap_item.pixmap.return_value.rect.return_value.contains.return_value = True
    mw.viewer.mapFromScene = Mock(return_value=Mock())
    mw.viewer.items = Mock(return_value=[])
    mw.viewer.scene = Mock(return_value=Mock())

    # Mock mode - SingleViewMouseHandler uses mw.mode directly
    mw.mode = "edit"

    # Mock original mouse press handler
    mw._original_mouse_press = Mock()

    return mw


def test_edit_mode_drag_initial_vertices_setter(app, mock_main_window):
    """Test that drag_initial_vertices can be set in edit mode.

    This test ensures the property setter exists and works correctly,
    preventing AttributeError when starting edit mode drag operations.
    """
    handler = SingleViewMouseHandler(mock_main_window)

    # Create mock event with proper scenePos that has toPoint
    pos = QPointF(25, 25)
    mock_event = Mock()
    mock_event.button.return_value = Qt.MouseButton.LeftButton
    mock_event.scenePos.return_value = pos
    mock_event.accept = Mock()

    # This should NOT raise AttributeError
    handler.handle_mouse_press(mock_event)

    # Verify drag_initial_vertices was set
    assert mock_main_window.drag_initial_vertices == {
        0: [[10, 10], [50, 10], [50, 50], [10, 50]]
    }
    assert mock_main_window.is_dragging_polygon is True
    assert mock_main_window.drag_start_pos == QPointF(25, 25)


def test_edit_mode_drag_vertices_iteration(app, mock_main_window):
    """Test that drag_initial_vertices can be iterated during drag."""
    handler = SingleViewMouseHandler(mock_main_window)

    # Set up initial drag state
    mock_main_window.is_dragging_polygon = True
    mock_main_window.drag_start_pos = QPointF(25, 25)
    mock_main_window.drag_initial_vertices = {
        0: [[10, 10], [50, 10], [50, 50], [10, 50]]
    }

    # Create mock move event
    mock_event = Mock()
    mock_event.scenePos.return_value = QPointF(30, 30)  # 5px delta

    # This should NOT raise any errors when iterating drag_initial_vertices
    handler.handle_mouse_move(mock_event)

    # Verify vertices were updated with delta
    updated_vertices = mock_main_window.segment_manager.segments[0]["vertices"]
    assert updated_vertices[0] == [15.0, 15.0]  # Original [10,10] + delta [5,5]


def test_edit_mode_drag_vertices_clear(app, mock_main_window):
    """Test that drag_initial_vertices can be cleared on release."""
    handler = SingleViewMouseHandler(mock_main_window)

    # Set up initial drag state
    mock_main_window.is_dragging_polygon = True
    mock_main_window.drag_start_pos = QPointF(25, 25)
    mock_main_window.drag_initial_vertices = {
        0: [[10, 10], [50, 10], [50, 50], [10, 50]]
    }

    # Create mock release event
    mock_event = Mock()
    mock_event.scenePos.return_value = QPointF(30, 30)
    mock_event.accept = Mock()

    # This should NOT raise any errors when clearing drag_initial_vertices
    handler.handle_mouse_release(mock_event)

    # Verify state was cleared
    assert mock_main_window.drag_initial_vertices == {}
    assert mock_main_window.is_dragging_polygon is False
