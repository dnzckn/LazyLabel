from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from PyQt6.QtCore import QModelIndex, QPointF, Qt
from PyQt6.QtGui import QPixmap

from lazylabel.ui.main_window import MainWindow


@pytest.fixture
def mock_sam_model():
    """Create a mock SAM model."""
    mock_model = MagicMock()
    mock_model.is_loaded = True
    mock_model.device = "CPU"
    return mock_model


@pytest.fixture
def main_window(qtbot, mock_sam_model):
    """Fixture for MainWindow with mocked model loading."""
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
        return window


def test_main_window_creation(main_window):
    """Test that the MainWindow can be created."""
    assert main_window is not None


def test_sam_point_creation_on_mouse_press(main_window, qtbot):
    """Test that _add_point is called when in AI mode with click (not drag)."""
    # Enable the model manager
    main_window.model_manager.is_model_available = MagicMock(return_value=True)

    # Set the mode to AI (sam_mode now goes to AI mode)
    main_window.set_sam_mode()
    assert main_window.mode == "ai"

    # Load a dummy pixmap to ensure mouse events are processed
    dummy_pixmap = QPixmap(100, 100)  # Create a 100x100 dummy pixmap
    dummy_pixmap.fill(Qt.GlobalColor.white)
    main_window.viewer.set_photo(dummy_pixmap)

    # Mock methods to prevent side effects
    main_window._add_point = MagicMock()
    main_window._update_segmentation = MagicMock()
    main_window._original_mouse_press = MagicMock()
    main_window._original_mouse_release = MagicMock()

    # Simulate a left mouse press event (AI mode click)
    pos = QPointF(10, 10)
    press_event = MagicMock()
    press_event.button.return_value = Qt.MouseButton.LeftButton
    press_event.scenePos.return_value = pos

    # Simulate a left mouse release event at the same position (click, not drag)
    release_event = MagicMock()
    release_event.scenePos.return_value = pos  # Same position = click

    # Call the mouse press and release handlers
    main_window._scene_mouse_press(press_event)
    main_window._scene_mouse_release(release_event)

    # Assert that _add_point was called on release (AI mode behavior)
    main_window._add_point.assert_called_once_with(
        pos, positive=True, update_segmentation=True
    )


def test_auto_save_on_image_navigation_when_enabled(main_window, qtbot):
    """Test that auto-save triggers when navigating to new image with auto-save enabled."""
    # Mock the save method and file operations
    main_window._save_output_to_npz = MagicMock()
    main_window.file_manager.is_image_file = MagicMock(return_value=True)

    # Set up initial state - simulate having a current image
    main_window.current_image_path = "/path/to/current_image.jpg"

    # Ensure auto-save is enabled
    main_window.control_panel.get_settings = MagicMock(return_value={"auto_save": True})

    # Mock other methods that get called during image loading
    main_window._reset_state = MagicMock()
    main_window._update_sam_model_image = MagicMock()
    main_window._update_all_lists = MagicMock()
    main_window.file_manager.load_class_aliases = MagicMock()
    main_window.file_manager.load_existing_mask = MagicMock()
    main_window.viewer.set_photo = MagicMock()
    main_window.viewer.set_image_adjustments = MagicMock()
    main_window.viewer.setFocus = MagicMock()
    main_window.right_panel.file_tree.setCurrentIndex = MagicMock()

    # Mock QPixmap creation to avoid file I/O
    with patch("lazylabel.ui.main_window.QPixmap") as mock_pixmap_class:
        mock_pixmap = MagicMock()
        mock_pixmap.isNull.return_value = False
        mock_pixmap.width.return_value = 100
        mock_pixmap.height.return_value = 100

        # Mock QImage for the pixmap conversion
        mock_qimage = MagicMock()
        mock_qimage.height.return_value = 100
        mock_qimage.width.return_value = 100
        mock_qimage.bytesPerLine.return_value = 400  # 100 * 4 bytes per pixel (RGBA)

        # Create mock pointer data (400 bytes for 100x100 RGBA image)
        mock_ptr = MagicMock()
        mock_ptr.__len__ = lambda: 40000  # 100 * 100 * 4
        mock_qimage.constBits.return_value = mock_ptr
        mock_pixmap.toImage.return_value = mock_qimage

        mock_pixmap_class.return_value = mock_pixmap

        with (
            patch("lazylabel.ui.main_window.os.path.isfile", return_value=True),
            patch("numpy.array") as mock_np_array,
        ):
            # Mock numpy array creation to return proper shaped data
            mock_np_array.return_value = np.zeros((100, 100, 4), dtype=np.uint8)

            # Create a valid QModelIndex with proper parent
            test_index = MagicMock()
            test_index.isValid.return_value = True
            parent_index = MagicMock()
            test_index.parent.return_value = parent_index
            main_window.file_model = MagicMock()
            main_window.file_model.filePath.return_value = "/path/to/test_image.jpg"
            main_window.file_model.isDir.return_value = True  # parent IS a directory

            # Call _load_selected_image which should trigger auto-save
            main_window._load_selected_image(test_index)

    # Verify auto-save was called
    main_window._save_output_to_npz.assert_called_once()


