"""Integration tests for the full sequence mode workflow.

Tests the end-to-end flow: setup -> reference -> propagate -> review -> trim -> save.
These tests exercise SequenceViewMode, PropagationManager, and TimelineWidget together.
"""

from unittest.mock import MagicMock

import numpy as np
import pytest

from lazylabel.ui.modes.sequence_view_mode import SequenceViewMode


@pytest.fixture
def svm():
    """Create a SequenceViewMode with mock main window."""
    mw = MagicMock()
    mw.segment_manager = MagicMock()
    mw.segment_manager.segments = []
    return SequenceViewMode(mw)


def _build_timeline(svm, n=10):
    """Set up an n-frame timeline with paths."""
    svm.set_image_paths([f"/frame_{i:04d}.png" for i in range(n)])


class TestSetupToReference:
    """Timeline setup and reference frame management."""

    def test_set_image_paths_initializes_pending(self, svm):
        _build_timeline(svm, 10)
        assert svm.total_frames == 10
        for i in range(10):
            assert svm.get_frame_status(i) == "pending"

    def test_set_reference_marks_frame(self, svm):
        _build_timeline(svm, 10)
        svm.set_reference_frame(0, [])
        assert svm.get_frame_status(0) == "reference"
        assert 0 in svm.reference_frame_indices

    def test_multiple_references(self, svm):
        _build_timeline(svm, 10)
        svm.set_reference_frame(0, [])
        svm.set_reference_frame(5, [])
        assert sorted(svm.reference_frame_indices) == [0, 5]

    def test_clear_reference(self, svm):
        _build_timeline(svm, 10)
        svm.set_reference_frame(3, [])
        svm.clear_reference_frame(3)
        assert 3 not in svm.reference_frame_indices
        assert svm.get_frame_status(3) == "pending"


class TestPropagationFlow:
    """Simulating propagation results arriving frame by frame."""

    def test_propagation_marks_frames_green(self, svm):
        _build_timeline(svm, 5)
        svm.set_reference_frame(0, [])
        mask = np.ones((10, 10), dtype=bool)

        for i in range(1, 5):
            svm.mark_frame_propagated(i, {1: mask}, confidence=0.999)

        assert svm.get_frame_status(0) == "reference"
        for i in range(1, 5):
            assert svm.get_frame_status(i) == "propagated"

    def test_low_confidence_flags_frame(self, svm):
        _build_timeline(svm, 5)
        svm.set_reference_frame(0, [])
        mask = np.ones((10, 10), dtype=bool)

        svm.mark_frame_propagated(1, {1: mask}, confidence=0.999)
        svm.mark_frame_propagated(2, {1: mask}, confidence=0.5)  # Below threshold

        assert svm.get_frame_status(1) == "propagated"
        assert svm.get_frame_status(2) == "flagged"

    def test_multi_object_confidence_uses_minimum(self, svm):
        _build_timeline(svm, 3)
        svm.set_reference_frame(0, [])
        mask = np.ones((10, 10), dtype=bool)

        # Object 1: high confidence
        svm.mark_frame_propagated(1, {1: mask}, confidence=0.999)
        # Object 2: low confidence — should flag the frame
        svm.mark_frame_propagated(1, {2: mask}, confidence=0.5)

        assert svm.get_frame_status(1) == "flagged"
        assert svm.get_confidence_score(1) == 0.5

    def test_obj_class_map_registered_during_propagation(self, svm):
        _build_timeline(svm, 3)
        mask = np.ones((10, 10), dtype=bool)

        svm.register_obj_class(1, 0, "car")
        svm.register_obj_class(2, 1, "person")
        svm.mark_frame_propagated(1, {1: mask, 2: mask}, confidence=0.999)

        assert svm.get_obj_class(1) == (0, "car")
        assert svm.get_obj_class(2) == (1, "person")


class TestReviewAndNavigation:
    """Navigating flagged frames for review."""

    def test_next_flagged_frame(self, svm):
        _build_timeline(svm, 10)
        mask = np.ones((10, 10), dtype=bool)

        for i in range(10):
            if i in (3, 7):
                svm.flag_frame(i)
            else:
                svm.mark_frame_propagated(i, {1: mask}, confidence=0.999)

        svm.set_current_frame(0)
        assert svm.next_flagged_frame() == 3
        svm.set_current_frame(3)
        assert svm.next_flagged_frame() == 7
        svm.set_current_frame(7)
        # Should wrap around
        next_f = svm.next_flagged_frame()
        assert next_f == 3

    def test_unflag_restores_propagated(self, svm):
        _build_timeline(svm, 3)
        mask = np.ones((10, 10), dtype=bool)
        svm.mark_frame_propagated(1, {1: mask}, confidence=0.999)
        svm.flag_frame(1)
        assert svm.get_frame_status(1) == "flagged"

        svm.unflag_frame(1)
        assert svm.get_frame_status(1) == "propagated"

    def test_unflag_without_masks_goes_pending(self, svm):
        _build_timeline(svm, 3)
        svm.flag_frame(1)
        svm.unflag_frame(1)
        assert svm.get_frame_status(1) == "pending"


