"""Qt-dependent tests for propagation worker threads.

These tests require pytest-qt for signal testing with qtbot.
They test the actual threaded execution of SequenceInitWorker
and ReferenceAnnotationWorker.
"""

from unittest.mock import MagicMock

import numpy as np
import pytest

pytest.importorskip("pytestqt")

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


# ========== SequenceInitWorker Qt Tests ==========


class TestSequenceInitWorkerQt:
    """Tests for SequenceInitWorker threaded execution."""

    def test_successful_init_emits_finished(
        self, app, qtbot, mock_propagation_manager, image_paths
    ):
        """Test that successful init emits finished_init(True)."""
        worker = SequenceInitWorker(
            propagation_manager=mock_propagation_manager,
            image_paths=image_paths,
        )
        with qtbot.waitSignal(worker.finished_init, timeout=5000) as blocker:
            worker.start()

        assert blocker.args == [True]
        mock_propagation_manager.init_sequence.assert_called_once()

    def test_failed_init_emits_finished_false(
        self, app, qtbot, mock_propagation_manager, image_paths
    ):
        """Test that failed init emits finished_init(False)."""
        mock_propagation_manager.init_sequence.return_value = False

        worker = SequenceInitWorker(
            propagation_manager=mock_propagation_manager,
            image_paths=image_paths,
        )
        with qtbot.waitSignal(worker.finished_init, timeout=5000) as blocker:
            worker.start()

        assert blocker.args == [False]

    def test_passes_image_cache_to_init_sequence(
        self, app, qtbot, mock_propagation_manager, image_paths
    ):
        """Test that image_cache is passed through to init_sequence."""
        cache = {"/path/frame_0000.png": np.zeros((100, 100, 3), dtype=np.uint8)}

        worker = SequenceInitWorker(
            propagation_manager=mock_propagation_manager,
            image_paths=image_paths,
            image_cache=cache,
        )
        with qtbot.waitSignal(worker.finished_init, timeout=5000):
            worker.start()

        call_kwargs = mock_propagation_manager.init_sequence.call_args
        assert call_kwargs[1]["image_cache"] is cache

    def test_passes_progress_callback(
        self, app, qtbot, mock_propagation_manager, image_paths
    ):
        """Test that a progress_callback is passed to init_sequence."""
        worker = SequenceInitWorker(
            propagation_manager=mock_propagation_manager,
            image_paths=image_paths,
        )
        with qtbot.waitSignal(worker.finished_init, timeout=5000):
            worker.start()

        call_kwargs = mock_propagation_manager.init_sequence.call_args
        assert "progress_callback" in call_kwargs[1]
        assert callable(call_kwargs[1]["progress_callback"])

    def test_emits_progress_signals(
        self, app, qtbot, mock_propagation_manager, image_paths
    ):
        """Test that worker emits progress signal during init."""
        progress_messages = []

        worker = SequenceInitWorker(
            propagation_manager=mock_propagation_manager,
            image_paths=image_paths,
        )
        worker.progress.connect(progress_messages.append)

        with qtbot.waitSignal(worker.finished_init, timeout=5000):
            worker.start()

        # Should have at least the initial "Preparing images..." message
        assert len(progress_messages) >= 1
        assert "Preparing images..." in progress_messages

    def test_exception_emits_error_signal(
        self, app, qtbot, mock_propagation_manager, image_paths
    ):
        """Test that exceptions emit error signal."""
        mock_propagation_manager.init_sequence.side_effect = RuntimeError("Test error")

        worker = SequenceInitWorker(
            propagation_manager=mock_propagation_manager,
            image_paths=image_paths,
        )
        with qtbot.waitSignal(worker.error, timeout=5000) as blocker:
            worker.start()

        assert "Test error" in blocker.args[0]


# ========== ReferenceAnnotationWorker Qt Tests ==========


