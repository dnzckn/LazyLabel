from unittest.mock import MagicMock, patch

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
    """Test that _add_point is called when in sam_points mode and mouse is pressed."""
    # Set the mode to sam_points
    main_window.set_sam_mode()

    # Load a dummy pixmap to ensure mouse events are processed
    dummy_pixmap = QPixmap(100, 100)  # Create a 100x100 dummy pixmap
    dummy_pixmap.fill(Qt.GlobalColor.white)
    main_window.viewer.set_photo(dummy_pixmap)

    # Mock _add_point and _original_mouse_press to prevent side effects and TypeErrors
    main_window._add_point = MagicMock()
    main_window._original_mouse_press = MagicMock()

    # Simulate a left mouse press event by calling the handler directly
    pos = QPointF(10, 10)
    mock_event = MagicMock()
    mock_event.button.return_value = Qt.MouseButton.LeftButton
    mock_event.scenePos.return_value = pos

    # Call the scene mouse press handler directly
    main_window._scene_mouse_press(mock_event)

    # Assert that _add_point was called
    main_window._add_point.assert_called_once_with(pos, positive=True)


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
        mock_pixmap_class.return_value = mock_pixmap

        with patch("lazylabel.ui.main_window.os.path.isfile", return_value=True):
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
