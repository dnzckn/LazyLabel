"""Comprehensive tests for trim and sort logic in SequenceViewMode.

These tests verify that frame statuses, masks, confidence scores, and
other per-frame data stay correctly tied to their frames through
trimming and sorting operations.
"""

import numpy as np
import pytest

from lazylabel.ui.modes.sequence_view_mode import SequenceViewMode


@pytest.fixture
def svm():
    """Create a SequenceViewMode with mock main window."""
    from unittest.mock import MagicMock

    mw = MagicMock()
    mw.segment_manager = MagicMock()
    mw.segment_manager.segments = []
    return SequenceViewMode(mw)


def _setup_9_frames(svm):
    """Set up 9 frames: 5 propagated (green), 4 flagged (red).

    Layout: [g g g g g r r r r]
    Paths:  /0.png /1.png ... /8.png
    """
    svm.set_image_paths([f"/{i}.png" for i in range(9)])
    mask = np.ones((10, 10), dtype=bool)
    for i in range(5):
        svm.mark_frame_propagated(i, {1: mask}, confidence=0.999)
    for i in range(5, 9):
        svm.flag_frame(i)
    return svm


# ============================================================
# TRIM: basic index correctness
# ============================================================


class TestTrimBasic:
    """Basic trim operations."""

    def test_trim_middle_range(self, svm):
        """Trim indices 3-8 from [g g g g g r r r r] → [g g g]."""
        _setup_9_frames(svm)
        removed = svm.trim_frames({3, 4, 5, 6, 7, 8})

        assert svm.total_frames == 3
        assert len(removed) == 6
        # Remaining paths should be /0, /1, /2
        assert svm.get_image_path(0) == "/0.png"
        assert svm.get_image_path(1) == "/1.png"
        assert svm.get_image_path(2) == "/2.png"

    def test_trim_preserves_status_by_path(self, svm):
        """Statuses must follow their frame identity (path), not index."""
        _setup_9_frames(svm)
        svm.trim_frames({3, 4, 5, 6, 7, 8})

        # All remaining frames were green (propagated)
        for i in range(3):
            assert svm.get_frame_status(i) == "propagated", (
                f"Frame {i} ({svm.get_image_path(i)}) should be propagated"
            )

    def test_trim_only_red_frames(self, svm):
        """Trim only the red (flagged) frames → all green remain."""
        _setup_9_frames(svm)
        svm.trim_frames({5, 6, 7, 8})

        assert svm.total_frames == 5
        for i in range(5):
            assert svm.get_frame_status(i) == "propagated"
            assert svm.get_image_path(i) == f"/{i}.png"

    def test_trim_only_green_frames(self, svm):
        """Trim only the green (propagated) frames → all red remain."""
        _setup_9_frames(svm)
        svm.trim_frames({0, 1, 2, 3, 4})

        assert svm.total_frames == 4
        for i in range(4):
            assert svm.get_frame_status(i) == "flagged"
            assert svm.get_image_path(i) == f"/{i + 5}.png"

    def test_trim_alternating(self, svm):
        """Trim alternating frames and verify paths + statuses."""
        _setup_9_frames(svm)
        svm.trim_frames({0, 2, 4, 6, 8})

        assert svm.total_frames == 4
        expected = [
            ("/1.png", "propagated"),
            ("/3.png", "propagated"),
            ("/5.png", "flagged"),
            ("/7.png", "flagged"),
        ]
        for i, (path, status) in enumerate(expected):
            assert svm.get_image_path(i) == path
            assert svm.get_frame_status(i) == status


# ============================================================
# TRIM: confidence scores follow frames
# ============================================================


