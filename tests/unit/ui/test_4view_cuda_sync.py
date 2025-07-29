"""Test CUDA synchronization fixes for 4-view SAM loading."""

from unittest.mock import MagicMock, patch

import pytest
from PyQt6.QtWidgets import QApplication

from lazylabel.ui.workers import MultiViewSAMUpdateWorker


@pytest.fixture
def app():
    """Create QApplication for testing."""
    app = QApplication.instance()
    if app is None:
        app = QApplication([])
    yield app


def test_cuda_synchronization_in_update_worker():
    """Test that CUDA synchronization is called in MultiViewSAMUpdateWorker."""
    mock_model = MagicMock()

    # Create worker
    worker = MultiViewSAMUpdateWorker(
        viewer_index=0,
        model=mock_model,
        image_path="/test/image.jpg",
        operate_on_view=False,
        current_image=None,
    )

    # Mock torch.cuda calls
    with (
        patch("torch.cuda.is_available", return_value=True) as mock_cuda_available,
        patch("torch.cuda.synchronize") as mock_sync,
        patch(
            "lazylabel.ui.workers.multi_view_sam_update_worker.QPixmap"
        ) as mock_pixmap,
    ):
        # Mock a valid pixmap
        mock_pixmap_instance = MagicMock()
        mock_pixmap_instance.isNull.return_value = False
        mock_pixmap_instance.width.return_value = 100
        mock_pixmap_instance.height.return_value = 100
        mock_pixmap.return_value = mock_pixmap_instance

        # Run the worker
        worker.run()

        # Verify CUDA synchronization was called
        mock_cuda_available.assert_called()
        mock_sync.assert_called()

        # Verify model method was called
        mock_model.set_image_from_path.assert_called_once_with("/test/image.jpg")


def test_cuda_synchronization_with_array_path():
    """Test worker runs successfully with operate_on_view=True path."""
    import numpy as np

    mock_model = MagicMock()
    test_image = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)

    # Create worker with operate_on_view=True
    worker = MultiViewSAMUpdateWorker(
        viewer_index=1,
        model=mock_model,
        image_path="/test/image.jpg",
        operate_on_view=True,
        current_image=test_image,
    )

    # Run the worker
    worker.run()

    # Verify model method was called with the correct image
    mock_model.set_image_from_array.assert_called_once()

    # Verify the worker completes successfully
    assert worker.viewer_index == 1
