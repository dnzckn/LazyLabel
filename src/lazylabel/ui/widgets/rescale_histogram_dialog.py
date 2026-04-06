"""ImageJ-style histogram dialog for min/max rescale selection.

Displays a histogram of pixel intensities with draggable min/max markers.
Includes presets for common enhancement operations:
- Contrast Stretch (percentile-based)
- Histogram Equalization
- CLAHE (Contrast Limited Adaptive Histogram Equalization)
"""

import numpy as np
from PyQt6.QtCore import QPoint, QRect, Qt, pyqtSignal
from PyQt6.QtGui import QColor, QPainter, QPen, QPolygon
from PyQt6.QtWidgets import (
    QDialog,
    QDoubleSpinBox,
    QFrame,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSlider,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)


def _build_equalization_lut(image_array, output_max):
    """Build a histogram equalization LUT.

    Args:
        image_array: 2D grayscale array
        output_max: max output value (255 or 65535)

    Returns:
        1D numpy LUT array
    """
    hist, _ = np.histogram(
        image_array.ravel(), bins=output_max + 1, range=(0, output_max)
    )
    cdf = hist.cumsum()
    cdf_min = cdf[cdf > 0].min()
    total = image_array.size
    denom = max(1, total - cdf_min)
    lut = ((cdf - cdf_min) / denom * output_max).clip(0, output_max)
    out_dtype = np.uint16 if output_max > 255 else np.uint8
    return lut.astype(out_dtype)


def _build_clahe_lut_image(image_array, clip_limit, tile_size, output_max):
    """Apply CLAHE and return the transformed image (not a simple LUT).

    CLAHE is spatially adaptive so it can't be expressed as a global LUT.
    Returns the transformed image directly.

    Args:
        image_array: 2D grayscale array
        clip_limit: CLAHE clip limit
        tile_size: tile grid size (square)
        output_max: max output value (255 or 65535)

    Returns:
        Transformed 2D image array
    """
    import cv2

    # CLAHE needs uint8 or uint16
    if image_array.dtype == np.float32 or image_array.dtype == np.float64:
        out_dtype = np.uint16 if output_max > 255 else np.uint8
        image_array = image_array.clip(0, output_max).astype(out_dtype)

    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile_size, tile_size))
    return clahe.apply(image_array)


def _preview_histogram(image_array, output_max, n_bins=256):
    """Compute histogram for preview display."""
    hist, edges = np.histogram(
        image_array.ravel().astype(np.float64),
        bins=n_bins,
        range=(0, output_max),
    )
    return hist, edges