class TestTrimConfidence:
    """Confidence scores must stay tied to their frame after trim."""

    def test_confidence_follows_frame_through_trim(self, svm):
        """Confidence scores should be keyed by path, not index."""
        svm.set_image_paths([f"/{i}.png" for i in range(5)])
        mask = np.ones((10, 10), dtype=bool)
        svm.mark_frame_propagated(0, {1: mask}, confidence=0.95)
        svm.mark_frame_propagated(2, {1: mask}, confidence=0.80)
        svm.mark_frame_propagated(4, {1: mask}, confidence=0.70)

        svm.trim_frames({1, 3})
        # Old 0→0, old 2→1, old 4→2

        assert svm.get_confidence_score(0) == 0.95  # was /0.png
        assert svm.get_confidence_score(1) == 0.80  # was /2.png
        assert svm.get_confidence_score(2) == 0.70  # was /4.png

    def test_confidence_removed_for_trimmed_frames(self, svm):
        """Confidence scores for trimmed frames should be gone."""
        svm.set_image_paths([f"/{i}.png" for i in range(3)])
        mask = np.ones((10, 10), dtype=bool)
        svm.mark_frame_propagated(0, {1: mask}, confidence=0.99)
        svm.mark_frame_propagated(1, {1: mask}, confidence=0.50)
        svm.mark_frame_propagated(2, {1: mask}, confidence=0.75)

        svm.trim_frames({1})  # Remove the low-confidence frame

        assert svm.total_frames == 2
        assert svm.get_confidence_score(0) == 0.99
        assert svm.get_confidence_score(1) == 0.75


# ============================================================
# TRIM: propagated masks follow frames
# ============================================================


class TestTrimMasks:
    """Propagated masks must stay tied to their frame after trim."""

    def test_masks_follow_frame_through_trim(self, svm):
        svm.set_image_paths([f"/{i}.png" for i in range(5)])
        mask_a = np.ones((10, 10), dtype=bool)
        mask_b = np.zeros((10, 10), dtype=bool)
        svm.mark_frame_propagated(1, {1: mask_a}, confidence=0.99)
        svm.mark_frame_propagated(3, {2: mask_b}, confidence=0.99)

        svm.trim_frames({0, 2})
        # Old 1→0, old 3→1

        assert svm.get_propagated_masks(0) is not None
        assert 1 in svm.get_propagated_masks(0)
        assert svm.get_propagated_masks(1) is not None
        assert 2 in svm.get_propagated_masks(1)

    def test_masks_removed_for_trimmed_frames(self, svm):
        svm.set_image_paths([f"/{i}.png" for i in range(3)])
        mask = np.ones((10, 10), dtype=bool)
        svm.mark_frame_propagated(1, {1: mask}, confidence=0.99)

        svm.trim_frames({1})

        # No masks should remain for any frame
        assert svm.get_propagated_masks(0) is None
        assert svm.get_propagated_masks(1) is None


# ============================================================
# TRIM: reference frames follow frames
# ============================================================


class TestTrimReferences:
    """Reference annotations must stay tied to their frame after trim."""

    def test_reference_follows_frame_through_trim(self, svm):
        svm.set_image_paths([f"/{i}.png" for i in range(5)])
        svm.set_reference_frame(2, [])

        svm.trim_frames({0, 1})
        # Old 2→0

        assert svm.get_frame_status(0) == "reference"
        assert svm.get_image_path(0) == "/2.png"
        assert 0 in svm.reference_frame_indices

    def test_reference_removed_when_trimmed(self, svm):
        svm.set_image_paths([f"/{i}.png" for i in range(5)])
        svm.set_reference_frame(2, [])

        svm.trim_frames({2})

        assert svm.reference_frame_indices == []
        assert svm.primary_reference_idx == -1


# ============================================================
# TRIM: current frame handling
# ============================================================


class TestTrimCurrentFrame:
    """Current frame index must be correctly adjusted after trim."""

    def test_current_frame_remapped(self, svm):
        svm.set_image_paths([f"/{i}.png" for i in range(5)])
        svm.set_current_frame(3)

        svm.trim_frames({0, 1})
        # Old 3→1

        assert svm.current_frame_idx == 1
        assert svm.get_image_path(1) == "/3.png"

    def test_current_frame_removed_goes_to_nearest(self, svm):
        svm.set_image_paths([f"/{i}.png" for i in range(5)])
        svm.set_current_frame(2)

        svm.trim_frames({2})

        assert 0 <= svm.current_frame_idx < 4


# ============================================================
# TRIM: the exact user scenario
# ============================================================


