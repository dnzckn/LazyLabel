"""Timeline widget for sequence navigation.

Provides a visual timeline for navigating through image sequences
with color-coded frame statuses.
"""

from PyQt6.QtCore import QEvent, QPointF, Qt, pyqtSignal
from PyQt6.QtGui import QBrush, QColor, QMouseEvent, QPainter, QPen
from PyQt6.QtWidgets import (
    QHBoxLayout,
    QPushButton,
    QScrollArea,
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
        """Calculate timeline bar geometry."""
        if self._bar_rect is not None:
            return

        margin = 5
        width = self.width() - 2 * margin
        height = self.height() - 2 * margin

        self._bar_rect = (margin, margin, width, height)

        if self.total_frames > 0:
            self._frame_width = width / self.total_frames
        else:
            self._frame_width = 0

    def _frame_to_x(self, frame_idx: int) -> float:
        """Convert real frame index to x coordinate (uses display order)."""
        self._calculate_geometry()
        if self._bar_rect is None or self._frame_width == 0:
            return 0
        margin = self._bar_rect[0]
        display_pos = self._reverse_order.get(frame_idx, frame_idx)
        return margin + display_pos * self._frame_width

    def _x_to_frame(self, x: float) -> int:
        """Convert x coordinate to real frame index (uses display order)."""
        self._calculate_geometry()
        if self._bar_rect is None or self._frame_width == 0:
            return 0
        margin = self._bar_rect[0]
        display_pos = int((x - margin) / self._frame_width)
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

        # Draw frame statuses
        # For large sequences, batch consecutive same-status frames
        if self.total_frames <= width:
            # Small enough to draw individual frames
            self._draw_individual_frames(painter, margin, top, height)
        else:
            # Large sequence - draw in blocks
            self._draw_block_frames(painter, margin, top, width, height)

        # Draw current frame indicator (triangle/marker on top)
        self._draw_current_frame_marker(painter, top, height)

    def _draw_individual_frames(
        self, painter: QPainter, margin: int, top: int, height: int
    ) -> None:
        """Draw individual frame indicators for small sequences."""
        frame_width = max(1, self._frame_width)
        separator_pen = QPen(QColor(30, 30, 30, 160), 1)

        for display_pos in range(self.total_frames):
            real_idx = self._display_order[display_pos]
            status = self.frame_statuses.get(real_idx, "pending")
            color = self.COLORS.get(status, self.COLORS["pending"])

            x = margin + display_pos * self._frame_width
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QBrush(color))
            painter.drawRect(int(x), top, int(frame_width) + 1, height)

        # Draw separators between frames when wide enough to see
        if frame_width >= 4:
            painter.setPen(separator_pen)
            for display_pos in range(1, self.total_frames):
                x = int(margin + display_pos * self._frame_width)
                painter.drawLine(x, top + 1, x, top + height - 1)

    def _draw_block_frames(
        self, painter: QPainter, margin: int, top: int, width: int, height: int
    ) -> None:
        """Draw frames in blocks for large sequences (optimization)."""
        # Calculate pixels per frame
        ppf = width / self.total_frames

        # Group consecutive display-position frames by status for efficiency
        current_status = None
        block_start = 0

        for display_pos in range(self.total_frames + 1):
            if display_pos < self.total_frames:
                real_idx = self._display_order[display_pos]
                status = self.frame_statuses.get(real_idx, "pending")
            else:
                status = None

            if status != current_status:
                # Draw previous block
                if current_status is not None:
                    color = self.COLORS.get(current_status, self.COLORS["pending"])
                    painter.setBrush(QBrush(color))
                    x1 = margin + block_start * ppf
                    x2 = margin + display_pos * ppf
                    painter.drawRect(int(x1), top, int(x2 - x1) + 1, height)

                current_status = status
                block_start = display_pos

    def _draw_current_frame_marker(
        self, painter: QPainter, top: int, height: int
    ) -> None:
        """Draw marker for current frame position."""
        if self.total_frames == 0:
            return

        x = self._frame_to_x(self.current_frame)
        marker_width = max(3, min(10, self._frame_width))

        # Draw vertical line
        painter.setPen(QPen(self.COLORS["current"], 2))
        painter.drawLine(int(x), top - 2, int(x), top + height + 2)

        # Draw small triangle at top
        painter.setBrush(QBrush(self.COLORS["current"]))
        painter.setPen(Qt.PenStyle.NoPen)
        points = [
            (int(x - marker_width / 2), top - 4),
            (int(x + marker_width / 2), top - 4),
            (int(x), top),
        ]
        from PyQt6.QtCore import QPoint
        from PyQt6.QtGui import QPolygon

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
      [          timeline scroll area          ]
      [◀] [−] [+] [▶]              [Sort]
    Controls bar is compact (18px tall). Pan/zoom-out hidden at 1×.
    """

    frame_selected = pyqtSignal(int)

    _ZOOM_STEP = 1.5
    _MIN_ZOOM = 1.0
    _MAX_ZOOM = 30.0
    _PAN_STEP_FRACTION = 0.25  # Pan 25% of viewport per click

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

        # --- Timeline scroll area (top) ---
        self._scroll = QScrollArea()
        self._scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._scroll.setWidgetResizable(True)
        self._scroll.setMinimumHeight(28)
        self._scroll.setMaximumHeight(40)
        self._scroll.setStyleSheet(
            "QScrollArea { border: none; background: transparent; }"
        )

        self.timeline = TimelineWidget()
        self.timeline.frame_selected.connect(self._on_frame_selected)
        self._scroll.setWidget(self.timeline)
        # Forward mouse events from viewport → timeline (QScrollArea eats them)
        self._scroll.viewport().installEventFilter(self)
        self._scroll.viewport().setMouseTracking(True)
        outer.addWidget(self._scroll, stretch=1)

        # --- Controls bar (bottom) ---
        ctrl = QHBoxLayout()
        ctrl.setContentsMargins(0, 0, 0, 0)
        ctrl.setSpacing(2)

        btn_h = 18  # Thin buttons

        # Pan left (hidden at zoom 1.0)
        self._pan_left_btn = QPushButton("\u25c0")
        self._pan_left_btn.setFixedHeight(btn_h)
        self._pan_left_btn.setToolTip("Pan left")
        self._pan_left_btn.setStyleSheet(self._BTN_STYLE)
        self._pan_left_btn.clicked.connect(self._pan_left)
        self._pan_left_btn.setVisible(False)
        ctrl.addWidget(self._pan_left_btn)

        # Zoom out (hidden at zoom 1.0)
        self._zoom_out_btn = QPushButton("\u2212")
        self._zoom_out_btn.setFixedHeight(btn_h)
        self._zoom_out_btn.setToolTip("Zoom out timeline")
        self._zoom_out_btn.setStyleSheet(self._BTN_STYLE)
        self._zoom_out_btn.clicked.connect(self._zoom_out)
        self._zoom_out_btn.setVisible(False)
        ctrl.addWidget(self._zoom_out_btn)

        # Zoom in (always visible)
        self._zoom_in_btn = QPushButton("+")
        self._zoom_in_btn.setFixedHeight(btn_h)
        self._zoom_in_btn.setToolTip("Zoom in timeline")
        self._zoom_in_btn.setStyleSheet(self._BTN_STYLE)
        self._zoom_in_btn.clicked.connect(self._zoom_in)
        ctrl.addWidget(self._zoom_in_btn)

        # Pan right (hidden at zoom 1.0)
        self._pan_right_btn = QPushButton("\u25b6")
        self._pan_right_btn.setFixedHeight(btn_h)
        self._pan_right_btn.setToolTip("Pan right")
        self._pan_right_btn.setStyleSheet(self._BTN_STYLE)
        self._pan_right_btn.clicked.connect(self._pan_right)
        self._pan_right_btn.setVisible(False)
        ctrl.addWidget(self._pan_right_btn)

        ctrl.addStretch()

        # Sort toggle (always visible, right-aligned)
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

        # Update pan button states when scroll position changes
        self._scroll.horizontalScrollBar().valueChanged.connect(
            self._update_pan_buttons
        )

        self._update_controls()

    def _on_frame_selected(self, frame: int):
        """Forward frame selection."""
        self.frame_selected.emit(frame)

    # -- Event filter (forward viewport mouse events to timeline) --

    _FORWARDED = {
        QEvent.Type.MouseButtonPress,
        QEvent.Type.MouseButtonRelease,
        QEvent.Type.MouseMove,
    }

    def eventFilter(self, obj, event):
        """Forward mouse events from the scroll-area viewport to the timeline."""
        if obj is self._scroll.viewport() and event.type() in self._FORWARDED:
            # Map viewport coords → timeline widget coords
            tl_pos = self.timeline.mapFrom(
                self._scroll.viewport(), event.position().toPoint()
            )
            forwarded = QMouseEvent(
                event.type(),
                QPointF(tl_pos),
                event.globalPosition(),
                event.button(),
                event.buttons(),
                event.modifiers(),
            )
            if event.type() == QEvent.Type.MouseButtonPress:
                self.timeline.mousePressEvent(forwarded)
            elif event.type() == QEvent.Type.MouseMove:
                self.timeline.mouseMoveEvent(forwarded)
            elif event.type() == QEvent.Type.MouseButtonRelease:
                self.timeline.mouseReleaseEvent(forwarded)
            return True
        return super().eventFilter(obj, event)

    # -- Zoom --

    def _zoom_in(self):
        self._zoom = min(self._MAX_ZOOM, self._zoom * self._ZOOM_STEP)
        self._apply_zoom()

    def _zoom_out(self):
        self._zoom = max(self._MIN_ZOOM, self._zoom / self._ZOOM_STEP)
        if abs(self._zoom - 1.0) < 0.05:
            self._zoom = 1.0
        self._apply_zoom()

    def _apply_zoom(self):
        viewport_w = self._scroll.viewport().width()
        if self._zoom <= 1.0:
            self._scroll.setWidgetResizable(True)
        else:
            self._scroll.setWidgetResizable(False)
            zoomed_w = int(viewport_w * self._zoom)
            self.timeline.setFixedWidth(zoomed_w)

        self.timeline._invalidate_geometry()
        self.timeline.update()
        self._update_controls()

    # -- Pan --

    def _pan_left(self):
        sb = self._scroll.horizontalScrollBar()
        step = int(self._scroll.viewport().width() * self._PAN_STEP_FRACTION)
        sb.setValue(max(0, sb.value() - step))

    def _pan_right(self):
        sb = self._scroll.horizontalScrollBar()
        step = int(self._scroll.viewport().width() * self._PAN_STEP_FRACTION)
        sb.setValue(min(sb.maximum(), sb.value() + step))

    def wheelEvent(self, event):
        """Scroll wheel pans horizontally when zoomed in."""
        if self._zoom > 1.0:
            sb = self._scroll.horizontalScrollBar()
            # angleDelta().y() is the standard wheel axis
            delta = event.angleDelta().y()
            step = int(self._scroll.viewport().width() * 0.1)
            if delta > 0:
                sb.setValue(max(0, sb.value() - step))
            elif delta < 0:
                sb.setValue(min(sb.maximum(), sb.value() + step))
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
        self._update_pan_buttons()

    def _update_pan_buttons(self):
        """Gray out pan buttons when at the scroll limits."""
        if self._zoom <= self._MIN_ZOOM:
            return
        sb = self._scroll.horizontalScrollBar()
        self._pan_left_btn.setEnabled(sb.value() > sb.minimum())
        self._pan_right_btn.setEnabled(sb.value() < sb.maximum())

    # -- Sort --

    def _toggle_sort(self):
        """Toggle between sorted and natural display order."""
        if self._sort_btn.isChecked():
            self.sort_by_status()
        else:
            self.reset_sort()

    def sort_by_status(self):
        """Sort timeline by status priority."""
        self.timeline.sort_by_status()
        self._sort_btn.setChecked(True)
        self._sort_btn.setText("Sorted")

    def reset_sort(self):
        """Restore natural file order."""
        self.timeline.reset_sort()
        self._sort_btn.setChecked(False)
        self._sort_btn.setText("Sort")

    def resizeEvent(self, event):
        """Re-apply zoom when the wrapper is resized."""
        super().resizeEvent(event)
        if self._zoom > 1.0:
            self._apply_zoom()
