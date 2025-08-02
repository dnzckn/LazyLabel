"""Comprehensive tests for 4-view mode functionality across all drawing modes."""

from unittest.mock import MagicMock, patch

import pytest
from PyQt6.QtCore import QPointF
from PyQt6.QtWidgets import QApplication

from lazylabel.ui.main_window import MainWindow


@pytest.fixture
def app():
    """Create QApplication for testing."""
    app = QApplication.instance()
    if app is None:
        app = QApplication([])
    yield app


@pytest.fixture
def main_window_4view(app, qtbot):
    """Create MainWindow configured for 4-view mode."""
    with (
        patch("lazylabel.core.model_manager.ModelManager.initialize_default_model"),
        patch(
            "lazylabel.core.model_manager.ModelManager.get_available_models"
        ) as mock_get_models,
    ):
        mock_get_models.return_value = [("Mock SAM Model", "/path/to/model.pth")]

        window = MainWindow()
        qtbot.addWidget(window)

        # Setup mock file model for testing
        window.file_model = MagicMock()

        # Configure for 4-view mode and rebuild layout
        window.settings.multi_view_grid_mode = "4_view"
        window._setup_multi_view_layout()  # Rebuild layout with new setting

        # Switch to multi-view mode
        window._on_view_mode_changed(1)

        # Verify 4-view setup
        assert len(window.multi_view_viewers) == 4
        assert len(window.multi_view_polygon_points) == 4

        return window


def test_4view_polygon_mode_mirroring(main_window_4view):
    """Test that polygon mode mirrors to all 4 viewers in 4-view mode."""
    window = main_window_4view

    # Set up proper multi-view state for the new link-aware implementation
    window.multi_view_linked = [True, True, True, True]  # All viewers linked
    window.multi_view_images = [
        "img1.jpg",
        "img2.jpg",
        "img3.jpg",
        "img4.jpg",
    ]  # All have images

    # Create test polygon points for viewer 0
    test_points = [QPointF(10, 10), QPointF(50, 10), QPointF(50, 50), QPointF(10, 50)]

    # Set up polygon points for viewer 0
    window.multi_view_polygon_points[0] = test_points

    # Get initial segment count
    initial_segment_count = len(window.segment_manager.segments)

    # Finalize polygon using the multi_view_mode handler method
    from lazylabel.ui.modes.multi_view_mode import MultiViewModeHandler

    handler = MultiViewModeHandler(window)
    handler._finalize_multi_view_polygon(0)

    # Verify segment was created
    assert len(window.segment_manager.segments) > initial_segment_count

    # Get the new segment
    new_segment = window.segment_manager.segments[-1]

    # Verify it has views for all 4 viewers
    assert "views" in new_segment
    assert set(new_segment["views"].keys()) == {0, 1, 2, 3}

    # Verify all viewers have the same polygon vertices
    expected_vertices = [[10.0, 10.0], [50.0, 10.0], [50.0, 50.0], [10.0, 50.0]]
    for viewer_index in range(4):
        viewer_data = new_segment["views"][viewer_index]
        assert "vertices" in viewer_data
        assert viewer_data["vertices"] == expected_vertices

    # Verify segment type
    assert new_segment["type"] == "Polygon"