class TestTrimUserScenario:
    """Reproduce the user's reported bug:
    [g g g g g r r r r] with trim at index 3-8 → should give [g g g].
    """

    def test_trim_left3_right8_unsorted(self, svm):
        """Unsorted: trim indices 3-8 from 9 frames."""
        _setup_9_frames(svm)

        # Simulate _on_trim_range with unsorted timeline
        left = 3
        right = 8
        indices = set(range(left, right + 1))
        assert indices == {3, 4, 5, 6, 7, 8}

        removed = svm.trim_frames(indices)
        assert len(removed) == 6
        assert svm.total_frames == 3

        # All remaining should be green
        for i in range(3):
            assert svm.get_frame_status(i) == "propagated"

    def test_trim_left3_right8_sorted(self, svm, qtbot):
        """Sorted: trim display positions 3-8 from sorted 9 frames."""
        _setup_9_frames(svm)

        # When sorted by status (propagated=2, flagged=4), display order
        # puts propagated first, then flagged, secondary sort by index.
        # Since frames 0-4 are propagated and 5-8 flagged, sorted order
        # is the same as natural: [0,1,2,3,4,5,6,7,8]
        from lazylabel.ui.widgets.timeline_widget import TimelineWidget

        tl = TimelineWidget()
        qtbot.addWidget(tl)
        tl.set_frame_count(9)
        for i in range(5):
            tl.set_frame_status(i, "propagated")
        for i in range(5, 9):
            tl.set_frame_status(i, "flagged")
        tl.sort_by_status()

        # Simulate trim bounds: user clicked display pos 3 and 8
        trim_left_real = tl._display_order[3]  # real index at display 3
        trim_right_real = tl._display_order[8]  # real index at display 8

        dp_left = tl._reverse_order[trim_left_real]
        dp_right = tl._reverse_order[trim_right_real]
        lo, hi = min(dp_left, dp_right), max(dp_left, dp_right)
        indices = {tl._display_order[dp] for dp in range(lo, hi + 1)}

        assert indices == {3, 4, 5, 6, 7, 8}
        svm.trim_frames(indices)
        assert svm.total_frames == 3

        for i in range(3):
            assert svm.get_frame_status(i) == "propagated"

    def test_trim_sorted_mixed_order(self, svm, qtbot):
        """Sorted with non-trivial display order."""
        # Original: [r g r g g r g r g] (indices 0-8)
        svm.set_image_paths([f"/{i}.png" for i in range(9)])
        mask = np.ones((10, 10), dtype=bool)
        # Propagated: 1, 3, 4, 6, 8
        for i in [1, 3, 4, 6, 8]:
            svm.mark_frame_propagated(i, {1: mask}, confidence=0.999)
        # Flagged: 0, 2, 5, 7
        for i in [0, 2, 5, 7]:
            svm.flag_frame(i)

        from lazylabel.ui.widgets.timeline_widget import TimelineWidget

        tl = TimelineWidget()
        qtbot.addWidget(tl)
        tl.set_frame_count(9)
        for i in [1, 3, 4, 6, 8]:
            tl.set_frame_status(i, "propagated")
        for i in [0, 2, 5, 7]:
            tl.set_frame_status(i, "flagged")
        tl.sort_by_status()

        # Sorted display: [g(1) g(3) g(4) g(6) g(8) r(0) r(2) r(5) r(7)]
        assert tl._display_order == [1, 3, 4, 6, 8, 0, 2, 5, 7]

        # Trim display positions 5-8 (all the reds)
        trim_left_real = tl._display_order[5]  # = 0
        trim_right_real = tl._display_order[8]  # = 7
        dp_left = tl._reverse_order[trim_left_real]
        dp_right = tl._reverse_order[trim_right_real]
        lo, hi = min(dp_left, dp_right), max(dp_left, dp_right)
        indices = {tl._display_order[dp] for dp in range(lo, hi + 1)}

        assert indices == {0, 2, 5, 7}  # All flagged frames

        svm.trim_frames(indices)
        assert svm.total_frames == 5
        # All remaining should be propagated
        for i in range(5):
            assert svm.get_frame_status(i) == "propagated"


# ============================================================
# SORT: timeline sort correctness
# ============================================================


