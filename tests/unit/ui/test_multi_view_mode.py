"""Unit tests for multi-view mode functionality."""

from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from PyQt6.QtCore import QPointF, Qt

# Try to import required dependencies, skip module if not available
try:
    import sam2  # noqa: F401
except ImportError:
    pytest.skip("SAM-2 dependencies not available", allow_module_level=True)

# Mock SAM-2 modules before importing MainWindow to prevent import errors
with (
    patch("lazylabel.models.sam2_model.build_sam2"),
    patch("lazylabel.models.sam2_model.SAM2ImagePredictor"),
    patch("lazylabel.models.sam2_model.logger"),
):
    from lazylabel.ui.main_window import MainWindow


@pytest.fixture
def mock_sam_model():
    """Create a mock SAM model for testing."""
    mock_model = MagicMock()
    mock_model.is_loaded = True
    mock_model.device = "CUDA"
    mock_model.set_image_from_path = MagicMock()
    mock_model.set_image_from_array = MagicMock()
    mock_model.predict = MagicMock(return_value=np.zeros((100, 100), dtype=np.uint8))
    return mock_model


@pytest.fixture
def mock_sam_models_list():
    """Create a list of mock SAM models for multi-view testing."""
    # Support both 2-view and 4-view configurations
    max_viewers = 4  # Support up to 4 viewers for testing
    models = []
    for _ in range(max_viewers):
        mock_model = MagicMock()
        mock_model.is_loaded = True
        mock_model.device = "CUDA"
        mock_model.set_image_from_path = MagicMock()
        mock_model.set_image_from_array = MagicMock()
        mock_model.predict = MagicMock(
            return_value=np.zeros((100, 100), dtype=np.uint8)
        )
        models.append(mock_model)
    return models


@pytest.fixture
def main_window_with_multi_view(qtbot, mock_sam_models_list):
    """Fixture for MainWindow with multi-view mode setup."""
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
        patch("lazylabel.models.sam_model.SamModel") as mock_sam_model_class,
        patch("lazylabel.models.sam2_model.Sam2Model") as mock_sam2_model_class,
    ):
        # Setup base model manager mocks
        mock_init.return_value = mock_sam_models_list[0]
        mock_get_models.return_value = [
            ("Mock SAM Model", "/path/to/model.pth"),
            ("Mock SAM2 Model", "/path/to/sam2_model.pth"),
        ]
        mock_is_available.return_value = True

        # Setup multi-view model creation mocks
        mock_sam_model_class.side_effect = mock_sam_models_list
        mock_sam2_model_class.side_effect = mock_sam_models_list

        # Create MainWindow
        window = MainWindow()
        qtbot.addWidget(window)

        # Setup mock file model for testing
        window.file_model = MagicMock()

        return window


def test_multi_view_initialization(main_window_with_multi_view):
    """Test that multi-view state is properly initialized."""
    window = main_window_with_multi_view

    # Get expected configuration
    config = window._get_multi_view_config()
    num_viewers = config["num_viewers"]

    # Check initial multi-view state
    assert window.view_mode == "single"
    assert window.multi_view_models == []
    assert len(window.multi_view_images) == num_viewers
    assert all(img is None for img in window.multi_view_images)
    assert len(window.multi_view_linked) == num_viewers
    assert all(linked for linked in window.multi_view_linked)
    assert len(window.multi_view_segments) == num_viewers
    assert all(segments == [] for segments in window.multi_view_segments)
    # Note: current_multi_batch_start removed - now uses relative navigation


def test_multi_view_mode_switch_without_folder(main_window_with_multi_view):
    """Test switching to multi-view mode without a folder loaded."""
    window = main_window_with_multi_view

    # Mock the warning notification
    window._show_warning_notification = MagicMock()

    # Mock the view tab widget
    window.view_tab_widget.setCurrentIndex = MagicMock()

    # Simulate switching to multi-view without folder
    window.file_model = None
    window._on_view_mode_changed(1)  # 1 = multi-view

    # Should show warning and switch back to single view
    window._show_warning_notification.assert_called_once()
    window.view_tab_widget.setCurrentIndex.assert_called_once_with(0)
    assert window.view_mode == "single"


