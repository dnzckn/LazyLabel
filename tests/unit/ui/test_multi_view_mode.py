"""Unit tests for multi-view mode functionality."""

from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from PyQt6.QtCore import QPointF, Qt

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
    models = []
    for _ in range(2):
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

    # Check initial multi-view state
    assert window.view_mode == "single"
    assert window.multi_view_models == []
    assert window.multi_view_images == [None, None]
    assert window.multi_view_linked == [True, True]
    assert window.multi_view_segments == [[], []]
    assert window.current_multi_batch_start == 0


def test_multi_view_mode_switch_without_folder(main_window_with_multi_view):
    """Test switching to multi-view mode without a folder loaded."""
    window = main_window_with_multi_view

    # Mock the warning notification
    window._show_warning_notification = MagicMock()

    # Mock the view mode tabs
    window.view_mode_tabs = MagicMock()
    window.view_mode_tabs.setCurrentIndex = MagicMock()

    # Simulate switching to multi-view without folder
    window.file_model = None
    window._on_view_mode_changed(1)  # 1 = multi-view

    # Should show warning and switch back to single view
    window._show_warning_notification.assert_called_once()
    window.view_mode_tabs.setCurrentIndex.assert_called_once_with(0)
    assert window.view_mode == "single"


def test_multi_view_mode_switch_with_no_images(main_window_with_multi_view):
    """Test switching to multi-view mode with no images available."""
    window = main_window_with_multi_view

    # Mock dependencies
    window._show_warning_notification = MagicMock()
    window.view_mode_tabs = MagicMock()
    window.view_mode_tabs.setCurrentIndex = MagicMock()
    window._get_images_without_npz = MagicMock(return_value=[])

    # Simulate switching to multi-view with no images
    window._on_view_mode_changed(1)  # 1 = multi-view

    # Should show warning and switch back to single view
    window._show_warning_notification.assert_called_once()
    window.view_mode_tabs.setCurrentIndex.assert_called_once_with(0)
    assert window.view_mode == "single"


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

    # Mock model instances
    mock_models = [MagicMock(), MagicMock()]
    for model in mock_models:
        model.is_loaded = True
    mock_sam_model_class.side_effect = mock_models

    # Test initialization - directly call the worker completion handlers
    window._on_multi_view_model_initialized(0, mock_models[0])
    window._on_multi_view_model_initialized(1, mock_models[1])
    window._on_all_multi_view_models_initialized(2)

    # Verify models were created
    assert len(window.multi_view_models) == 2


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

    # Mock model instances
    mock_models = [MagicMock(), MagicMock()]
    for model in mock_models:
        model.is_loaded = True
    mock_sam2_model_class.side_effect = mock_models

    # Test initialization - directly call the worker completion handlers
    window._on_multi_view_model_initialized(0, mock_models[0])
    window._on_multi_view_model_initialized(1, mock_models[1])
    window._on_all_multi_view_models_initialized(2)

    # Verify SAM2 models were created
    assert len(window.multi_view_models) == 2


def test_multi_view_model_initialization_failure(main_window_with_multi_view):
    """Test multi-view model initialization failure handling."""
    window = main_window_with_multi_view

    # Mock dependencies
    window._show_notification = MagicMock()
    window._show_error_notification = MagicMock()
    window._cleanup_multi_view_models = MagicMock()

    # Mock model manager without available model
    window.model_manager.is_model_available = MagicMock(return_value=False)

    # Test initialization failure
    window._initialize_multi_view_models()

    # Verify error handling
    window._show_error_notification.assert_called_once()
    assert len(window.multi_view_models) == 0


def test_multi_view_models_cleanup(main_window_with_multi_view):
    """Test multi-view models cleanup."""
    window = main_window_with_multi_view

    # Create mock models
    mock_models = [MagicMock(), MagicMock()]
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
    """Test loading a batch of images in multi-view mode."""
    window = main_window_with_multi_view

    # Mock dependencies
    window._get_images_without_npz = MagicMock(
        return_value=[
            "/path/to/image1.jpg",
            "/path/to/image2.jpg",
            "/path/to/image3.jpg",
            "/path/to/image4.jpg",
        ]
    )
    window.multi_view_models = [MagicMock(), MagicMock()]
    window.multi_view_viewers = [MagicMock(), MagicMock()]
    window.multi_view_info_labels = [MagicMock(), MagicMock()]
    window.multi_batch_info = MagicMock()
    window.multi_prev_button = MagicMock()
    window.multi_next_button = MagicMock()

    # Mock control panel
    window.control_panel = MagicMock()
    window.control_panel.border_crop_widget = MagicMock()
    window.control_panel.border_crop_widget.disable_thresholding_for_multi_view = (
        MagicMock()
    )

    # Mock QPixmap creation
    with patch("lazylabel.ui.main_window.QPixmap") as mock_pixmap_class:
        mock_pixmap = MagicMock()
        mock_pixmap.isNull.return_value = False
        mock_pixmap_class.return_value = mock_pixmap

        # Test batch loading
        window._load_current_multi_batch()

    # Verify batch loading
    assert window.multi_view_images[0] == "/path/to/image1.jpg"
    assert window.multi_view_images[1] == "/path/to/image2.jpg"
    assert window.multi_view_segments == [[], []]

    # Verify UI updates
    window.multi_batch_info.setText.assert_called_once()
    window.multi_prev_button.setEnabled.assert_called_once_with(False)
    window.multi_next_button.setEnabled.assert_called_once_with(True)


