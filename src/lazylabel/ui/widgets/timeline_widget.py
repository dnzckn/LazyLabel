"""Timeline widget for sequence navigation.

Provides a visual timeline for navigating through image sequences
with color-coded frame statuses.
"""

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QBrush, QColor, QMouseEvent, QPainter, QPen
from PyQt6.QtWidgets import QSizePolicy, QWidget


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
        "current": QColor(33, 150, 243),  # Blue for current frame marker
    }

    def __init__(self, parent=None):
        super().__init__(parent)

        self.total_frames = 0
        self.current_frame = 0
        self.frame_statuses: dict[int, str] = {}  # idx -> status

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
        self._invalidate_geometry()
        self.update()

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
        """Convert frame index to x coordinate."""
        self._calculate_geometry()
        if self._bar_rect is None or self._frame_width == 0:
            return 0
        margin = self._bar_rect[0]
        return margin + frame_idx * self._frame_width

    def _x_to_frame(self, x: float) -> int:
        """Convert x coordinate to frame index."""
        self._calculate_geometry()
        if self._bar_rect is None or self._frame_width == 0:
            return 0
        margin = self._bar_rect[0]
        frame = int((x - margin) / self._frame_width)
        return max(0, min(self.total_frames - 1, frame))

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

        for idx in range(self.total_frames):
            status = self.frame_statuses.get(idx, "pending")
            color = self.COLORS.get(status, self.COLORS["pending"])

            x = margin + idx * self._frame_width
            painter.setBrush(QBrush(color))
            painter.drawRect(int(x), top, int(frame_width) + 1, height)

    def _draw_block_frames(
        self, painter: QPainter, margin: int, top: int, width: int, height: int
    ) -> None:
        """Draw frames in blocks for large sequences (optimization)."""
        # Calculate pixels per frame
        ppf = width / self.total_frames

        # Group consecutive frames by status for efficiency
        current_status = None
        block_start = 0

        for idx in range(self.total_frames + 1):
            status = (
                self.frame_statuses.get(idx, "pending")
                if idx < self.total_frames
                else None
            )

            if status != current_status:
                # Draw previous block
                if current_status is not None:
                    color = self.COLORS.get(current_status, self.COLORS["pending"])
                    painter.setBrush(QBrush(color))
                    x1 = margin + block_start * ppf
                    x2 = margin + idx * ppf
                    painter.drawRect(int(x1), top, int(x2 - x1) + 1, height)

                current_status = status
                block_start = idx

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
        """Handle mouse drag to scrub through frames."""
        if event.buttons() & Qt.MouseButton.LeftButton and self.total_frames > 0:
            frame = self._x_to_frame(event.pos().x())
            if frame != self.current_frame:
                self.frame_selected.emit(frame)
                self.set_current_frame(frame)

    def resizeEvent(self, event) -> None:
        """Handle resize - invalidate cached geometry."""
        self._invalidate_geometry()
        super().resizeEvent(event)
