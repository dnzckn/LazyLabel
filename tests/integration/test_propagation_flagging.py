"""Integration tests for propagation flagging logic.

Tests the full flow: _on_propagation_frame_done -> _finalize_propagation_frame_color
to verify that frames are correctly marked green/red based on confidence threshold.
"""

from dataclasses import dataclass
from unittest.mock import MagicMock

import numpy as np
import pytest

from lazylabel.ui.managers.propagation_manager import (
    PropagationManager,
    PropagationState,
)
from lazylabel.ui.modes.sequence_view_mode import SequenceViewMode


@dataclass
class FakePropagationResult:
    """Minimal PropagationResult for testing."""

    frame_idx: int
    obj_id: int
    mask: np.ndarray
    confidence: float
    image_path: str = ""


@pytest.fixture
def svm():
    """Create a SequenceViewMode with mock main window."""
    mw = MagicMock()
    mw.segment_manager = MagicMock()
    mw.segment_manager.segments = []
    mode = SequenceViewMode(mw)
    mode.set_image_paths([f"/frame_{i:04d}.png" for i in range(20)])
    mode.set_reference_frame(0, [])
    return mode


@pytest.fixture
def prop_mgr():
    """Create a PropagationManager with mock main window."""
    mw = MagicMock()
    mw.model_manager.sam_model = MagicMock()
    mw.segment_manager = MagicMock()
    mgr = PropagationManager(mw)
    mgr.state = PropagationState(
        is_initialized=True,
        total_frames=20,
        confidence_threshold=0.99,
    )
    return mgr


@pytest.fixture
def timeline():
    """Create a mock timeline widget."""
    tl = MagicMock()
    tl.frame_statuses = {}

    def set_status(idx, status, immediate=False):
        tl.frame_statuses[idx] = status

    tl.set_frame_status = MagicMock(side_effect=set_status)
    return tl


@pytest.fixture
def mw_handler(svm, prop_mgr, timeline):
    """Create a minimal mock of MainWindow with the propagation handler methods.

    Instead of instantiating MainWindow (heavy), we bind the real methods
    to a lightweight mock that has the required attributes.
    """
    from lazylabel.ui.main_window import MainWindow

    handler = MagicMock()
    handler.sequence_view_mode = svm
    handler.propagation_manager = prop_mgr
    handler.timeline_widget = timeline
    handler.sequence_widget = None
    handler._propagation_worker = None
    handler._propagation_prev_frame = None
    handler._skip_labeled_frames = set()

    # Bind real methods
    handler._finalize_propagation_frame_color = (
        MainWindow._finalize_propagation_frame_color.__get__(handler)
    )
    handler._on_propagation_frame_done = MainWindow._on_propagation_frame_done.__get__(
        handler
    )
    return handler


def _make_mask():
    return np.ones((10, 10), dtype=bool)