def test_multi_view_batch_navigation(main_window_with_multi_view):
    """Test navigation between multi-view batches."""
    window = main_window_with_multi_view

    # Mock dependencies
    window._get_images_without_npz = MagicMock(
        return_value=[
            "/path/to/image1.jpg",
            "/path/to/image2.jpg",
            "/path/to/image3.jpg",
            "/path/to/image4.jpg",
        ]
    )
    window._load_current_multi_batch = MagicMock()

    # Test next batch navigation
    window.current_multi_batch_start = 0
    window._load_next_multi_batch()

    assert window.current_multi_batch_start == 2
    window._load_current_multi_batch.assert_called_once()

    # Test previous batch navigation
    window._load_current_multi_batch.reset_mock()
    window._load_previous_multi_batch()

    assert window.current_multi_batch_start == 0
    window._load_current_multi_batch.assert_called_once()


def test_multi_view_ai_click_handling(main_window_with_multi_view):
    """Test AI click handling in multi-view mode."""
    window = main_window_with_multi_view

    # Setup multi-view state
    window.multi_view_models = [MagicMock(), MagicMock()]
    window.multi_view_viewers = [MagicMock(), MagicMock()]

    # Mock viewer scene
    mock_scene = MagicMock()
    window.multi_view_viewers[0].scene.return_value = mock_scene

    # Mock coordinate transformation
    window._transform_multi_view_coords_to_sam_coords = MagicMock(return_value=(50, 60))

    # Mock event
    mock_event = MagicMock()
    mock_event.button.return_value = Qt.MouseButton.LeftButton
    pos = QPointF(10, 20)

    # Test AI click
    window._handle_multi_view_ai_click(pos, 0, mock_event)

    # Verify model prediction was called
    window.multi_view_models[0].predict.assert_called_once()

    # Verify visual point was added
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

    # Setup multi-view state
    window.multi_view_images = ["/path/to/image1.jpg", "/path/to/image2.jpg"]
    window.multi_view_linked = [True, True]
    window.multi_view_segments = [
        [{"class": "test", "mask": np.zeros((100, 100))}],
        [{"class": "test", "mask": np.zeros((100, 100))}],
    ]

    # Mock file manager and dependencies
    window.file_manager = MagicMock()
    window.file_manager.save_npz = MagicMock(return_value="/path/to/saved.npz")
    window.segment_manager = MagicMock()
    window.segment_manager.get_unique_class_ids = MagicMock(return_value=["test"])
    window.control_panel = MagicMock()
    window.control_panel.get_settings = MagicMock(return_value={"save_npz": True})

    # Mock viewers with pixmaps
    mock_viewers = [MagicMock(), MagicMock()]
    for mock_viewer in mock_viewers:
        mock_pixmap = MagicMock()
        mock_pixmap.isNull.return_value = False
        mock_pixmap.height.return_value = 100
        mock_pixmap.width.return_value = 100
        mock_viewer._pixmap_item.pixmap.return_value = mock_pixmap
    window.multi_view_viewers = mock_viewers

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
    window.multi_view_viewers = [mock_viewer1, mock_viewer2]

    # Mock event
    mock_event = MagicMock()
    mock_event.button.return_value = Qt.MouseButton.LeftButton
    pos = QPointF(10, 20)
    mock_event.scenePos.return_value = pos

    # Mock multi-view click handler
    window._handle_multi_view_ai_click = MagicMock()

    # Test mouse event delegation
    window._multi_view_mouse_press(mock_event, 0)

    # Verify delegation occurred with mapped position - called for both viewers
    assert window._handle_multi_view_ai_click.call_count == 2
    window._handle_multi_view_ai_click.assert_any_call(mapped_pos, 0, mock_event)


def test_multi_view_empty_batch_handling(main_window_with_multi_view):
    """Test handling of empty batch in multi-view mode."""
    window = main_window_with_multi_view

    # Mock dependencies
    window._get_images_without_npz = MagicMock(return_value=[])
    window._show_warning_notification = MagicMock()
    window.multi_view_viewers = [MagicMock(), MagicMock()]
    window.multi_view_info_labels = [MagicMock(), MagicMock()]
    window.multi_batch_info = MagicMock()

    # Test empty batch handling
    window._load_current_multi_batch()

    # Verify warning was shown
    window._show_warning_notification.assert_called_once()

    # Verify viewers were hidden
    for viewer in window.multi_view_viewers:
        viewer.hide.assert_called_once()
