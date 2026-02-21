"""Sequence controls widget for propagation operations.

Provides UI controls for sequence mode operations including
timeline setup, reference frame selection, propagation controls, and review navigation.
"""

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QKeyEvent
from PyQt6.QtWidgets import (
    QCheckBox,
    QDoubleSpinBox,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)


class ShortcutSpinBox(QSpinBox):
    """SpinBox that ignores WASD keys to allow global shortcuts to work."""

    def keyPressEvent(self, event: QKeyEvent) -> None:
        """Ignore WASD keys so pan shortcuts work globally."""
        if event.key() in (Qt.Key.Key_W, Qt.Key.Key_A, Qt.Key.Key_S, Qt.Key.Key_D):
            event.ignore()
            return
        super().keyPressEvent(event)


class ShortcutDoubleSpinBox(QDoubleSpinBox):
    """DoubleSpinBox that ignores WASD keys to allow global shortcuts to work."""

    def keyPressEvent(self, event: QKeyEvent) -> None:
        """Ignore WASD keys so pan shortcuts work globally."""
        if event.key() in (Qt.Key.Key_W, Qt.Key.Key_A, Qt.Key.Key_S, Qt.Key.Key_D):
            event.ignore()
            return
        super().keyPressEvent(event)


class SequenceWidget(QWidget):
    """Control panel for sequence mode operations.

    Provides controls for:
    - Timeline setup (set start/end, build timeline)
    - Setting reference frame
    - Propagation direction and range
    - Progress monitoring
    - Review navigation for flagged frames
    """

    # Signals - Timeline Setup
    set_start_requested = pyqtSignal()  # Request to set current file as start
    set_end_requested = pyqtSignal()  # Request to set current file as end
    clear_range_requested = pyqtSignal()  # Request to clear start/end selection
    build_timeline_requested = pyqtSignal()  # Request to build timeline from range
    exit_timeline_requested = pyqtSignal()  # Request to exit timeline and start fresh

    # Signals - Propagation
    add_reference_requested = pyqtSignal()  # Request to add current frame as reference
    add_all_before_requested = (
        pyqtSignal()
    )  # Request to add all frames before current as reference
    add_all_labeled_requested = (
        pyqtSignal()
    )  # Request to add all frames with NPZ labels as reference
    clear_references_requested = pyqtSignal()  # Request to clear all references
    propagate_requested = pyqtSignal(
        str, int, int, bool
    )  # direction, start, end, skip_flagged
    cancel_propagation_requested = pyqtSignal()
    next_flagged_requested = pyqtSignal()
    prev_flagged_requested = pyqtSignal()
    jump_to_frame_requested = pyqtSignal(int)
    confidence_threshold_changed = pyqtSignal(float)  # threshold value 0.0-1.0

    # Signals - Trim
    set_trim_left_requested = pyqtSignal()
    set_trim_right_requested = pyqtSignal()
    trim_range_requested = pyqtSignal()
    clear_trim_requested = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)

        self._total_frames = 0
        self._reference_frames: list[int] = []  # List of reference frame indices
        self._flagged_count = 0
        self._propagated_count = 0
        self._is_propagating = False
        self._timeline_built = False
        self._start_frame_name: str | None = None
        self._end_frame_name: str | None = None
        self._trim_left_name: str | None = None
        self._trim_right_name: str | None = None

        self._setup_ui()

    # Shared QGroupBox styling
    _GROUP_STYLE = (
        "QGroupBox { border: 1px solid #555; border-radius: 4px;"
        " margin-top: 8px; padding-top: 4px; }"
        "QGroupBox::title { subcontrol-origin: margin;"
        " left: 8px; padding: 0 4px; color: #CCC; }"
    )

    def _setup_ui(self) -> None:
        """Create the UI layout."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(8)

        # Timeline Setup Section (shown before timeline is built)
        self.setup_group = QGroupBox("Timeline Setup")
        self.setup_group.setStyleSheet(self._GROUP_STYLE)
        setup_layout = QVBoxLayout(self.setup_group)
        setup_layout.setContentsMargins(6, 8, 6, 6)
        setup_layout.setSpacing(4)

        # Instructions
        instructions = QLabel(
            "1. Navigate to start frame in file list\n"
            "2. Click 'Set Start'\n"
            "3. Navigate to end frame\n"
            "4. Click 'Set End'\n"
            "5. Click 'Build Timeline'"
        )
        instructions.setStyleSheet("color: #AAAAAA; font-size: 11px;")
        instructions.setWordWrap(True)
        setup_layout.addWidget(instructions)

        # Start/End display
        range_display_layout = QHBoxLayout()
        range_display_layout.addWidget(QLabel("Start:"))
        self.start_label = QLabel("Not set")
        self.start_label.setStyleSheet("font-weight: bold; color: #4CAF50;")
        self.start_label.setWordWrap(True)
        range_display_layout.addWidget(self.start_label, 1)
        setup_layout.addLayout(range_display_layout)

        range_display_layout2 = QHBoxLayout()
        range_display_layout2.addWidget(QLabel("End:"))
        self.end_label = QLabel("Not set")
        self.end_label.setStyleSheet("font-weight: bold; color: #F44336;")
        self.end_label.setWordWrap(True)
        range_display_layout2.addWidget(self.end_label, 1)
        setup_layout.addLayout(range_display_layout2)

        # Set Start/End buttons
        set_btn_layout = QHBoxLayout()
        self.set_start_btn = QPushButton("Set Start")
        self.set_start_btn.setToolTip("Mark current file as sequence start")
        self.set_start_btn.setStyleSheet(
            "QPushButton { background-color: #4CAF50; color: black; font-weight: bold; }"
        )
        self.set_start_btn.clicked.connect(self.set_start_requested.emit)
        set_btn_layout.addWidget(self.set_start_btn)

        self.set_end_btn = QPushButton("Set End")
        self.set_end_btn.setToolTip("Mark current file as sequence end")
        self.set_end_btn.setStyleSheet(
            "QPushButton { background-color: #F44336; color: black; font-weight: bold; }"
        )
        self.set_end_btn.clicked.connect(self.set_end_requested.emit)
        set_btn_layout.addWidget(self.set_end_btn)
        setup_layout.addLayout(set_btn_layout)

        # Clear and Build buttons
        action_btn_layout = QHBoxLayout()
        self.clear_range_btn = QPushButton("Clear")
        self.clear_range_btn.setToolTip("Clear start/end selection")
        self.clear_range_btn.clicked.connect(self._on_clear_range)
        self.clear_range_btn.setEnabled(False)
        action_btn_layout.addWidget(self.clear_range_btn)

        self.build_timeline_btn = QPushButton("Build Timeline")
        self.build_timeline_btn.setToolTip("Build timeline from selected range")
        self.build_timeline_btn.setStyleSheet(
            "QPushButton { background-color: #2196F3; color: black; font-weight: bold; padding: 6px; }"
        )
        self.build_timeline_btn.clicked.connect(self.build_timeline_requested.emit)
        self.build_timeline_btn.setEnabled(False)
        action_btn_layout.addWidget(self.build_timeline_btn)
        setup_layout.addLayout(action_btn_layout)

        layout.addWidget(self.setup_group)

        # Reference Frame Section (hidden until timeline is built)
        self.ref_group = QGroupBox("Reference Frames")
        self.ref_group.setStyleSheet(self._GROUP_STYLE)
        ref_layout = QVBoxLayout(self.ref_group)
        ref_layout.setContentsMargins(6, 8, 6, 6)
        ref_layout.setSpacing(4)

        # Reference frame display
        ref_info_layout = QHBoxLayout()
        ref_info_layout.addWidget(QLabel("References:"))
        self.reference_label = QLabel("None")
        self.reference_label.setStyleSheet("font-weight: bold; color: #FFC107;")
        self.reference_label.setWordWrap(True)
        ref_info_layout.addWidget(self.reference_label, 1)
        ref_layout.addLayout(ref_info_layout)

        # Reference buttons - row 1
        ref_btn_layout = QHBoxLayout()
        self.add_reference_btn = QPushButton("+ Add Current")
        self.add_reference_btn.setToolTip(
            "Add current frame as reference for propagation (F)"
        )
        self.add_reference_btn.clicked.connect(self.add_reference_requested.emit)
        ref_btn_layout.addWidget(self.add_reference_btn)

        self.add_all_before_btn = QPushButton("+ All Before")
        self.add_all_before_btn.setToolTip(
            "Add all frames before current position as references"
        )
        self.add_all_before_btn.clicked.connect(self.add_all_before_requested.emit)
        ref_btn_layout.addWidget(self.add_all_before_btn)

        ref_layout.addLayout(ref_btn_layout)

        # Reference buttons - row 2
        ref_btn_layout2 = QHBoxLayout()
        self.add_all_labeled_btn = QPushButton("+ All Labeled")
        self.add_all_labeled_btn.setToolTip(
            "Add all frames with existing labels (NPZ files) as references"
        )
        self.add_all_labeled_btn.clicked.connect(self.add_all_labeled_requested.emit)
        ref_btn_layout2.addWidget(self.add_all_labeled_btn)

        self.clear_references_btn = QPushButton("Clear All")
        self.clear_references_btn.setToolTip("Clear all reference frames")
        self.clear_references_btn.clicked.connect(self.clear_references_requested.emit)
        self.clear_references_btn.setEnabled(False)
        ref_btn_layout2.addWidget(self.clear_references_btn)

        ref_layout.addLayout(ref_btn_layout2)

        layout.addWidget(self.ref_group)

        # Propagation Section (hidden until timeline is built)
        self.prop_group = QGroupBox("Propagation")
        self.prop_group.setStyleSheet(self._GROUP_STYLE)
        prop_layout = QVBoxLayout(self.prop_group)
        prop_layout.setContentsMargins(6, 8, 6, 6)
        prop_layout.setSpacing(4)

        # Propagate button (always bidirectional from all reference frames)
        self.propagate_btn = QPushButton("Propagate")
        self.propagate_btn.setToolTip(
            "Propagate masks from all reference frames to fill the sequence (Ctrl+P)"
        )
        self.propagate_btn.setStyleSheet(
            "QPushButton { background-color: #4CAF50; color: black; font-weight: bold; padding: 8px; }"
        )
        self.propagate_btn.clicked.connect(self._request_propagate)
        prop_layout.addWidget(self.propagate_btn)

        # Range, skip flagged, and confidence all on one row
        options_layout = QHBoxLayout()

        # Range inputs
        options_layout.addWidget(QLabel("Range:"))
        self.range_start_spin = ShortcutSpinBox()
        self.range_start_spin.setMinimum(1)
        self.range_start_spin.setMaximum(1)
        self.range_start_spin.setToolTip("Start frame (1-indexed)")
        options_layout.addWidget(self.range_start_spin)

        options_layout.addWidget(QLabel("-"))

        self.range_end_spin = ShortcutSpinBox()
        self.range_end_spin.setMinimum(1)
        self.range_end_spin.setMaximum(1)
        self.range_end_spin.setToolTip("End frame (1-indexed)")
        options_layout.addWidget(self.range_end_spin)

        # Skip flagged checkbox
        self.skip_flagged_checkbox = QCheckBox("Skip Low Conf")
        self.skip_flagged_checkbox.setChecked(True)
        self.skip_flagged_checkbox.setToolTip(
            "Skip low confidence frames (won't get masks)"
        )
        options_layout.addWidget(self.skip_flagged_checkbox)

        # Confidence threshold
        options_layout.addWidget(QLabel("Min Conf:"))
        self.confidence_spin = ShortcutDoubleSpinBox()
        self.confidence_spin.setRange(0.0, 1.0)
        self.confidence_spin.setSingleStep(0.05)
        self.confidence_spin.setValue(0.99)
        self.confidence_spin.setDecimals(4)
        self.confidence_spin.setToolTip("Frames below this confidence will be flagged")
        self.confidence_spin.valueChanged.connect(
            self.confidence_threshold_changed.emit
        )
        options_layout.addWidget(self.confidence_spin)

        prop_layout.addLayout(options_layout)

        layout.addWidget(self.prop_group)

        # Review Section (hidden until timeline is built)
        self.review_group = QGroupBox("Review")
        self.review_group.setStyleSheet(self._GROUP_STYLE)
        review_layout = QVBoxLayout(self.review_group)
        review_layout.setContentsMargins(6, 8, 6, 6)
        review_layout.setSpacing(4)

        # Flagged count
        flagged_layout = QHBoxLayout()
        flagged_layout.addWidget(QLabel("Flagged frames:"))
        self.flagged_label = QLabel("0")
        self.flagged_label.setStyleSheet("font-weight: bold; color: #F44336;")
        flagged_layout.addWidget(self.flagged_label)
        flagged_layout.addStretch()
        review_layout.addLayout(flagged_layout)

        # Navigation buttons
        nav_layout = QHBoxLayout()
        self.prev_flagged_btn = QPushButton("\u2190 Prev Flagged")
        self.prev_flagged_btn.setToolTip("Go to previous flagged frame (Shift+N)")
        self.prev_flagged_btn.clicked.connect(self.prev_flagged_requested.emit)
        self.prev_flagged_btn.setEnabled(False)
        nav_layout.addWidget(self.prev_flagged_btn)

        self.next_flagged_btn = QPushButton("Next Flagged \u2192")
        self.next_flagged_btn.setToolTip("Go to next flagged frame (N)")
        self.next_flagged_btn.clicked.connect(self.next_flagged_requested.emit)
        self.next_flagged_btn.setEnabled(False)
        nav_layout.addWidget(self.next_flagged_btn)

        review_layout.addLayout(nav_layout)

        layout.addWidget(self.review_group)

        # Trim Section (hidden until timeline is built)
        self.trim_group = QGroupBox("Trim")
        self.trim_group.setStyleSheet(self._GROUP_STYLE)
        trim_layout = QVBoxLayout(self.trim_group)
        trim_layout.setContentsMargins(6, 8, 6, 6)
        trim_layout.setSpacing(4)

        # Left/Right frame labels
        trim_display = QHBoxLayout()
        trim_display.addWidget(QLabel("Left:"))
        self.trim_left_label = QLabel("Not set")
        self.trim_left_label.setStyleSheet("font-weight: bold; color: #8B4513;")
        self.trim_left_label.setWordWrap(True)
        trim_display.addWidget(self.trim_left_label, 1)
        trim_layout.addLayout(trim_display)

        trim_display2 = QHBoxLayout()
        trim_display2.addWidget(QLabel("Right:"))
        self.trim_right_label = QLabel("Not set")
        self.trim_right_label.setStyleSheet("font-weight: bold; color: #8B4513;")
        self.trim_right_label.setWordWrap(True)
        trim_display2.addWidget(self.trim_right_label, 1)
        trim_layout.addLayout(trim_display2)

        # Set Left/Right buttons
        trim_set_layout = QHBoxLayout()
        self.set_trim_left_btn = QPushButton("Set Left")
        self.set_trim_left_btn.setToolTip("Mark current frame as trim left bound")
        self.set_trim_left_btn.clicked.connect(self.set_trim_left_requested.emit)
        trim_set_layout.addWidget(self.set_trim_left_btn)

        self.set_trim_right_btn = QPushButton("Set Right")
        self.set_trim_right_btn.setToolTip("Mark current frame as trim right bound")
        self.set_trim_right_btn.clicked.connect(self.set_trim_right_requested.emit)
        trim_set_layout.addWidget(self.set_trim_right_btn)
        trim_layout.addLayout(trim_set_layout)

        # Clear Trim / Trim Range buttons
        trim_action_layout = QHBoxLayout()
        self.clear_trim_btn = QPushButton("Clear Trim")
        self.clear_trim_btn.setToolTip("Reset trim selection")
        self.clear_trim_btn.clicked.connect(self._on_clear_trim)
        self.clear_trim_btn.setEnabled(False)
        trim_action_layout.addWidget(self.clear_trim_btn)

        self.trim_range_btn = QPushButton("Trim Range")
        self.trim_range_btn.setToolTip(
            "Remove all frames within the selected range (inclusive)"
        )
        self.trim_range_btn.setStyleSheet(
            "QPushButton { background-color: #8B4513; color: white; font-weight: bold; }"
            "QPushButton:hover { background-color: #A0522D; }"
        )
        self.trim_range_btn.clicked.connect(self.trim_range_requested.emit)
        self.trim_range_btn.setEnabled(False)
        trim_action_layout.addWidget(self.trim_range_btn)
        trim_layout.addLayout(trim_action_layout)

        layout.addWidget(self.trim_group)

        # New Timeline button (hidden until timeline is built)
        self.new_timeline_btn = QPushButton("New Timeline")
        self.new_timeline_btn.setToolTip(
            "Exit current timeline and select a new range.\n"
            "This will clear all propagation results."
        )
        self.new_timeline_btn.setStyleSheet(
            "QPushButton { background-color: #8B4513; color: white; padding: 6px; font-weight: bold; }"
            "QPushButton:hover { background-color: #A0522D; }"
        )
        self.new_timeline_btn.clicked.connect(self.exit_timeline_requested.emit)
        self.new_timeline_btn.setVisible(False)  # Hidden until timeline is built
        layout.addWidget(self.new_timeline_btn)

        # Hidden spinbox for programmatic frame tracking (used by set_current_frame)
        self.frame_spin = ShortcutSpinBox()
        self.frame_spin.setMinimum(1)
        self.frame_spin.setMaximum(1)
        self.frame_spin.setVisible(False)  # Hidden - timeline is used for navigation

        self.total_frames_label = QLabel("/ 0")
        self.total_frames_label.setVisible(False)  # Hidden

        # Stretch at bottom
        layout.addStretch()

        # Initial state - hide propagation controls until timeline is built
        self._update_button_states()
        self._update_timeline_visibility()

    def _request_propagate(self) -> None:
        """Request propagation (bidirectional within specified range)."""
        # Immediate visual feedback that click was registered
        self.propagate_btn.setText("Starting...")
        self.propagate_btn.setStyleSheet(
            "QPushButton { background-color: #FFC107; color: black; font-weight: bold; padding: 8px; }"
        )
        self.propagate_btn.repaint()  # Force immediate repaint

        start = self.range_start_spin.value() - 1  # Convert to 0-indexed
        end = self.range_end_spin.value() - 1
        skip_flagged = self.skip_flagged_checkbox.isChecked()
        self.propagate_requested.emit("both", start, end, skip_flagged)

    def _update_button_states(self) -> None:
        """Update button enabled states based on current state."""
        has_references = len(self._reference_frames) > 0
        has_frames = self._total_frames > 0
        can_propagate = has_references and has_frames and not self._is_propagating

        self.propagate_btn.setEnabled(can_propagate)
        self.clear_references_btn.setEnabled(has_references)

        has_flagged = self._flagged_count > 0
        self.prev_flagged_btn.setEnabled(has_flagged)
        self.next_flagged_btn.setEnabled(has_flagged)

    def set_total_frames(self, count: int) -> None:
        """Set total number of frames."""
        self._total_frames = max(0, count)
        self.frame_spin.setMaximum(max(1, count))
        self.total_frames_label.setText(f"/ {count}")

        # Update range spinboxes to default to full sequence
        self.range_start_spin.setMaximum(max(1, count))
        self.range_end_spin.setMaximum(max(1, count))
        self.range_start_spin.setValue(1)
        self.range_end_spin.setValue(max(1, count))

        self._update_button_states()

    def set_current_frame(self, idx: int) -> None:
        """Update current frame display."""
        # Block signals to prevent recursive updates
        self.frame_spin.blockSignals(True)
        self.frame_spin.setValue(idx + 1)  # Convert to 1-indexed
        self.frame_spin.blockSignals(False)

    def set_reference_frames(self, indices: list[int]) -> None:
        """Update reference frames display.

        Args:
            indices: List of reference frame indices (0-indexed)
        """
        self._reference_frames = list(indices)
        if indices:
            # Show frame numbers (1-indexed for display)
            frame_nums = [str(idx + 1) for idx in sorted(indices)]
            if len(frame_nums) <= 5:
                self.reference_label.setText(f"Frames: {', '.join(frame_nums)} \u2605")
            else:
                # Show first few and count
                shown = ", ".join(frame_nums[:3])
                self.reference_label.setText(
                    f"Frames: {shown}... ({len(frame_nums)} total) \u2605"
                )
        else:
            self.reference_label.setText("None")
        self._update_button_states()

    def add_reference_frame(self, idx: int) -> None:
        """Add a reference frame to the list.

        Args:
            idx: Frame index to add (0-indexed)
        """
        if idx not in self._reference_frames:
            self._reference_frames.append(idx)
            self.set_reference_frames(self._reference_frames)

    def clear_reference_frames(self) -> None:
        """Clear all reference frames."""
        self._reference_frames.clear()
        self.set_reference_frames([])

    def set_flagged_count(self, count: int) -> None:
        """Update flagged frame count."""
        self._flagged_count = count
        self.flagged_label.setText(str(count))
        self._update_button_states()

    def set_propagated_count(self, count: int) -> None:
        """Update propagated frame count (enables save button)."""
        self._propagated_count = count
        self._update_button_states()

    def set_propagation_progress(self, current: int, total: int) -> None:
        """Update propagation progress (timeline handles visual feedback)."""
        # Progress is now shown via timeline status colors
        pass

    def start_propagation(self) -> None:
        """Enter propagation state (disable controls, show visual feedback)."""
        self._is_propagating = True
        # Change button to show propagation is in progress
        self.propagate_btn.setText("Propagating...")
        self.propagate_btn.setStyleSheet(
            "QPushButton { background-color: #FF9800; color: black; font-weight: bold; padding: 8px; }"
        )
        self._update_button_states()

    def end_propagation(self) -> None:
        """Exit propagation state (enable controls, restore button)."""
        self._is_propagating = False
        # Restore original button appearance
        self.propagate_btn.setText("Propagate")
        self.propagate_btn.setStyleSheet(
            "QPushButton { background-color: #4CAF50; color: black; font-weight: bold; padding: 8px; }"
        )
        self._update_button_states()

    def set_propagation_status(self, message: str) -> None:
        """Update propagation button text with status message.

        Args:
            message: Status message to display on the button
        """
        if self._is_propagating:
            self.propagate_btn.setText(message)
            self.propagate_btn.repaint()  # Force immediate repaint

    def reset(self) -> None:
        """Reset widget to initial state."""
        self._reference_frames.clear()
        self._flagged_count = 0
        self._is_propagating = False
        self._timeline_built = False
        self._start_frame_name = None
        self._end_frame_name = None
        self._trim_left_name = None
        self._trim_right_name = None
        self.reference_label.setText("None")
        self.flagged_label.setText("0")
        self.start_label.setText("Not set")
        self.end_label.setText("Not set")
        self.trim_left_label.setText("Not set")
        self.trim_right_label.setText("Not set")
        self._update_button_states()
        self._update_timeline_visibility()
        self._update_range_button_states()
        self._update_trim_button_states()

    def _update_timeline_visibility(self) -> None:
        """Show/hide UI sections based on timeline state."""
        # Setup section visible when timeline not built
        self.setup_group.setVisible(not self._timeline_built)

        # Propagation sections visible only when timeline is built
        self.ref_group.setVisible(self._timeline_built)
        self.prop_group.setVisible(self._timeline_built)
        self.review_group.setVisible(self._timeline_built)
        self.trim_group.setVisible(self._timeline_built)
        self.new_timeline_btn.setVisible(self._timeline_built)

    def _update_range_button_states(self) -> None:
        """Update range selection button states."""
        has_start = self._start_frame_name is not None
        has_end = self._end_frame_name is not None

        self.clear_range_btn.setEnabled(has_start or has_end)
        self.build_timeline_btn.setEnabled(has_start and has_end)

    def _on_clear_range(self) -> None:
        """Handle clear range button click."""
        self._start_frame_name = None
        self._end_frame_name = None
        self.start_label.setText("Not set")
        self.end_label.setText("Not set")
        self._update_range_button_states()
        self.clear_range_requested.emit()

    def set_start_frame(self, name: str) -> None:
        """Set the start frame for the sequence range.

        Args:
            name: Filename of the start frame
        """
        self._start_frame_name = name
        self.start_label.setText(name)
        self._update_range_button_states()

    def set_end_frame(self, name: str) -> None:
        """Set the end frame for the sequence range.

        Args:
            name: Filename of the end frame
        """
        self._end_frame_name = name
        self.end_label.setText(name)
        self._update_range_button_states()

    def get_range_names(self) -> tuple[str | None, str | None]:
        """Get the current range selection.

        Returns:
            Tuple of (start_name, end_name) or (None, None) if not set
        """
        return (self._start_frame_name, self._end_frame_name)

    def set_timeline_built(self, built: bool) -> None:
        """Set whether the timeline has been built.

        Args:
            built: True if timeline is built, False otherwise
        """
        self._timeline_built = built
        self._update_timeline_visibility()

    # --- Trim helpers ---

    def set_trim_left(self, frame_name: str) -> None:
        """Set the left bound of the trim range.

        Args:
            frame_name: Display name for the left bound frame
        """
        self._trim_left_name = frame_name
        self.trim_left_label.setText(frame_name)
        self._update_trim_button_states()

    def set_trim_right(self, frame_name: str) -> None:
        """Set the right bound of the trim range.

        Args:
            frame_name: Display name for the right bound frame
        """
        self._trim_right_name = frame_name
        self.trim_right_label.setText(frame_name)
        self._update_trim_button_states()

    def get_trim_range(self) -> tuple[str | None, str | None]:
        """Get the current trim selection.

        Returns:
            Tuple of (left_name, right_name)
        """
        return (self._trim_left_name, self._trim_right_name)

    def clear_trim(self) -> None:
        """Clear the trim selection."""
        self._trim_left_name = None
        self._trim_right_name = None
        self.trim_left_label.setText("Not set")
        self.trim_right_label.setText("Not set")
        self._update_trim_button_states()

    def _on_clear_trim(self) -> None:
        """Handle clear trim button click."""
        self.clear_trim()
        self.clear_trim_requested.emit()

    def _update_trim_button_states(self) -> None:
        """Update trim button enabled states."""
        has_left = self._trim_left_name is not None
        has_right = self._trim_right_name is not None
        self.clear_trim_btn.setEnabled(has_left or has_right)
        self.trim_range_btn.setEnabled(has_left and has_right)