class TestTimelineSort:
    """Tests for timeline sort_by_status and reset_sort."""

    def test_sort_groups_by_status(self, qtbot):
        from lazylabel.ui.widgets.timeline_widget import TimelineWidget

        tl = TimelineWidget()
        qtbot.addWidget(tl)
        tl.set_frame_count(6)
        tl.set_frame_status(0, "flagged")
        tl.set_frame_status(1, "propagated")
        tl.set_frame_status(2, "reference")
        tl.set_frame_status(3, "flagged")
        tl.set_frame_status(4, "propagated")
        tl.set_frame_status(5, "saved")

        tl.sort_by_status()

        # Expected order by priority: reference(2), saved(5),
        # propagated(1,4), flagged(0,3), then pending (none)
        assert tl._display_order == [2, 5, 1, 4, 0, 3]
        assert tl.is_sorted is True

    def test_reset_sort_restores_natural_order(self, qtbot):
        from lazylabel.ui.widgets.timeline_widget import TimelineWidget

        tl = TimelineWidget()
        qtbot.addWidget(tl)
        tl.set_frame_count(5)
        tl.set_frame_status(0, "flagged")
        tl.set_frame_status(1, "reference")
        tl.sort_by_status()
        tl.reset_sort()

        assert tl._display_order == [0, 1, 2, 3, 4]
        assert tl.is_sorted is False

    def test_sort_preserves_frame_statuses(self, qtbot):
        """Sorting should not change any status values."""
        from lazylabel.ui.widgets.timeline_widget import TimelineWidget

        tl = TimelineWidget()
        qtbot.addWidget(tl)
        tl.set_frame_count(5)
        tl.set_frame_status(0, "reference")
        tl.set_frame_status(1, "propagated")
        tl.set_frame_status(2, "flagged")

        original = dict(tl.frame_statuses)
        tl.sort_by_status()

        assert tl.frame_statuses == original

    def test_reverse_order_is_consistent(self, qtbot):
        """reverse_order must be exact inverse of display_order."""
        from lazylabel.ui.widgets.timeline_widget import TimelineWidget

        tl = TimelineWidget()
        qtbot.addWidget(tl)
        tl.set_frame_count(8)
        tl.set_frame_status(0, "flagged")
        tl.set_frame_status(3, "reference")
        tl.set_frame_status(5, "propagated")
        tl.sort_by_status()

        for display_pos, real_idx in enumerate(tl._display_order):
            assert tl._reverse_order[real_idx] == display_pos


# ============================================================
# TRIM + SORT: combined operations
# ============================================================


class TestTrimAfterSort:
    """Trim operations after sort should produce correct results."""

    def test_trim_red_tail_after_sort(self, svm, qtbot):
        """After sorting, trim the flagged tail."""
        # Setup: mixed order [r g g r g r g g r]
        svm.set_image_paths([f"/{i}.png" for i in range(9)])
        mask = np.ones((10, 10), dtype=bool)
        propagated = [1, 2, 4, 6, 7]
        flagged = [0, 3, 5, 8]
        for i in propagated:
            svm.mark_frame_propagated(i, {1: mask}, confidence=0.999)
        for i in flagged:
            svm.flag_frame(i)

        from lazylabel.ui.widgets.timeline_widget import TimelineWidget

        tl = TimelineWidget()
        qtbot.addWidget(tl)
        tl.set_frame_count(9)
        for i in propagated:
            tl.set_frame_status(i, "propagated")
        for i in flagged:
            tl.set_frame_status(i, "flagged")
        tl.sort_by_status()

        # Sorted: propagated first [1,2,4,6,7], then flagged [0,3,5,8]
        # Display positions 5-8 are the flagged frames
        indices_to_remove = {tl._display_order[dp] for dp in range(5, 9)}
        assert indices_to_remove == set(flagged)

        removed = svm.trim_frames(indices_to_remove)
        assert len(removed) == 4
        assert svm.total_frames == 5

        # All remaining should be propagated, paths should match
        remaining_paths = [svm.get_image_path(i) for i in range(5)]
        assert remaining_paths == [f"/{i}.png" for i in propagated]
        for i in range(5):
            assert svm.get_frame_status(i) == "propagated"

    def test_trim_single_frame_sorted(self, svm):
        """Trim a single frame from a sorted view."""
        svm.set_image_paths([f"/{i}.png" for i in range(5)])
        mask = np.ones((10, 10), dtype=bool)
        svm.mark_frame_propagated(0, {1: mask}, confidence=0.999)
        svm.mark_frame_propagated(1, {1: mask}, confidence=0.999)
        svm.mark_frame_propagated(2, {1: mask}, confidence=0.999)
        svm.flag_frame(3)
        svm.flag_frame(4)

        svm.trim_frames({4})

        assert svm.total_frames == 4
        assert svm.get_frame_status(0) == "propagated"
        assert svm.get_frame_status(1) == "propagated"
        assert svm.get_frame_status(2) == "propagated"
        assert svm.get_frame_status(3) == "flagged"
        assert svm.get_image_path(3) == "/3.png"


