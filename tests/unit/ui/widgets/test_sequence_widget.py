"""Tests for SequenceWidget (sequence mode control panel)."""

import pytest

from lazylabel.ui.widgets.sequence_widget import SequenceWidget


@pytest.fixture
def sequence_widget(qtbot):
    """Fixture for SequenceWidget."""
    widget = SequenceWidget()
    qtbot.addWidget(widget)
    return widget


class TestSequenceWidgetCreation:
    """Tests for widget creation and initialization."""

    def test_widget_creates_successfully(self, sequence_widget):
        """Test that SequenceWidget can be created."""
        assert sequence_widget is not None

    def test_initial_state(self, sequence_widget):
        """Test initial state of the widget."""
        assert sequence_widget._total_frames == 0
        assert sequence_widget._reference_frames == []
        assert sequence_widget._flagged_count == 0
        assert sequence_widget._propagated_count == 0
        assert sequence_widget._is_propagating is False

    def test_reference_label_initial_text(self, sequence_widget):
        """Test that reference label shows 'None' initially."""
        assert sequence_widget.reference_label.text() == "None"

    def test_flagged_label_initial_text(self, sequence_widget):
        """Test that flagged label shows '0' initially."""
        assert sequence_widget.flagged_label.text() == "0"

    def test_propagation_button_exists(self, sequence_widget):
        """Test that propagation button exists."""
        assert sequence_widget.propagate_btn is not None

    def test_review_buttons_exist(self, sequence_widget):
        """Test that review navigation buttons exist."""
        assert sequence_widget.prev_flagged_btn is not None
        assert sequence_widget.next_flagged_btn is not None

    def test_range_controls_exist(self, sequence_widget):
        """Test that range controls exist."""
        assert sequence_widget.range_start_spin is not None
        assert sequence_widget.range_end_spin is not None

    def test_skip_flagged_checkbox_exists(self, sequence_widget):
        """Test that skip flagged checkbox exists and is checked by default."""
        assert sequence_widget.skip_flagged_checkbox is not None
        assert sequence_widget.skip_flagged_checkbox.isChecked()


class TestSetTotalFrames:
    """Tests for set_total_frames method."""

    def test_set_total_frames_updates_internal_state(self, sequence_widget):
        """Test that set_total_frames updates internal state."""
        sequence_widget.set_total_frames(100)
        assert sequence_widget._total_frames == 100

    def test_set_total_frames_updates_spin_maximums(self, sequence_widget):
        """Test that set_total_frames updates spinbox maximums."""
        sequence_widget.set_total_frames(50)
        assert sequence_widget.range_start_spin.maximum() == 50
        assert sequence_widget.range_end_spin.maximum() == 50
        assert sequence_widget.frame_spin.maximum() == 50

    def test_set_total_frames_updates_total_label(self, sequence_widget):
        """Test that set_total_frames updates total frames label."""
        sequence_widget.set_total_frames(200)
        assert sequence_widget.total_frames_label.text() == "/ 200"

    def test_set_total_frames_sets_range_to_full(self, sequence_widget):
        """Test that set_total_frames sets range to full sequence."""
        sequence_widget.set_total_frames(75)
        assert sequence_widget.range_start_spin.value() == 1
        assert sequence_widget.range_end_spin.value() == 75

    def test_set_total_frames_negative_becomes_zero(self, sequence_widget):
        """Test that negative total frames becomes 0."""
        sequence_widget.set_total_frames(-10)
        assert sequence_widget._total_frames == 0

    def test_set_total_frames_zero(self, sequence_widget):
        """Test setting total frames to zero."""
        sequence_widget.set_total_frames(0)
        assert sequence_widget._total_frames == 0
        assert sequence_widget.range_start_spin.maximum() == 1  # Minimum is 1


class TestSetCurrentFrame:
    """Tests for set_current_frame method."""

    def test_set_current_frame_updates_spinbox(self, sequence_widget):
        """Test that set_current_frame updates frame spinbox."""
        sequence_widget.set_total_frames(100)
        sequence_widget.set_current_frame(50)
        # Note: set_current_frame uses 0-indexed, spinbox shows 1-indexed
        assert sequence_widget.frame_spin.value() == 51

    def test_set_current_frame_zero_indexed(self, sequence_widget):
        """Test that frame index is 0-indexed internally."""
        sequence_widget.set_total_frames(10)
        sequence_widget.set_current_frame(0)
        assert sequence_widget.frame_spin.value() == 1


