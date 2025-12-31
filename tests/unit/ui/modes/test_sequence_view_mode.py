"""Tests for SequenceViewMode (sequence mode state management)."""

from unittest.mock import MagicMock

import numpy as np
import pytest

from lazylabel.ui.modes.sequence_view_mode import (
    FrameStatus,
    SequenceViewMode,
)


@pytest.fixture
def mock_main_window():
    """Create a mock MainWindow for testing."""
    mw = MagicMock()
    mw.segment_manager = MagicMock()
    mw.segment_manager.segments = []
    return mw


@pytest.fixture
def sequence_view_mode(mock_main_window):
    """Fixture for SequenceViewMode."""
    return SequenceViewMode(mock_main_window)


class TestSequenceViewModeCreation:
    """Tests for sequence view mode creation and initialization."""

    def test_mode_creates_successfully(self, sequence_view_mode):
        """Test that SequenceViewMode can be created."""
        assert sequence_view_mode is not None

    def test_initial_state(self, sequence_view_mode):
        """Test initial state of the mode."""
        assert sequence_view_mode.total_frames == 0
        assert sequence_view_mode.current_frame_idx == 0
        assert sequence_view_mode.primary_reference_idx == -1

    def test_initial_confidence_threshold(self, sequence_view_mode):
        """Test initial confidence threshold."""
        assert sequence_view_mode._confidence_threshold == 0.95

    def test_auto_flag_enabled_by_default(self, sequence_view_mode):
        """Test that auto-flag is enabled by default."""
        assert sequence_view_mode._auto_flag_low_confidence is True


class TestSetImagePaths:
    """Tests for set_image_paths method."""

    def test_set_image_paths(self, sequence_view_mode):
        """Test setting image paths."""
        paths = ["/path/img1.png", "/path/img2.png", "/path/img3.png"]
        sequence_view_mode.set_image_paths(paths)
        assert sequence_view_mode.total_frames == 3

    def test_set_image_paths_resets_state(self, sequence_view_mode):
        """Test that setting paths resets all state."""
        # First set up some state
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])
        sequence_view_mode._current_frame_idx = 1
        sequence_view_mode._reference_annotations[0] = []

        # Set new paths
        sequence_view_mode.set_image_paths(["/x.png"])

        # State should be reset
        assert sequence_view_mode._current_frame_idx == 0
        assert len(sequence_view_mode._reference_annotations) == 0

    def test_set_image_paths_initializes_statuses(self, sequence_view_mode):
        """Test that all frames start with PENDING status."""
        paths = ["/a.png", "/b.png", "/c.png"]
        sequence_view_mode.set_image_paths(paths)

        for i in range(3):
            assert sequence_view_mode._frame_statuses[i] == FrameStatus.PENDING


class TestGetImagePath:
    """Tests for get_image_path method."""

    def test_get_image_path_valid_index(self, sequence_view_mode):
        """Test getting image path for valid index."""
        paths = ["/path/a.png", "/path/b.png"]
        sequence_view_mode.set_image_paths(paths)
        assert sequence_view_mode.get_image_path(0) == "/path/a.png"
        assert sequence_view_mode.get_image_path(1) == "/path/b.png"

    def test_get_image_path_invalid_index(self, sequence_view_mode):
        """Test getting image path for invalid index returns None."""
        paths = ["/path/a.png"]
        sequence_view_mode.set_image_paths(paths)
        assert sequence_view_mode.get_image_path(-1) is None
        assert sequence_view_mode.get_image_path(10) is None