class TestFinalizationLogic:
    """Test _finalize_propagation_frame_color in isolation."""

    def test_all_objects_pass_threshold_green(self, svm, prop_mgr, timeline):
        """Two objects both above threshold → frame should be green."""
        from lazylabel.ui.main_window import MainWindow

        handler = MagicMock()
        handler.sequence_view_mode = svm
        handler.propagation_manager = prop_mgr
        handler.timeline_widget = timeline

        # Simulate two objects passing threshold
        svm.mark_frame_propagated(1, {1: _make_mask()}, confidence=0.995)
        svm.mark_frame_propagated(1, {2: _make_mask()}, confidence=0.993)

        MainWindow._finalize_propagation_frame_color(handler, 1)

        assert timeline.frame_statuses[1] == "propagated"
        assert svm.get_frame_status(1) == "propagated"

    def test_one_object_below_threshold_red(self, svm, prop_mgr, timeline):
        """One object below threshold → frame should be red."""
        from lazylabel.ui.main_window import MainWindow

        handler = MagicMock()
        handler.sequence_view_mode = svm
        handler.propagation_manager = prop_mgr
        handler.timeline_widget = timeline

        # Object 1 passes, object 2 fails
        svm.mark_frame_propagated(1, {1: _make_mask()}, confidence=0.995)
        svm.mark_frame_propagated(1, {}, confidence=0.985)

        MainWindow._finalize_propagation_frame_color(handler, 1)

        assert timeline.frame_statuses[1] == "flagged"

    def test_all_objects_below_threshold_red(self, svm, prop_mgr, timeline):
        """Both objects below threshold → red."""
        from lazylabel.ui.main_window import MainWindow

        handler = MagicMock()
        handler.sequence_view_mode = svm
        handler.propagation_manager = prop_mgr
        handler.timeline_widget = timeline

        svm.mark_frame_propagated(1, {}, confidence=0.5)
        svm.mark_frame_propagated(1, {}, confidence=0.3)

        MainWindow._finalize_propagation_frame_color(handler, 1)

        assert timeline.frame_statuses[1] == "flagged"

    def test_single_object_above_threshold_green(self, svm, prop_mgr, timeline):
        """Single object above threshold → green."""
        from lazylabel.ui.main_window import MainWindow

        handler = MagicMock()
        handler.sequence_view_mode = svm
        handler.propagation_manager = prop_mgr
        handler.timeline_widget = timeline

        svm.mark_frame_propagated(1, {1: _make_mask()}, confidence=0.995)

        MainWindow._finalize_propagation_frame_color(handler, 1)

        assert timeline.frame_statuses[1] == "propagated"

    def test_pending_frame_with_no_results_flagged(self, svm, prop_mgr, timeline):
        """Frame with no results (never propagated) → flagged (conf=0.0)."""
        from lazylabel.ui.main_window import MainWindow

        handler = MagicMock()
        handler.sequence_view_mode = svm
        handler.propagation_manager = prop_mgr
        handler.timeline_widget = timeline

        # Frame 1 never got mark_frame_propagated called
        MainWindow._finalize_propagation_frame_color(handler, 1)

        assert timeline.frame_statuses[1] == "flagged"

    def test_threshold_boundary_exact(self, svm, prop_mgr, timeline):
        """Confidence exactly at threshold → should pass (not strictly less)."""
        from lazylabel.ui.main_window import MainWindow

        handler = MagicMock()
        handler.sequence_view_mode = svm
        handler.propagation_manager = prop_mgr
        handler.timeline_widget = timeline

        svm.mark_frame_propagated(1, {1: _make_mask()}, confidence=0.99)

        MainWindow._finalize_propagation_frame_color(handler, 1)

        # 0.99 < 0.99 is False → should be propagated
        assert timeline.frame_statuses[1] == "propagated"