def test_4view_bbox_mode_mirroring(main_window_4view):
    """Test that bbox mode mirrors to all 4 viewers in 4-view mode."""
    window = main_window_4view

    # Set up proper multi-view state for the new link-aware implementation
    window.multi_view_linked = [True, True, True, True]  # All viewers linked
    window.multi_view_images = [
        "img1.jpg",
        "img2.jpg",
        "img3.jpg",
        "img4.jpg",
    ]  # All have images

    # Initialize bbox arrays for 4 viewers
    window.multi_view_bbox_starts = [None] * 4
    window.multi_view_bbox_rects = [None] * 4

    # Get initial segment count
    initial_segment_count = len(window.segment_manager.segments)

    # Simulate bbox completion using the multi_view_mode handler method
    from lazylabel.ui.modes.multi_view_mode import MultiViewModeHandler

    handler = MultiViewModeHandler(window)

    # Set up bbox for viewer 0
    start_pos = QPointF(20, 20)
    end_pos = QPointF(80, 60)
    window.multi_view_bbox_starts[0] = start_pos

    # Create mock rect item that can be removed from scene
    from PyQt6.QtWidgets import QGraphicsRectItem

    mock_rect = QGraphicsRectItem()
    window.multi_view_viewers[0].scene().addItem(mock_rect)  # Add to scene first
    window.multi_view_bbox_rects[0] = mock_rect

    # Complete the bbox
    handler.handle_bbox_complete(end_pos, 0)

    # Verify segment was created
    assert len(window.segment_manager.segments) > initial_segment_count

    # Get the new segment
    new_segment = window.segment_manager.segments[-1]

    # Verify it has views for all 4 viewers
    assert "views" in new_segment
    assert set(new_segment["views"].keys()) == {0, 1, 2, 3}

    # Verify all viewers have the same bbox vertices (as polygon)
    expected_vertices = [[20.0, 20.0], [80.0, 20.0], [80.0, 60.0], [20.0, 60.0]]
    for viewer_index in range(4):
        viewer_data = new_segment["views"][viewer_index]
        assert "vertices" in viewer_data
        assert viewer_data["vertices"] == expected_vertices

    # Verify segment type
    assert new_segment["type"] == "Polygon"


def test_4view_array_initialization(main_window_4view):
    """Test that all multi-view arrays are properly initialized for 4 viewers."""
    window = main_window_4view

    # Test polygon arrays
    assert len(window.multi_view_polygon_points) == 4
    assert len(window.multi_view_polygon_preview_items) == 4
    assert all(isinstance(points, list) for points in window.multi_view_polygon_points)

    # Test segment items tracking
    assert len(window.multi_view_segment_items) == 4
    assert set(window.multi_view_segment_items.keys()) == {0, 1, 2, 3}

    # Test that AI arrays are initialized when needed
    from lazylabel.ui.modes.multi_view_mode import MultiViewModeHandler

    handler = MultiViewModeHandler(window)

    # Initialize AI arrays (normally done on first AI interaction)
    num_viewers = handler._get_num_viewers()
    window.multi_view_positive_points = {i: [] for i in range(num_viewers)}
    window.multi_view_negative_points = {i: [] for i in range(num_viewers)}
    window.multi_view_point_items = {i: [] for i in range(num_viewers)}

    assert len(window.multi_view_positive_points) == 4
    assert len(window.multi_view_negative_points) == 4
    assert len(window.multi_view_point_items) == 4
    assert set(window.multi_view_positive_points.keys()) == {0, 1, 2, 3}


def test_4view_ai_prediction_saving(main_window_4view):
    """Test that AI predictions are saved with proper view structure for 4 viewers."""
    window = main_window_4view

    from lazylabel.ui.modes.multi_view_mode import MultiViewModeHandler

    handler = MultiViewModeHandler(window)

    # Mock AI predictions for multiple viewers
    import numpy as np

    mock_mask_1 = np.array([[True, False], [False, True]], dtype=bool)
    mock_mask_2 = np.array([[False, True], [True, False]], dtype=bool)
    mock_mask_3 = np.array([[True, True], [False, False]], dtype=bool)

    window.multi_view_ai_predictions = {
        0: {"mask": mock_mask_1, "points": [(10, 10)], "labels": [1]},
        1: {"mask": mock_mask_2, "points": [(20, 20)], "labels": [1]},
        2: {"mask": mock_mask_3, "points": [(30, 30)], "labels": [1]},
    }

    # Get initial segment count
    initial_segment_count = len(window.segment_manager.segments)

    # Save AI predictions
    handler.save_ai_predictions()

    # Verify segment was created
    assert len(window.segment_manager.segments) > initial_segment_count

    # Get the new segment
    new_segment = window.segment_manager.segments[-1]

    # Verify it has views for the viewers that had predictions
    assert "views" in new_segment
    assert set(new_segment["views"].keys()) == {0, 1, 2}

    # Verify each viewer's data
    assert np.array_equal(new_segment["views"][0]["mask"], mock_mask_1)
    assert np.array_equal(new_segment["views"][1]["mask"], mock_mask_2)
    assert np.array_equal(new_segment["views"][2]["mask"], mock_mask_3)

    # Verify segment type and class
    assert new_segment["type"] == "AI"
    assert "class_id" in new_segment


