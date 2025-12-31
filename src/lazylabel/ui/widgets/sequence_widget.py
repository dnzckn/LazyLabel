"""Sequence controls widget for propagation operations.

Provides UI controls for sequence mode operations including
reference frame selection, propagation controls, and review navigation.
"""

from PyQt6.QtCore import pyqtSignal
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


class SequenceWidget(QWidget):
    """Control panel for sequence mode operations.

    Provides controls for:
    - Setting reference frame
    - Propagation direction and range
    - Progress monitoring
    - Review navigation for flagged frames
    """

    # Signals
    add_reference_requested = pyqtSignal()  # Request to add current frame as reference
    add_all_before_requested = (
        pyqtSignal()
    )  # Request to add all frames before current as reference
    clear_references_requested = pyqtSignal()  # Request to clear all references
    propagate_requested = pyqtSignal(
        str, int, int, bool
    )  # direction, start, end, skip_flagged
    cancel_propagation_requested = pyqtSignal()
    next_flagged_requested = pyqtSignal()
    prev_flagged_requested = pyqtSignal()
    jump_to_frame_requested = pyqtSignal(int)
    confidence_threshold_changed = pyqtSignal(float)  # threshold value 0.0-1.0

    def __init__(self, parent=None):
        super().__init__(parent)

        self._total_frames = 0
        self._reference_frames: list[int] = []  # List of reference frame indices
        self._flagged_count = 0
        self._propagated_count = 0
        self._is_propagating = False

        self._setup_ui()

    def _setup_ui(self) -> None:
        """Create the UI layout."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(8)

        # Reference Frame Section
        ref_group = QGroupBox("Reference Frames")
        ref_layout = QVBoxLayout(ref_group)

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
        self.clear_references_btn = QPushButton("Clear All")
        self.clear_references_btn.setToolTip("Clear all reference frames")
        self.clear_references_btn.clicked.connect(self.clear_references_requested.emit)
        self.clear_references_btn.setEnabled(False)
        ref_btn_layout2.addWidget(self.clear_references_btn)
        ref_btn_layout2.addStretch()

        ref_layout.addLayout(ref_btn_layout2)

        layout.addWidget(ref_group)

        # Propagation Section
        prop_group = QGroupBox("Propagation")
        prop_layout = QVBoxLayout(prop_group)

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
        self.range_start_spin = QSpinBox()
        self.range_start_spin.setMinimum(1)
        self.range_start_spin.setMaximum(1)
        self.range_start_spin.setToolTip("Start frame (1-indexed)")
        options_layout.addWidget(self.range_start_spin)

        options_layout.addWidget(QLabel("-"))

        self.range_end_spin = QSpinBox()
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
        self.confidence_spin = QDoubleSpinBox()
        self.confidence_spin.setRange(0.0, 1.0)
        self.confidence_spin.setSingleStep(0.05)
        self.confidence_spin.setValue(0.95)
        self.confidence_spin.setDecimals(2)
        self.confidence_spin.setToolTip("Frames below this confidence will be flagged")
        self.confidence_spin.valueChanged.connect(
            self.confidence_threshold_changed.emit
        )
        options_layout.addWidget(self.confidence_spin)

        prop_layout.addLayout(options_layout)

        layout.addWidget(prop_group)

        # Review Section
        review_group = QGroupBox("Review")
        review_layout = QVBoxLayout(review_group)

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

        layout.addWidget(review_group)

        # Hidden spinbox for programmatic frame tracking (used by set_current_frame)
        self.frame_spin = QSpinBox()
        self.frame_spin.setMinimum(1)
        self.frame_spin.setMaximum(1)
        self.frame_spin.setVisible(False)  # Hidden - timeline is used for navigation

        self.total_frames_label = QLabel("/ 0")
        self.total_frames_label.setVisible(False)  # Hidden

        # Stretch at bottom
        layout.addStretch()

        # Initial state
        self._update_button_states()

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

    def reset(self) -> None:
        """Reset widget to initial state."""
        self._reference_frames.clear()
        self._flagged_count = 0
        self._is_propagating = False
        self.reference_label.setText("None")
        self.flagged_label.setText("0")
        self._update_button_states()