class TestSetCurrentFrame:
    """Tests for set_current_frame method."""

    def test_set_current_frame_valid(self, sequence_view_mode):
        """Test setting current frame to valid index."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png", "/c.png"])
        assert sequence_view_mode.set_current_frame(1) is True
        assert sequence_view_mode.current_frame_idx == 1

    def test_set_current_frame_invalid(self, sequence_view_mode):
        """Test setting current frame to invalid index returns False."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])
        assert sequence_view_mode.set_current_frame(-1) is False
        assert sequence_view_mode.set_current_frame(5) is False

    def test_set_current_frame_boundary(self, sequence_view_mode):
        """Test setting current frame to boundary values."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png", "/c.png"])
        assert sequence_view_mode.set_current_frame(0) is True
        assert sequence_view_mode.set_current_frame(2) is True


class TestReferenceFrame:
    """Tests for reference frame management."""

    def test_set_reference_frame(self, sequence_view_mode):
        """Test setting a reference frame."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])
        result = sequence_view_mode.set_reference_frame(0, [])
        assert result is True
        assert sequence_view_mode.primary_reference_idx == 0

    def test_set_reference_frame_updates_status(self, sequence_view_mode, qtbot):
        """Test that setting reference frame updates status."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])

        with qtbot.waitSignal(sequence_view_mode.frame_status_changed):
            sequence_view_mode.set_reference_frame(0, [])

        assert sequence_view_mode._frame_statuses[0] == FrameStatus.REFERENCE

    def test_set_reference_frame_emits_signal(self, sequence_view_mode, qtbot):
        """Test that setting reference frame emits signal."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])

        with qtbot.waitSignal(sequence_view_mode.reference_changed) as blocker:
            sequence_view_mode.set_reference_frame(1, [])

        assert blocker.args[0] == 1

    def test_set_reference_frame_invalid_index(self, sequence_view_mode):
        """Test setting reference frame with invalid index fails."""
        sequence_view_mode.set_image_paths(["/a.png"])
        assert sequence_view_mode.set_reference_frame(5, []) is False

    def test_clear_reference_frame(self, sequence_view_mode, qtbot):
        """Test clearing a reference frame."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])
        sequence_view_mode.set_reference_frame(0, [])

        result = sequence_view_mode.clear_reference_frame(0)
        assert result is True
        assert sequence_view_mode.primary_reference_idx == -1

    def test_clear_reference_frame_resets_status(self, sequence_view_mode):
        """Test that clearing reference resets status to PENDING."""
        sequence_view_mode.set_image_paths(["/a.png"])
        sequence_view_mode.set_reference_frame(0, [])
        sequence_view_mode.clear_reference_frame(0)
        assert sequence_view_mode._frame_statuses[0] == FrameStatus.PENDING

    def test_multiple_reference_frames(self, sequence_view_mode):
        """Test that multiple reference frames can be set."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png", "/c.png"])
        sequence_view_mode.set_reference_frame(0, [])
        sequence_view_mode.set_reference_frame(2, [])

        refs = sequence_view_mode.reference_frame_indices
        assert set(refs) == {0, 2}


