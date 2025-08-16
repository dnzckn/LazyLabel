"""Test enumeration and timeout improvements for 4-view SAM loading."""

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


def test_4view_enumerated_loading_messages(main_window_4view):
    """Test that parallel loading shows appropriate messages."""
    window = main_window_4view

    # Mock the notification method to capture messages
    window._show_notification = MagicMock()

    # Set up mock images
    window.multi_view_images = ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"]
    window.multi_view_models = [MagicMock() for _ in range(4)]
    window.multi_view_models_dirty = [True, True, True, True]
    window.multi_view_models_updating = [False, False, False, False]

    # Mock the worker to avoid actual model operations
    with patch(
        "lazylabel.ui.main_window.MultiViewSAMUpdateWorker"
    ) as mock_worker_class:
        mock_worker = MagicMock()
        mock_worker_class.return_value = mock_worker

        # Trigger parallel loading for all viewers
        window._start_sequential_multi_view_sam_loading()

        # Verify the parallel loading message was shown
        window._show_notification.assert_called_with(
            "Loading embeddings for 4 images in parallel...", duration=0
        )


def test_4view_completion_messages(main_window_4view):
    """Test that completion messages show enumeration."""
    window = main_window_4view

    # Mock the notification method to capture messages
    window._show_notification = MagicMock()

    # Set up arrays for 4-view mode and progress tracking
    window.multi_view_models = [None, None, None, None]
    window.multi_view_images = [None, None, None, None]
    window.multi_view_models_dirty = [False, False, False, False]
    window.multi_view_models_updating = [False, False, False, False]
    window._multi_view_loading_step = 0
    window._multi_view_total_steps = 0

    # Trigger completion for viewer 2
    window._on_multi_view_sam_update_finished(2)

    # Verify the completion message was shown
    window._show_notification.assert_called_with(
        "Embeddings computed for image 3/4 ✓", duration=1000
    )


def test_4view_increased_timeout(main_window_4view):
    """Test that timeout is increased to 60 seconds for 4-view mode."""
    window = main_window_4view

    # Set up mock data
    window.multi_view_images = ["img1.jpg"]
    window.multi_view_models = [MagicMock()]
    window.multi_view_models_dirty = [True]
    window.multi_view_models_updating = [False]

    # Mock QTimer to capture timeout value
    with (
        patch("lazylabel.ui.main_window.QTimer") as mock_timer_class,
        patch("lazylabel.ui.main_window.MultiViewSAMUpdateWorker"),
    ):
        mock_timer = MagicMock()
        mock_timer_class.return_value = mock_timer

        # Trigger image loading
        window._ensure_multi_view_sam_updated(0)

        # Verify timer was started with 60 seconds (60000 ms)
        mock_timer.start.assert_called_with(60000)


def test_4view_sequential_loading_enumeration(main_window_4view):
    """Test that parallel loading shows proper notification for all viewers."""
    window = main_window_4view

    # Mock the notification method to capture all messages
    notifications = []

    def capture_notification(message, **kwargs):
        notifications.append(message)

    window._show_notification = capture_notification
    window._show_success_notification = capture_notification

    # Set up all 4 images and models
    window.multi_view_images = ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"]
    window.multi_view_models = [MagicMock() for _ in range(4)]
    window.multi_view_models_dirty = [True, True, True, True]
    window.multi_view_models_updating = [False, False, False, False]

    # Mock workers to avoid actual operations
    with (
        patch("lazylabel.ui.main_window.MultiViewSAMUpdateWorker"),
        patch("lazylabel.ui.main_window.QTimer"),
    ):
        # Start parallel loading
        window._start_sequential_multi_view_sam_loading()

        # Should show parallel loading message for all 4 images
        assert any(
            "Loading embeddings for 4 images in parallel" in msg
            for msg in notifications
        )

        # Simulate completion of all images
        window.multi_view_models_dirty = [False, False, False, False]
        window.multi_view_models_updating = [False, False, False, False]
        notifications.clear()

        window._start_sequential_multi_view_sam_loading()

        # Should now show completion message since all are done
        assert any("AI models ready" in msg for msg in notifications)