# ============================================================
# TRIM: get_all_frame_statuses consistency
# ============================================================


class TestTrimStatusConsistency:
    """get_all_frame_statuses must return correct data after trim."""

    def test_all_statuses_correct_after_trim(self, svm):
        _setup_9_frames(svm)
        svm.trim_frames({5, 6, 7, 8})

        statuses = svm.get_all_frame_statuses()
        assert len(statuses) == 5
        for i in range(5):
            assert statuses[i] == "propagated"

    def test_mixed_statuses_correct_after_trim(self, svm):
        svm.set_image_paths([f"/{i}.png" for i in range(6)])
        svm.set_reference_frame(0, [])
        mask = np.ones((10, 10), dtype=bool)
        svm.mark_frame_propagated(1, {1: mask}, confidence=0.999)
        svm.mark_frame_propagated(2, {1: mask}, confidence=0.999)
        svm.flag_frame(3)
        svm.mark_frame_saved(4)
        # Frame 5 stays pending

        svm.trim_frames({2})  # Remove a propagated frame

        statuses = svm.get_all_frame_statuses()
        assert statuses[0] == "reference"  # /0.png
        assert statuses[1] == "propagated"  # /1.png
        assert statuses[2] == "flagged"  # /3.png
        assert statuses[3] == "saved"  # /4.png
        assert statuses[4] == "pending"  # /5.png

    def test_statuses_count_matches_frames_after_trim(self, svm):
        """Every frame should have a status entry after trim."""
        _setup_9_frames(svm)
        svm.trim_frames({0, 4, 8})

        statuses = svm.get_all_frame_statuses()
        assert len(statuses) == svm.total_frames
        for i in range(svm.total_frames):
            assert i in statuses


# ============================================================
# Multiple trims
# ============================================================


class TestMultipleTrims:
    """Successive trims should remain correct."""

    def test_two_successive_trims(self, svm):
        svm.set_image_paths([f"/{i}.png" for i in range(10)])
        mask = np.ones((10, 10), dtype=bool)
        for i in range(10):
            svm.mark_frame_propagated(i, {1: mask}, confidence=0.999)

        svm.trim_frames({0, 1})
        assert svm.total_frames == 8
        assert svm.get_image_path(0) == "/2.png"

        svm.trim_frames({0, 1})
        assert svm.total_frames == 6
        assert svm.get_image_path(0) == "/4.png"

        for i in range(6):
            assert svm.get_frame_status(i) == "propagated"

    def test_trim_down_to_one_frame(self, svm):
        svm.set_image_paths([f"/{i}.png" for i in range(5)])
        svm.set_reference_frame(2, [])

        svm.trim_frames({0, 1, 3, 4})

        assert svm.total_frames == 1
        assert svm.get_image_path(0) == "/2.png"
        assert svm.get_frame_status(0) == "reference"


# ============================================================
# Class mapping survives trim
# ============================================================