def test_multi_view_mode_switch_with_no_images(main_window_with_multi_view):
    """Test switching to multi-view mode with no images available."""
    window = main_window_with_multi_view

    # Mock dependencies
    window._show_warning_notification = MagicMock()
    window.view_tab_widget.setCurrentIndex = MagicMock()
    window._get_images_without_npz = MagicMock(return_value=[])

    # Simulate switching to multi-view with no images
    window._on_view_mode_changed(1)  # 1 = multi-view

    # Should switch to multi-view mode without warnings (no file scanning)
    window._show_warning_notification.assert_not_called()
    window.view_tab_widget.setCurrentIndex.assert_not_called()
    assert window.view_mode == "multi"


@patch("lazylabel.models.sam_model.SamModel")
def test_multi_view_model_initialization_sam1(
    mock_sam_model_class, main_window_with_multi_view
):
    """Test multi-view model initialization with SAM1 models."""
    window = main_window_with_multi_view

    # Mock dependencies
    window._show_notification = MagicMock()
    window._show_success_notification = MagicMock()
    window._cleanup_multi_view_models = MagicMock()

    # Mock model manager
    window.model_manager.is_model_available = MagicMock(return_value=True)
    window.model_manager.sam_model = MagicMock()
    window.model_manager.sam_model.current_model_type = "vit_h"
    window.model_manager.sam_model.current_model_path = "/path/to/model.pth"

    # Get dynamic viewer count
    config = window._get_multi_view_config()
    num_viewers = config["num_viewers"]

    # Mock model instances
    mock_models = [MagicMock() for _ in range(num_viewers)]
    for model in mock_models:
        model.is_loaded = True
    mock_sam_model_class.side_effect = mock_models

    # Test initialization - directly call the worker completion handlers
    for i in range(num_viewers):
        window._on_multi_view_model_initialized(i, mock_models[i])
    window._on_all_multi_view_models_initialized(num_viewers)

    # Verify models were created
    assert len(window.multi_view_models) == num_viewers


@patch("lazylabel.models.sam2_model.Sam2Model")
def test_multi_view_model_initialization_sam2(
    mock_sam2_model_class, main_window_with_multi_view
):
    """Test multi-view model initialization with SAM2 models."""
    window = main_window_with_multi_view

    # Mock dependencies
    window._show_notification = MagicMock()
    window._show_success_notification = MagicMock()
    window._cleanup_multi_view_models = MagicMock()

    # Mock model manager with SAM2 model
    window.model_manager.is_model_available = MagicMock(return_value=True)
    window.model_manager.sam_model = MagicMock()
    window.model_manager.sam_model._is_sam2 = True
    window.model_manager.sam_model.model_path = "/path/to/sam2_model.pth"

    # Get dynamic viewer count
    config = window._get_multi_view_config()
    num_viewers = config["num_viewers"]

    # Mock model instances
    mock_models = [MagicMock() for _ in range(num_viewers)]
    for model in mock_models:
        model.is_loaded = True
    mock_sam2_model_class.side_effect = mock_models

    # Test initialization - directly call the worker completion handlers
    for i in range(num_viewers):
        window._on_multi_view_model_initialized(i, mock_models[i])
    window._on_all_multi_view_models_initialized(num_viewers)

    # Verify SAM2 models were created
    assert len(window.multi_view_models) == num_viewers


def test_multi_view_model_initialization_failure(main_window_with_multi_view):
    """Test multi-view model initialization failure handling."""
    window = main_window_with_multi_view

    # Mock dependencies
    window._show_notification = MagicMock()
    window._show_error_notification = MagicMock()
    window._cleanup_multi_view_models = MagicMock()

    # Mock model creation to fail
    with patch("lazylabel.models.sam_model.SamModel") as mock_sam_model:
        mock_sam_model.side_effect = Exception("Model creation failed")

        # Test initialization failure - call the error handler directly
        window._on_multi_view_init_error("Model creation failed")

    # Verify error handling
    window._show_error_notification.assert_called_once()
    assert len(window.multi_view_models) == 0


def test_multi_view_models_cleanup(main_window_with_multi_view):
    """Test multi-view models cleanup."""
    window = main_window_with_multi_view

    # Get dynamic viewer count and create mock models
    config = window._get_multi_view_config()
    num_viewers = config["num_viewers"]
    mock_models = [MagicMock() for _ in range(num_viewers)]
    for model in mock_models:
        model.model = MagicMock()
    window.multi_view_models = mock_models

    # Test cleanup
    with patch("torch.cuda.empty_cache") as mock_empty_cache:
        window._cleanup_multi_view_models()

    # Verify cleanup
    assert len(window.multi_view_models) == 0
    mock_empty_cache.assert_called_once()