class TestTrimWorkflow:
    """Trim after propagation — the main workflow for focusing on remaining work."""

    def test_sort_then_trim_reds(self, svm, qtbot):
        """Core workflow: propagate, sort, trim greens, work on reds."""
        _build_timeline(svm, 10)
        mask = np.ones((10, 10), dtype=bool)

        # Propagate: 6 green, 4 red
        for i in range(6):
            svm.mark_frame_propagated(i, {1: mask}, confidence=0.999)
        for i in range(6, 10):
            svm.flag_frame(i)

        # Build timeline widget to test sort integration
        from lazylabel.ui.widgets.timeline_widget import TimelineWidget

        tl = TimelineWidget()
        qtbot.addWidget(tl)
        tl.set_frame_count(10)
        for i in range(6):
            tl.set_frame_status(i, "propagated")
        for i in range(6, 10):
            tl.set_frame_status(i, "flagged")
        tl.sort_by_status()

        # Sorted: [0,1,2,3,4,5, 6,7,8,9] (greens already first)
        # Trim display positions 0-5 (all greens)
        indices_to_trim = {tl._display_order[dp] for dp in range(0, 6)}
        assert indices_to_trim == {0, 1, 2, 3, 4, 5}

        removed = svm.trim_frames(indices_to_trim)
        assert len(removed) == 6
        assert svm.total_frames == 4

        # All remaining should be flagged
        for i in range(4):
            assert svm.get_frame_status(i) == "flagged"

        # Paths should be the original flagged frames
        for i in range(4):
            assert svm.get_image_path(i) == f"/frame_{i + 6:04d}.png"

    def test_trim_preserves_class_map(self, svm):
        """Class mapping must survive trim for correct mask loading."""
        _build_timeline(svm, 5)
        mask = np.ones((10, 10), dtype=bool)

        svm.register_obj_class(1, 0, "car")
        svm.register_obj_class(2, 1, "person")

        for i in range(5):
            svm.mark_frame_propagated(i, {1: mask, 2: mask}, confidence=0.999)

        svm.trim_frames({0, 1, 2})

        # Class map is global, not per-frame — should survive
        assert svm.get_obj_class(1) == (0, "car")
        assert svm.get_obj_class(2) == (1, "person")

    def test_trim_then_re_sort(self, svm, qtbot):
        """After trim, re-sorting should work on the reduced frame set."""
        _build_timeline(svm, 8)
        mask = np.ones((10, 10), dtype=bool)

        # Mixed: [g r g r g r g r]
        for i in range(8):
            if i % 2 == 0:
                svm.mark_frame_propagated(i, {1: mask}, confidence=0.999)
            else:
                svm.flag_frame(i)

        from lazylabel.ui.widgets.timeline_widget import TimelineWidget

        tl = TimelineWidget()
        qtbot.addWidget(tl)
        tl.set_frame_count(8)
        for i in range(8):
            if i % 2 == 0:
                tl.set_frame_status(i, "propagated")
            else:
                tl.set_frame_status(i, "flagged")
        tl.sort_by_status()

        # Trim all greens (display positions 0-3)
        greens = {tl._display_order[dp] for dp in range(4)}
        assert greens == {0, 2, 4, 6}

        svm.trim_frames(greens)
        assert svm.total_frames == 4

        # Rebuild timeline with new frame count
        tl.set_frame_count(4)
        statuses = svm.get_all_frame_statuses()
        tl.set_batch_statuses(statuses)
        tl.sort_by_status()

        # All remaining are flagged, sort should still work
        for i in range(4):
            assert svm.get_frame_status(i) == "flagged"


