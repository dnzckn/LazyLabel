"""Tests for TimelineWidget (visual timeline for sequence navigation)."""

import pytest
from PyQt6.QtCore import QPoint, Qt
from PyQt6.QtGui import QMouseEvent

from lazylabel.ui.widgets.timeline_widget import TimelineWidget


@pytest.fixture
def timeline_widget(qtbot):
    """Fixture for TimelineWidget."""
    widget = TimelineWidget()
    qtbot.addWidget(widget)
    widget.resize(500, 40)  # Give it a reasonable size for tests
    widget.show()
    return widget


class TestTimelineWidgetCreation:
    """Tests for widget creation and initialization."""

    def test_widget_creates_successfully(self, timeline_widget):
        """Test that TimelineWidget can be created."""
        assert timeline_widget is not None

    def test_initial_state(self, timeline_widget):
        """Test initial state of the widget."""
        assert timeline_widget.total_frames == 0
        assert timeline_widget.current_frame == 0
        assert timeline_widget.frame_statuses == {}

    def test_minimum_height(self, timeline_widget):
        """Test that widget has minimum height set."""
        assert timeline_widget.minimumHeight() == 30

    def test_maximum_height(self, timeline_widget):
        """Test that widget has maximum height set."""
        assert timeline_widget.maximumHeight() == 40

    def test_color_definitions_exist(self, timeline_widget):
        """Test that all required status colors are defined."""
        required_colors = [
            "reference",
            "propagated",
            "pending",
            "flagged",
            "saved",
            "current",
        ]
        for color_name in required_colors:
            assert color_name in timeline_widget.COLORS


class TestSetFrameCount:
    """Tests for set_frame_count method."""

    def test_set_frame_count_updates_total(self, timeline_widget):
        """Test that set_frame_count updates total_frames."""
        timeline_widget.set_frame_count(100)
        assert timeline_widget.total_frames == 100

    def test_set_frame_count_clears_statuses(self, timeline_widget):
        """Test that set_frame_count clears existing statuses."""
        timeline_widget.set_frame_status(0, "reference")
        timeline_widget.set_frame_count(50)
        assert timeline_widget.frame_statuses == {}

    def test_set_frame_count_negative_becomes_zero(self, timeline_widget):
        """Test that negative frame count becomes 0."""
        timeline_widget.set_frame_count(-10)
        assert timeline_widget.total_frames == 0

    def test_set_frame_count_invalidates_geometry(self, timeline_widget):
        """Test that set_frame_count invalidates cached geometry."""
        timeline_widget._bar_rect = (0, 0, 100, 30)
        timeline_widget.set_frame_count(50)
        assert timeline_widget._bar_rect is None


class TestSetCurrentFrame:
    """Tests for set_current_frame method."""

    def test_set_current_frame_updates_value(self, timeline_widget):
        """Test that set_current_frame updates current_frame."""
        timeline_widget.set_frame_count(100)
        timeline_widget.set_current_frame(50)
        assert timeline_widget.current_frame == 50

    def test_set_current_frame_ignores_invalid_negative(self, timeline_widget):
        """Test that negative frame index is ignored."""
        timeline_widget.set_frame_count(100)
        timeline_widget.set_current_frame(50)
        timeline_widget.set_current_frame(-1)
        assert timeline_widget.current_frame == 50  # Unchanged

    def test_set_current_frame_ignores_out_of_range(self, timeline_widget):
        """Test that out-of-range frame index is ignored."""
        timeline_widget.set_frame_count(100)
        timeline_widget.set_current_frame(50)
        timeline_widget.set_current_frame(100)  # Index should be 0-99
        assert timeline_widget.current_frame == 50  # Unchanged

    def test_set_current_frame_accepts_boundary_values(self, timeline_widget):
        """Test that boundary values are accepted."""
        timeline_widget.set_frame_count(100)
        timeline_widget.set_current_frame(0)
        assert timeline_widget.current_frame == 0
        timeline_widget.set_current_frame(99)
        assert timeline_widget.current_frame == 99


