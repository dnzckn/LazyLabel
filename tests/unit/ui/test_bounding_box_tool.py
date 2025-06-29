from unittest.mock import MagicMock, patch

import pytest
from PyQt6.QtCore import QPointF, Qt
from PyQt6.QtGui import QPixmap

from lazylabel.core.segment_manager import SegmentManager
from lazylabel.ui.main_window import MainWindow


@pytest.fixture
def mock_sam_model():
    """Create a mock SAM model."""
    mock_model = MagicMock()
    mock_model.is_loaded = True
    mock_model.device = "CPU"
    return mock_model


@pytest.fixture
def main_window_with_image(qtbot, mock_sam_model):
    """Fixture for MainWindow with a dummy image loaded and mocked model loading."""
    with (
        patch(
            "lazylabel.core.model_manager.ModelManager.initialize_default_model"
        ) as mock_init,
        patch(
            "lazylabel.core.model_manager.ModelManager.get_available_models"
        ) as mock_get_models,
        patch(
            "lazylabel.core.model_manager.ModelManager.is_model_available"
        ) as mock_is_available,
    ):
        # Setup mocks to avoid expensive model loading
        mock_init.return_value = mock_sam_model
        mock_get_models.return_value = [
            ("Mock Model 1", "/path/to/model1"),
            ("Mock Model 2", "/path/to/model2"),
        ]
        mock_is_available.return_value = True

        # Create MainWindow with mocked model loading
        window = MainWindow()
        qtbot.addWidget(window)

        # Load a dummy pixmap to enable mouse events
        dummy_pixmap = QPixmap(100, 100)
        dummy_pixmap.fill(Qt.GlobalColor.white)
        window.viewer.set_photo(dummy_pixmap)
        window.segment_manager = SegmentManager()  # Ensure segment manager is clean
        window.action_history = []
        window.redo_history = []

        # Mock the original mouse press to prevent issues
        window._original_mouse_press = MagicMock()
        window._original_mouse_move = MagicMock()
        window._original_mouse_release = MagicMock()

        return window


def simulate_bbox_drag(main_window, start_pos, end_pos):
    """Helper to simulate bbox drawing by directly calling the mouse event handlers."""
    # Create a mock event with required attributes
    press_event = MagicMock()
    press_event.button.return_value = Qt.MouseButton.LeftButton
    press_event.scenePos.return_value = start_pos
    press_event.accept = MagicMock()

    move_event = MagicMock()
    move_event.scenePos.return_value = end_pos
    move_event.accept = MagicMock()

    release_event = MagicMock()
    release_event.scenePos.return_value = end_pos
    release_event.accept = MagicMock()

    # Call the mouse event handlers directly
    main_window._scene_mouse_press(press_event)
    main_window._scene_mouse_move(move_event)
    main_window._scene_mouse_release(release_event)


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
    simulate_bbox_drag(main_window_with_image, start_pos, end_pos)

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
    simulate_bbox_drag(main_window_with_image, start_pos, end_pos)

    assert len(main_window_with_image.segment_manager.segments) == initial_segment_count
    assert len(main_window_with_image.action_history) == initial_history_count