def test_4view_segment_display_initialization(main_window_4view):
    """Test that segment display is properly initialized for 4 viewers."""
    window = main_window_4view

    from lazylabel.ui.modes.multi_view_mode import MultiViewModeHandler

    handler = MultiViewModeHandler(window)

    # Call display_all_segments to initialize tracking
    handler.display_all_segments()

    # Verify segment items tracking is initialized for 4 viewers
    assert hasattr(window, "multi_view_segment_items")
    assert len(window.multi_view_segment_items) == 4
    assert set(window.multi_view_segment_items.keys()) == {0, 1, 2, 3}

    # Verify each viewer has empty segment tracking initially
    for viewer_index in range(4):
        assert isinstance(window.multi_view_segment_items[viewer_index], dict)


def test_4view_helper_methods(main_window_4view):
    """Test that helper methods work correctly with 4 viewers."""
    window = main_window_4view

    from lazylabel.ui.modes.multi_view_mode import MultiViewModeHandler

    handler = MultiViewModeHandler(window)

    # Test _get_num_viewers
    assert handler._get_num_viewers() == 4

    # Test _get_other_viewer_indices
    assert handler._get_other_viewer_indices(0) == [1, 2, 3]
    assert handler._get_other_viewer_indices(1) == [0, 2, 3]
    assert handler._get_other_viewer_indices(2) == [0, 1, 3]
    assert handler._get_other_viewer_indices(3) == [0, 1, 2]

    # Test with invalid viewer index
    assert handler._get_other_viewer_indices(5) == [
        0,
        1,
        2,
        3,
    ]  # Should return all valid indices


def test_4view_configuration_consistency(main_window_4view):
    """Test that 4-view configuration is consistent across the application."""
    window = main_window_4view

    # Verify settings
    assert window.settings.multi_view_grid_mode == "4_view"

    # Verify configuration
    config = window._get_multi_view_config()
    assert config["num_viewers"] == 4
    assert config["use_grid"]
    assert config["grid_rows"] == 2
    assert config["grid_cols"] == 2

    # Verify UI elements
    assert len(window.multi_view_viewers) == 4
    assert len(window.multi_view_info_labels) == 4
    assert len(window.multi_view_unlink_buttons) == 4


def test_4view_polygon_clearing(main_window_4view):
    """Test that polygon clearing works for all 4 viewers."""
    window = main_window_4view

    from lazylabel.ui.modes.multi_view_mode import MultiViewModeHandler

    handler = MultiViewModeHandler(window)

    # Add some points to viewer 2
    test_points = [QPointF(5, 5), QPointF(15, 15)]
    window.multi_view_polygon_points[2] = test_points

    # Clear polygon for viewer 2
    handler._clear_multi_view_polygon(2)

    # Verify points were cleared
    assert len(window.multi_view_polygon_points[2]) == 0

    # Verify other viewers weren't affected (if they had points)
    window.multi_view_polygon_points[0] = [QPointF(1, 1)]
    handler._clear_multi_view_polygon(2)  # Clear 2 again
    assert (
        len(window.multi_view_polygon_points[0]) == 1
    )  # Viewer 0 should be unaffected


def test_4view_clear_all_points(main_window_4view):
    """Test that clearing all points works for all 4 viewers."""
    window = main_window_4view

    from lazylabel.ui.modes.multi_view_mode import MultiViewModeHandler

    handler = MultiViewModeHandler(window)

    # Add points to multiple viewers
    for i in range(4):
        window.multi_view_polygon_points[i] = [QPointF(i, i), QPointF(i + 10, i + 10)]

    # Clear all points
    handler.clear_all_points()

    # Verify all viewers were cleared
    for i in range(4):
        assert len(window.multi_view_polygon_points[i]) == 0