def test_auto_save_disabled_when_setting_is_false(main_window, qtbot):
    """Test that auto-save doesn't trigger when disabled in settings."""
    # Mock the save method and file operations
    main_window._save_output_to_npz = MagicMock()
    main_window.file_manager.is_image_file = MagicMock(return_value=True)

    # Mock the file model
    main_window.file_model = MagicMock()
    main_window.file_model.filePath.return_value = "/path/to/test_image.jpg"
    main_window.file_model.isDir.return_value = False

    # Set up initial state - simulate having a current image
    main_window.current_image_path = "/path/to/current_image.jpg"

    # Disable auto-save
    main_window.control_panel.get_settings = MagicMock(
        return_value={"auto_save": False}
    )

    # Mock QPixmap creation
    with patch("lazylabel.ui.main_window.QPixmap") as mock_pixmap_class:
        mock_pixmap = MagicMock()
        mock_pixmap.isNull.return_value = False
        mock_pixmap.width.return_value = 100
        mock_pixmap.height.return_value = 100

        # Mock QImage for the pixmap conversion
        mock_qimage = MagicMock()
        mock_qimage.height.return_value = 100
        mock_qimage.width.return_value = 100
        mock_qimage.bytesPerLine.return_value = 400  # 100 * 4 bytes per pixel (RGBA)

        # Create mock pointer data (400 bytes for 100x100 RGBA image)
        mock_ptr = MagicMock()
        mock_ptr.__len__ = lambda: 40000  # 100 * 100 * 4
        mock_qimage.constBits.return_value = mock_ptr
        mock_pixmap.toImage.return_value = mock_qimage

        mock_pixmap_class.return_value = mock_pixmap

        # Create a valid QModelIndex
        test_index = QModelIndex()
        with (
            patch.object(test_index, "isValid", return_value=True),
            patch.object(test_index, "parent") as mock_parent,
        ):
            mock_parent.return_value = QModelIndex()

            # Call _load_selected_image which should NOT trigger auto-save
            main_window._load_selected_image(test_index)

    # Verify auto-save was NOT called
    main_window._save_output_to_npz.assert_not_called()


def test_auto_save_skipped_on_first_image_load(main_window, qtbot):
    """Test that auto-save doesn't trigger on first image load (no current image)."""
    # Mock the save method and file operations
    main_window._save_output_to_npz = MagicMock()
    main_window.file_manager.is_image_file = MagicMock(return_value=True)

    # Mock the file model
    main_window.file_model = MagicMock()
    main_window.file_model.filePath.return_value = "/path/to/test_image.jpg"
    main_window.file_model.isDir.return_value = False

    # Set up initial state - NO current image (first load)
    main_window.current_image_path = None

    # Enable auto-save
    main_window.control_panel.get_settings = MagicMock(return_value={"auto_save": True})

    # Mock QPixmap creation
    with patch("lazylabel.ui.main_window.QPixmap") as mock_pixmap_class:
        mock_pixmap = MagicMock()
        mock_pixmap.isNull.return_value = False
        mock_pixmap.width.return_value = 100
        mock_pixmap.height.return_value = 100

        # Mock QImage for the pixmap conversion
        mock_qimage = MagicMock()
        mock_qimage.height.return_value = 100
        mock_qimage.width.return_value = 100
        mock_qimage.bytesPerLine.return_value = 400  # 100 * 4 bytes per pixel (RGBA)

        # Create mock pointer data (400 bytes for 100x100 RGBA image)
        mock_ptr = MagicMock()
        mock_ptr.__len__ = lambda: 40000  # 100 * 100 * 4
        mock_qimage.constBits.return_value = mock_ptr
        mock_pixmap.toImage.return_value = mock_qimage

        mock_pixmap_class.return_value = mock_pixmap

        # Create a valid QModelIndex
        test_index = QModelIndex()
        with (
            patch.object(test_index, "isValid", return_value=True),
            patch.object(test_index, "parent") as mock_parent,
        ):
            mock_parent.return_value = QModelIndex()

            # Call _load_selected_image on first load - should NOT trigger auto-save
            main_window._load_selected_image(test_index)

    # Verify auto-save was NOT called (no existing work to save)
    main_window._save_output_to_npz.assert_not_called()