class TestReferenceAnnotationWorkerQt:
    """Tests for ReferenceAnnotationWorker threaded execution."""

    def test_successful_annotation_emits_count(
        self, app, qtbot, mock_propagation_manager, sample_segments
    ):
        """Test that successful annotation emits finished with correct count."""
        worker = ReferenceAnnotationWorker(
            propagation_manager=mock_propagation_manager,
            reference_frames=[0, 3],
            segments=sample_segments,
        )
        with qtbot.waitSignal(worker.finished_annotations, timeout=5000) as blocker:
            worker.start()

        assert blocker.args == [3]

    def test_registers_reference_frames(
        self, app, qtbot, mock_propagation_manager, sample_segments
    ):
        """Test that reference frames are registered before annotations."""
        worker = ReferenceAnnotationWorker(
            propagation_manager=mock_propagation_manager,
            reference_frames=[0, 3],
            segments=sample_segments,
        )
        with qtbot.waitSignal(worker.finished_annotations, timeout=5000):
            worker.start()

        assert mock_propagation_manager.add_reference_frame.call_count == 2
        mock_propagation_manager.add_reference_frame.assert_any_call(0)
        mock_propagation_manager.add_reference_frame.assert_any_call(3)

    def test_adds_annotations_with_correct_args(
        self, app, qtbot, mock_propagation_manager, sample_segments
    ):
        """Test that annotations are added with correct arguments."""
        worker = ReferenceAnnotationWorker(
            propagation_manager=mock_propagation_manager,
            reference_frames=[0],
            segments=sample_segments[:1],
        )
        with qtbot.waitSignal(worker.finished_annotations, timeout=5000):
            worker.start()

        seg = sample_segments[0]
        mock_propagation_manager.add_reference_annotation.assert_called_once_with(
            seg.frame_idx,
            seg.mask,
            seg.class_id,
            seg.class_name,
            obj_id=seg.obj_id,
        )

    def test_emits_progress_per_reference_frame(
        self, app, qtbot, mock_propagation_manager, sample_segments
    ):
        """Test that progress is emitted per reference frame (not per segment)."""
        progress_messages = []

        worker = ReferenceAnnotationWorker(
            propagation_manager=mock_propagation_manager,
            reference_frames=[0, 3],
            segments=sample_segments,
        )
        worker.progress.connect(progress_messages.append)

        with qtbot.waitSignal(worker.finished_annotations, timeout=5000):
            worker.start()

        assert len(progress_messages) == 2
        assert "Adding reference 1/2" in progress_messages
        assert "Adding reference 2/2" in progress_messages

    def test_failed_annotation_not_counted(
        self, app, qtbot, mock_propagation_manager, sample_segments
    ):
        """Test that failed annotations (return 0) are not counted."""
        mock_propagation_manager.add_reference_annotation.side_effect = [1, 0, 1]

        worker = ReferenceAnnotationWorker(
            propagation_manager=mock_propagation_manager,
            reference_frames=[0, 3],
            segments=sample_segments,
        )
        with qtbot.waitSignal(worker.finished_annotations, timeout=5000) as blocker:
            worker.start()

        assert blocker.args == [2]

    def test_exception_emits_error(
        self, app, qtbot, mock_propagation_manager, sample_segments
    ):
        """Test that exceptions emit error signal."""
        mock_propagation_manager.add_reference_frame.side_effect = RuntimeError(
            "GPU error"
        )

        worker = ReferenceAnnotationWorker(
            propagation_manager=mock_propagation_manager,
            reference_frames=[0],
            segments=sample_segments[:1],
        )
        with qtbot.waitSignal(worker.error, timeout=5000) as blocker:
            worker.start()

        assert "GPU error" in blocker.args[0]

    def test_empty_segments_emits_zero(self, app, qtbot, mock_propagation_manager):
        """Test that empty segments list emits 0 count."""
        worker = ReferenceAnnotationWorker(
            propagation_manager=mock_propagation_manager,
            reference_frames=[],
            segments=[],
        )
        with qtbot.waitSignal(worker.finished_annotations, timeout=5000) as blocker:
            worker.start()

        assert blocker.args == [0]
