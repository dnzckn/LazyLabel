"""Timeline widget for sequence navigation.

Provides a visual timeline for navigating through image sequences
with color-coded frame statuses.
"""

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QBrush, QColor, QMouseEvent, QPainter, QPen
from PyQt6.QtWidgets import (
    QHBoxLayout,
    QPushButton,
    QSizePolicy,
    QToolTip,
    QVBoxLayout,
    QWidget,
)


class TimelineWidget(QWidget):
    """Visual timeline for navigating image sequences.

    Displays a horizontal bar representing all frames in a sequence,
    with color-coded indicators for frame status (reference, propagated,
    pending, flagged).
    """

    # Emitted when user clicks on a frame in the timeline
    frame_selected = pyqtSignal(int)

    # Status colors
    COLORS = {
        "reference": QColor(255, 193, 7),  # Gold/yellow for reference
        "propagated": QColor(76, 175, 80),  # Green for propagated
        "pending": QColor(100, 100, 100),  # Gray for pending
        "flagged": QColor(244, 67, 54),  # Red for flagged/needs review
        "saved": QColor(0, 188, 212),  # Cyan for saved to disk
        "skipped": QColor(139, 69, 19),  # Brown for dimension mismatch
        "current": QColor(33, 150, 243),  # Blue for current frame marker
    }

    # Sort priority: lower = further left when sorted
    _STATUS_PRIORITY = {
        "reference": 0,
        "saved": 1,
        "propagated": 2,
        "pending": 3,
        "flagged": 4,
        "skipped": 5,
    }

    def __init__(self, parent=None):
        super().__init__(parent)

        self.total_frames = 0
        self.current_frame = 0
        self.frame_statuses: dict[int, str] = {}  # idx -> status
        self._frame_names: list[str] = []
        self._confidence_scores: dict[int, float] = {}

        # Display order indirection for sorting
        self._display_order: list[int] = []  # display_pos -> real_idx
        self._reverse_order: dict[int, int] = {}  # real_idx -> display_pos
        self._sorted = False

        # Trim markers (real frame indices, or None)
        self._trim_left: int | None = None
        self._trim_right: int | None = None

        # Zoom / virtual scroll (no QScrollArea — widget stays fixed width)
        self._zoom = 1.0
        self._scroll_offset = 0  # first visible display position
        self._visible_count = 0  # frames visible at current zoom

        # UI settings
        self.setMinimumHeight(30)
        self.setMaximumHeight(40)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.setMouseTracking(True)

        # Cached geometry
        self._bar_rect = None
        self._frame_width = 0

    def set_frame_count(self, count: int) -> None:
        """Set total number of frames in the sequence."""
        self.total_frames = max(0, count)
        self.frame_statuses.clear()
        self._frame_names.clear()
        self._confidence_scores.clear()
        self._reset_display_order()
        self._invalidate_geometry()
        self.update()

    def _reset_display_order(self) -> None:
        """Reset display order to natural (file) order."""
        self._display_order = list(range(self.total_frames))
        self._reverse_order = {i: i for i in range(self.total_frames)}
        self._sorted = False

    def _rebuild_reverse_order(self) -> None:
        """Rebuild reverse lookup from current display order."""
        self._reverse_order = {
            real_idx: display_pos
            for display_pos, real_idx in enumerate(self._display_order)
        }

    def sort_by_status(self) -> None:
        """Sort display order by status priority, secondary by original index."""
        self._display_order = sorted(
            range(self.total_frames),
            key=lambda idx: (
                self._STATUS_PRIORITY.get(self.frame_statuses.get(idx, "pending"), 3),
                idx,
            ),
        )
        self._rebuild_reverse_order()
        self._sorted = True
        self.update()

    def reset_sort(self) -> None:
        """Restore natural file order."""
        self._reset_display_order()
        self.update()

    @property
    def is_sorted(self) -> bool:
        """Whether the timeline is currently sorted by status."""
        return self._sorted

    def set_zoom(self, zoom: float) -> None:
        """Set zoom level (1.0 = all frames visible)."""
        self._zoom = max(1.0, zoom)
        self._invalidate_geometry()
        self.update()

    def set_scroll_offset(self, offset: int) -> None:
        """Set the first visible display position, clamped to valid range."""
        max_offset = max(0, self.total_frames - self._visible_count)
        self._scroll_offset = max(0, min(offset, max_offset))
        self._invalidate_geometry()
        self.update()

    def center_on_frame(self, frame_idx: int) -> None:
        """Pan so the given frame is centered in the visible area."""
        display_pos = self._reverse_order.get(frame_idx, frame_idx)
        self.set_scroll_offset(display_pos - self._visible_count // 2)

    def set_trim_left(self, frame_idx: int | None) -> None:
        """Set or clear the left trim marker."""
        self._trim_left = frame_idx
        self.update()

    def set_trim_right(self, frame_idx: int | None) -> None:
        """Set or clear the right trim marker."""
        self._trim_right = frame_idx
        self.update()

    def set_frame_names(self, names: list[str]) -> None:
        """Set display names for each frame (e.g. filename stems)."""
        self._frame_names = list(names)

    def set_confidence_scores(self, scores: dict[int, float]) -> None:
        """Set confidence scores for frames."""
        self._confidence_scores = dict(scores)

    def set_current_frame(self, idx: int) -> None:
        """Update current frame indicator."""
        if 0 <= idx < self.total_frames:
            self.current_frame = idx
            self.update()

    def set_frame_status(self, idx: int, status: str, immediate: bool = False) -> None:
        """Update status for a frame.

        Args:
            idx: Frame index
            status: One of 'reference', 'propagated', 'pending', 'flagged'
            immediate: If True, force immediate repaint for animation
        """
        if 0 <= idx < self.total_frames:
            self.frame_statuses[idx] = status
            if immediate:
                self.repaint()  # Force immediate repaint for animation
            else:
                self.update()

    def set_batch_statuses(self, statuses: dict[int, str]) -> None:
        """Update multiple frame statuses at once."""
        for idx, status in statuses.items():
            if 0 <= idx < self.total_frames:
                self.frame_statuses[idx] = status
        self.update()

    def clear_statuses(self) -> None:
        """Clear all frame statuses."""
        self.frame_statuses.clear()
        self.update()

    def get_reference_frames(self) -> list[int]:
        """Get list of frames marked as reference."""
        return [
            idx for idx, status in self.frame_statuses.items() if status == "reference"
        ]

    def get_propagated_frames(self) -> list[int]:
        """Get list of frames that have been propagated."""
        return [
            idx for idx, status in self.frame_statuses.items() if status == "propagated"
        ]

    def get_flagged_frames(self) -> list[int]:
        """Get list of frames flagged for review."""
        return [
            idx for idx, status in self.frame_statuses.items() if status == "flagged"
        ]

    def _invalidate_geometry(self) -> None:
        """Invalidate cached geometry calculations."""
        self._bar_rect = None
        self._frame_width = 0

    def _calculate_geometry(self) -> None:
        """Calculate timeline bar geometry (zoom-aware)."""
        if self._bar_rect is not None:
            return

        margin = 5
        width = self.width() - 2 * margin
        height = self.height() - 2 * margin

        self._bar_rect = (margin, margin, width, height)

        if self.total_frames > 0:
            self._visible_count = max(1, int(self.total_frames / self._zoom))
            # Clamp scroll offset
            max_offset = max(0, self.total_frames - self._visible_count)
            self._scroll_offset = max(0, min(self._scroll_offset, max_offset))
            self._frame_width = width / self._visible_count
        else:
            self._visible_count = 0
            self._frame_width = 0

    def _frame_to_x(self, frame_idx: int) -> float:
        """Convert real frame index to x coordinate (scroll-aware)."""
        self._calculate_geometry()
        if self._bar_rect is None or self._frame_width == 0:
            return 0
        margin = self._bar_rect[0]
        display_pos = self._reverse_order.get(frame_idx, frame_idx)
        visible_pos = display_pos - self._scroll_offset
        return margin + visible_pos * self._frame_width

    def _x_to_frame(self, x: float) -> int:
        """Convert x coordinate to real frame index (scroll-aware)."""
        self._calculate_geometry()
        if self._bar_rect is None or self._frame_width == 0:
            return 0
        margin = self._bar_rect[0]
        visible_pos = int((x - margin) / self._frame_width)
        display_pos = visible_pos + self._scroll_offset
        display_pos = max(0, min(self.total_frames - 1, display_pos))
        return self._display_order[display_pos] if self._display_order else 0

    def paintEvent(self, event) -> None:
        """Draw timeline with color-coded frame statuses."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        self._calculate_geometry()

        if self._bar_rect is None or self.total_frames == 0:
            # Draw empty state
            painter.setPen(QPen(QColor(80, 80, 80)))
            painter.drawText(
                self.rect(), Qt.AlignmentFlag.AlignCenter, "No sequence loaded"
            )
            return

        margin, top, width, height = self._bar_rect

        # Draw background bar
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QBrush(QColor(50, 50, 50)))
        painter.drawRoundedRect(margin, top, width, height, 3, 3)

        # Draw frame statuses (only the visible range)
        if self._visible_count <= width:
            self._draw_individual_frames(painter, margin, top, height)
        else:
            self._draw_block_frames(painter, margin, top, width, height)

        # Draw trim markers and current frame indicator
        self._draw_trim_markers(painter, top, height)
        self._draw_current_frame_marker(painter, top, height)

    def _draw_individual_frames(
        self, painter: QPainter, margin: int, top: int, height: int
    ) -> None:
        """Draw individual frame indicators (only the visible range)."""
        frame_width = max(1, self._frame_width)
        separator_pen = QPen(QColor(30, 30, 30, 160), 1)
        end = min(self._scroll_offset + self._visible_count, self.total_frames)

        for display_pos in range(self._scroll_offset, end):
            real_idx = self._display_order[display_pos]
            status = self.frame_statuses.get(real_idx, "pending")
            color = self.COLORS.get(status, self.COLORS["pending"])

            visible_pos = display_pos - self._scroll_offset
            x = margin + visible_pos * self._frame_width
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QBrush(color))
            painter.drawRect(int(x), top, int(frame_width) + 1, height)

        # Draw separators between frames when wide enough to see
        if frame_width >= 4:
            painter.setPen(separator_pen)
            for display_pos in range(self._scroll_offset + 1, end):
                visible_pos = display_pos - self._scroll_offset
                x = int(margin + visible_pos * self._frame_width)
                painter.drawLine(x, top + 1, x, top + height - 1)

    def _draw_block_frames(
        self, painter: QPainter, margin: int, top: int, width: int, height: int
    ) -> None:
        """Draw frames in blocks for large sequences (optimization)."""
        ppf = width / self._visible_count
        end = min(self._scroll_offset + self._visible_count, self.total_frames)

        # Group consecutive visible frames by status for efficiency
        current_status = None
        block_start = 0

        for display_pos in range(self._scroll_offset, end + 1):
            if display_pos < end:
                real_idx = self._display_order[display_pos]
                status = self.frame_statuses.get(real_idx, "pending")
            else:
                status = None

            if status != current_status:
                if current_status is not None:
                    color = self.COLORS.get(current_status, self.COLORS["pending"])
                    painter.setBrush(QBrush(color))
                    x1 = margin + (block_start - self._scroll_offset) * ppf
                    x2 = margin + (display_pos - self._scroll_offset) * ppf
                    painter.drawRect(int(x1), top, int(x2 - x1) + 1, height)

                current_status = status
                block_start = display_pos

    def _draw_trim_markers(self, painter: QPainter, top: int, height: int) -> None:
        """Draw left/right trim markers as red sideways triangles above the bar."""
        from PyQt6.QtCore import QPoint
        from PyQt6.QtGui import QPolygon

        trim_color = QColor(220, 50, 50)  # Red
        marker_h = max(4, min(8, int(self._frame_width * 0.6)))

        for frame_idx, pointing_left in [
            (self._trim_left, True),
            (self._trim_right, False),
        ]:
            if frame_idx is None:
                continue
            dp = self._reverse_order.get(frame_idx, frame_idx)
            if (
                dp < self._scroll_offset
                or dp >= self._scroll_offset + self._visible_count
            ):
                continue

            x = self._frame_to_x(frame_idx) + self._frame_width / 2
            cy = top - 3  # center-y above bar

            painter.setBrush(QBrush(trim_color))
            painter.setPen(Qt.PenStyle.NoPen)
            if pointing_left:
                # ◄  triangle pointing left
                pts = [
                    QPoint(int(x - marker_h // 2), int(cy)),
                    QPoint(int(x + marker_h // 2), int(cy - marker_h // 2)),
                    QPoint(int(x + marker_h // 2), int(cy + marker_h // 2)),
                ]
            else:
                # ►  triangle pointing right
                pts = [
                    QPoint(int(x + marker_h // 2), int(cy)),
                    QPoint(int(x - marker_h // 2), int(cy - marker_h // 2)),
                    QPoint(int(x - marker_h // 2), int(cy + marker_h // 2)),
                ]
            painter.drawPolygon(QPolygon(pts))

    def _draw_current_frame_marker(
        self, painter: QPainter, top: int, height: int
    ) -> None:
        """Draw a small triangle above the center of the current frame."""
        if self.total_frames == 0:
            return

        # Only draw if current frame is in the visible range
        display_pos = self._reverse_order.get(self.current_frame, self.current_frame)
        if (
            display_pos < self._scroll_offset
            or display_pos >= self._scroll_offset + self._visible_count
        ):
            return

        x = self._frame_to_x(self.current_frame) + self._frame_width / 2
        marker_width = max(4, min(10, self._frame_width))

        from PyQt6.QtCore import QPoint
        from PyQt6.QtGui import QPolygon

        painter.setBrush(QBrush(self.COLORS["current"]))
        painter.setPen(Qt.PenStyle.NoPen)
        points = [
            (int(x - marker_width / 2), top - 4),
            (int(x + marker_width / 2), top - 4),
            (int(x), top),
        ]
        polygon = QPolygon([QPoint(p[0], p[1]) for p in points])
        painter.drawPolygon(polygon)

    def mousePressEvent(self, event: QMouseEvent) -> None:
        """Handle mouse click to select frame."""
        if event.button() == Qt.MouseButton.LeftButton and self.total_frames > 0:
            frame = self._x_to_frame(event.pos().x())
            self.frame_selected.emit(frame)
            self.set_current_frame(frame)

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        """Handle mouse drag to scrub through frames, or show tooltip on hover."""
        if event.buttons() & Qt.MouseButton.LeftButton and self.total_frames > 0:
            frame = self._x_to_frame(event.pos().x())
            if frame != self.current_frame:
                self.frame_selected.emit(frame)
                self.set_current_frame(frame)
        elif self.total_frames > 0:
            frame = self._x_to_frame(event.pos().x())
            self._show_frame_tooltip(event, frame)

    def _show_frame_tooltip(self, event: QMouseEvent, frame: int) -> None:
        """Show tooltip with frame info at cursor position.

        Args:
            event: Mouse event for positioning
            frame: Real frame index (already resolved through display order)
        """
        lines = [f"Frame {frame + 1}/{self.total_frames}"]

        if frame < len(self._frame_names):
            lines.append(self._frame_names[frame])

        status = self.frame_statuses.get(frame, "pending")
        lines.append(f"Status: {status}")

        if frame in self._confidence_scores:
            lines.append(f"Confidence: {self._confidence_scores[frame]:.4f}")

        QToolTip.showText(event.globalPosition().toPoint(), "\n".join(lines), self)

    def resizeEvent(self, event) -> None:
        """Handle resize - invalidate cached geometry."""
        self._invalidate_geometry()
        super().resizeEvent(event)


class ZoomableTimeline(QWidget):
    """Timeline wrapper with zoom, pan, and sort controls below.

    Layout (vertical):
      [          timeline (fixed width, fits all frames)          ]
      [◀] [−] [+] [▶]                                     [Sort]
    At zoom 1× all frames are visible. Zoom renders a subset via
    virtual scroll — no QScrollArea needed.
    """

    frame_selected = pyqtSignal(int)
    sort_toggled = pyqtSignal(list)  # display_order (empty list = reset)

    _ZOOM_STEP = 1.5
    _MIN_ZOOM = 1.0
    _MAX_ZOOM = 30.0
    _PAN_STEP_FRACTION = 0.25  # Pan 25% of visible frames per click

    _BTN_STYLE = """
        QPushButton {
            background-color: rgba(60, 60, 60, 0.8);
            border: 1px solid rgba(80, 80, 80, 0.6);
            border-radius: 2px;
            color: #E0E0E0;
            font-weight: bold;
            font-size: 11px;
            padding: 0px 3px;
        }
        QPushButton:hover { background-color: rgba(80, 80, 80, 0.8); }
        QPushButton:pressed { background-color: rgba(100, 100, 100, 0.8); }
        QPushButton:disabled { color: rgba(100, 100, 100, 0.5); }
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self._zoom = 1.0

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(1)

        # --- Timeline (direct child, no scroll area) ---
        self.timeline = TimelineWidget()
        self.timeline.frame_selected.connect(self._on_frame_selected)
        outer.addWidget(self.timeline, stretch=1)

        # --- Controls bar (bottom) ---
        ctrl = QHBoxLayout()
        ctrl.setContentsMargins(0, 0, 0, 0)
        ctrl.setSpacing(2)

        btn_h = 18

        self._pan_left_btn = QPushButton("\u25c0")
        self._pan_left_btn.setFixedHeight(btn_h)
        self._pan_left_btn.setToolTip("Pan left")
        self._pan_left_btn.setStyleSheet(self._BTN_STYLE)
        self._pan_left_btn.clicked.connect(self._pan_left)
        self._pan_left_btn.setVisible(False)
        ctrl.addWidget(self._pan_left_btn)

        self._zoom_out_btn = QPushButton("\u2212")
        self._zoom_out_btn.setFixedHeight(btn_h)
        self._zoom_out_btn.setToolTip("Zoom out timeline")
        self._zoom_out_btn.setStyleSheet(self._BTN_STYLE)
        self._zoom_out_btn.clicked.connect(self._zoom_out)
        self._zoom_out_btn.setVisible(False)
        ctrl.addWidget(self._zoom_out_btn)

        self._zoom_in_btn = QPushButton("+")
        self._zoom_in_btn.setFixedHeight(btn_h)
        self._zoom_in_btn.setToolTip("Zoom in timeline")
        self._zoom_in_btn.setStyleSheet(self._BTN_STYLE)
        self._zoom_in_btn.clicked.connect(self._zoom_in)
        ctrl.addWidget(self._zoom_in_btn)

        self._pan_right_btn = QPushButton("\u25b6")
        self._pan_right_btn.setFixedHeight(btn_h)
        self._pan_right_btn.setToolTip("Pan right")
        self._pan_right_btn.setStyleSheet(self._BTN_STYLE)
        self._pan_right_btn.clicked.connect(self._pan_right)
        self._pan_right_btn.setVisible(False)
        ctrl.addWidget(self._pan_right_btn)

        ctrl.addStretch()

        self._sort_btn = QPushButton("Sort")
        self._sort_btn.setFixedHeight(btn_h)
        self._sort_btn.setToolTip("Sort timeline by status (done \u2192 needs work)")
        self._sort_btn.setCheckable(True)
        self._sort_btn.setStyleSheet(self._BTN_STYLE)
        self._sort_btn.clicked.connect(self._toggle_sort)
        ctrl.addWidget(self._sort_btn)

        outer.addLayout(ctrl)

        self.setMinimumHeight(46)
        self.setMaximumHeight(62)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

        self._update_controls()

    def _on_frame_selected(self, frame: int):
        self.frame_selected.emit(frame)

    # -- Zoom --

    def _zoom_in(self):
        self._zoom = min(self._MAX_ZOOM, self._zoom * self._ZOOM_STEP)
        self.timeline.set_zoom(self._zoom)
        self.timeline.center_on_frame(self.timeline.current_frame)
        self._update_controls()

    def _zoom_out(self):
        self._zoom = max(self._MIN_ZOOM, self._zoom / self._ZOOM_STEP)
        if abs(self._zoom - 1.0) < 0.05:
            self._zoom = 1.0
        self.timeline.set_zoom(self._zoom)
        if self._zoom <= 1.0:
            self.timeline.set_scroll_offset(0)
        else:
            self.timeline.center_on_frame(self.timeline.current_frame)
        self._update_controls()

    # -- Pan --

    def _pan_left(self):
        step = max(1, int(self.timeline._visible_count * self._PAN_STEP_FRACTION))
        self.timeline.set_scroll_offset(self.timeline._scroll_offset - step)
        self._update_controls()

    def _pan_right(self):
        step = max(1, int(self.timeline._visible_count * self._PAN_STEP_FRACTION))
        self.timeline.set_scroll_offset(self.timeline._scroll_offset + step)
        self._update_controls()

    def wheelEvent(self, event):
        """Scroll wheel pans when zoomed in."""
        if self._zoom > 1.0:
            delta = event.angleDelta().y()
            step = max(1, int(self.timeline._visible_count * 0.1))
            if delta > 0:
                self.timeline.set_scroll_offset(self.timeline._scroll_offset - step)
            elif delta < 0:
                self.timeline.set_scroll_offset(self.timeline._scroll_offset + step)
            self._update_controls()
            event.accept()
        else:
            super().wheelEvent(event)

    # -- Controls state --

    def _update_controls(self):
        zoomed = self._zoom > self._MIN_ZOOM
        self._zoom_out_btn.setVisible(zoomed)
        self._zoom_out_btn.setEnabled(zoomed)
        self._pan_left_btn.setVisible(zoomed)
        self._pan_right_btn.setVisible(zoomed)
        self._zoom_in_btn.setEnabled(self._zoom < self._MAX_ZOOM)
        if zoomed:
            self._pan_left_btn.setEnabled(self.timeline._scroll_offset > 0)
            max_off = max(0, self.timeline.total_frames - self.timeline._visible_count)
            self._pan_right_btn.setEnabled(self.timeline._scroll_offset < max_off)

    # -- Sort --

    def _toggle_sort(self):
        if self._sort_btn.isChecked():
            self.sort_by_status()
        else:
            self.reset_sort()

    def sort_by_status(self):
        self.timeline.sort_by_status()
        self._sort_btn.setChecked(True)
        self._sort_btn.setText("Sorted")
        self.sort_toggled.emit(list(self.timeline._display_order))

    def reset_sort(self):
        self.timeline.reset_sort()
        self._sort_btn.setChecked(False)
        self._sort_btn.setText("Sort")
        self.sort_toggled.emit([])