class HistogramCanvas(QWidget):
    """Canvas that draws the histogram and draggable min/max lines."""

    valuesChanged = pyqtSignal(int, int)

    MARGIN_LEFT = 50
    MARGIN_RIGHT = 20
    MARGIN_TOP = 20
    MARGIN_BOTTOM = 40

    def __init__(self, parent=None):
        super().__init__(parent)
        self._histogram = None
        self._bin_edges = None
        self._preview_histogram = None  # overlay histogram from preset preview
        self._preview_edges = None
        self._data_min = 0
        self._data_max = 255
        self._min_val = 0
        self._max_val = 255
        self._dragging = None
        self._log_scale = True
        self.setMinimumSize(500, 280)

    def set_data(self, image_array, data_min, data_max, current_min, current_max):
        """Compute histogram from image array."""
        self._data_min = data_min
        self._data_max = data_max
        self._min_val = current_min
        self._max_val = current_max

        n_bins = min(256, data_max - data_min + 1)
        if n_bins < 2:
            n_bins = 256
        flat = image_array.ravel().astype(np.float64)
        self._histogram, self._bin_edges = np.histogram(
            flat, bins=n_bins, range=(data_min, data_max)
        )
        self._preview_histogram = None
        self._preview_edges = None
        self.update()

    def set_preview(self, histogram, bin_edges):
        """Set a preview histogram overlay (e.g. from equalization)."""
        self._preview_histogram = histogram
        self._preview_edges = bin_edges
        self.update()

    def clear_preview(self):
        """Clear the preview histogram overlay."""
        self._preview_histogram = None
        self._preview_edges = None
        self.update()

    def _plot_rect(self):
        return QRect(
            self.MARGIN_LEFT,
            self.MARGIN_TOP,
            self.width() - self.MARGIN_LEFT - self.MARGIN_RIGHT,
            self.height() - self.MARGIN_TOP - self.MARGIN_BOTTOM,
        )

    def _val_to_x(self, value):
        r = self._plot_rect()
        ratio = (value - self._data_min) / max(1, self._data_max - self._data_min)
        return r.left() + int(ratio * r.width())

    def _x_to_val(self, x):
        r = self._plot_rect()
        ratio = (x - r.left()) / max(1, r.width())
        ratio = max(0.0, min(1.0, ratio))
        return int(self._data_min + ratio * (self._data_max - self._data_min))

    def paintEvent(self, event):
        if self._histogram is None:
            return

        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        r = self._plot_rect()

        # Background
        p.fillRect(r, QColor(30, 30, 30))

        # Compute display counts
        counts = self._histogram.astype(np.float64)
        if self._log_scale:
            counts = np.log1p(counts)
        max_count = counts.max() if counts.max() > 0 else 1.0

        # If preview exists, scale both to same max
        if self._preview_histogram is not None:
            prev_counts = self._preview_histogram.astype(np.float64)
            if self._log_scale:
                prev_counts = np.log1p(prev_counts)
            max_count = max(
                max_count, prev_counts.max() if prev_counts.max() > 0 else 1.0
            )

        n_bins = len(counts)
        bar_w = max(1, r.width() / n_bins)

        # Draw original histogram
        for i in range(n_bins):
            bin_center = (self._bin_edges[i] + self._bin_edges[i + 1]) / 2.0
            x = self._val_to_x(bin_center)
            h = int((counts[i] / max_count) * r.height())

            if self._min_val <= bin_center <= self._max_val:
                p.setBrush(QColor(100, 180, 255, 200))
            else:
                p.setBrush(QColor(120, 120, 120, 150))
            p.setPen(Qt.PenStyle.NoPen)
            p.drawRect(QRect(int(x - bar_w / 2), r.bottom() - h, max(1, int(bar_w)), h))

        # Draw preview histogram overlay
        if self._preview_histogram is not None and self._preview_edges is not None:
            prev_n = len(self._preview_histogram)
            prev_bar_w = max(1, r.width() / prev_n)
            for i in range(prev_n):
                bc = (self._preview_edges[i] + self._preview_edges[i + 1]) / 2.0
                x = self._val_to_x(bc)
                h = int((prev_counts[i] / max_count) * r.height())
                p.setPen(QPen(QColor(255, 180, 50, 220), 1))
                p.setBrush(Qt.BrushStyle.NoBrush)
                bar_rect = QRect(
                    int(x - prev_bar_w / 2), r.bottom() - h, max(1, int(prev_bar_w)), h
                )
                p.drawRect(bar_rect)

        # Border
        p.setPen(QPen(QColor(80, 80, 80), 1))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRect(r)

        # Min/max lines
        min_x = self._val_to_x(self._min_val)
        p.setPen(QPen(QColor(50, 200, 50), 2, Qt.PenStyle.DashLine))
        p.drawLine(min_x, r.top(), min_x, r.bottom())

        max_x = self._val_to_x(self._max_val)
        p.setPen(QPen(QColor(200, 50, 50), 2, Qt.PenStyle.DashLine))
        p.drawLine(max_x, r.top(), max_x, r.bottom())

        # Handle triangles
        self._draw_handle(p, min_x, r.bottom(), QColor(50, 200, 50), "min")
        self._draw_handle(p, max_x, r.bottom(), QColor(200, 50, 50), "max")

        # Axis labels
        p.setPen(QColor(200, 200, 200))
        p.drawText(r.left(), r.bottom() + 15, str(self._data_min))
        mid_val = (self._data_min + self._data_max) // 2
        p.drawText(self._val_to_x(mid_val) - 10, r.bottom() + 15, str(mid_val))
        p.drawText(r.right() - 30, r.bottom() + 15, str(self._data_max))

        # Y-axis label
        p.save()
        p.translate(12, r.center().y())
        p.rotate(-90)
        p.drawText(-20, 0, "log(count)" if self._log_scale else "count")
        p.restore()

        # Min/Max value labels
        p.setPen(QColor(50, 200, 50))
        p.drawText(min_x - 15, r.bottom() + 30, str(self._min_val))
        p.setPen(QColor(200, 50, 50))
        p.drawText(max_x - 15, r.bottom() + 30, str(self._max_val))

        # Preview legend
        if self._preview_histogram is not None:
            p.setPen(QColor(255, 180, 50))
            p.drawText(r.right() - 80, r.top() + 14, "preview")

    def _draw_handle(self, painter, x, y, color, which):
        painter.setPen(Qt.PenStyle.NoPen)
        c = QColor(color)
        if self._dragging == which:
            c = c.lighter(150)
        painter.setBrush(c)
        tri = QPolygon(
            [
                QPoint(x, y),
                QPoint(x - 6, y + 10),
                QPoint(x + 6, y + 10),
            ]
        )
        painter.drawPolygon(tri)

    def mousePressEvent(self, event):
        if event.button() != Qt.MouseButton.LeftButton:
            return
        r = self._plot_rect()
        x = event.pos().x()
        max_x = self._val_to_x(self._max_val)
        min_x = self._val_to_x(self._min_val)
        if abs(x - max_x) <= 8 and r.top() - 5 <= event.pos().y() <= r.bottom() + 15:
            self._dragging = "max"
            self.setCursor(Qt.CursorShape.SizeHorCursor)
        elif abs(x - min_x) <= 8 and r.top() - 5 <= event.pos().y() <= r.bottom() + 15:
            self._dragging = "min"
            self.setCursor(Qt.CursorShape.SizeHorCursor)

    def mouseMoveEvent(self, event):
        if self._dragging is None:
            return
        new_val = self._x_to_val(event.pos().x())
        new_val = max(self._data_min, min(self._data_max, new_val))
        if self._dragging == "min":
            self._min_val = min(new_val, self._max_val)
        else:
            self._max_val = max(new_val, self._min_val)
        self.valuesChanged.emit(self._min_val, self._max_val)
        self.update()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self._dragging:
            self._dragging = None
            self.setCursor(Qt.CursorShape.ArrowCursor)

    def toggle_log_scale(self):
        self._log_scale = not self._log_scale
        self.update()


