import pytest
from PyQt6.QtCore import QPointF, Qt
from PyQt6.QtGui import QPixmap

from lazylabel.core.segment_manager import SegmentManager
from lazylabel.ui.main_window import MainWindow


@pytest.fixture
def main_window_with_image(qtbot):
    """Fixture for MainWindow with a dummy image loaded."""
    window = MainWindow()
    qtbot.addWidget(window)
    # Load a dummy pixmap to enable mouse events
    window.viewer.set_photo(QPixmap(100, 100))
    window.segment_manager = SegmentManager()  # Ensure segment manager is clean
    window.action_history = []
    window.redo_history = []
    return window


def simulate_mouse_drag(viewer, qtbot, start_scene_pos, end_scene_pos):
    """Helper to simulate a mouse drag event on the viewer's scene."""
    # Map scene positions to viewport positions
    start_viewport_pos = viewer.mapFromScene(start_scene_pos)
    end_viewport_pos = viewer.mapFromScene(end_scene_pos)

    # Simulate mouse press
    qtbot.mousePress(
        viewer.viewport(), Qt.MouseButton.LeftButton, pos=start_viewport_pos
    )

    # Simulate mouse move
    qtbot.mouseMove(viewer.viewport(), pos=end_viewport_pos)

    # Simulate mouse release
    qtbot.mouseRelease(
        viewer.viewport(), Qt.MouseButton.LeftButton, pos=end_viewport_pos
    )


def test_bbox_tool_creation(main_window_with_image):
    """Test that the bounding box mode can be set."""
    main_window_with_image.set_bbox_mode()
    assert main_window_with_image.mode == "bbox"


def test_bbox_drawing_adds_segment(main_window_with_image, qtbot):
    """Test that drawing a bbox adds a segment and records history."""
    main_window_with_image.set_bbox_mode()
    initial_segment_count = len(main_window_with_image.segment_manager.segments)
    initial_history_count = len(main_window_with_image.action_history)

    start_pos = QPointF(10, 10)
    end_pos = QPointF(50, 50)
    simulate_mouse_drag(main_window_with_image.viewer, qtbot, start_pos, end_pos)

    assert (
        len(main_window_with_image.segment_manager.segments)
        == initial_segment_count + 1
    )
    new_segment = main_window_with_image.segment_manager.segments[-1]
    assert new_segment["type"] == "Polygon"
    assert len(new_segment["vertices"]) == 4  # A bounding box is a 4-vertex polygon

    assert len(main_window_with_image.action_history) == initial_history_count + 1
    last_action = main_window_with_image.action_history[-1]
    assert last_action["type"] == "add_segment"
    assert (
        last_action["segment_index"]
        == len(main_window_with_image.segment_manager.segments) - 1
    )


def test_bbox_drawing_no_segment_on_zero_size(main_window_with_image, qtbot):
    """Test that a zero-size bbox does not add a segment."""
    main_window_with_image.set_bbox_mode()
    initial_segment_count = len(main_window_with_image.segment_manager.segments)
    initial_history_count = len(main_window_with_image.action_history)

    start_pos = QPointF(10, 10)
    end_pos = QPointF(10, 10)  # Zero size
    simulate_mouse_drag(main_window_with_image.viewer, qtbot, start_pos, end_pos)

    assert len(main_window_with_image.segment_manager.segments) == initial_segment_count
    assert len(main_window_with_image.action_history) == initial_history_count
