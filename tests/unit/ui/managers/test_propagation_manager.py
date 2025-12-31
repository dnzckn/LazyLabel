"""Tests for PropagationManager (SAM 2 video-based mask propagation)."""

from unittest.mock import MagicMock

import numpy as np
import pytest

from lazylabel.ui.managers.propagation_manager import (
    FrameStatus,
    PropagationDirection,
    PropagationManager,
    PropagationResult,
    PropagationState,
    ReferenceAnnotation,
)


@pytest.fixture
def mock_main_window():
    """Create a mock MainWindow for testing."""
    mw = MagicMock()
    mw.segment_manager = MagicMock()
    mw.segment_manager.segments = []
    mw.segment_manager.class_aliases = {}
    mw.model_manager = MagicMock()
    mw.model_manager.sam_model = None  # No SAM model by default
    return mw


@pytest.fixture
def propagation_manager(mock_main_window):
    """Fixture for PropagationManager."""
    return PropagationManager(mock_main_window)


@pytest.fixture
def mock_sam2_model():
    """Create a mock SAM 2 model."""
    model = MagicMock()
    model.init_video_state = MagicMock(return_value=True)
    model.video_frame_count = 10
    model.video_image_paths = [f"/path/{i}.png" for i in range(10)]
    model.add_video_mask = MagicMock(return_value=(np.ones((100, 100)), 0.95))
    model.reset_video_state = MagicMock()
    model.cleanup_video_predictor = MagicMock()
    return model


class TestPropagationManagerCreation:
    """Tests for manager creation and initialization."""

    def test_manager_creates_successfully(self, propagation_manager):
        """Test that PropagationManager can be created."""
        assert propagation_manager is not None

    def test_initial_state(self, propagation_manager):
        """Test initial state of the manager."""
        assert propagation_manager.is_initialized is False
        assert propagation_manager.total_frames == 0
        assert propagation_manager.reference_frame_indices == set()

    def test_initial_propagation_state(self, propagation_manager):
        """Test initial propagation state object."""
        assert isinstance(propagation_manager.state, PropagationState)
        assert propagation_manager.state.is_initialized is False

    def test_sam2_model_property_returns_none_without_model(self, propagation_manager):
        """Test that sam2_model property returns None when no model."""
        assert propagation_manager.sam2_model is None


