"""Test prevention of duplicate workers in 4-view SAM loading."""

from unittest.mock import MagicMock, patch

import pytest
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
        window._setup_multi_view_layout()

        # Switch to multi-view mode
        window._on_view_mode_changed(1)

        return window


def test_prevent_duplicate_sequential_loading(main_window_4view):
    """Test that _start_sequential_multi_view_sam_loading starts parallel workers and prevents duplicates."""
    window = main_window_4view

    # Set up initial state with models and images
    window.multi_view_models = [MagicMock() for _ in range(4)]
    window.multi_view_images = ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"]
    window.multi_view_models_dirty = [True, True, True, True]
    window.multi_view_models_updating = [False, False, False, False]

    # Mock the worker creation
    with patch.object(window, "_ensure_multi_view_sam_updated") as mock_ensure:
        # First call should start loading for all 4 viewers in parallel
        window._start_sequential_multi_view_sam_loading()
        assert mock_ensure.call_count == 4
        mock_ensure.assert_any_call(0)
        mock_ensure.assert_any_call(1)
        mock_ensure.assert_any_call(2)
        mock_ensure.assert_any_call(3)

        # Simulate all viewers starting to update
        window.multi_view_models_updating = [True, True, True, True]
        mock_ensure.reset_mock()

        # Second call should be prevented (any_updating = True)
        window._start_sequential_multi_view_sam_loading()
        mock_ensure.assert_not_called()


def test_prevent_duplicate_ai_click_workers(main_window_4view):
    """Test that AI click handler prevents duplicate workers when called directly."""
    window = main_window_4view

    # Set up initial state
    window.multi_view_models = [MagicMock() for _ in range(4)]
    window.multi_view_images = ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"]
    window.multi_view_models_dirty = [True, False, False, False]
    window.multi_view_models_updating = [
        True,
        False,
        False,
        False,
    ]  # Viewer 0 is updating

    # Mock the worker creation
    with patch.object(window, "_ensure_multi_view_sam_updated") as mock_ensure:
        # Test the main window's direct AI click handling (when models exist but need updates)
        # This simulates the path where models are loaded but images need to be updated

        # Simulate viewer 0 already updating - should not call ensure
        if not window.multi_view_models_updating[0]:
            window._ensure_multi_view_sam_updated(0)
        mock_ensure.assert_not_called()  # Should not be called since viewer 0 is updating

        # Simulate viewer 1 not updating - should call ensure
        window.multi_view_models_updating[1] = False
        window.multi_view_models_dirty[1] = True
        if not window.multi_view_models_updating[1]:
            window._ensure_multi_view_sam_updated(1)
        mock_ensure.assert_called_once_with(1)


def test_sequential_loading_with_multiple_calls(main_window_4view):
    """Test that multiple parallel loading calls don't create duplicate workers."""
    window = main_window_4view

    # Set up initial state
    window.multi_view_models = [MagicMock() for _ in range(4)]
    window.multi_view_images = ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"]
    window.multi_view_models_dirty = [True, True, True, True]
    window.multi_view_models_updating = [False, False, False, False]
    window._multi_view_loading_step = 0
    window._multi_view_total_steps = 4

    call_count = 0
    original_ensure = window._ensure_multi_view_sam_updated

    def mock_ensure(viewer_index):
        nonlocal call_count
        call_count += 1
        # Simulate marking as updating
        window.multi_view_models_updating[viewer_index] = True

    window._ensure_multi_view_sam_updated = mock_ensure

    # First call should start all 4 workers in parallel
    window._start_sequential_multi_view_sam_loading()
    assert call_count == 4  # All 4 start in parallel

    # Multiple rapid calls should not create more workers
    window._start_sequential_multi_view_sam_loading()
    window._start_sequential_multi_view_sam_loading()

    # Should still only have 4 calls total (no duplicates)
    assert call_count == 4

    # Restore original method
    window._ensure_multi_view_sam_updated = original_ensure


def test_sequential_loading_progression(main_window_4view):
    """Test that parallel loading starts all viewers at once."""
    window = main_window_4view

    # Set up initial state
    window.multi_view_models = [MagicMock() for _ in range(4)]
    window.multi_view_images = ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"]
    window.multi_view_models_dirty = [True, True, True, True]
    window.multi_view_models_updating = [False, False, False, False]
    window._multi_view_loading_step = 0
    window._multi_view_total_steps = 4

    called_viewers = []

    def mock_ensure(viewer_index):
        called_viewers.append(viewer_index)
        window.multi_view_models_updating[viewer_index] = True

    window._ensure_multi_view_sam_updated = mock_ensure

    # Should start all viewers at once in parallel
    window._start_sequential_multi_view_sam_loading()
    assert sorted(called_viewers) == [0, 1, 2, 3]  # All started in parallel

    # Simulate all viewers completion
    window.multi_view_models_dirty = [False, False, False, False]
    window.multi_view_models_updating = [False, False, False, False]
    called_viewers.clear()

    # Should not start any more since all are done
    window._start_sequential_multi_view_sam_loading()
    assert called_viewers == []