def test_multi_view_batch_loading(main_window_with_multi_view):
    """Test loading a pair of images from cached list position."""
    window = main_window_with_multi_view

    # Override config to use 2-view mode for this test
    window._get_multi_view_config = MagicMock(
        return_value={
            "num_viewers": 2,
            "grid_rows": 1,
            "grid_cols": 2,
            "use_grid": False,
        }
    )

    # Mock cached image list (the global list from folder scan)
    window.cached_image_paths = [
        "/path/to/image1.jpg",
        "/path/to/image2.jpg",
        "/path/to/image3.jpg",
        "/path/to/image4.jpg",
    ]

    # Mock file model approach
    window.current_file_index = MagicMock()
    window.current_file_index.isValid.return_value = True
    window.file_model = MagicMock()
    window.file_model.filePath.return_value = "/path/to/image1.jpg"
    window._load_multi_view_images = MagicMock()
    window.file_manager = MagicMock()
    window.file_manager.is_image_file.return_value = True

    # Mock os.path.isfile
    with patch("os.path.isfile", return_value=True):
        # Test relative loading from cached list
        window._load_current_multi_view_pair_from_file_model()

    # Verify it calls the image loading function with correct paths from cached list
    window._load_multi_view_images.assert_called_once_with(
        ["/path/to/image1.jpg", "/path/to/image2.jpg"]
    )


def test_multi_view_batch_navigation(main_window_with_multi_view):
    """Test navigation between multi-view batches."""
    window = main_window_with_multi_view

    # Override config to use 2-view mode for this test
    window._get_multi_view_config = MagicMock(
        return_value={
            "num_viewers": 2,
            "grid_rows": 1,
            "grid_cols": 2,
            "use_grid": False,
        }
    )

    # Mock cached image list (the global list from folder scan)
    window.cached_image_paths = [
        "/path/to/image1.jpg",
        "/path/to/image2.jpg",
        "/path/to/image3.jpg",
        "/path/to/image4.jpg",
        "/path/to/image5.jpg",
        "/path/to/image6.jpg",
    ]

    # Mock the navigation implementation
    window._load_multi_view_images = MagicMock()
    window.current_file_index = MagicMock()
    window.current_file_index.isValid.return_value = True
    window.file_model = MagicMock()
    window.right_panel = MagicMock()
    window.right_panel.file_tree = MagicMock()

    # Mock the class filter combo to avoid the >= comparison issue
    mock_combo = MagicMock()
    mock_combo.findText.return_value = -1  # Return integer instead of MagicMock
    window.right_panel.class_filter_combo = mock_combo

    # Test next batch navigation (from image1 -> image3+4)
    window.file_model.filePath.return_value = "/path/to/image1.jpg"
    # Set up current state to start from image1
    window.multi_view_images = ["/path/to/image1.jpg", "/path/to/image2.jpg"]
    # Mock control panel to avoid auto-save
    window.control_panel = MagicMock()
    window.control_panel.get_settings.return_value = {"auto_save": False}

    window._load_next_multi_batch()

    # Verify _load_multi_view_images was called with images at index 2 and 3
    window._load_multi_view_images.assert_called_once_with(
        ["/path/to/image3.jpg", "/path/to/image4.jpg"]
    )

    # Reset mocks for previous batch test
    window._load_multi_view_images.reset_mock()

    # Test previous batch navigation (from image5 -> image3+4)
    window.file_model.filePath.return_value = "/path/to/image5.jpg"
    # Set up current state to start from image5+6
    window.multi_view_images = ["/path/to/image5.jpg", "/path/to/image6.jpg"]

    window._load_previous_multi_batch()

    # Verify _load_multi_view_images was called with images at index 2 and 3
    window._load_multi_view_images.assert_called_once_with(
        ["/path/to/image3.jpg", "/path/to/image4.jpg"]
    )


