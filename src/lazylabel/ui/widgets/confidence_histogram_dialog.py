"""Confidence score histogram dialog for sequence mode.

Provides a visual histogram of propagation confidence scores with a
draggable threshold line so users can visually tune the flagging threshold.
"""

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QColor, QMouseEvent, QPainter, QPen
from PyQt6.QtWidgets import (
    QDialog,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


class ConfidenceHistogramWidget(QWidget):
    """Pure QPainter histogram of confidence scores with draggable threshold."""

    threshold_changed = pyqtSignal(float)

    NUM_BINS = 50
    MARGIN_LEFT = 50
    MARGIN_BOTTOM = 30
    MARGIN_TOP = 20
    MARGIN_RIGHT = 20

    COLOR_BG = QColor(43, 43, 43)
    COLOR_ABOVE = QColor(76, 175, 80)  # green
    COLOR_BELOW = QColor(244, 67, 54)  # red
    COLOR_THRESHOLD = QColor(255, 193, 7)  # gold
    COLOR_TEXT = QColor(200, 200, 200)

    def __init__(self, scores: list[float], threshold: float, parent=None):
        super().__init__(parent)
        self._scores = scores
        self._threshold = max(0.0, min(1.0, threshold))
        self._dragging = False
        self._bins: list[int] = [0] * self.NUM_BINS
        self._max_count = 1
        self._recompute_bins()
        self.setMinimumSize(400, 250)
        self.setMouseTracking(True)

    @property
    def threshold(self) -> float:
        return self._threshold

    def _recompute_bins(self) -> None:
        self._bins = [0] * self.NUM_BINS
        for s in self._scores:
            idx = int(s * self.NUM_BINS)
            idx = min(idx, self.NUM_BINS - 1)
            self._bins[idx] += 1
        self._max_count = max(max(self._bins), 1)

    def _plot_rect(self) -> tuple[int, int, int, int]:
        """Return (x, y, w, h) of the plotting area."""
        x = self.MARGIN_LEFT
        y = self.MARGIN_TOP
        w = self.width() - self.MARGIN_LEFT - self.MARGIN_RIGHT
        h = self.height() - self.MARGIN_TOP - self.MARGIN_BOTTOM
        return x, y, max(w, 1), max(h, 1)

    def _threshold_x(self) -> float:
        px, _, pw, _ = self._plot_rect()
        return px + self._threshold * pw

    def paintEvent(self, event) -> None:
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Background
        painter.fillRect(self.rect(), self.COLOR_BG)

        px, py, pw, ph = self._plot_rect()
        bin_w = pw / self.NUM_BINS
        threshold_bin = int(self._threshold * self.NUM_BINS)

        # Draw bars
        for i, count in enumerate(self._bins):
            if count == 0:
                continue
            bar_h = int((count / self._max_count) * ph)
            bx = px + i * bin_w
            by = py + ph - bar_h
            color = self.COLOR_ABOVE if i >= threshold_bin else self.COLOR_BELOW
            painter.fillRect(int(bx), int(by), max(int(bin_w), 1), bar_h, color)

        # Y-axis labels
        painter.setPen(QPen(self.COLOR_TEXT))
        painter.setFont(painter.font())
        painter.drawText(0, py + 10, self.MARGIN_LEFT - 4, 16, Qt.AlignmentFlag.AlignRight, str(self._max_count))
        painter.drawText(0, py + ph - 8, self.MARGIN_LEFT - 4, 16, Qt.AlignmentFlag.AlignRight, "0")

        # X-axis labels
        painter.drawText(px - 10, py + ph + 2, 30, 16, Qt.AlignmentFlag.AlignCenter, "0.0")
        painter.drawText(px + pw - 15, py + ph + 2, 30, 16, Qt.AlignmentFlag.AlignCenter, "1.0")

        # Threshold line
        tx = self._threshold_x()
        pen = QPen(self.COLOR_THRESHOLD, 2)
        painter.setPen(pen)
        painter.drawLine(int(tx), py, int(tx), py + ph)

        # Triangle handles
        painter.setBrush(self.COLOR_THRESHOLD)
        painter.setPen(Qt.PenStyle.NoPen)
        tri_size = 6
        # Top triangle
        from PyQt6.QtCore import QPoint
        from PyQt6.QtGui import QPolygon

        top_tri = QPolygon([
            QPoint(int(tx), py),
            QPoint(int(tx) - tri_size, py - tri_size),
            QPoint(int(tx) + tri_size, py - tri_size),
        ])
        painter.drawPolygon(top_tri)
        # Bottom triangle
        bot_tri = QPolygon([
            QPoint(int(tx), py + ph),
            QPoint(int(tx) - tri_size, py + ph + tri_size),
            QPoint(int(tx) + tri_size, py + ph + tri_size),
        ])
        painter.drawPolygon(bot_tri)

        # Count annotations
        below = sum(1 for s in self._scores if s < self._threshold)
        above = len(self._scores) - below
        total = len(self._scores) or 1
        below_pct = below / total * 100
        above_pct = above / total * 100

        painter.setPen(QPen(self.COLOR_BELOW))
        painter.drawText(px + 4, py + 14, f"Below: {below} ({below_pct:.0f}%)")
        painter.setPen(QPen(self.COLOR_ABOVE))
        painter.drawText(
            px + pw - 140, py + 14, f"Above: {above} ({above_pct:.0f}%)"
        )

        # Threshold value label near line
        painter.setPen(QPen(self.COLOR_THRESHOLD))
        label = f"{self._threshold:.4f}"
        label_x = int(tx) + 4
        if label_x + 50 > px + pw:
            label_x = int(tx) - 54
        painter.drawText(label_x, py + ph - 4, label)

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            tx = self._threshold_x()
            if abs(event.pos().x() - tx) < 8:
                self._dragging = True

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        tx = self._threshold_x()
        if abs(event.pos().x() - tx) < 8:
            self.setCursor(Qt.CursorShape.SizeHorCursor)
        elif not self._dragging:
            self.setCursor(Qt.CursorShape.ArrowCursor)

        if self._dragging:
            px, _, pw, _ = self._plot_rect()
            new_t = (event.pos().x() - px) / pw
            new_t = max(0.0, min(1.0, new_t))
            if new_t != self._threshold:
                self._threshold = new_t
                self.threshold_changed.emit(self._threshold)
                self.update()

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self._dragging = False


class ConfidenceHistogramDialog(QDialog):
    """Dialog wrapping the histogram widget with Apply/Close buttons."""

    def __init__(
        self, scores: list[float], threshold: float, parent=None
    ):
        super().__init__(parent)
        self.setWindowTitle("Confidence Score Distribution")
        self.setMinimumSize(500, 350)
        self.resize(600, 400)

        layout = QVBoxLayout(self)

        # Info label
        self._info_label = QLabel(f"{len(scores)} frames with confidence scores")
        layout.addWidget(self._info_label)

        # Histogram widget
        self._histogram = ConfidenceHistogramWidget(scores, threshold)
        layout.addWidget(self._histogram, 1)

        # Threshold readout
        self._threshold_label = QLabel(f"Threshold: {threshold:.4f}")
        self._histogram.threshold_changed.connect(self._on_threshold_changed)
        layout.addWidget(self._threshold_label)

        # Buttons
        btn_layout = QHBoxLayout()
        btn_layout.addStretch()
        apply_btn = QPushButton("Apply")
        apply_btn.clicked.connect(self.accept)
        btn_layout.addWidget(apply_btn)
        close_btn = QPushButton("Close")
        close_btn.clicked.connect(self.reject)
        btn_layout.addWidget(close_btn)
        layout.addLayout(btn_layout)

    def _on_threshold_changed(self, value: float) -> None:
        self._threshold_label.setText(f"Threshold: {value:.4f}")

    def get_threshold(self) -> float:
        return self._histogram.threshold