class TestObjClassMapSurvivesTrim:
    """obj_id → class mapping must survive trim so masks keep their classes."""

    def test_class_map_survives_trim(self, svm):
        """After trim, get_obj_class should still return correct classes."""
        svm.set_image_paths([f"/{i}.png" for i in range(5)])
        mask = np.ones((10, 10), dtype=bool)

        # Register class mappings (normally done during propagation)
        svm.register_obj_class(1, 0, "car")
        svm.register_obj_class(2, 1, "person")
        svm.register_obj_class(3, 2, "bike")

        # Propagate with different obj_ids per frame
        svm.mark_frame_propagated(0, {1: mask}, confidence=0.999)
        svm.mark_frame_propagated(1, {2: mask}, confidence=0.999)
        svm.mark_frame_propagated(2, {3: mask}, confidence=0.999)
        svm.mark_frame_propagated(3, {1: mask, 2: mask}, confidence=0.999)
        svm.mark_frame_propagated(4, {1: mask, 3: mask}, confidence=0.999)

        # Trim frames 0 and 1
        svm.trim_frames({0, 1})

        assert svm.total_frames == 3

        # Class mappings must still be intact
        assert svm.get_obj_class(1) == (0, "car")
        assert svm.get_obj_class(2) == (1, "person")
        assert svm.get_obj_class(3) == (2, "bike")

        # Masks on remaining frames should still have correct obj_ids
        masks_frame0 = svm.get_propagated_masks(0)  # was /2.png
        assert masks_frame0 is not None
        assert 3 in masks_frame0  # obj_id 3 = "bike"

        masks_frame1 = svm.get_propagated_masks(1)  # was /3.png
        assert masks_frame1 is not None
        assert 1 in masks_frame1  # obj_id 1 = "car"
        assert 2 in masks_frame1  # obj_id 2 = "person"

    def test_class_map_not_lost_after_multiple_trims(self, svm):
        svm.set_image_paths([f"/{i}.png" for i in range(6)])
        mask = np.ones((10, 10), dtype=bool)

        svm.register_obj_class(10, 5, "tree")
        svm.register_obj_class(20, 6, "sign")

        for i in range(6):
            svm.mark_frame_propagated(i, {10: mask, 20: mask}, confidence=0.999)

        svm.trim_frames({0, 1})
        svm.trim_frames({0, 1})

        assert svm.total_frames == 2
        assert svm.get_obj_class(10) == (5, "tree")
        assert svm.get_obj_class(20) == (6, "sign")


# ============================================================
# Cut vs Keep: both trim operations
# ============================================================


