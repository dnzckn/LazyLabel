"""Tests for propagation worker threads.

Tests SequenceInitWorker and ReferenceAnnotationWorker for background
initialization, reference annotation adding, and progress reporting.
"""

from unittest.mock import MagicMock

import numpy as np
import pytest

from lazylabel.ui.workers.propagation_worker import (
    ReferenceAnnotationWorker,
    ReferenceSegmentData,
    SequenceInitWorker,
)


@pytest.fixture
def mock_propagation_manager():
    """Create a mock PropagationManager."""
    pm = MagicMock()
    pm.init_sequence = MagicMock(return_value=True)
    pm.total_frames = 10
    pm.add_reference_frame = MagicMock()
    pm.add_reference_annotation = MagicMock(return_value=1)
    return pm


@pytest.fixture
def image_paths():
    """Create a list of image paths for testing."""
    return [f"/path/frame_{i:04d}.png" for i in range(10)]


@pytest.fixture
def sample_segments():
    """Create sample reference segment data."""
    return [
        ReferenceSegmentData(
            frame_idx=0,
            mask=np.ones((100, 100), dtype=bool),
            class_id=1,
            class_name="Object A",
            obj_id=2,
        ),
        ReferenceSegmentData(
            frame_idx=0,
            mask=np.ones((100, 100), dtype=bool),
            class_id=2,
            class_name="Object B",
            obj_id=3,
        ),
        ReferenceSegmentData(
            frame_idx=3,
            mask=np.ones((100, 100), dtype=bool),
            class_id=1,
            class_name="Object A",
            obj_id=2,
        ),
    ]


# ========== ReferenceSegmentData Tests (no Qt needed) ==========


class TestReferenceSegmentData:
    """Tests for ReferenceSegmentData dataclass."""

    def test_creation(self):
        """Test ReferenceSegmentData can be created."""
        mask = np.zeros((50, 50), dtype=bool)
        data = ReferenceSegmentData(
            frame_idx=5,
            mask=mask,
            class_id=1,
            class_name="Test",
            obj_id=2,
        )
        assert data.frame_idx == 5
        assert data.class_id == 1
        assert data.class_name == "Test"
        assert data.obj_id == 2
        assert data.mask is mask

    def test_mask_stored_by_reference(self):
        """Test that mask is stored by reference, not copied."""
        mask = np.ones((10, 10), dtype=bool)
        data = ReferenceSegmentData(
            frame_idx=0, mask=mask, class_id=0, class_name="X", obj_id=1
        )
        assert data.mask is mask


# ========== PropagationManager init_sequence API Tests (no Qt needed) ==========


class TestInitSequenceAPI:
    """Tests for the deferred init_sequence API."""

    def test_init_sequence_accepts_image_paths_list(self):
        """Test that init_sequence accepts a list of paths."""
        from lazylabel.ui.managers.propagation_manager import PropagationManager

        mw = MagicMock()
        mw.model_manager.sam_model = MagicMock()
        mw.model_manager.sam_model.init_video_state = MagicMock(return_value=True)
        mw.model_manager.sam_model.video_frame_count = 5

        pm = PropagationManager(mw)
        paths = [f"/img/{i}.png" for i in range(5)]
        result = pm.init_sequence(paths)

        assert result is True
        # init_video_state is NOT called during init_sequence (deferred)
        mw.model_manager.sam_model.init_video_state.assert_not_called()
        # Paths should be stored for deferred loading
        assert pm.state.all_image_paths == paths

    def test_init_sequence_stores_image_cache(self):
        """Test that image_cache is stored for deferred use."""
        from lazylabel.ui.managers.propagation_manager import PropagationManager

        mw = MagicMock()
        mw.model_manager.sam_model = MagicMock()
        mw.model_manager.sam_model.init_video_state = MagicMock(return_value=True)
        mw.model_manager.sam_model.video_frame_count = 2

        pm = PropagationManager(mw)
        cache = {"/a.png": np.zeros((10, 10, 3))}
        pm.init_sequence(["/a.png"], image_cache=cache)

        # Cache should be stored in state for use during propagation
        assert pm.state.image_cache is cache

    def test_init_sequence_no_image_dir_in_state(self):
        """Test that PropagationState no longer stores image_dir."""
        from lazylabel.ui.managers.propagation_manager import PropagationManager

        mw = MagicMock()
        mw.model_manager.sam_model = MagicMock()
        mw.model_manager.sam_model.init_video_state = MagicMock(return_value=True)
        mw.model_manager.sam_model.video_frame_count = 3

        pm = PropagationManager(mw)
        pm.init_sequence(["/a.png", "/b.png", "/c.png"])

        # image_dir field should be None (default) since we no longer set it
        assert pm.state.image_dir is None

    def test_init_sequence_total_frames_matches_path_count(self):
        """Test that total_frames equals number of filtered paths."""
        from lazylabel.ui.managers.propagation_manager import PropagationManager

        mw = MagicMock()
        mw.model_manager.sam_model = MagicMock()
        mw.model_manager.sam_model.init_video_state = MagicMock(return_value=True)

        pm = PropagationManager(mw)
        paths = [f"/img/{i}.png" for i in range(7)]
        pm.init_sequence(paths)

        assert pm.total_frames == 7


# ========== Worker lifecycle tests (no Qt event loop needed) ==========


class TestWorkerLifecycle:
    """Tests for worker stop flags and direct run() calls (no Qt needed)."""

    def test_sequence_init_worker_stop_flag(
        self, mock_propagation_manager, image_paths
    ):
        """Test SequenceInitWorker stop flag prevents execution."""
        worker = SequenceInitWorker(
            propagation_manager=mock_propagation_manager,
            image_paths=image_paths,
        )
        worker.stop()
        assert worker._should_stop is True
        worker.run()
        mock_propagation_manager.init_sequence.assert_not_called()

    def test_reference_worker_stop_flag(
        self, mock_propagation_manager, sample_segments
    ):
        """Test ReferenceAnnotationWorker stop flag prevents execution."""
        worker = ReferenceAnnotationWorker(
            propagation_manager=mock_propagation_manager,
            reference_frames=[0],
            segments=sample_segments[:1],
        )
        worker.stop()
        assert worker._should_stop is True
        worker.run()
        mock_propagation_manager.add_reference_frame.assert_not_called()
        mock_propagation_manager.add_reference_annotation.assert_not_called()

    def test_sequence_init_worker_stores_image_cache(
        self, mock_propagation_manager, image_paths
    ):
        """Test that SequenceInitWorker stores image_cache."""
        cache = {"/path/0.png": np.zeros((10, 10, 3))}
        worker = SequenceInitWorker(
            propagation_manager=mock_propagation_manager,
            image_paths=image_paths,
            image_cache=cache,
        )
        assert worker.image_cache is cache
        assert worker.image_paths is image_paths

    def test_reference_worker_stores_data(
        self, mock_propagation_manager, sample_segments
    ):
        """Test that ReferenceAnnotationWorker stores its data."""
        worker = ReferenceAnnotationWorker(
            propagation_manager=mock_propagation_manager,
            reference_frames=[0, 3],
            segments=sample_segments,
        )
        assert worker.reference_frames == [0, 3]
        assert worker.segments is sample_segments


# ========== Qt-dependent tests (require pytest-qt) ==========
# These tests use qtbot for signal testing and require a running QApplication.
# They are in a separate file to keep this module importable without pytest-qt.