class TestFrameStatus:
    """Tests for frame status management."""

    def test_get_frame_status_default(self, sequence_view_mode):
        """Test that default status is 'pending'."""
        sequence_view_mode.set_image_paths(["/a.png"])
        assert sequence_view_mode.get_frame_status(0) == "pending"

    def test_get_frame_status_reference(self, sequence_view_mode):
        """Test getting reference frame status."""
        sequence_view_mode.set_image_paths(["/a.png"])
        sequence_view_mode.set_reference_frame(0, [])
        assert sequence_view_mode.get_frame_status(0) == "reference"

    def test_get_all_frame_statuses(self, sequence_view_mode):
        """Test getting all frame statuses at once."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png", "/c.png"])
        sequence_view_mode.set_reference_frame(0, [])

        all_statuses = sequence_view_mode.get_all_frame_statuses()
        assert all_statuses[0] == "reference"
        assert all_statuses[1] == "pending"
        assert all_statuses[2] == "pending"


class TestMarkFramePropagated:
    """Tests for mark_frame_propagated method."""

    def test_mark_frame_propagated(self, sequence_view_mode, qtbot):
        """Test marking a frame as propagated."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])

        mask = np.ones((100, 100), dtype=bool)
        with qtbot.waitSignal(sequence_view_mode.frame_status_changed):
            sequence_view_mode.mark_frame_propagated(1, {1: mask}, confidence=0.98)

        assert sequence_view_mode._frame_statuses[1] == FrameStatus.PROPAGATED

    def test_mark_frame_propagated_low_confidence_flags(self, sequence_view_mode):
        """Test that low confidence marks frame as flagged."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])
        sequence_view_mode._confidence_threshold = 0.8

        mask = np.ones((100, 100), dtype=bool)
        sequence_view_mode.mark_frame_propagated(1, {1: mask}, confidence=0.5)

        assert sequence_view_mode._frame_statuses[1] == FrameStatus.FLAGGED

    def test_mark_frame_propagated_stores_masks(self, sequence_view_mode):
        """Test that propagated masks are stored."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])

        mask = np.ones((100, 100), dtype=bool)
        sequence_view_mode.mark_frame_propagated(1, {1: mask})

        stored_masks = sequence_view_mode.get_propagated_masks(1)
        assert stored_masks is not None
        assert 1 in stored_masks

    def test_mark_frame_propagated_merges_masks(self, sequence_view_mode):
        """Test that multiple objects are merged for same frame."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])

        mask1 = np.ones((100, 100), dtype=bool)
        mask2 = np.zeros((100, 100), dtype=bool)

        sequence_view_mode.mark_frame_propagated(1, {1: mask1})
        sequence_view_mode.mark_frame_propagated(1, {2: mask2})

        stored_masks = sequence_view_mode.get_propagated_masks(1)
        assert 1 in stored_masks
        assert 2 in stored_masks


class TestFlagging:
    """Tests for frame flagging."""

    def test_flag_frame(self, sequence_view_mode, qtbot):
        """Test manually flagging a frame."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])

        with qtbot.waitSignal(sequence_view_mode.frame_status_changed):
            sequence_view_mode.flag_frame(1)

        assert sequence_view_mode._frame_statuses[1] == FrameStatus.FLAGGED

    def test_unflag_frame_with_masks(self, sequence_view_mode):
        """Test unflagging a frame that has masks."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])
        mask = np.ones((100, 100), dtype=bool)
        sequence_view_mode.mark_frame_propagated(1, {1: mask})
        sequence_view_mode.flag_frame(1)
        sequence_view_mode.unflag_frame(1)

        assert sequence_view_mode._frame_statuses[1] == FrameStatus.PROPAGATED

    def test_unflag_frame_without_masks(self, sequence_view_mode):
        """Test unflagging a frame without masks reverts to pending."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])
        sequence_view_mode.flag_frame(1)
        sequence_view_mode.unflag_frame(1)

        assert sequence_view_mode._frame_statuses[1] == FrameStatus.PENDING

    def test_get_flagged_frames(self, sequence_view_mode):
        """Test getting list of flagged frames."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png", "/c.png", "/d.png"])
        sequence_view_mode.flag_frame(1)
        sequence_view_mode.flag_frame(3)

        flagged = sequence_view_mode.get_flagged_frames()
        assert set(flagged) == {1, 3}


class TestFlaggedNavigation:
    """Tests for flagged frame navigation."""

    def test_next_flagged_frame(self, sequence_view_mode):
        """Test getting next flagged frame."""
        sequence_view_mode.set_image_paths([f"/{i}.png" for i in range(10)])
        sequence_view_mode.flag_frame(3)
        sequence_view_mode.flag_frame(7)
        sequence_view_mode._current_frame_idx = 0

        assert sequence_view_mode.next_flagged_frame() == 3

    def test_next_flagged_frame_wraps(self, sequence_view_mode):
        """Test that next flagged wraps around."""
        sequence_view_mode.set_image_paths([f"/{i}.png" for i in range(10)])
        sequence_view_mode.flag_frame(2)
        sequence_view_mode._current_frame_idx = 5

        assert sequence_view_mode.next_flagged_frame() == 2  # Wrap around

    def test_prev_flagged_frame(self, sequence_view_mode):
        """Test getting previous flagged frame."""
        sequence_view_mode.set_image_paths([f"/{i}.png" for i in range(10)])
        sequence_view_mode.flag_frame(3)
        sequence_view_mode.flag_frame(7)
        sequence_view_mode._current_frame_idx = 5

        assert sequence_view_mode.prev_flagged_frame() == 3

    def test_prev_flagged_frame_wraps(self, sequence_view_mode):
        """Test that prev flagged wraps around."""
        sequence_view_mode.set_image_paths([f"/{i}.png" for i in range(10)])
        sequence_view_mode.flag_frame(8)
        sequence_view_mode._current_frame_idx = 2

        assert sequence_view_mode.prev_flagged_frame() == 8  # Wrap around

    def test_no_flagged_returns_none(self, sequence_view_mode):
        """Test that no flagged frames returns None."""
        sequence_view_mode.set_image_paths([f"/{i}.png" for i in range(10)])

        assert sequence_view_mode.next_flagged_frame() is None
        assert sequence_view_mode.prev_flagged_frame() is None


class TestMarkFrameSaved:
    """Tests for mark_frame_saved method."""

    def test_mark_frame_saved(self, sequence_view_mode, qtbot):
        """Test marking a frame as saved."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])

        with qtbot.waitSignal(sequence_view_mode.frame_status_changed):
            sequence_view_mode.mark_frame_saved(1)

        assert sequence_view_mode._frame_statuses[1] == FrameStatus.SAVED

    def test_mark_frame_saved_clears_propagated_masks(self, sequence_view_mode):
        """Test that saving clears propagated masks."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])
        mask = np.ones((100, 100), dtype=bool)
        sequence_view_mode.mark_frame_propagated(1, {1: mask})
        sequence_view_mode.mark_frame_saved(1)

        assert sequence_view_mode.get_propagated_masks(1) is None


class TestConfidenceSettings:
    """Tests for confidence threshold settings."""

    def test_set_confidence_threshold(self, sequence_view_mode):
        """Test setting confidence threshold."""
        sequence_view_mode.set_confidence_threshold(0.5)
        assert sequence_view_mode._confidence_threshold == 0.5

    def test_confidence_threshold_clamped(self, sequence_view_mode):
        """Test that confidence threshold is clamped to 0-1."""
        sequence_view_mode.set_confidence_threshold(-0.5)
        assert sequence_view_mode._confidence_threshold == 0.0

        sequence_view_mode.set_confidence_threshold(1.5)
        assert sequence_view_mode._confidence_threshold == 1.0

    def test_set_auto_flag_enabled(self, sequence_view_mode):
        """Test enabling/disabling auto-flag."""
        sequence_view_mode.set_auto_flag_enabled(False)
        assert sequence_view_mode._auto_flag_low_confidence is False

        sequence_view_mode.set_auto_flag_enabled(True)
        assert sequence_view_mode._auto_flag_low_confidence is True


class TestClearPropagationResults:
    """Tests for clear_propagation_results method."""

    def test_clear_propagation_results(self, sequence_view_mode):
        """Test clearing propagation results."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png", "/c.png"])
        sequence_view_mode.set_reference_frame(0, [])
        mask = np.ones((100, 100), dtype=bool)
        sequence_view_mode.mark_frame_propagated(1, {1: mask})
        sequence_view_mode.mark_frame_propagated(2, {1: mask})

        sequence_view_mode.clear_propagation_results()

        assert len(sequence_view_mode._propagated_masks) == 0
        assert sequence_view_mode._frame_statuses[1] == FrameStatus.PENDING
        assert sequence_view_mode._frame_statuses[2] == FrameStatus.PENDING

    def test_clear_propagation_preserves_reference(self, sequence_view_mode):
        """Test that clearing propagation preserves reference frame."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])
        sequence_view_mode.set_reference_frame(0, [])
        mask = np.ones((100, 100), dtype=bool)
        sequence_view_mode.mark_frame_propagated(1, {1: mask})

        sequence_view_mode.clear_propagation_results()

        # Reference should still be set
        assert sequence_view_mode._frame_statuses[0] == FrameStatus.REFERENCE


class TestPropagationRange:
    """Tests for get_propagation_range method."""

    def test_propagation_range_forward(self, sequence_view_mode):
        """Test getting propagation range for forward direction."""
        sequence_view_mode.set_image_paths([f"/{i}.png" for i in range(10)])
        sequence_view_mode.set_reference_frame(3, [])

        start, end = sequence_view_mode.get_propagation_range("forward", 0, 9)
        assert start == 3  # From reference
        assert end == 9

    def test_propagation_range_backward(self, sequence_view_mode):
        """Test getting propagation range for backward direction."""
        sequence_view_mode.set_image_paths([f"/{i}.png" for i in range(10)])
        sequence_view_mode.set_reference_frame(7, [])

        start, end = sequence_view_mode.get_propagation_range("backward", 0, 9)
        assert start == 0
        assert end == 7  # To reference

    def test_propagation_range_both(self, sequence_view_mode):
        """Test getting propagation range for bidirectional."""
        sequence_view_mode.set_image_paths([f"/{i}.png" for i in range(10)])
        sequence_view_mode.set_reference_frame(5, [])

        start, end = sequence_view_mode.get_propagation_range("both", 0, 9)
        assert start == 0
        assert end == 9

    def test_propagation_range_no_reference(self, sequence_view_mode):
        """Test getting propagation range with no reference returns (0, 0)."""
        sequence_view_mode.set_image_paths([f"/{i}.png" for i in range(10)])

        start, end = sequence_view_mode.get_propagation_range("forward", 0, 9)
        assert start == 0
        assert end == 0


class TestSerialization:
    """Tests for to_dict and from_dict methods."""

    def test_to_dict(self, sequence_view_mode):
        """Test serializing state to dict."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])
        sequence_view_mode.set_reference_frame(0, [])
        sequence_view_mode._current_frame_idx = 1

        data = sequence_view_mode.to_dict()

        assert data["image_paths"] == ["/a.png", "/b.png"]
        assert data["current_frame_idx"] == 1
        assert 0 in data["reference_frame_indices"]

    def test_from_dict(self, sequence_view_mode):
        """Test restoring state from dict."""
        data = {
            "image_paths": ["/x.png", "/y.png"],
            "current_frame_idx": 1,
            "confidence_threshold": 0.5,
            "frame_statuses": {"0": "reference", "1": "pending"},
            "confidence_scores": {},
        }

        sequence_view_mode.from_dict(data)

        assert sequence_view_mode._image_paths == ["/x.png", "/y.png"]
        assert sequence_view_mode._current_frame_idx == 1
        assert sequence_view_mode._confidence_threshold == 0.5