def test_auto_save_skipped_when_loading_same_image(main_window, qtbot):
    """Test that auto-save doesn't trigger when loading the same image again."""
    # Mock the save method and file operations
    main_window._save_output_to_npz = MagicMock()
    main_window.file_manager.is_image_file = MagicMock(return_value=True)

    # Mock the file model to return the same path as current image
    current_path = "/path/to/current_image.jpg"
    main_window.file_model = MagicMock()
    main_window.file_model.filePath.return_value = current_path
    main_window.file_model.isDir.return_value = False

    # Set up initial state - same image path
    main_window.current_image_path = current_path

    # Enable auto-save
    main_window.control_panel.get_settings = MagicMock(return_value={"auto_save": True})

    # Create a valid QModelIndex
    test_index = QModelIndex()
    with (
        patch.object(test_index, "isValid", return_value=True),
        patch.object(test_index, "parent") as mock_parent,
    ):
        mock_parent.return_value = QModelIndex()

        # Call _load_selected_image with same image - should return early
        main_window._load_selected_image(test_index)

    # Verify auto-save was NOT called (same image, early return)
    main_window._save_output_to_npz.assert_not_called()


# Border crop functionality tests
def test_crop_state_initialization(main_window):
    """Test that crop state is properly initialized."""
    assert hasattr(main_window, "crop_mode")
    assert hasattr(main_window, "crop_rect_item")
    assert hasattr(main_window, "crop_start_pos")
    assert hasattr(main_window, "crop_coords_by_size")
    assert hasattr(main_window, "current_crop_coords")
    assert hasattr(main_window, "crop_hover_overlays")
    assert main_window.crop_mode is False
    assert main_window.crop_rect_item is None
    assert main_window.crop_start_pos is None
    assert main_window.crop_coords_by_size == {}
    assert main_window.current_crop_coords is None
    assert main_window.crop_hover_overlays == []


def test_crop_drawing_mode_activation(main_window):
    """Test activating crop drawing mode."""
    main_window._start_crop_drawing()

    assert main_window.crop_mode is True
    assert main_window.mode == "crop"


def test_crop_coordinate_application(main_window):
    """Test applying crop coordinates."""
    # Mock current image path
    main_window.current_image_path = "/test/image.jpg"

    # Mock QPixmap to avoid file I/O
    with patch("lazylabel.ui.main_window.QPixmap") as mock_pixmap_class:
        mock_pixmap = MagicMock()
        mock_pixmap.isNull.return_value = False
        mock_pixmap.width.return_value = 500
        mock_pixmap.height.return_value = 400
        mock_pixmap_class.return_value = mock_pixmap

        # Mock the apply crop to image method to avoid complex image processing
        main_window._apply_crop_to_image = MagicMock()

        # Apply coordinates
        main_window._apply_crop_coordinates(10, 20, 100, 200)

        # Check that coordinates are stored
        assert main_window.current_crop_coords == (10, 20, 100, 200)
        assert (500, 400) in main_window.crop_coords_by_size
        assert main_window.crop_coords_by_size[(500, 400)] == (10, 20, 100, 200)


def test_crop_coordinate_validation(main_window):
    """Test crop coordinate validation and bounds checking."""
    main_window.current_image_path = "/test/image.jpg"

    with patch("lazylabel.ui.main_window.QPixmap") as mock_pixmap_class:
        mock_pixmap = MagicMock()
        mock_pixmap.isNull.return_value = False
        mock_pixmap.width.return_value = 100  # Small image
        mock_pixmap.height.return_value = 100
        mock_pixmap_class.return_value = mock_pixmap

        main_window._apply_crop_to_image = MagicMock()

        # Try to apply coordinates outside image bounds
        main_window._apply_crop_coordinates(-10, -20, 150, 200)

        # Coordinates should be clamped to image bounds
        assert main_window.current_crop_coords == (0, 0, 99, 99)