class TestReferenceFrames:
    """Tests for reference frame methods."""

    def test_set_reference_frames_updates_label(self, sequence_widget):
        """Test that set_reference_frames updates reference label."""
        sequence_widget.set_reference_frames([5])
        assert "6" in sequence_widget.reference_label.text()  # 1-indexed display

    def test_set_reference_frames_includes_star(self, sequence_widget):
        """Test that reference label includes star character."""
        sequence_widget.set_reference_frames([10])
        assert "\u2605" in sequence_widget.reference_label.text()

    def test_set_reference_frames_empty_shows_none(self, sequence_widget):
        """Test that empty reference frames shows 'None'."""
        sequence_widget.set_reference_frames([5])  # First set it
        sequence_widget.set_reference_frames([])  # Then clear
        assert sequence_widget.reference_label.text() == "None"

    def test_set_reference_frames_updates_internal_state(self, sequence_widget):
        """Test that set_reference_frames updates internal state."""
        sequence_widget.set_reference_frames([42])
        assert sequence_widget._reference_frames == [42]

    def test_add_reference_frame_adds_to_list(self, sequence_widget):
        """Test that add_reference_frame adds to the list."""
        sequence_widget.add_reference_frame(5)
        assert 5 in sequence_widget._reference_frames
        sequence_widget.add_reference_frame(10)
        assert 5 in sequence_widget._reference_frames
        assert 10 in sequence_widget._reference_frames

    def test_add_reference_frame_no_duplicates(self, sequence_widget):
        """Test that add_reference_frame doesn't add duplicates."""
        sequence_widget.add_reference_frame(5)
        sequence_widget.add_reference_frame(5)
        assert sequence_widget._reference_frames.count(5) == 1

    def test_clear_reference_frames(self, sequence_widget):
        """Test that clear_reference_frames clears the list."""
        sequence_widget.add_reference_frame(5)
        sequence_widget.add_reference_frame(10)
        sequence_widget.clear_reference_frames()
        assert sequence_widget._reference_frames == []
        assert sequence_widget.reference_label.text() == "None"

    def test_multiple_reference_frames_display(self, sequence_widget):
        """Test display with multiple reference frames."""
        sequence_widget.set_reference_frames([0, 1, 2])
        # Should show "Frames: 1, 2, 3" (1-indexed)
        assert "1" in sequence_widget.reference_label.text()
        assert "2" in sequence_widget.reference_label.text()
        assert "3" in sequence_widget.reference_label.text()

    def test_many_reference_frames_shows_count(self, sequence_widget):
        """Test that many reference frames shows count."""
        sequence_widget.set_reference_frames([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
        # Should show abbreviated display with total count
        assert "total" in sequence_widget.reference_label.text()


class TestSetFlaggedCount:
    """Tests for set_flagged_count method."""

    def test_set_flagged_count_updates_label(self, sequence_widget):
        """Test that set_flagged_count updates flagged label."""
        sequence_widget.set_flagged_count(15)
        assert sequence_widget.flagged_label.text() == "15"

    def test_set_flagged_count_updates_internal_state(self, sequence_widget):
        """Test that set_flagged_count updates internal state."""
        sequence_widget.set_flagged_count(7)
        assert sequence_widget._flagged_count == 7

    def test_set_flagged_count_enables_nav_buttons(self, sequence_widget):
        """Test that having flagged frames enables navigation buttons."""
        sequence_widget.set_flagged_count(5)
        assert sequence_widget.prev_flagged_btn.isEnabled()
        assert sequence_widget.next_flagged_btn.isEnabled()

    def test_set_flagged_count_zero_disables_nav_buttons(self, sequence_widget):
        """Test that zero flagged frames disables navigation buttons."""
        sequence_widget.set_flagged_count(5)  # First enable
        sequence_widget.set_flagged_count(0)  # Then disable
        assert not sequence_widget.prev_flagged_btn.isEnabled()
        assert not sequence_widget.next_flagged_btn.isEnabled()


class TestButtonStates:
    """Tests for button state management."""

    def test_propagation_button_disabled_without_reference(self, sequence_widget):
        """Test that propagation button is disabled without reference frame."""
        sequence_widget.set_total_frames(100)
        # No reference set, button should be disabled
        assert not sequence_widget.propagate_btn.isEnabled()

    def test_propagation_button_disabled_without_frames(self, sequence_widget):
        """Test that propagation button is disabled without frames."""
        sequence_widget.add_reference_frame(0)
        # No frames, button should be disabled
        assert not sequence_widget.propagate_btn.isEnabled()

    def test_propagation_button_enabled_with_reference_and_frames(
        self, sequence_widget
    ):
        """Test that propagation button is enabled with reference and frames."""
        sequence_widget.set_total_frames(100)
        sequence_widget.add_reference_frame(50)
        assert sequence_widget.propagate_btn.isEnabled()

    def test_propagation_button_disabled_during_propagation(self, sequence_widget):
        """Test that propagation button is disabled during propagation."""
        sequence_widget.set_total_frames(100)
        sequence_widget.add_reference_frame(50)
        sequence_widget.start_propagation()
        assert not sequence_widget.propagate_btn.isEnabled()

    def test_clear_references_button_disabled_without_references(self, sequence_widget):
        """Test that clear references button is disabled without references."""
        assert not sequence_widget.clear_references_btn.isEnabled()

    def test_clear_references_button_enabled_with_references(self, sequence_widget):
        """Test that clear references button is enabled with references."""
        sequence_widget.add_reference_frame(5)
        assert sequence_widget.clear_references_btn.isEnabled()


class TestPropagationState:
    """Tests for propagation state management."""

    def test_start_propagation_sets_flag(self, sequence_widget):
        """Test that start_propagation sets the propagating flag."""
        sequence_widget.start_propagation()
        assert sequence_widget._is_propagating is True

    def test_end_propagation_clears_flag(self, sequence_widget):
        """Test that end_propagation clears the propagating flag."""
        sequence_widget.start_propagation()
        sequence_widget.end_propagation()
        assert sequence_widget._is_propagating is False

    def test_set_propagation_progress_does_not_crash(self, sequence_widget):
        """Test that set_propagation_progress doesn't crash (progress bar removed)."""
        sequence_widget.start_propagation()
        # Should not raise even though progress bar was removed
        sequence_widget.set_propagation_progress(50, 100)


class TestReset:
    """Tests for reset method."""

    def test_reset_clears_reference_frames(self, sequence_widget):
        """Test that reset clears reference frames."""
        sequence_widget.add_reference_frame(50)
        sequence_widget.add_reference_frame(51)
        sequence_widget.reset()
        assert sequence_widget._reference_frames == []
        assert sequence_widget.reference_label.text() == "None"

    def test_reset_clears_flagged_count(self, sequence_widget):
        """Test that reset clears flagged count."""
        sequence_widget.set_flagged_count(10)
        sequence_widget.reset()
        assert sequence_widget._flagged_count == 0
        assert sequence_widget.flagged_label.text() == "0"

    def test_reset_clears_propagation_state(self, sequence_widget):
        """Test that reset clears propagation state."""
        sequence_widget.start_propagation()
        sequence_widget.reset()
        assert sequence_widget._is_propagating is False


class TestSignals:
    """Tests for signal emissions."""

    def test_add_reference_button_emits_signal(self, sequence_widget, qtbot):
        """Test that Add Reference button emits signal."""
        with qtbot.waitSignal(sequence_widget.add_reference_requested):
            sequence_widget.add_reference_btn.click()

    def test_clear_references_button_emits_signal(self, sequence_widget, qtbot):
        """Test that Clear References button emits signal."""
        sequence_widget.add_reference_frame(5)  # Enable the button
        with qtbot.waitSignal(sequence_widget.clear_references_requested):
            sequence_widget.clear_references_btn.click()

    def test_add_all_before_button_emits_signal(self, sequence_widget, qtbot):
        """Test that Add All Before button emits signal."""
        with qtbot.waitSignal(sequence_widget.add_all_before_requested):
            sequence_widget.add_all_before_btn.click()

    def test_propagate_button_emits_signal_with_both_direction(
        self, sequence_widget, qtbot
    ):
        """Test that propagate button emits signal with 'both' direction."""
        sequence_widget.set_total_frames(100)
        sequence_widget.add_reference_frame(50)
        with qtbot.waitSignal(sequence_widget.propagate_requested) as blocker:
            sequence_widget.propagate_btn.click()
        # Always bidirectional now
        assert blocker.args[0] == "both"

    def test_next_flagged_button_emits_signal(self, sequence_widget, qtbot):
        """Test that next flagged button emits signal."""
        sequence_widget.set_flagged_count(5)  # Enable button
        with qtbot.waitSignal(sequence_widget.next_flagged_requested):
            sequence_widget.next_flagged_btn.click()

    def test_prev_flagged_button_emits_signal(self, sequence_widget, qtbot):
        """Test that prev flagged button emits signal."""
        sequence_widget.set_flagged_count(5)  # Enable button
        with qtbot.waitSignal(sequence_widget.prev_flagged_requested):
            sequence_widget.prev_flagged_btn.click()

    def test_propagate_signal_includes_range(self, sequence_widget, qtbot):
        """Test that propagate signal includes correct range."""
        sequence_widget.set_total_frames(100)
        sequence_widget.add_reference_frame(50)
        with qtbot.waitSignal(sequence_widget.propagate_requested) as blocker:
            sequence_widget.propagate_btn.click()
        # Range should be 0 to 99 (0-indexed)
        direction, start, end, skip_flagged = blocker.args
        assert start == 0
        assert end == 99

    def test_propagate_signal_with_custom_range(self, sequence_widget, qtbot):
        """Test that propagate signal uses custom range when specified."""
        sequence_widget.set_total_frames(100)
        sequence_widget.add_reference_frame(50)
        sequence_widget.range_start_spin.setValue(10)
        sequence_widget.range_end_spin.setValue(80)
        with qtbot.waitSignal(sequence_widget.propagate_requested) as blocker:
            sequence_widget.propagate_btn.click()
        direction, start, end, skip_flagged = blocker.args
        # Values are converted to 0-indexed
        assert start == 9
        assert end == 79

    def test_propagate_signal_includes_skip_flagged(self, sequence_widget, qtbot):
        """Test that propagate signal includes skip_flagged parameter."""
        sequence_widget.set_total_frames(100)
        sequence_widget.add_reference_frame(50)
        sequence_widget.skip_flagged_checkbox.setChecked(True)
        with qtbot.waitSignal(sequence_widget.propagate_requested) as blocker:
            sequence_widget.propagate_btn.click()
        direction, start, end, skip_flagged = blocker.args
        assert skip_flagged is True

    def test_propagate_signal_skip_flagged_unchecked(self, sequence_widget, qtbot):
        """Test that propagate signal passes False when skip_flagged is unchecked."""
        sequence_widget.set_total_frames(100)
        sequence_widget.add_reference_frame(50)
        sequence_widget.skip_flagged_checkbox.setChecked(False)
        with qtbot.waitSignal(sequence_widget.propagate_requested) as blocker:
            sequence_widget.propagate_btn.click()
        direction, start, end, skip_flagged = blocker.args
        assert skip_flagged is False


class TestAddAllLabeledButton:
    """Tests for the Add All Labeled button."""

    def test_add_all_labeled_button_exists(self, sequence_widget):
        """Test that the Add All Labeled button exists."""
        assert sequence_widget.add_all_labeled_btn is not None

    def test_add_all_labeled_button_emits_signal(self, sequence_widget, qtbot):
        """Test that Add All Labeled button emits the correct signal."""
        with qtbot.waitSignal(sequence_widget.add_all_labeled_requested):
            sequence_widget.add_all_labeled_btn.click()

    def test_add_all_labeled_button_tooltip(self, sequence_widget):
        """Test that the button has an appropriate tooltip."""
        assert "NPZ" in sequence_widget.add_all_labeled_btn.toolTip()


class TestTrimUI:
    """Tests for the trim section UI."""

    def test_trim_group_exists(self, sequence_widget):
        """Test that the trim group box exists."""
        assert sequence_widget.trim_group is not None

    def test_trim_group_hidden_initially(self, sequence_widget):
        """Test that trim group is hidden before timeline is built."""
        assert sequence_widget.trim_group.isHidden()

    def test_trim_group_shown_after_timeline_built(self, sequence_widget):
        """Test that trim group is not hidden after timeline is built."""
        sequence_widget.set_timeline_built(True)
        assert not sequence_widget.trim_group.isHidden()

    def test_trim_buttons_exist(self, sequence_widget):
        """Test that all trim buttons exist."""
        assert sequence_widget.set_trim_left_btn is not None
        assert sequence_widget.set_trim_right_btn is not None
        assert sequence_widget.clear_trim_btn is not None
        assert sequence_widget.trim_range_btn is not None

    def test_trim_range_disabled_without_bounds(self, sequence_widget):
        """Test that Trim Range button is disabled without both bounds."""
        assert not sequence_widget.trim_range_btn.isEnabled()

    def test_trim_range_enabled_with_both_bounds(self, sequence_widget):
        """Test that Trim Range button is enabled when both bounds are set."""
        sequence_widget.set_trim_left("frame_001.png")
        sequence_widget.set_trim_right("frame_010.png")
        assert sequence_widget.trim_range_btn.isEnabled()

    def test_clear_trim_disabled_without_bounds(self, sequence_widget):
        """Test that Clear Trim button is disabled without any bounds."""
        assert not sequence_widget.clear_trim_btn.isEnabled()

    def test_clear_trim_enabled_with_left_bound(self, sequence_widget):
        """Test that Clear Trim is enabled when left bound is set."""
        sequence_widget.set_trim_left("frame_001.png")
        assert sequence_widget.clear_trim_btn.isEnabled()

    def test_set_trim_left_updates_label(self, sequence_widget):
        """Test that set_trim_left updates the label text."""
        sequence_widget.set_trim_left("frame_005.png")
        assert sequence_widget.trim_left_label.text() == "frame_005.png"

    def test_set_trim_right_updates_label(self, sequence_widget):
        """Test that set_trim_right updates the label text."""
        sequence_widget.set_trim_right("frame_020.png")
        assert sequence_widget.trim_right_label.text() == "frame_020.png"

    def test_get_trim_range(self, sequence_widget):
        """Test that get_trim_range returns the current trim selection."""
        sequence_widget.set_trim_left("a.png")
        sequence_widget.set_trim_right("b.png")
        assert sequence_widget.get_trim_range() == ("a.png", "b.png")

    def test_get_trim_range_none_initially(self, sequence_widget):
        """Test that get_trim_range returns (None, None) initially."""
        assert sequence_widget.get_trim_range() == (None, None)

    def test_clear_trim_resets_labels(self, sequence_widget):
        """Test that clear_trim resets labels and state."""
        sequence_widget.set_trim_left("a.png")
        sequence_widget.set_trim_right("b.png")
        sequence_widget.clear_trim()
        assert sequence_widget.trim_left_label.text() == "Not set"
        assert sequence_widget.trim_right_label.text() == "Not set"
        assert sequence_widget.get_trim_range() == (None, None)

    def test_set_trim_left_signal(self, sequence_widget, qtbot):
        """Test that Set Left button emits signal."""
        with qtbot.waitSignal(sequence_widget.set_trim_left_requested):
            sequence_widget.set_trim_left_btn.click()

    def test_set_trim_right_signal(self, sequence_widget, qtbot):
        """Test that Set Right button emits signal."""
        with qtbot.waitSignal(sequence_widget.set_trim_right_requested):
            sequence_widget.set_trim_right_btn.click()

    def test_trim_range_signal(self, sequence_widget, qtbot):
        """Test that Trim Range button emits signal when enabled."""
        sequence_widget.set_trim_left("a.png")
        sequence_widget.set_trim_right("b.png")
        with qtbot.waitSignal(sequence_widget.trim_range_requested):
            sequence_widget.trim_range_btn.click()

    def test_clear_trim_signal(self, sequence_widget, qtbot):
        """Test that Clear Trim button emits signal."""
        sequence_widget.set_trim_left("a.png")
        with qtbot.waitSignal(sequence_widget.clear_trim_requested):
            sequence_widget.clear_trim_btn.click()

    def test_reset_clears_trim(self, sequence_widget):
        """Test that reset clears trim state."""
        sequence_widget.set_trim_left("a.png")
        sequence_widget.set_trim_right("b.png")
        sequence_widget.reset()
        assert sequence_widget.get_trim_range() == (None, None)
        assert sequence_widget.trim_left_label.text() == "Not set"


class TestHistogramButton:
    """Tests for the histogram button."""

    def test_histogram_button_exists(self, sequence_widget):
        """Test that the histogram button exists."""
        assert sequence_widget.histogram_btn is not None

    def test_histogram_button_text(self, sequence_widget):
        """Test that the histogram button has correct text."""
        assert sequence_widget.histogram_btn.text() == "Hist"

    def test_histogram_button_tooltip(self, sequence_widget):
        """Test that the histogram button has a tooltip."""
        assert "histogram" in sequence_widget.histogram_btn.toolTip().lower()

    def test_histogram_button_max_width(self, sequence_widget):
        """Test that the histogram button has constrained width."""
        assert sequence_widget.histogram_btn.maximumWidth() == 40

    def test_histogram_button_emits_signal(self, sequence_widget, qtbot):
        """Test that histogram button emits show_histogram_requested signal."""
        with qtbot.waitSignal(sequence_widget.show_histogram_requested):
            sequence_widget.histogram_btn.click()