class TestFrameDoneToFinalization:
    """Test the full _on_propagation_frame_done → finalize flow."""

    def test_two_good_objects_stay_green(self, mw_handler, svm, timeline):
        """Two passing objects for same frame → green after finalization."""
        mask = _make_mask()
        r1 = FakePropagationResult(1, obj_id=1, mask=mask, confidence=0.995)
        r2 = FakePropagationResult(1, obj_id=2, mask=mask, confidence=0.993)

        # Simulate SAM2 yielding obj1 then obj2 for frame 1
        mw_handler._on_propagation_frame_done(1, r1)
        mw_handler._on_propagation_frame_done(1, r2)

        # Then frame 2 arrives, triggering finalization of frame 1
        r3 = FakePropagationResult(2, obj_id=1, mask=mask, confidence=0.997)
        mw_handler._on_propagation_frame_done(2, r3)

        assert timeline.frame_statuses.get(1) == "propagated"

    def test_good_then_float_stays_green(self, mw_handler, svm, timeline):
        """Good object then float (failed) — failed object ignored, frame green."""
        mask = _make_mask()
        r1 = FakePropagationResult(1, obj_id=1, mask=mask, confidence=0.995)

        mw_handler._on_propagation_frame_done(1, r1)
        # Float result = failed object, silently ignored
        mw_handler._on_propagation_frame_done(1, 0.985)

        # Frame 2 triggers finalization of frame 1
        r3 = FakePropagationResult(2, obj_id=1, mask=mask, confidence=0.997)
        mw_handler._on_propagation_frame_done(2, r3)

        # Min only reflects passing objects (0.995)
        assert timeline.frame_statuses.get(1) == "propagated"
        assert svm.get_confidence_score(1) == 0.995

    def test_float_then_good_stays_green(self, mw_handler, svm, timeline):
        """Float (failed) then good object — failed object ignored, frame green."""
        mask = _make_mask()

        mw_handler._on_propagation_frame_done(1, 0.985)
        r2 = FakePropagationResult(1, obj_id=2, mask=mask, confidence=0.995)
        mw_handler._on_propagation_frame_done(1, r2)

        # Frame 2 triggers finalization
        r3 = FakePropagationResult(2, obj_id=1, mask=mask, confidence=0.997)
        mw_handler._on_propagation_frame_done(2, r3)

        # Min only reflects passing objects (0.995)
        assert timeline.frame_statuses.get(1) == "propagated"
        assert svm.get_confidence_score(1) == 0.995

    def test_all_floats_flags_frame(self, mw_handler, svm, timeline):
        """All objects below threshold (all floats) → frame flagged."""
        mw_handler._on_propagation_frame_done(1, 0.985)
        mw_handler._on_propagation_frame_done(1, 0.980)

        # Frame 2 triggers finalization — no good objects, so pending + conf=0.0
        mask = _make_mask()
        mw_handler._on_propagation_frame_done(
            2, FakePropagationResult(2, 1, mask, 0.997)
        )

        assert timeline.frame_statuses.get(1) == "flagged"

    def test_multiple_frames_correct_colors(self, mw_handler, svm, timeline):
        """Multiple frames: good → green, mixed → green (failed ignored), good → green."""
        mask = _make_mask()

        # Frame 1: both pass
        mw_handler._on_propagation_frame_done(
            1, FakePropagationResult(1, 1, mask, 0.995)
        )
        mw_handler._on_propagation_frame_done(
            1, FakePropagationResult(1, 2, mask, 0.993)
        )

        # Frame 2: one good, one float (failed ignored)
        mw_handler._on_propagation_frame_done(
            2, FakePropagationResult(2, 1, mask, 0.997)
        )
        mw_handler._on_propagation_frame_done(2, 0.980)

        # Frame 3: both pass (also finalizes frame 2)
        mw_handler._on_propagation_frame_done(
            3, FakePropagationResult(3, 1, mask, 0.996)
        )
        mw_handler._on_propagation_frame_done(
            3, FakePropagationResult(3, 2, mask, 0.994)
        )

        # Frame 4 to finalize frame 3
        mw_handler._on_propagation_frame_done(
            4, FakePropagationResult(4, 1, mask, 0.998)
        )

        assert timeline.frame_statuses.get(1) == "propagated"
        assert timeline.frame_statuses.get(2) == "propagated"  # failed obj ignored
        assert timeline.frame_statuses.get(3) == "propagated"

    def test_single_object_per_frame_green(self, mw_handler, svm, timeline):
        """Single object above threshold → green."""
        mask = _make_mask()

        mw_handler._on_propagation_frame_done(
            1, FakePropagationResult(1, 1, mask, 0.995)
        )
        # Frame 2 triggers finalization of frame 1
        mw_handler._on_propagation_frame_done(
            2, FakePropagationResult(2, 1, mask, 0.993)
        )

        assert timeline.frame_statuses.get(1) == "propagated"

    def test_skip_labeled_frames_stay_skipped(self, mw_handler, timeline):
        """Skip-labeled frames show as skipped regardless of result."""
        mw_handler._skip_labeled_frames = {1}
        mask = _make_mask()

        mw_handler._on_propagation_frame_done(
            1, FakePropagationResult(1, 1, mask, 0.999)
        )

        assert timeline.frame_statuses.get(1) == "skipped"