def test_crop_coordinate_auto_ordering(main_window):
    """Test that crop coordinates are automatically ordered correctly."""
    main_window.current_image_path = "/test/image.jpg"

    with patch("lazylabel.ui.main_window.QPixmap") as mock_pixmap_class:
        mock_pixmap = MagicMock()
        mock_pixmap.isNull.return_value = False
        mock_pixmap.width.return_value = 500
        mock_pixmap.height.return_value = 400
        mock_pixmap_class.return_value = mock_pixmap

        main_window._apply_crop_to_image = MagicMock()

        # Apply reversed coordinates
        main_window._apply_crop_coordinates(100, 200, 10, 20)

        # Should be automatically reordered
        assert main_window.current_crop_coords == (10, 20, 100, 200)


def test_crop_clearing(main_window):
    """Test clearing crop functionality."""
    # Set up initial crop state
    main_window.current_crop_coords = (10, 20, 100, 200)
    main_window.crop_coords_by_size = {(500, 400): (10, 20, 100, 200)}
    main_window.current_image_path = "/test/image.jpg"

    # Mock dependencies
    main_window._remove_crop_visual = MagicMock()
    main_window._reload_current_image = MagicMock()

    with patch("lazylabel.ui.main_window.QPixmap") as mock_pixmap_class:
        mock_pixmap = MagicMock()
        mock_pixmap.isNull.return_value = False
        mock_pixmap.width.return_value = 500
        mock_pixmap.height.return_value = 400
        mock_pixmap_class.return_value = mock_pixmap

        main_window._clear_crop()

        # Check that crop state is cleared
        assert main_window.current_crop_coords is None
        assert (500, 400) not in main_window.crop_coords_by_size


def test_crop_hover_state_management(main_window):
    """Test crop hover state management."""
    # Set up crop coordinates
    main_window.current_crop_coords = (10, 20, 100, 200)

    # Test hover enter
    main_window._on_crop_hover_enter()
    assert main_window.is_hovering_crop is True

    # Test hover leave
    main_window._on_crop_hover_leave()
    assert main_window.is_hovering_crop is False


def test_crop_visual_cleanup_on_reset(main_window):
    """Test that crop visuals are cleaned up during state reset."""
    # Mock cleanup methods
    main_window._remove_crop_visual = MagicMock()
    main_window._remove_crop_hover_overlay = MagicMock()
    main_window._remove_crop_hover_effect = MagicMock()

    # Set up crop state before reset
    main_window.crop_mode = True
    main_window.crop_start_pos = QPointF(10, 20)

    # Mock other reset operations to avoid side effects
    main_window.clear_all_points = MagicMock()
    main_window.segment_manager.clear = MagicMock()
    main_window._update_all_lists = MagicMock()
    main_window.viewer.scene().items = MagicMock(return_value=[])

    # Call reset state
    main_window._reset_state()

    # Verify cleanup methods were called
    main_window._remove_crop_visual.assert_called_once()
    main_window._remove_crop_hover_overlay.assert_called_once()
    main_window._remove_crop_hover_effect.assert_called_once()
    # Verify crop state was reset
    assert main_window.crop_mode is False
    assert main_window.crop_start_pos is None


def test_control_panel_crop_integration(main_window):
    """Test that control panel crop widget is properly integrated."""
    # Check that control panel has crop widget
    assert hasattr(main_window.control_panel, "crop_widget")

    # Check that delegate methods exist
    assert hasattr(main_window.control_panel, "set_crop_coordinates")
    assert hasattr(main_window.control_panel, "clear_crop_coordinates")
    assert hasattr(main_window.control_panel, "get_crop_coordinates")
    assert hasattr(main_window.control_panel, "has_crop")
    assert hasattr(main_window.control_panel, "set_crop_status")


def test_crop_drawing_mouse_events(main_window):
    """Test crop drawing with mouse events."""
    # Set up for crop mode - need to set crop_mode flag as well
    main_window.mode = "crop"
    main_window.crop_mode = True
    main_window.crop_rect_item = None
    main_window.crop_start_pos = None

    # Load a dummy pixmap so viewer has a valid image
    dummy_pixmap = QPixmap(100, 100)
    dummy_pixmap.fill(Qt.GlobalColor.white)
    main_window.viewer.set_photo(dummy_pixmap)

    # Mock the original mouse press to prevent side effects
    main_window._original_mouse_press = MagicMock()

    # Mock mouse event
    mock_event = MagicMock()
    mock_event.button.return_value = Qt.MouseButton.LeftButton
    pos = QPointF(50, 60)
    mock_event.scenePos.return_value = pos

    # Test mouse press in crop mode
    main_window._scene_mouse_press(mock_event)

    # Check that crop drawing was initiated
    assert main_window.crop_start_pos == pos
    assert main_window.crop_rect_item is not None