def test_multi_view_ai_click_handling(main_window_with_multi_view):
    """Test AI click handling in multi-view mode."""
    window = main_window_with_multi_view

    # Setup multi-view state
    window.multi_view_models = [MagicMock(), MagicMock()]
    window.multi_view_viewers = [MagicMock(), MagicMock()]
    window.multi_view_models_updating = [False, False]
    window.multi_view_models_dirty = [False, False]
    window.point_radius = 5

    # Mock viewer scene
    mock_scene = MagicMock()
    window.multi_view_viewers[0].scene.return_value = mock_scene

    # Mock event - use right click since left click now does drag detection
    mock_event = MagicMock()
    mock_event.button.return_value = Qt.MouseButton.RightButton
    pos = QPointF(10, 20)

    # Mock the SAM model prediction to return a valid result
    mock_result = (
        np.ones((256, 256), dtype=bool),  # mask
        np.array([0.9]),  # scores
        np.random.rand(1, 256, 256),  # logits
    )
    window.multi_view_models[0].predict.return_value = mock_result

    # Set up the mode handler properly
    from lazylabel.ui.modes import MultiViewModeHandler

    window.multi_view_mode_handler = MultiViewModeHandler(window)

    # Mock additional dependencies
    window._transform_multi_view_coords_to_sam_coords = MagicMock(return_value=(50, 60))
    window._display_multi_view_mask = MagicMock()

    # Test AI click using the mode handler
    window.multi_view_mode_handler.handle_ai_click(pos, mock_event, 0)

    # Verify visual point was added to scene
    mock_scene.addItem.assert_called_once()


def test_multi_view_link_toggle(main_window_with_multi_view):
    """Test toggling link status in multi-view mode."""
    window = main_window_with_multi_view

    # Mock button
    mock_button = MagicMock()
    window.multi_view_unlink_buttons = [mock_button, MagicMock()]

    # Test toggle link
    initial_state = window.multi_view_linked[0]
    window._toggle_multi_view_link(0)

    # Verify link state changed
    assert window.multi_view_linked[0] != initial_state

    # Verify button appearance updated
    mock_button.setText.assert_called_once()


def test_multi_view_zoom_synchronization(main_window_with_multi_view):
    """Test zoom synchronization between multi-view viewers."""
    window = main_window_with_multi_view

    # Setup viewers and ensure we're in multi-view mode
    window.view_mode = "multi"
    window.multi_view_viewers = [MagicMock(), MagicMock()]
    window.multi_view_linked = [True, True]
    window.multi_view_images = ["image1.jpg", "image2.jpg"]  # Need images loaded

    # Test zoom sync
    window._sync_multi_view_zoom(1.5, 0)

    # Verify zoom was synced to the other viewer
    window.multi_view_viewers[1].sync_zoom.assert_called_once_with(1.5)


def test_multi_view_zoom_sync_with_unlinked_viewer(main_window_with_multi_view):
    """Test zoom synchronization when source viewer is unlinked."""
    window = main_window_with_multi_view

    # Setup viewers with one unlinked
    window.multi_view_viewers = [MagicMock(), MagicMock()]
    window.multi_view_linked = [False, True]

    # Test zoom sync from unlinked viewer
    window._sync_multi_view_zoom(1.5, 0)

    # Verify no sync occurred
    window.multi_view_viewers[1].sync_zoom.assert_not_called()


def test_multi_view_save_batch(main_window_with_multi_view):
    """Test saving annotations for multi-view batch."""
    window = main_window_with_multi_view

    # Setup multi-view state for 2-view mode
    window.multi_view_images = ["/path/to/image1.jpg", "/path/to/image2.jpg"]
    window.multi_view_linked = [True, True]
    window.multi_view_segments = [
        [{"class": "test", "mask": np.zeros((100, 100))}],
        [{"class": "test", "mask": np.zeros((100, 100))}],
    ]

    # Mock config to return 2-view mode for this test
    window._get_multi_view_config = MagicMock(
        return_value={
            "num_viewers": 2,
            "grid_rows": 1,
            "grid_cols": 2,
            "use_grid": False,
        }
    )

    # Mock file manager and dependencies
    window.file_manager = MagicMock()
    window.file_manager.save_npz = MagicMock(return_value="/path/to/saved.npz")
    window.segment_manager = MagicMock()
    window.segment_manager.get_unique_class_ids = MagicMock(return_value=["test"])
    window.control_panel = MagicMock()
    window.control_panel.get_settings = MagicMock(return_value={"save_npz": True})

    # Mock _get_segments_for_viewer to return segments
    window._get_segments_for_viewer = MagicMock(
        side_effect=lambda i: [{"class": "test", "mask": np.zeros((100, 100))}]
    )

    # Mock viewers with pixmaps
    mock_viewers = [MagicMock(), MagicMock()]
    for mock_viewer in mock_viewers:
        mock_pixmap = MagicMock()
        mock_pixmap.isNull.return_value = False
        mock_pixmap.height.return_value = 100
        mock_pixmap.width.return_value = 100
        mock_viewer._pixmap_item.pixmap.return_value = mock_pixmap
    window.multi_view_viewers = mock_viewers

    # Mock file_model update methods to avoid errors
    window.file_model = MagicMock()
    window.file_model.update_cache_for_path = MagicMock()
    window.file_model.set_highlighted_path = MagicMock()

    # Test batch save
    window._save_multi_view_output()

    # Verify both images were saved
    assert window.file_manager.save_npz.call_count == 2