class TestInitSequence:
    """Tests for init_sequence method."""

    def test_init_sequence_without_sam_model_fails(self, propagation_manager):
        """Test that init_sequence fails without SAM model."""
        result = propagation_manager.init_sequence("/some/path")
        assert result is False

    def test_init_sequence_without_video_predictor_fails(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test that init_sequence fails without video predictor capability."""
        # Remove video predictor capability
        del mock_sam2_model.init_video_state
        mock_main_window.model_manager.sam_model = mock_sam2_model

        result = propagation_manager.init_sequence("/some/path")
        assert result is False

    def test_init_sequence_success(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test successful sequence initialization."""
        mock_main_window.model_manager.sam_model = mock_sam2_model

        result = propagation_manager.init_sequence("/some/path")

        assert result is True
        assert propagation_manager.is_initialized is True
        assert propagation_manager.total_frames == 10

    def test_init_sequence_resets_state(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test that init_sequence resets previous state."""
        mock_main_window.model_manager.sam_model = mock_sam2_model

        # First initialization
        propagation_manager.init_sequence("/path1")
        propagation_manager.state.propagated_frames.add(5)

        # Second initialization should reset
        propagation_manager.init_sequence("/path2")
        assert len(propagation_manager.state.propagated_frames) == 0


class TestCleanup:
    """Tests for cleanup method."""

    def test_cleanup_resets_state(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test that cleanup resets all state."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")

        propagation_manager.cleanup()

        assert propagation_manager.is_initialized is False
        assert propagation_manager.state.total_frames == 0

    def test_cleanup_calls_model_cleanup(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test that cleanup calls model's cleanup method."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")

        propagation_manager.cleanup()

        mock_sam2_model.cleanup_video_predictor.assert_called_once()


class TestReferenceFrames:
    """Tests for reference frame methods."""

    def test_add_reference_frame_not_initialized_fails(self, propagation_manager):
        """Test that add_reference_frame fails when not initialized."""
        result = propagation_manager.add_reference_frame(0)
        assert result is False

    def test_add_reference_frame_success(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test successful reference frame addition."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")

        result = propagation_manager.add_reference_frame(5)

        assert result is True
        assert 5 in propagation_manager.reference_frame_indices

    def test_add_reference_frame_invalid_index_fails(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test that invalid index fails."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")

        assert propagation_manager.add_reference_frame(-1) is False
        assert propagation_manager.add_reference_frame(100) is False

    def test_add_multiple_reference_frames(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test adding multiple reference frames."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")

        propagation_manager.add_reference_frame(3)
        propagation_manager.add_reference_frame(5)
        propagation_manager.add_reference_frame(7)

        assert propagation_manager.reference_frame_indices == {3, 5, 7}

    def test_add_reference_frames_bulk(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test bulk adding reference frames."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")

        count = propagation_manager.add_reference_frames([0, 1, 2, 3, 4])

        assert count == 5
        assert propagation_manager.reference_frame_indices == {0, 1, 2, 3, 4}

    def test_clear_reference_frames(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test clearing all reference frames."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")
        propagation_manager.add_reference_frame(3)
        propagation_manager.add_reference_frame(5)

        propagation_manager.clear_reference_frames()

        assert propagation_manager.reference_frame_indices == set()


class TestAddReferenceAnnotation:
    """Tests for add_reference_annotation method."""

    def test_add_reference_annotation_not_initialized_fails(self, propagation_manager):
        """Test that adding annotation fails when not initialized."""
        mask = np.ones((100, 100), dtype=bool)
        result = propagation_manager.add_reference_annotation(0, mask, 0, "Class 0")
        assert result == -1

    def test_add_reference_annotation_success(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test successful annotation addition."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")
        propagation_manager.add_reference_frame(0)

        mask = np.ones((100, 100), dtype=bool)
        obj_id = propagation_manager.add_reference_annotation(0, mask, 0, "Class 0")

        assert obj_id > 0
        assert len(propagation_manager.state.reference_annotations) == 1

    def test_add_reference_annotation_auto_assigns_obj_id(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test that object IDs are auto-assigned sequentially."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")
        propagation_manager.add_reference_frame(0)

        mask = np.ones((100, 100), dtype=bool)
        obj_id1 = propagation_manager.add_reference_annotation(0, mask, 0, "Class 0")
        obj_id2 = propagation_manager.add_reference_annotation(0, mask, 1, "Class 1")

        assert obj_id2 == obj_id1 + 1

    def test_add_reference_annotation_with_explicit_obj_id(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test adding annotation with explicit object ID."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")
        propagation_manager.add_reference_frame(0)

        mask = np.ones((100, 100), dtype=bool)
        obj_id = propagation_manager.add_reference_annotation(
            0, mask, 0, "Class 0", obj_id=42
        )

        assert obj_id == 42

    def test_add_reference_annotation_on_different_frames(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test adding annotations on different reference frames."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")
        propagation_manager.add_reference_frame(0)
        propagation_manager.add_reference_frame(5)

        mask = np.ones((100, 100), dtype=bool)
        obj_id1 = propagation_manager.add_reference_annotation(0, mask, 0, "Class 0")
        obj_id2 = propagation_manager.add_reference_annotation(5, mask, 0, "Class 0")

        assert obj_id1 > 0
        assert obj_id2 > 0
        assert len(propagation_manager.state.reference_annotations) == 2


class TestAddReferenceAnnotationsFromSegments:
    """Tests for add_reference_annotations_from_segments method."""

    def test_add_from_segments_not_initialized_fails(self, propagation_manager):
        """Test that adding from segments fails when not initialized."""
        count = propagation_manager.add_reference_annotations_from_segments(0)
        assert count == 0

    def test_add_from_segments_success(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test successful addition from segments."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")
        propagation_manager.add_reference_frame(0)

        # Set up mock segments
        mock_main_window.segment_manager.segments = [
            {"mask": np.ones((100, 100), dtype=bool), "class_id": 0},
            {"mask": np.ones((100, 100), dtype=bool), "class_id": 1},
        ]

        count = propagation_manager.add_reference_annotations_from_segments(0)

        assert count == 2
        assert len(propagation_manager.state.reference_annotations) == 2

    def test_add_from_segments_clears_existing_for_frame(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test that adding from segments clears existing annotations for that frame."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")
        propagation_manager.add_reference_frame(0)

        # Add initial annotation
        mask = np.ones((100, 100), dtype=bool)
        propagation_manager.add_reference_annotation(0, mask, 0, "Class 0")

        # Set up mock segments
        mock_main_window.segment_manager.segments = [
            {"mask": np.ones((50, 50), dtype=bool), "class_id": 1},
        ]

        propagation_manager.add_reference_annotations_from_segments(0)

        # Should only have the segment-based annotation
        assert len(propagation_manager.state.reference_annotations) == 1

    def test_add_from_segments_skips_empty_masks(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test that empty masks are skipped."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")
        propagation_manager.add_reference_frame(0)

        mock_main_window.segment_manager.segments = [
            {"mask": np.ones((100, 100), dtype=bool), "class_id": 0},
            {"mask": np.zeros((100, 100), dtype=bool), "class_id": 1},  # Empty mask
            {"mask": None, "class_id": 2},  # No mask
        ]

        count = propagation_manager.add_reference_annotations_from_segments(0)

        assert count == 1


class TestClearReferenceAnnotations:
    """Tests for clear_reference_annotations method."""

    def test_clear_reference_annotations(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test clearing all reference annotations."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")
        propagation_manager.add_reference_frame(0)

        mask = np.ones((100, 100), dtype=bool)
        propagation_manager.add_reference_annotation(0, mask, 0, "Class 0")
        propagation_manager.add_reference_annotation(0, mask, 1, "Class 1")

        propagation_manager.clear_reference_annotations()

        assert len(propagation_manager.state.reference_annotations) == 0


class TestClearPropagationResults:
    """Tests for clear_propagation_results method."""

    def test_clear_propagation_results(self, propagation_manager):
        """Test clearing propagation results."""
        propagation_manager.state.propagated_frames = {1, 2, 3}
        propagation_manager.state.flagged_frames = {2}
        propagation_manager.state.frame_results = {1: [], 2: [], 3: []}

        propagation_manager.clear_propagation_results()

        assert len(propagation_manager.state.propagated_frames) == 0
        assert len(propagation_manager.state.flagged_frames) == 0
        assert len(propagation_manager.state.frame_results) == 0


class TestRequestCancel:
    """Tests for request_cancel method."""

    def test_request_cancel_sets_flag(self, propagation_manager):
        """Test that request_cancel sets the cancel flag."""
        assert propagation_manager._cancel_requested is False
        propagation_manager.request_cancel()
        assert propagation_manager._cancel_requested is True


class TestGetFrameStatus:
    """Tests for get_frame_status method."""

    def test_get_frame_status_reference(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test getting status for reference frame."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")
        propagation_manager.add_reference_frame(3)

        assert propagation_manager.get_frame_status(3) == FrameStatus.REFERENCE

    def test_get_frame_status_multiple_references(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test getting status for multiple reference frames."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")
        propagation_manager.add_reference_frame(3)
        propagation_manager.add_reference_frame(7)

        assert propagation_manager.get_frame_status(3) == FrameStatus.REFERENCE
        assert propagation_manager.get_frame_status(7) == FrameStatus.REFERENCE
        assert propagation_manager.get_frame_status(5) == FrameStatus.PENDING

    def test_get_frame_status_flagged(self, propagation_manager):
        """Test getting status for flagged frame."""
        propagation_manager.state.flagged_frames.add(5)

        assert propagation_manager.get_frame_status(5) == FrameStatus.FLAGGED

    def test_get_frame_status_propagated(self, propagation_manager):
        """Test getting status for propagated frame."""
        propagation_manager.state.propagated_frames.add(7)

        assert propagation_manager.get_frame_status(7) == FrameStatus.PROPAGATED

    def test_get_frame_status_pending(self, propagation_manager):
        """Test getting status for pending frame."""
        # Frame 5 is not reference (no references set), not flagged, not propagated
        assert propagation_manager.get_frame_status(5) == FrameStatus.PENDING


class TestGetFrameResults:
    """Tests for get_frame_results method."""

    def test_get_frame_results_existing(self, propagation_manager):
        """Test getting results for frame with results."""
        result = PropagationResult(
            frame_idx=1,
            obj_id=1,
            mask=np.ones((100, 100)),
            confidence=0.9,
            image_path="/path/1.png",
        )
        propagation_manager.state.frame_results[1] = [result]

        results = propagation_manager.get_frame_results(1)

        assert len(results) == 1
        assert results[0].confidence == 0.9

    def test_get_frame_results_empty(self, propagation_manager):
        """Test getting results for frame without results."""
        results = propagation_manager.get_frame_results(99)
        assert results == []


class TestGetReferenceAnnotationForObj:
    """Tests for get_reference_annotation_for_obj method."""

    def test_get_reference_annotation_found(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test getting reference annotation by object ID."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")
        propagation_manager.add_reference_frame(0)

        mask = np.ones((100, 100), dtype=bool)
        obj_id = propagation_manager.add_reference_annotation(0, mask, 0, "Class 0")

        ann = propagation_manager.get_reference_annotation_for_obj(obj_id)

        assert ann is not None
        assert ann.class_name == "Class 0"

    def test_get_reference_annotation_not_found(self, propagation_manager):
        """Test getting non-existent reference annotation."""
        ann = propagation_manager.get_reference_annotation_for_obj(999)
        assert ann is None


class TestFlaggedNavigation:
    """Tests for flagged frame navigation."""

    def test_get_next_flagged_frame(self, propagation_manager):
        """Test getting next flagged frame."""
        propagation_manager.state.flagged_frames = {3, 7, 15}

        assert propagation_manager.get_next_flagged_frame(0) == 3
        assert propagation_manager.get_next_flagged_frame(5) == 7
        assert propagation_manager.get_next_flagged_frame(10) == 15

    def test_get_next_flagged_frame_wraps(self, propagation_manager):
        """Test that next flagged wraps around."""
        propagation_manager.state.flagged_frames = {3}

        assert propagation_manager.get_next_flagged_frame(5) == 3

    def test_get_prev_flagged_frame(self, propagation_manager):
        """Test getting previous flagged frame."""
        propagation_manager.state.flagged_frames = {3, 7, 15}

        assert propagation_manager.get_prev_flagged_frame(20) == 15
        assert propagation_manager.get_prev_flagged_frame(10) == 7
        assert propagation_manager.get_prev_flagged_frame(5) == 3

    def test_get_prev_flagged_frame_wraps(self, propagation_manager):
        """Test that prev flagged wraps around."""
        propagation_manager.state.flagged_frames = {15}

        assert propagation_manager.get_prev_flagged_frame(5) == 15

    def test_no_flagged_returns_none(self, propagation_manager):
        """Test that no flagged frames returns None."""
        assert propagation_manager.get_next_flagged_frame(0) is None
        assert propagation_manager.get_prev_flagged_frame(0) is None


class TestSetConfidenceThreshold:
    """Tests for set_confidence_threshold method."""

    def test_set_confidence_threshold(self, propagation_manager):
        """Test setting confidence threshold."""
        propagation_manager.set_confidence_threshold(0.5)
        assert propagation_manager.state.confidence_threshold == 0.5

    def test_set_confidence_threshold_clamped(self, propagation_manager):
        """Test that threshold is clamped to 0-1."""
        propagation_manager.set_confidence_threshold(-0.5)
        assert propagation_manager.state.confidence_threshold == 0.0

        propagation_manager.set_confidence_threshold(1.5)
        assert propagation_manager.state.confidence_threshold == 1.0

    def test_set_confidence_threshold_reevaluates_flagged(self, propagation_manager):
        """Test that changing threshold reevaluates flagged frames."""
        # Add some results
        propagation_manager.state.frame_results = {
            1: [
                PropagationResult(
                    frame_idx=1,
                    obj_id=1,
                    mask=np.ones((10, 10)),
                    confidence=0.6,
                    image_path="/1.png",
                )
            ],
            2: [
                PropagationResult(
                    frame_idx=2,
                    obj_id=1,
                    mask=np.ones((10, 10)),
                    confidence=0.8,
                    image_path="/2.png",
                )
            ],
        }

        # With threshold 0.7, frame 1 should be flagged
        propagation_manager.set_confidence_threshold(0.7)
        assert 1 in propagation_manager.state.flagged_frames
        assert 2 not in propagation_manager.state.flagged_frames

        # With threshold 0.5, neither should be flagged
        propagation_manager.set_confidence_threshold(0.5)
        assert 1 not in propagation_manager.state.flagged_frames
        assert 2 not in propagation_manager.state.flagged_frames


class TestGetPropagationStats:
    """Tests for get_propagation_stats method."""

    def test_get_propagation_stats(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test getting propagation statistics."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")
        propagation_manager.add_reference_frame(5)

        mask = np.ones((100, 100), dtype=bool)
        propagation_manager.add_reference_annotation(5, mask, 0, "Class 0")
        propagation_manager.state.propagated_frames = {1, 2, 3}
        propagation_manager.state.flagged_frames = {2}

        stats = propagation_manager.get_propagation_stats()

        assert stats["total_frames"] == 10
        assert 5 in stats["reference_frames"]
        assert stats["num_reference_annotations"] == 1
        assert stats["num_propagated"] == 3
        assert stats["num_flagged"] == 1

    def test_get_propagation_stats_multiple_references(
        self, propagation_manager, mock_main_window, mock_sam2_model
    ):
        """Test getting stats with multiple reference frames."""
        mock_main_window.model_manager.sam_model = mock_sam2_model
        propagation_manager.init_sequence("/path")
        propagation_manager.add_reference_frame(0)
        propagation_manager.add_reference_frame(5)
        propagation_manager.add_reference_frame(9)

        stats = propagation_manager.get_propagation_stats()

        assert set(stats["reference_frames"]) == {0, 5, 9}


class TestDataClasses:
    """Tests for data classes used by PropagationManager."""

    def test_propagation_result_creation(self):
        """Test PropagationResult dataclass creation."""
        result = PropagationResult(
            frame_idx=5,
            obj_id=1,
            mask=np.ones((100, 100)),
            confidence=0.95,
            image_path="/path/5.png",
        )

        assert result.frame_idx == 5
        assert result.obj_id == 1
        assert result.confidence == 0.95
        assert result.image_path == "/path/5.png"

    def test_reference_annotation_creation(self):
        """Test ReferenceAnnotation dataclass creation."""
        ann = ReferenceAnnotation(
            frame_idx=0,
            obj_id=1,
            mask=np.ones((100, 100)),
            class_id=0,
            class_name="Background",
        )

        assert ann.frame_idx == 0
        assert ann.obj_id == 1
        assert ann.class_id == 0
        assert ann.class_name == "Background"

    def test_propagation_state_defaults(self):
        """Test PropagationState default values."""
        state = PropagationState()

        assert state.is_initialized is False
        assert state.image_dir is None
        assert state.total_frames == 0
        assert state.confidence_threshold == 0.95
        assert len(state.reference_annotations) == 0


class TestEnums:
    """Tests for enum classes."""

    def test_propagation_direction_values(self):
        """Test PropagationDirection enum values."""
        assert PropagationDirection.FORWARD.value == "forward"
        assert PropagationDirection.BACKWARD.value == "backward"
        assert PropagationDirection.BIDIRECTIONAL.value == "bidirectional"

    def test_frame_status_values(self):
        """Test FrameStatus enum values."""
        assert FrameStatus.PENDING.value == "pending"
        assert FrameStatus.REFERENCE.value == "reference"
        assert FrameStatus.PROPAGATED.value == "propagated"
        assert FrameStatus.FLAGGED.value == "flagged"