class TestCutAndKeep:
    """Cut removes the range, Keep removes everything outside the range."""

    def test_cut_removes_range(self, svm):
        """Cut indices 3-6 from 10 frames → 6 remain."""
        svm.set_image_paths([f"/{i}.png" for i in range(10)])
        mask = np.ones((10, 10), dtype=bool)
        for i in range(10):
            svm.mark_frame_propagated(i, {1: mask}, confidence=0.999)

        cut_indices = set(range(3, 7))  # {3, 4, 5, 6}
        svm.trim_frames(cut_indices)

        assert svm.total_frames == 6
        expected_paths = [f"/{i}.png" for i in [0, 1, 2, 7, 8, 9]]
        for i in range(6):
            assert svm.get_image_path(i) == expected_paths[i]
            assert svm.get_frame_status(i) == "propagated"

    def test_keep_removes_outside_range(self, svm):
        """Keep indices 3-6 from 10 frames → 4 remain."""
        svm.set_image_paths([f"/{i}.png" for i in range(10)])
        mask = np.ones((10, 10), dtype=bool)
        for i in range(10):
            svm.mark_frame_propagated(i, {1: mask}, confidence=0.999)

        keep_indices = set(range(3, 7))  # {3, 4, 5, 6}
        all_indices = set(range(10))
        remove_indices = all_indices - keep_indices
        svm.trim_frames(remove_indices)

        assert svm.total_frames == 4
        expected_paths = [f"/{i}.png" for i in [3, 4, 5, 6]]
        for i in range(4):
            assert svm.get_image_path(i) == expected_paths[i]
            assert svm.get_frame_status(i) == "propagated"

    def test_cut_with_mixed_statuses(self, svm):
        """Cut a range that spans green and red frames."""
        _setup_9_frames(svm)  # [g g g g g r r r r]

        # Cut indices 2-6 → keep [g g r r]
        svm.trim_frames({2, 3, 4, 5, 6})

        assert svm.total_frames == 4
        assert svm.get_image_path(0) == "/0.png"
        assert svm.get_image_path(1) == "/1.png"
        assert svm.get_image_path(2) == "/7.png"
        assert svm.get_image_path(3) == "/8.png"
        assert svm.get_frame_status(0) == "propagated"
        assert svm.get_frame_status(1) == "propagated"
        assert svm.get_frame_status(2) == "flagged"
        assert svm.get_frame_status(3) == "flagged"

    def test_keep_with_mixed_statuses(self, svm):
        """Keep a range that spans green and red frames."""
        _setup_9_frames(svm)  # [g g g g g r r r r]

        # Keep indices 2-6 → [g g g r r]
        keep = set(range(2, 7))
        remove = set(range(9)) - keep
        svm.trim_frames(remove)

        assert svm.total_frames == 5
        assert svm.get_image_path(0) == "/2.png"
        assert svm.get_image_path(4) == "/6.png"
        assert svm.get_frame_status(0) == "propagated"
        assert svm.get_frame_status(1) == "propagated"
        assert svm.get_frame_status(2) == "propagated"
        assert svm.get_frame_status(3) == "flagged"
        assert svm.get_frame_status(4) == "flagged"

    def test_keep_sorted_trims_outside_display_range(self, svm, qtbot):
        """Keep on a sorted timeline removes frames outside display range."""
        # [r g r g g r g r g] → sorted: [g g g g g r r r r]
        svm.set_image_paths([f"/{i}.png" for i in range(9)])
        mask = np.ones((10, 10), dtype=bool)
        propagated = [1, 3, 4, 6, 8]
        flagged = [0, 2, 5, 7]
        for i in propagated:
            svm.mark_frame_propagated(i, {1: mask}, confidence=0.999)
        for i in flagged:
            svm.flag_frame(i)

        from lazylabel.ui.widgets.timeline_widget import TimelineWidget

        tl = TimelineWidget()
        qtbot.addWidget(tl)
        tl.set_frame_count(9)
        for i in propagated:
            tl.set_frame_status(i, "propagated")
        for i in flagged:
            tl.set_frame_status(i, "flagged")
        tl.sort_by_status()

        # Sorted display: [g(1) g(3) g(4) g(6) g(8) r(0) r(2) r(5) r(7)]
        # Keep display positions 0-4 (all greens)
        keep_indices = {tl._display_order[dp] for dp in range(0, 5)}
        assert keep_indices == set(propagated)

        all_indices = set(range(9))
        svm.trim_frames(all_indices - keep_indices)

        assert svm.total_frames == 5
        for i in range(5):
            assert svm.get_frame_status(i) == "propagated"

    def test_cut_and_keep_are_complements(self, svm):
        """Cut and Keep on the same range should produce complementary results."""
        from unittest.mock import MagicMock

        # Setup two identical SVMs
        svm.set_image_paths([f"/{i}.png" for i in range(8)])
        mask = np.ones((10, 10), dtype=bool)
        for i in range(8):
            svm.mark_frame_propagated(i, {1: mask}, confidence=0.999)

        mw2 = MagicMock()
        mw2.segment_manager = MagicMock()
        mw2.segment_manager.segments = []
        svm2 = SequenceViewMode(mw2)
        svm2.set_image_paths([f"/{i}.png" for i in range(8)])
        for i in range(8):
            svm2.mark_frame_propagated(i, {1: mask}, confidence=0.999)

        range_indices = set(range(2, 6))  # {2, 3, 4, 5}
        all_indices = set(range(8))

        # Cut removes the range
        svm.trim_frames(range_indices)
        # Keep removes the complement
        svm2.trim_frames(all_indices - range_indices)

        # Together they should account for all original paths
        cut_paths = {svm.get_image_path(i) for i in range(svm.total_frames)}
        keep_paths = {svm2.get_image_path(i) for i in range(svm2.total_frames)}
        all_paths = {f"/{i}.png" for i in range(8)}

        assert cut_paths | keep_paths == all_paths
        assert cut_paths & keep_paths == set()  # No overlap