class TestSetFrameStatus:
    """Tests for set_frame_status method."""

    def test_set_frame_status_updates_dict(self, timeline_widget):
        """Test that set_frame_status updates frame_statuses dict."""
        timeline_widget.set_frame_count(100)
        timeline_widget.set_frame_status(10, "reference")
        assert timeline_widget.frame_statuses[10] == "reference"

    def test_set_frame_status_accepts_all_status_types(self, timeline_widget):
        """Test that all status types can be set."""
        timeline_widget.set_frame_count(100)
        statuses = ["reference", "propagated", "pending", "flagged", "saved"]
        for idx, status in enumerate(statuses):
            timeline_widget.set_frame_status(idx, status)
            assert timeline_widget.frame_statuses[idx] == status

    def test_set_frame_status_ignores_invalid_index(self, timeline_widget):
        """Test that invalid indices are ignored."""
        timeline_widget.set_frame_count(100)
        timeline_widget.set_frame_status(-1, "reference")
        timeline_widget.set_frame_status(100, "propagated")
        assert -1 not in timeline_widget.frame_statuses
        assert 100 not in timeline_widget.frame_statuses

    def test_set_frame_status_overwrites_existing(self, timeline_widget):
        """Test that existing status can be overwritten."""
        timeline_widget.set_frame_count(100)
        timeline_widget.set_frame_status(5, "pending")
        timeline_widget.set_frame_status(5, "propagated")
        assert timeline_widget.frame_statuses[5] == "propagated"


class TestSetBatchStatuses:
    """Tests for set_batch_statuses method."""

    def test_set_batch_statuses_updates_multiple(self, timeline_widget):
        """Test that set_batch_statuses updates multiple frames at once."""
        timeline_widget.set_frame_count(100)
        statuses = {0: "reference", 10: "propagated", 20: "flagged"}
        timeline_widget.set_batch_statuses(statuses)
        assert timeline_widget.frame_statuses[0] == "reference"
        assert timeline_widget.frame_statuses[10] == "propagated"
        assert timeline_widget.frame_statuses[20] == "flagged"

    def test_set_batch_statuses_ignores_invalid_indices(self, timeline_widget):
        """Test that invalid indices in batch are ignored."""
        timeline_widget.set_frame_count(50)
        statuses = {0: "reference", 100: "propagated"}  # 100 is out of range
        timeline_widget.set_batch_statuses(statuses)
        assert 0 in timeline_widget.frame_statuses
        assert 100 not in timeline_widget.frame_statuses


class TestClearStatuses:
    """Tests for clear_statuses method."""

    def test_clear_statuses_removes_all(self, timeline_widget):
        """Test that clear_statuses removes all frame statuses."""
        timeline_widget.set_frame_count(100)
        timeline_widget.set_frame_status(0, "reference")
        timeline_widget.set_frame_status(50, "propagated")
        timeline_widget.clear_statuses()
        assert timeline_widget.frame_statuses == {}


class TestGetStatusLists:
    """Tests for get_reference_frames, get_propagated_frames, get_flagged_frames."""

    def test_get_reference_frames(self, timeline_widget):
        """Test that get_reference_frames returns correct list."""
        timeline_widget.set_frame_count(100)
        timeline_widget.set_frame_status(0, "reference")
        timeline_widget.set_frame_status(50, "reference")
        timeline_widget.set_frame_status(10, "propagated")
        refs = timeline_widget.get_reference_frames()
        assert set(refs) == {0, 50}

    def test_get_propagated_frames(self, timeline_widget):
        """Test that get_propagated_frames returns correct list."""
        timeline_widget.set_frame_count(100)
        timeline_widget.set_frame_status(0, "reference")
        timeline_widget.set_frame_status(10, "propagated")
        timeline_widget.set_frame_status(20, "propagated")
        propagated = timeline_widget.get_propagated_frames()
        assert set(propagated) == {10, 20}

    def test_get_flagged_frames(self, timeline_widget):
        """Test that get_flagged_frames returns correct list."""
        timeline_widget.set_frame_count(100)
        timeline_widget.set_frame_status(5, "flagged")
        timeline_widget.set_frame_status(15, "flagged")
        timeline_widget.set_frame_status(10, "propagated")
        flagged = timeline_widget.get_flagged_frames()
        assert set(flagged) == {5, 15}

    def test_get_empty_lists_when_no_status_set(self, timeline_widget):
        """Test that lists are empty when no statuses are set."""
        timeline_widget.set_frame_count(100)
        assert timeline_widget.get_reference_frames() == []
        assert timeline_widget.get_propagated_frames() == []
        assert timeline_widget.get_flagged_frames() == []