def test_multi_view_coordinate_transformation(main_window_with_multi_view):
    """Test coordinate transformation between viewer and SAM coordinates."""
    window = main_window_with_multi_view

    # Setup viewers
    window.multi_view_viewers = [MagicMock(), MagicMock()]
    window.multi_view_viewers[0].scale_factor = 0.5

    # Mock pixmap
    mock_pixmap = MagicMock()
    mock_pixmap.width.return_value = 200
    mock_pixmap.height.return_value = 200
    window.multi_view_viewers[0]._pixmap_item = MagicMock()
    window.multi_view_viewers[0]._pixmap_item.pixmap.return_value = mock_pixmap

    # Test coordinate transformation
    pos = QPointF(100, 100)
    sam_coords = window._transform_multi_view_coords_to_sam_coords(pos, 0)

    # Verify coordinate transformation
    assert isinstance(sam_coords, tuple)
    assert len(sam_coords) == 2


def test_multi_view_mouse_event_delegation(main_window_with_multi_view):
    """Test mouse event delegation in multi-view mode."""
    window = main_window_with_multi_view

    # Setup multi-view state
    window.view_mode = "multi"
    window.mode = "ai"
    window.multi_view_models = [MagicMock(), MagicMock()]
    window.multi_view_linked = [True, True]
    window.multi_view_images = ["image1.jpg", "image2.jpg"]

    # Mock viewers with mapToScene
    mock_viewer1 = MagicMock()
    mock_viewer2 = MagicMock()
    mapped_pos = QPointF(15, 25)  # Mapped position
    mock_viewer1.mapToScene.return_value = mapped_pos
    mock_viewer1.mapFromScene.return_value = mapped_pos
    window.multi_view_viewers = [mock_viewer1, mock_viewer2]

    # Mock event
    mock_event = MagicMock()
    mock_event.button.return_value = Qt.MouseButton.LeftButton
    pos = QPointF(10, 20)
    mock_event.scenePos.return_value = pos

    # Mock the AI click handler method
    window._handle_multi_view_ai_click = MagicMock()
    window._mirror_mouse_action = MagicMock()

    # Test mouse event delegation
    window._multi_view_mouse_press(mock_event, 0)

    # Verify delegation occurred
    window._handle_multi_view_ai_click.assert_called_once()
    # Also verify mirroring occurred for the second viewer
    window._mirror_mouse_action.assert_called_once()


def test_multi_view_empty_batch_handling(main_window_with_multi_view):
    """Test handling when no valid file index exists."""
    window = main_window_with_multi_view

    # Mock invalid file index
    window.current_file_index = MagicMock()
    window.current_file_index.isValid.return_value = False
    window._load_multi_view_pair = MagicMock()

    # Test empty handling - should return early and not call pair loading
    window._load_current_multi_view_pair_from_file_model()

    # Verify no pair loading was attempted
    window._load_multi_view_pair.assert_not_called()


