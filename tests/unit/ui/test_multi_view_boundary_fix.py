"""Test for multi-view navigation boundary condition fixes."""

from unittest.mock import MagicMock, patch

import pytest

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
def main_window_boundary_test(qtbot):
    """Fixture for MainWindow with boundary test setup."""
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
        patch("lazylabel.models.sam_model.SamModel"),
        patch("lazylabel.models.sam2_model.Sam2Model"),
    ):
        # Setup model manager mocks
        mock_model = MagicMock()
        mock_model.is_loaded = True
        mock_init.return_value = mock_model
        mock_get_models.return_value = [("Mock Model", "/path/to/model.pth")]
        mock_is_available.return_value = True

        # Create MainWindow
        window = MainWindow()
        qtbot.addWidget(window)

        return window


def test_boundary_navigation_prevents_navigation_from_none_state(
    main_window_boundary_test,
):
    """Test that navigation is prevented when in an invalid state with all None images."""
    window = main_window_boundary_test

    # Set up 2-view mode
    window._get_multi_view_config = MagicMock(
        return_value={
            "num_viewers": 2,
            "grid_rows": 1,
            "grid_cols": 2,
            "use_grid": False,
        }
    )

    # Mock cached image list
    window.cached_image_paths = [
        "/path/to/image1.jpg",
        "/path/to/image2.jpg",
        "/path/to/image3.jpg",
        "/path/to/image4.jpg",
    ]

    # Mock control panel to avoid auto-save
    window.control_panel = MagicMock()
    window.control_panel.get_settings.return_value = {"auto_save": False}

    # Mock the multi-view image loading
    window._load_multi_view_images = MagicMock()

    # Simulate the problematic state: all images are None (stuck state)
    window.multi_view_images = [None, None]

    # Try to navigate - should do nothing (no recovery, just prevent navigation)
    window._load_next_multi_batch()

    # Should NOT have called load (stayed put - no navigation when no valid current path)
    window._load_multi_view_images.assert_not_called()


def test_boundary_navigation_prevents_all_none_batch(main_window_boundary_test):
    """Test that navigation prevents loading a batch with all None images."""
    window = main_window_boundary_test

    # Set up 2-view mode
    window._get_multi_view_config = MagicMock(
        return_value={
            "num_viewers": 2,
            "grid_rows": 1,
            "grid_cols": 2,
            "use_grid": False,
        }
    )

    # Mock only 3 images (so navigating from image2 would result in [image4, None])
    window.cached_image_paths = [
        "/path/to/image1.jpg",
        "/path/to/image2.jpg",
        "/path/to/image3.jpg",
    ]

    # Set current state to last valid image
    window.multi_view_images = ["/path/to/image3.jpg", None]

    # Mock control panel to avoid auto-save
    window.control_panel = MagicMock()
    window.control_panel.get_settings.return_value = {"auto_save": False}

    # Mock the multi-view image loading
    window._load_multi_view_images = MagicMock()

    # Try to navigate forward - should not do anything because it would result in [None, None]
    window._load_next_multi_batch()

    # Should NOT have called load (stayed at current position)
    window._load_multi_view_images.assert_not_called()


def test_boundary_navigation_allows_partial_none_batch(main_window_boundary_test):
    """Test that navigation allows batches with some None images if at least one is valid."""
    window = main_window_boundary_test

    # Set up 2-view mode
    window._get_multi_view_config = MagicMock(
        return_value={
            "num_viewers": 2,
            "grid_rows": 1,
            "grid_cols": 2,
            "use_grid": False,
        }
    )

    # Mock 3 images total
    window.cached_image_paths = [
        "/path/to/image1.jpg",
        "/path/to/image2.jpg",
        "/path/to/image3.jpg",
    ]

    # Set current state to first image
    window.multi_view_images = ["/path/to/image1.jpg", "/path/to/image2.jpg"]

    # Mock control panel to avoid auto-save
    window.control_panel = MagicMock()
    window.control_panel.get_settings.return_value = {"auto_save": False}

    # Mock the multi-view image loading and file model
    window._load_multi_view_images = MagicMock()
    window.current_file_index = MagicMock()
    window.current_file_index.parent.return_value = MagicMock()
    window.file_model = MagicMock()
    window.file_model.rowCount.return_value = 3
    window.file_model.index.return_value = MagicMock()
    window.file_model.filePath.side_effect = lambda idx: "/path/to/image3.jpg"
    window.right_panel = MagicMock()

    # Navigate forward - should load [image3, None] which is valid (one valid image)
    window._load_next_multi_batch()

    # Should have called load with [image3, None]
    window._load_multi_view_images.assert_called_once_with(
        ["/path/to/image3.jpg", None]
    )


def test_boundary_navigation_prevents_going_past_end(main_window_boundary_test):
    """Test that navigation prevents going past the end of the image list."""
    window = main_window_boundary_test

    # Set up 2-view mode
    window._get_multi_view_config = MagicMock(
        return_value={
            "num_viewers": 2,
            "grid_rows": 1,
            "grid_cols": 2,
            "use_grid": False,
        }
    )

    # Mock only 3 images
    window.cached_image_paths = [
        "/path/to/image1.jpg",
        "/path/to/image2.jpg",
        "/path/to/image3.jpg",
    ]

    # Set current state to last valid image (image2+3)
    window.multi_view_images = ["/path/to/image2.jpg", "/path/to/image3.jpg"]

    # Mock control panel to avoid auto-save
    window.control_panel = MagicMock()
    window.control_panel.get_settings.return_value = {"auto_save": False}

    # Mock the multi-view image loading
    window._load_multi_view_images = MagicMock()

    # Try to navigate forward - should not do anything (already at end)
    window._load_next_multi_batch()

    # Should NOT have called load (can't navigate past end)
    window._load_multi_view_images.assert_not_called()