class TestHasReference:
    """Tests for has_reference method."""

    def test_has_reference_false_initially(self, sequence_view_mode):
        """Test that has_reference is False initially."""
        sequence_view_mode.set_image_paths(["/a.png"])
        assert sequence_view_mode.has_reference() is False

    def test_has_reference_true_after_setting(self, sequence_view_mode):
        """Test that has_reference is True after setting reference."""
        sequence_view_mode.set_image_paths(["/a.png"])
        sequence_view_mode.set_reference_frame(0, [])
        assert sequence_view_mode.has_reference() is True

    def test_has_reference_false_after_clearing(self, sequence_view_mode):
        """Test that has_reference is False after clearing."""
        sequence_view_mode.set_image_paths(["/a.png"])
        sequence_view_mode.set_reference_frame(0, [])
        sequence_view_mode.clear_reference_frame(0)
        assert sequence_view_mode.has_reference() is False


class TestGetPropagatedFrames:
    """Tests for get_propagated_frames method."""

    def test_get_propagated_frames(self, sequence_view_mode):
        """Test getting list of propagated frames."""
        sequence_view_mode.set_image_paths([f"/{i}.png" for i in range(5)])
        mask = np.ones((10, 10), dtype=bool)

        sequence_view_mode.mark_frame_propagated(1, {1: mask}, confidence=0.98)
        sequence_view_mode.mark_frame_propagated(3, {1: mask}, confidence=0.98)

        propagated = sequence_view_mode.get_propagated_frames()
        assert set(propagated) == {1, 3}

    def test_get_propagated_frames_empty(self, sequence_view_mode):
        """Test getting empty propagated frames list."""
        sequence_view_mode.set_image_paths(["/a.png"])
        assert sequence_view_mode.get_propagated_frames() == []


class TestConfidenceScore:
    """Tests for get_confidence_score method."""

    def test_get_confidence_score(self, sequence_view_mode):
        """Test getting confidence score for a frame."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])
        mask = np.ones((10, 10), dtype=bool)
        sequence_view_mode.mark_frame_propagated(1, {1: mask}, confidence=0.85)

        assert sequence_view_mode.get_confidence_score(1) == 0.85

    def test_get_confidence_score_unpropagated(self, sequence_view_mode):
        """Test getting confidence score for unpropagated frame returns 0."""
        sequence_view_mode.set_image_paths(["/a.png"])
        assert sequence_view_mode.get_confidence_score(0) == 0.0

    def test_confidence_score_takes_minimum(self, sequence_view_mode):
        """Test that confidence score is minimum of all objects."""
        sequence_view_mode.set_image_paths(["/a.png", "/b.png"])
        mask = np.ones((10, 10), dtype=bool)

        sequence_view_mode.mark_frame_propagated(1, {1: mask}, confidence=0.9)
        sequence_view_mode.mark_frame_propagated(1, {2: mask}, confidence=0.7)

        assert sequence_view_mode.get_confidence_score(1) == 0.7