class RescaleHistogramDialog(QDialog):
    """ImageJ-style histogram dialog with presets and draggable min/max."""

    applied = pyqtSignal(int, int)  # min_val, max_val  (linear mode)
    lut_applied = pyqtSignal(object, str)  # lut_array, preset_name

    def __init__(
        self,
        image_array,
        data_min,
        data_max,
        current_min,
        current_max,
        parent=None,
    ):
        super().__init__(parent)
        self._image = image_array
        self._data_min = data_min
        self._data_max = data_max
        self._pending_lut = None
        self._pending_preset_name = None

        self.setWindowTitle("Rescale Histogram")
        self.setMinimumSize(600, 520)
        self.resize(650, 560)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(6)

        # Canvas
        self.canvas = HistogramCanvas()
        self.canvas.set_data(image_array, data_min, data_max, current_min, current_max)
        self.canvas.valuesChanged.connect(self._on_values_changed)
        layout.addWidget(self.canvas)

        # Info row
        info_layout = QHBoxLayout()
        self.min_label = QLabel(f"Min: {current_min}")
        self.min_label.setStyleSheet("color: #32C832; font-weight: bold;")
        self.max_label = QLabel(f"Max: {current_max}")
        self.max_label.setStyleSheet("color: #C83232; font-weight: bold;")

        pixels = image_array.size
        self.stats_label = QLabel(
            f"Pixels: {pixels:,}  |  "
            f"Image range: {int(image_array.min())}–{int(image_array.max())}"
        )
        self.stats_label.setStyleSheet("font-size: 10px;")

        info_layout.addWidget(self.min_label)
        info_layout.addStretch()
        info_layout.addWidget(self.stats_label)
        info_layout.addStretch()
        info_layout.addWidget(self.max_label)
        layout.addLayout(info_layout)

        # Presets group
        presets_group = QGroupBox("Presets")
        presets_group.setStyleSheet("QGroupBox { font-weight: bold; font-size: 11px; }")
        presets_layout = QVBoxLayout(presets_group)
        presets_layout.setSpacing(4)
        presets_layout.setContentsMargins(6, 12, 6, 6)

        # Row 1: Contrast stretch with saturation slider
        stretch_row = QHBoxLayout()

        btn_style = (
            "QPushButton { font-size: 10px; padding: 3px 8px; }"
            "QPushButton:hover { background-color: rgba(100, 100, 200, 0.4); }"
        )

        stretch_label = QLabel("Contrast Stretch")
        stretch_label.setStyleSheet("font-size: 10px;")
        stretch_row.addWidget(stretch_label)

        self.stretch_slider = QSlider(Qt.Orientation.Horizontal)
        self.stretch_slider.setRange(0, 500)  # 0.0% to 50.0% in 0.1 steps
        self.stretch_slider.setValue(4)  # 0.4% default (~ImageJ's 0.35%)
        self.stretch_slider.setToolTip(
            "Saturation %: how much of the tails to clip.\n"
            "0% = full min/max stretch, higher = more aggressive"
        )
        self.stretch_slider.valueChanged.connect(self._on_stretch_slider_changed)
        stretch_row.addWidget(self.stretch_slider)

        self.stretch_value_label = QLabel("0.4%")
        self.stretch_value_label.setFixedWidth(36)
        self.stretch_value_label.setStyleSheet("font-size: 10px;")
        stretch_row.addWidget(self.stretch_value_label)

        presets_layout.addLayout(stretch_row)

        # Row 2: Equalization presets
        eq_row = QHBoxLayout()

        self.btn_equalize = QPushButton("Equalize")
        self.btn_equalize.setToolTip(
            "Histogram equalization — spreads intensity values\n"
            "uniformly for maximum global contrast"
        )
        self.btn_equalize.setStyleSheet(btn_style)
        self.btn_equalize.clicked.connect(self._preset_equalize)
        eq_row.addWidget(self.btn_equalize)

        self.btn_clahe = QPushButton("CLAHE")
        self.btn_clahe.setToolTip(
            "Contrast Limited Adaptive Histogram Equalization\n"
            "Enhances local contrast while limiting noise amplification"
        )
        self.btn_clahe.setStyleSheet(btn_style)
        self.btn_clahe.clicked.connect(self._preset_clahe)
        eq_row.addWidget(self.btn_clahe)

        # CLAHE parameters
        eq_row.addWidget(self._make_separator())

        eq_row.addWidget(QLabel("Clip:"))
        self.clahe_clip_spin = QDoubleSpinBox()
        self.clahe_clip_spin.setRange(0.5, 40.0)
        self.clahe_clip_spin.setValue(2.0)
        self.clahe_clip_spin.setSingleStep(0.5)
        self.clahe_clip_spin.setFixedWidth(55)
        self.clahe_clip_spin.setToolTip("CLAHE clip limit (higher = more contrast)")
        self.clahe_clip_spin.valueChanged.connect(self._on_clahe_param_changed)
        eq_row.addWidget(self.clahe_clip_spin)

        eq_row.addWidget(QLabel("Tile:"))
        self.clahe_tile_spin = QSpinBox()
        self.clahe_tile_spin.setRange(2, 32)
        self.clahe_tile_spin.setValue(8)
        self.clahe_tile_spin.setFixedWidth(45)
        self.clahe_tile_spin.setToolTip("CLAHE tile grid size")
        self.clahe_tile_spin.valueChanged.connect(self._on_clahe_param_changed)
        eq_row.addWidget(self.clahe_tile_spin)

        presets_layout.addLayout(eq_row)

        # Preset status
        self.preset_label = QLabel("")
        self.preset_label.setStyleSheet("color: #FFB74D; font-size: 10px;")
        presets_layout.addWidget(self.preset_label)

        layout.addWidget(presets_group)

        # Bottom button row
        btn_layout = QHBoxLayout()

        self.log_btn = QPushButton("Linear")
        self.log_btn.setToolTip("Toggle logarithmic / linear scale")
        self.log_btn.setFixedWidth(60)
        self.log_btn.clicked.connect(self._toggle_log)
        btn_layout.addWidget(self.log_btn)

        btn_layout.addStretch()

        self.apply_btn = QPushButton("Apply")
        self.apply_btn.setStyleSheet(
            "QPushButton { background-color: #4CAF50; color: white;"
            " font-weight: bold; padding: 4px 16px; }"
            "QPushButton:hover { background-color: #66BB6A; }"
        )
        self.apply_btn.clicked.connect(self._on_apply)
        btn_layout.addWidget(self.apply_btn)

        self.cancel_btn = QPushButton("Cancel")
        self.cancel_btn.clicked.connect(self.reject)
        btn_layout.addWidget(self.cancel_btn)

        layout.addLayout(btn_layout)

    @staticmethod
    def _make_separator():
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.VLine)
        sep.setFrameShadow(QFrame.Shadow.Sunken)
        sep.setFixedWidth(2)
        return sep

    # --- Signal handlers ---

    def _on_values_changed(self, min_val, max_val):
        self.min_label.setText(f"Min: {min_val}")
        self.max_label.setText(f"Max: {max_val}")
        # Manual handle drag clears pending preset
        self._pending_lut = None
        self._pending_preset_name = None
        self.preset_label.setText("")
        self.canvas.clear_preview()

    def _toggle_log(self):
        self.canvas.toggle_log_scale()
        self.log_btn.setText("Log" if not self.canvas._log_scale else "Linear")

    # --- Presets ---

    def _on_stretch_slider_changed(self, value):
        """Live-update contrast stretch as slider moves."""
        pct = value / 10.0
        self.stretch_value_label.setText(f"{pct:.1f}%")
        self._preset_percentile(pct)

    def _preset_percentile(self, pct):
        """Contrast stretch clipping pct% on each side."""
        if pct <= 0:
            lo = int(self._image.min())
            hi = int(self._image.max())
            label = "Min/Max stretch (full data range)"
        else:
            lo = int(np.floor(np.percentile(self._image, pct)))
            hi = int(np.ceil(np.percentile(self._image, 100 - pct)))
            lo = max(self._data_min, lo)
            hi = min(self._data_max, hi)
            label = f"Contrast stretch ({pct:.1f}% saturation)"
        self._set_min_max(lo, hi)
        self._pending_lut = None
        self._pending_preset_name = None
        self.preset_label.setText(label)
        self.canvas.clear_preview()

    def _preset_equalize(self):
        """Histogram equalization."""
        lut = _build_equalization_lut(self._image, self._data_max)
        self._pending_lut = lut
        self._pending_preset_name = "Histogram Equalization"
        self.preset_label.setText("Histogram Equalization (preview in orange)")

        # Show preview histogram
        result = lut[self._image]
        hist, edges = _preview_histogram(result, self._data_max)
        self.canvas.set_preview(hist, edges)

    def _on_clahe_param_changed(self):
        """Re-run CLAHE preview when clip or tile changes."""
        if self._pending_preset_name and self._pending_preset_name.startswith("CLAHE"):
            self._preset_clahe()

    def _preset_clahe(self):
        """CLAHE adaptive equalization."""
        clip = self.clahe_clip_spin.value()
        tile = self.clahe_tile_spin.value()

        result = _build_clahe_lut_image(self._image, clip, tile, self._data_max)

        # CLAHE is spatially adaptive — store the transformed image as a
        # "LUT" by building a pixel-level mapping. We encode the full result
        # and pass it through the lut_applied signal.
        self._pending_lut = result
        self._pending_preset_name = f"CLAHE (clip={clip}, tile={tile})"
        self.preset_label.setText(
            f"CLAHE clip={clip} tile={tile}×{tile} (preview in orange)"
        )

        hist, edges = _preview_histogram(result, self._data_max)
        self.canvas.set_preview(hist, edges)

    # --- Helpers ---

    def _set_min_max(self, lo, hi):
        self.canvas._min_val = lo
        self.canvas._max_val = hi
        self.canvas.valuesChanged.emit(lo, hi)
        self.canvas.update()
        self.min_label.setText(f"Min: {lo}")
        self.max_label.setText(f"Max: {hi}")

    def _on_apply(self):
        if self._pending_lut is not None:
            self.lut_applied.emit(self._pending_lut, self._pending_preset_name)
        else:
            self.applied.emit(self.canvas._min_val, self.canvas._max_val)
        self.accept()