class TestGeometryCalculations:
    """Tests for geometry calculation methods."""

    def test_frame_to_x_calculation(self, timeline_widget):
        """Test that _frame_to_x returns reasonable values."""
        timeline_widget.set_frame_count(100)
        timeline_widget.resize(505, 40)  # 500 usable + margins
        timeline_widget._invalidate_geometry()

        x0 = timeline_widget._frame_to_x(0)
        x99 = timeline_widget._frame_to_x(99)
        # First frame should be near left edge
        assert x0 < 20
        # Last frame should be near right edge
        assert x99 > 450

    def test_x_to_frame_calculation(self, timeline_widget):
        """Test that _x_to_frame returns valid frame indices."""
        timeline_widget.set_frame_count(100)
        timeline_widget.resize(505, 40)
        timeline_widget._invalidate_geometry()

        # Click at start should give frame 0 or close to it
        frame_start = timeline_widget._x_to_frame(5)
        assert 0 <= frame_start < 10

        # Click at end should give high frame number
        frame_end = timeline_widget._x_to_frame(500)
        assert frame_end >= 90

    def test_x_to_frame_clamps_to_valid_range(self, timeline_widget):
        """Test that _x_to_frame clamps to valid frame range."""
        timeline_widget.set_frame_count(100)
        timeline_widget.resize(505, 40)
        timeline_widget._invalidate_geometry()

        # Far left should give 0
        assert timeline_widget._x_to_frame(-100) == 0
        # Far right should give max frame
        assert timeline_widget._x_to_frame(1000) == 99

    def test_geometry_invalidated_on_resize(self, timeline_widget):
        """Test that geometry is invalidated on resize."""
        timeline_widget.set_frame_count(100)
        timeline_widget._calculate_geometry()
        assert timeline_widget._bar_rect is not None

        timeline_widget.resize(600, 40)
        assert timeline_widget._bar_rect is None


class TestFrameSelection:
    """Tests for frame selection signal emission."""

    def test_frame_selected_signal_emitted_on_click(self, timeline_widget, qtbot):
        """Test that frame_selected signal is emitted on mouse click."""
        timeline_widget.set_frame_count(100)
        timeline_widget.resize(505, 40)

        with qtbot.waitSignal(timeline_widget.frame_selected) as blocker:
            # Simulate click in middle of widget
            qtbot.mouseClick(
                timeline_widget, Qt.MouseButton.LeftButton, pos=QPoint(250, 20)
            )

        # Should emit some frame index
        assert 0 <= blocker.args[0] < 100

    def test_current_frame_updated_on_click(self, timeline_widget, qtbot):
        """Test that current_frame is updated on click."""
        timeline_widget.set_frame_count(100)
        timeline_widget.resize(505, 40)

        qtbot.mouseClick(
            timeline_widget, Qt.MouseButton.LeftButton, pos=QPoint(250, 20)
        )

        # Current frame should have been updated
        assert (
            timeline_widget.current_frame != 0 or 250 < 50
        )  # Either moved or was near start


class TestPaintEvent:
    """Tests for paint event (basic rendering checks)."""

    def test_paint_event_handles_zero_frames(self, timeline_widget, qtbot):
        """Test that paint event handles zero frames without crash."""
        timeline_widget.set_frame_count(0)
        timeline_widget.repaint()  # Should not crash

    def test_paint_event_handles_many_frames(self, timeline_widget, qtbot):
        """Test that paint event handles large number of frames."""
        timeline_widget.set_frame_count(10000)
        timeline_widget.set_frame_status(0, "reference")
        timeline_widget.set_frame_status(5000, "propagated")
        timeline_widget.repaint()  # Should not crash

    def test_paint_event_with_all_status_types(self, timeline_widget, qtbot):
        """Test that paint event handles all status types."""
        timeline_widget.set_frame_count(100)
        timeline_widget.set_frame_status(0, "reference")
        timeline_widget.set_frame_status(10, "propagated")
        timeline_widget.set_frame_status(20, "flagged")
        timeline_widget.set_frame_status(30, "saved")
        timeline_widget.set_frame_status(40, "pending")
        timeline_widget.repaint()  # Should not crash


class TestFrameNames:
    """Tests for frame name storage."""

    def test_set_frame_names(self, timeline_widget):
        """Test that set_frame_names stores names."""
        timeline_widget.set_frame_count(3)
        timeline_widget.set_frame_names(["a", "b", "c"])
        assert timeline_widget._frame_names == ["a", "b", "c"]

    def test_set_frame_count_clears_names(self, timeline_widget):
        """Test that set_frame_count clears stored frame names."""
        timeline_widget.set_frame_names(["a", "b"])
        timeline_widget.set_frame_count(5)
        assert timeline_widget._frame_names == []

    def test_set_frame_names_copies_list(self, timeline_widget):
        """Test that set_frame_names stores a copy."""
        names = ["x", "y"]
        timeline_widget.set_frame_names(names)
        names.append("z")
        assert len(timeline_widget._frame_names) == 2