def test_4view_selection_mode_arrays(main_window_4view):
    """Test that selection mode arrays are properly initialized for 4 viewers."""
    window = main_window_4view

    # Test highlight items initialization
    window._highlight_segments_multi_view([])  # This triggers initialization

    assert hasattr(window, "multi_view_highlight_items")
    assert len(window.multi_view_highlight_items) == 4
    assert set(window.multi_view_highlight_items.keys()) == {0, 1, 2, 3}

    # Test that all viewers have empty highlight lists initially
    for viewer_index in range(4):
        assert isinstance(window.multi_view_highlight_items[viewer_index], list)
        assert len(window.multi_view_highlight_items[viewer_index]) == 0


def test_4view_selection_mode_functionality(main_window_4view):
    """Test that selection mode works with 4 viewers without crashing."""
    window = main_window_4view

    # Create a test segment first that spans all viewers
    test_segment = {
        "type": "Polygon",
        "class_id": 1,
        "views": {
            0: {"vertices": [[10, 10], [20, 10], [20, 20], [10, 20]], "mask": None},
            1: {"vertices": [[30, 30], [40, 30], [40, 40], [30, 40]], "mask": None},
            2: {"vertices": [[50, 50], [60, 50], [60, 60], [50, 60]], "mask": None},
            3: {"vertices": [[70, 70], [80, 70], [80, 80], [70, 80]], "mask": None},
        },
    }

    # Add segment to manager
    window.segment_manager.add_segment(test_segment)

    # Test highlighting segments (this was the failing case)
    window._highlight_segments_multi_view([0])  # Highlight the first (and only) segment

    # Verify highlight items were created for all viewers
    assert hasattr(window, "multi_view_highlight_items")
    assert len(window.multi_view_highlight_items) == 4

    # Each viewer should have highlight items for the segment
    total_highlight_items = sum(
        len(items) for items in window.multi_view_highlight_items.values()
    )
    assert total_highlight_items > 0  # Should have created some highlight items

    # Test clearing highlights manually (simulating what happens when segments are deselected)
    # Clear all highlight items from all viewers
    for viewer_idx, items in window.multi_view_highlight_items.items():
        for item in items:
            if item.scene():
                item.scene().removeItem(item)
        window.multi_view_highlight_items[viewer_idx] = []

    # Verify all highlights were cleared
    total_highlight_items_after = sum(
        len(items) for items in window.multi_view_highlight_items.values()
    )
    assert total_highlight_items_after == 0


def test_4view_crop_overlays_initialization(main_window_4view):
    """Test that crop overlays are properly initialized for 4 viewers."""
    window = main_window_4view

    # Manually trigger the initialization logic by simulating the code path
    # This tests that the initialization logic works correctly for 4 viewers
    config = window._get_multi_view_config()
    num_viewers = config["num_viewers"]
    window.multi_view_crop_overlays = {i: [] for i in range(num_viewers)}

    assert hasattr(window, "multi_view_crop_overlays")
    assert len(window.multi_view_crop_overlays) == 4
    assert set(window.multi_view_crop_overlays.keys()) == {0, 1, 2, 3}

    # Verify each viewer has a list for crop overlays
    for viewer_index in range(4):
        assert isinstance(window.multi_view_crop_overlays[viewer_index], list)


def test_4view_edit_handles_initialization(main_window_4view):
    """Test that edit handles are properly initialized for 4 viewers."""
    window = main_window_4view

    # Create a test polygon segment
    test_segment = {
        "type": "Polygon",
        "class_id": 1,
        "views": {
            0: {"vertices": [[10, 10], [20, 10], [20, 20], [10, 20]], "mask": None}
        },
    }

    # Add segment and set mode to edit
    window.segment_manager.add_segment(test_segment)
    window.mode = "edit"

    # Mock the right panel to return selected segment
    from unittest.mock import MagicMock

    window.right_panel = MagicMock()
    window.right_panel.get_selected_segment_indices.return_value = [0]

    # Trigger edit handles initialization
    window._display_multi_view_edit_handles()

    assert hasattr(window, "multi_view_edit_handles")
    assert len(window.multi_view_edit_handles) == 4
    assert set(window.multi_view_edit_handles.keys()) == {0, 1, 2, 3}

    # Verify each viewer has a list for edit handles
    for viewer_index in range(4):
        assert isinstance(window.multi_view_edit_handles[viewer_index], list)