def test_multi_view_segment_selection_with_mouse_click(main_window_with_multi_view):
    """Test that clicking on a segment in multi-view mode selects it."""
    window = main_window_with_multi_view

    # Set up multi-view mode and selection mode
    window.view_mode = "multi"
    window._set_mode("selection")

    # Create a test segment in multi-view format
    test_segment = {
        "type": "Polygon",
        "class_id": 1,
        "views": {
            0: {
                "vertices": [
                    [100.0, 100.0],
                    [200.0, 100.0],
                    [200.0, 200.0],
                    [100.0, 200.0],
                ],
                "mask": None,
            },
            1: {
                "vertices": [
                    [100.0, 100.0],
                    [200.0, 100.0],
                    [200.0, 200.0],
                    [100.0, 200.0],
                ],
                "mask": None,
            },
        },
    }

    # Add the segment to the segment manager
    window.segment_manager.add_segment(test_segment)

    # Update the display to show the segment
    window._update_all_lists()

    # Verify the segment was added
    assert len(window.segment_manager.segments) == 1

    # Verify no segments are initially selected
    selected_indices = window.right_panel.get_selected_segment_indices()
    assert len(selected_indices) == 0

    # Simulate clicking directly on the segment selection handler
    click_point = QPointF(150.0, 150.0)  # Center of the 100x100 square

    # Directly call the selection handler
    window._handle_multi_view_selection_click(click_point, 0)

    # Verify that the segment is now selected
    selected_indices = window.right_panel.get_selected_segment_indices()
    assert len(selected_indices) == 1
    assert selected_indices[0] == 0

    # Verify that the segment row is selected in the table
    table = window.right_panel.segment_table
    assert table.rowCount() == 1

    # Check if row 0 is selected
    selected_rows = []
    for i in range(table.rowCount()):
        if table.item(i, 0) and table.item(i, 0).isSelected():
            selected_rows.append(i)

    assert len(selected_rows) == 1
    assert selected_rows[0] == 0


def test_multi_view_selection_not_mirrored_between_viewers(main_window_with_multi_view):
    """Test that selection clicks are not mirrored between viewers."""
    window = main_window_with_multi_view

    # Set up multi-view mode and selection mode
    window.view_mode = "multi"
    window._set_mode("selection")

    # Create a test segment in multi-view format
    test_segment = {
        "type": "Polygon",
        "class_id": 1,
        "views": {
            0: {
                "vertices": [
                    [100.0, 100.0],
                    [200.0, 100.0],
                    [200.0, 200.0],
                    [100.0, 200.0],
                ],
                "mask": None,
            },
            1: {
                "vertices": [
                    [100.0, 100.0],
                    [200.0, 100.0],
                    [200.0, 200.0],
                    [100.0, 200.0],
                ],
                "mask": None,
            },
        },
    }

    window.segment_manager.add_segment(test_segment)
    window._update_all_lists()

    # Verify no segments are initially selected
    selected_indices = window.right_panel.get_selected_segment_indices()
    assert len(selected_indices) == 0

    # Click on segment in viewer 0 only
    click_point = QPointF(150.0, 150.0)
    window._handle_multi_view_selection_click(click_point, 0)

    # Verify segment is selected
    selected_indices = window.right_panel.get_selected_segment_indices()
    assert len(selected_indices) == 1
    assert selected_indices[0] == 0

    # Verify that clicking in the same location in viewer 1 doesn't immediately deselect
    # (This tests that selection events are not mirrored between viewers)
    window._handle_multi_view_selection_click(click_point, 1)

    # Should now be deselected because viewer 1 click was handled independently
    selected_indices = window.right_panel.get_selected_segment_indices()
    assert len(selected_indices) == 0


def test_multi_view_selection_toggle_on_repeated_clicks(main_window_with_multi_view):
    """Test that clicking the same segment twice toggles selection."""
    window = main_window_with_multi_view

    # Set up multi-view mode and selection mode
    window.view_mode = "multi"
    window._set_mode("selection")

    # Create and add a test segment
    test_segment = {
        "type": "Polygon",
        "class_id": 1,
        "views": {
            0: {
                "vertices": [
                    [75.0, 75.0],
                    [175.0, 75.0],
                    [175.0, 175.0],
                    [75.0, 175.0],
                ],
                "mask": None,
            },
            1: {
                "vertices": [
                    [75.0, 75.0],
                    [175.0, 75.0],
                    [175.0, 175.0],
                    [75.0, 175.0],
                ],
                "mask": None,
            },
        },
    }

    window.segment_manager.add_segment(test_segment)
    window._update_all_lists()

    click_point = QPointF(125.0, 125.0)

    # First click - should select
    window._handle_multi_view_selection_click(click_point, 0)

    selected_indices = window.right_panel.get_selected_segment_indices()
    assert len(selected_indices) == 1

    # Second click - should deselect
    window._handle_multi_view_selection_click(click_point, 0)

    selected_indices = window.right_panel.get_selected_segment_indices()
    assert len(selected_indices) == 0
