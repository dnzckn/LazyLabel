"""Test optimized SAM functionality in 4-view mode."""

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

        return window


def test_4view_sam_model_arrays_initialization(main_window_4view):
    """Test that SAM model arrays are properly initialized for 4 viewers."""
    window = main_window_4view

    # Initialize arrays to proper size (this happens during multi-view setup)
    config = window._get_multi_view_config()
    num_viewers = config["num_viewers"]

    assert num_viewers == 4  # Verify we're in 4-view mode
    assert len(window.multi_view_models_updating) == 4
    assert len(window.multi_view_models_dirty) == 4


def test_4view_all_models_initialization(main_window_4view):
    """Test that all models are initialized when AI mode is first used."""
    window = main_window_4view

    # Mock the multi-view model initialization method
    window._initialize_multi_view_models = MagicMock()

    from lazylabel.ui.modes.multi_view_mode import MultiViewModeHandler

    handler = MultiViewModeHandler(window)

    # Simulate clicking on any viewer (should trigger initialization of ALL models)
    handler.handle_ai_click(QPointF(10, 10), None, viewer_index=2)

    # Verify multi-view model initialization was called (loads ALL models sequentially)
    window._initialize_multi_view_models.assert_called_once()


def test_4view_sam_model_bounds_checking(main_window_4view):
    """Test that SAM model access respects 4-view bounds."""
    window = main_window_4view

    # Test the fixed _ensure_multi_view_sam_updated method
    # This should now work for viewer indices 0-3 in 4-view mode

    # Initialize arrays to proper size
    window.multi_view_models = [None] * 4
    window.multi_view_models_updating = [False] * 4
    window.multi_view_models_dirty = [True] * 4  # Mark as dirty to trigger update
    window.multi_view_images = ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"]

    # Mock the worker creation
    with patch(
        "lazylabel.ui.main_window.MultiViewSAMUpdateWorker"
    ) as mock_worker_class:
        mock_worker = MagicMock()
        mock_worker_class.return_value = mock_worker

        # Test that viewer 3 (index 3) is now valid in 4-view mode
        window._ensure_multi_view_sam_updated(3)

        # Verify worker was created (meaning the bounds check passed)
        mock_worker_class.assert_called_once()

        # Test that viewer 4 (index 4) is invalid and gets rejected
        mock_worker_class.reset_mock()
        window._ensure_multi_view_sam_updated(4)

        # Verify worker was NOT created (meaning bounds check failed)
        mock_worker_class.assert_not_called()


def test_4view_consecutive_image_loading(main_window_4view):
    """Test that consecutive image loading works for 4 viewers."""
    window = main_window_4view

    # Mock image paths
    test_images = ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg", "img5.jpg"]
    window.cached_image_paths = test_images

    # Mock file model
    window.current_file_index = MagicMock()
    window.current_file_index.isValid.return_value = True
    window.file_model.filePath.return_value = "img1.jpg"

    # Mock file manager to make the current path look like an image
    with (
        patch.object(window.file_manager, "is_image_file", return_value=True),
        patch("os.path.isfile", return_value=True),
        patch.object(window, "_load_multi_view_images") as mock_load,
    ):
        window._load_current_multi_view_pair_from_file_model()

        # Verify it tried to load 4 consecutive images
        mock_load.assert_called_once()
        loaded_images = mock_load.call_args[0][0]

        # Should load img1, img2, img3, img4
        assert loaded_images == ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"]


def test_4view_sequential_model_initialization(main_window_4view):
    """Test that MultiViewSAMInitWorker creates models for all 4 viewers."""
    window = main_window_4view

    # Mock the worker class
    with patch("lazylabel.ui.main_window.MultiViewSAMInitWorker") as mock_worker_class:
        mock_worker = MagicMock()
        mock_worker_class.return_value = mock_worker

        # Call the multi-view model initialization
        window._initialize_multi_view_models()

        # Verify worker was created with correct parameters
        mock_worker_class.assert_called_once_with(window.model_manager, window)

        # Verify signals were connected
        assert mock_worker.model_initialized.connect.called
        assert mock_worker.all_models_initialized.connect.called
        assert mock_worker.error.connect.called
        assert mock_worker.progress.connect.called

        # Verify worker was started (this will load ALL models sequentially)
        mock_worker.start.assert_called_once()


def test_4view_sequential_image_loading(main_window_4view):
    """Test that images are loaded sequentially into models for all 4 viewers."""
    window = main_window_4view

    from lazylabel.ui.modes.multi_view_mode import MultiViewModeHandler

    handler = MultiViewModeHandler(window)

    # Initialize models for all 4 viewers
    window.multi_view_models = [MagicMock() for _ in range(4)]
    window.multi_view_models_updating = [False] * 4
    window.multi_view_models_dirty = [False] * 4
    window.multi_view_images = ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"]

    # Create a mock event object
    mock_event = MagicMock()
    mock_event.button.return_value = 1  # Qt.MouseButton.LeftButton

    # Test that all viewers can be accessed
    for i in range(4):
        # This should not crash or return early due to bounds checking
        try:
            # Mock the prediction method to avoid actual AI processing
            with patch.object(
                window.multi_view_models[i], "predict", return_value=None
            ):
                handler.handle_ai_click(QPointF(10, 10), mock_event, viewer_index=i)
            # If we get here, the bounds checking worked correctly
            assert True
        except Exception as e:
            pytest.fail(f"AI click failed for viewer {i}: {e}")