class TestConfidenceScores:
    """Tests for confidence score storage on timeline."""

    def test_set_confidence_scores(self, timeline_widget):
        """Test that set_confidence_scores stores scores."""
        timeline_widget.set_frame_count(10)
        timeline_widget.set_confidence_scores({0: 0.95, 5: 0.50})
        assert timeline_widget._confidence_scores == {0: 0.95, 5: 0.50}

    def test_set_frame_count_clears_scores(self, timeline_widget):
        """Test that set_frame_count clears stored confidence scores."""
        timeline_widget.set_confidence_scores({0: 0.9})
        timeline_widget.set_frame_count(5)
        assert timeline_widget._confidence_scores == {}

    def test_set_confidence_scores_copies_dict(self, timeline_widget):
        """Test that set_confidence_scores stores a copy."""
        scores = {1: 0.8}
        timeline_widget.set_confidence_scores(scores)
        scores[2] = 0.5
        assert 2 not in timeline_widget._confidence_scores


class TestTooltip:
    """Tests for tooltip generation."""

    def test_show_frame_tooltip_basic(self, timeline_widget, qtbot):
        """Test that _show_frame_tooltip does not crash with minimal data."""
        from unittest.mock import MagicMock

        timeline_widget.set_frame_count(10)
        event = MagicMock()
        event.globalPosition.return_value.toPoint.return_value = QPoint(0, 0)
        timeline_widget._show_frame_tooltip(event, 0)

    def test_show_frame_tooltip_with_name_and_score(self, timeline_widget, qtbot):
        """Test tooltip includes name and score when available."""
        from unittest.mock import MagicMock, patch

        timeline_widget.set_frame_count(5)
        timeline_widget.set_frame_names(["frame_001", "frame_002", "frame_003", "frame_004", "frame_005"])
        timeline_widget.set_confidence_scores({2: 0.9876})
        timeline_widget.set_frame_status(2, "propagated")

        event = MagicMock()
        event.globalPosition.return_value.toPoint.return_value = (0, 0)

        with patch("lazylabel.ui.widgets.timeline_widget.QToolTip.showText") as mock_show:
            timeline_widget._show_frame_tooltip(event, 2)
            text = mock_show.call_args[0][1]
            assert "frame_003" in text
            assert "0.9876" in text
            assert "propagated" in text

    def test_mousemove_without_button_shows_tooltip(self, timeline_widget, qtbot):
        """Test that mouse move without button press triggers tooltip path."""
        from unittest.mock import MagicMock, patch

        timeline_widget.set_frame_count(10)
        timeline_widget.resize(500, 40)

        with patch.object(timeline_widget, "_show_frame_tooltip") as mock_tooltip:
            event = MagicMock(spec=QMouseEvent)
            event.buttons.return_value = Qt.MouseButton(0)  # No buttons
            event.pos.return_value = QPoint(250, 20)
            timeline_widget.mouseMoveEvent(event)
            mock_tooltip.assert_called_once()


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_single_frame_sequence(self, timeline_widget):
        """Test handling of single-frame sequence."""
        timeline_widget.set_frame_count(1)
        timeline_widget.set_frame_status(0, "reference")
        assert timeline_widget.total_frames == 1
        assert timeline_widget.get_reference_frames() == [0]

    def test_large_sequence(self, timeline_widget):
        """Test handling of very large sequence."""
        timeline_widget.set_frame_count(100000)
        timeline_widget.set_frame_status(50000, "reference")
        assert timeline_widget.total_frames == 100000
        assert 50000 in timeline_widget.frame_statuses

    def test_rapid_status_updates(self, timeline_widget):
        """Test rapid status updates don't cause issues."""
        timeline_widget.set_frame_count(100)
        for i in range(100):
            timeline_widget.set_frame_status(i, "propagated")
        assert len(timeline_widget.frame_statuses) == 100

    def test_widget_can_be_hidden_and_shown(self, timeline_widget):
        """Test that widget can be hidden and shown without issues."""
        timeline_widget.set_frame_count(100)
        timeline_widget.hide()
        timeline_widget.show()
        timeline_widget.repaint()  # Should not crash