class TestSaveFlow:
    """Mark frames as saved and verify state transitions."""

    def test_save_clears_propagated_masks(self, svm):
        _build_timeline(svm, 3)
        mask = np.ones((10, 10), dtype=bool)
        svm.mark_frame_propagated(1, {1: mask}, confidence=0.999)

        assert svm.get_propagated_masks(1) is not None
        svm.mark_frame_saved(1)
        assert svm.get_frame_status(1) == "saved"
        assert svm.get_propagated_masks(1) is None

    def test_saved_status_survives_trim(self, svm):
        _build_timeline(svm, 5)
        mask = np.ones((10, 10), dtype=bool)
        svm.mark_frame_propagated(0, {1: mask}, confidence=0.999)
        svm.mark_frame_saved(0)
        svm.mark_frame_propagated(1, {1: mask}, confidence=0.999)
        svm.flag_frame(2)

        svm.trim_frames({3, 4})

        assert svm.get_frame_status(0) == "saved"
        assert svm.get_frame_status(1) == "propagated"
        assert svm.get_frame_status(2) == "flagged"


class TestSerializationRoundtrip:
    """to_dict / from_dict must preserve all state."""

    def test_roundtrip_preserves_state(self, svm):
        _build_timeline(svm, 5)
        mask = np.ones((10, 10), dtype=bool)

        svm.set_reference_frame(0, [])
        svm.register_obj_class(1, 0, "car")
        svm.register_obj_class(2, 1, "person")
        svm.mark_frame_propagated(1, {1: mask}, confidence=0.999)
        svm.mark_frame_propagated(2, {1: mask, 2: mask}, confidence=0.85)
        svm.mark_frame_saved(3)
        svm.set_current_frame(2)

        data = svm.to_dict()

        # Create fresh SVM and restore
        mw = MagicMock()
        mw.segment_manager = MagicMock()
        mw.segment_manager.segments = []
        svm2 = SequenceViewMode(mw)
        svm2.from_dict(data)

        assert svm2.total_frames == 5
        assert svm2.current_frame_idx == 2
        assert svm2.get_frame_status(0) == "reference"
        assert svm2.get_frame_status(1) == "propagated"
        assert svm2.get_frame_status(2) == "flagged"  # below threshold
        assert svm2.get_frame_status(3) == "saved"
        assert svm2.get_frame_status(4) == "pending"
        assert svm2.get_obj_class(1) == (0, "car")
        assert svm2.get_obj_class(2) == (1, "person")

    def test_roundtrip_preserves_confidence(self, svm):
        _build_timeline(svm, 3)
        mask = np.ones((10, 10), dtype=bool)
        svm.mark_frame_propagated(0, {1: mask}, confidence=0.95)
        svm.mark_frame_propagated(1, {1: mask}, confidence=0.999)

        data = svm.to_dict()
        mw = MagicMock()
        mw.segment_manager = MagicMock()
        mw.segment_manager.segments = []
        svm2 = SequenceViewMode(mw)
        svm2.from_dict(data)

        assert svm2.get_confidence_score(0) == 0.95
        assert svm2.get_confidence_score(1) == 0.999


class TestDimensionMismatch:
    """Frames with different dimensions should be marked as skipped."""

    def test_skipped_frames_marked(self, svm):
        _build_timeline(svm, 5)
        svm.mark_frames_skipped({2, 4})

        assert svm.get_frame_status(2) == "skipped"
        assert svm.get_frame_status(4) == "skipped"
        assert svm.get_frame_status(0) == "pending"

    def test_skipped_survives_trim(self, svm):
        _build_timeline(svm, 5)
        svm.mark_frames_skipped({3})
        svm.trim_frames({0, 1})

        # Frame 3 was at index 3, now at index 1
        assert svm.get_frame_status(1) == "skipped"
        assert svm.get_image_path(1) == "/frame_0003.png"


class TestThreadSafety:
    """Verify lock doesn't cause deadlocks in normal usage patterns."""

    def test_concurrent_read_write(self, svm):
        """Simulate rapid read/write like during propagation."""
        import threading

        _build_timeline(svm, 100)
        mask = np.ones((10, 10), dtype=bool)
        errors = []

        def writer():
            try:
                for i in range(1, 50):
                    svm.mark_frame_propagated(i, {1: mask}, confidence=0.999)
                    svm.register_obj_class(i, i % 5, f"class_{i % 5}")
            except Exception as e:
                errors.append(e)

        def reader():
            try:
                for i in range(100):
                    svm.get_frame_status(i % 100)
                    svm.get_confidence_score(i % 100)
                    svm.get_propagated_masks(i % 100)
                    svm.get_obj_class(i % 5)
                    svm.get_all_frame_statuses()
            except Exception as e:
                errors.append(e)

        t1 = threading.Thread(target=writer)
        t2 = threading.Thread(target=reader)
        t1.start()
        t2.start()
        t1.join(timeout=5)
        t2.join(timeout=5)

        assert not errors, f"Thread errors: {errors}"
        assert not t1.is_alive()
        assert not t2.is_alive()
