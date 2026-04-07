"""Rescale Widget for LazyLabel.

Provides min/max intensity rescaling for grayscale images.
Remaps all pixel values from [min, max] → [0, output_max], clamping
values outside the range. Includes a Hist button to open an ImageJ-style
histogram dialog for visual min/max selection.

Supports LUT-based presets (equalization, CLAHE) in addition to linear
min/max rescaling.
"""

import numpy as np
from PyQt6.QtCore import QRect, Qt, pyqtSignal
from PyQt6.QtGui import QColor, QFont, QPainter, QPen
from PyQt6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)


class RescaleSlider(QWidget):
    """Custom dual-handle slider for min/max rescaling."""

    valueChanged = pyqtSignal(int, int)  # min_val, max_val
    dragStarted = pyqtSignal()
    dragFinished = pyqtSignal()

    def __init__(self, minimum=0, maximum=255, parent=None):
        super().__init__(parent)
        self.minimum = minimum
        self.maximum = maximum
        self._min_val = minimum
        self._max_val = maximum
        self._dragging = None  # "min", "max", or None
        self._drag_offset = 0

        self.setMinimumHeight(50)
        self.setFixedHeight(50)
        self.setMinimumWidth(200)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

    @property
    def min_val(self):
        return self._min_val

    @property
    def max_val(self):
        return self._max_val

    def set_range(self, minimum, maximum):
        """Set the slider range."""
        self.minimum = minimum
        self.maximum = maximum
        self._min_val = minimum
        self._max_val = maximum
        self.update()

    def set_values(self, min_val, max_val):
        """Set min/max values programmatically."""
        self._min_val = max(self.minimum, min(min_val, self.maximum))
        self._max_val = max(self.minimum, min(max_val, self.maximum))
        if self._min_val > self._max_val:
            self._min_val, self._max_val = self._max_val, self._min_val
        self.valueChanged.emit(self._min_val, self._max_val)
        self.update()

    def _get_track_rect(self):
        margin = 20
        return QRect(margin, 18, self.width() - 2 * margin, 10)

    def _val_to_x(self, value):
        track = self._get_track_rect()
        ratio = (value - self.minimum) / max(1, self.maximum - self.minimum)
        return track.left() + int(ratio * track.width())

    def _x_to_val(self, x):
        track = self._get_track_rect()
        ratio = (x - track.left()) / max(1, track.width())
        ratio = max(0.0, min(1.0, ratio))
        return int(self.minimum + ratio * (self.maximum - self.minimum))

    def _handle_rect(self, value):
        x = self._val_to_x(value)
        track = self._get_track_rect()
        return QRect(x - 6, track.top() - 3, 12, track.height() + 6)

    def _is_dark(self) -> bool:
        """Check if the current theme is dark based on palette."""
        return self.palette().window().color().lightness() < 128

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        dark = self._is_dark()
        track = self._get_track_rect()

        # Track background
        p.setPen(QPen(QColor(100, 100, 100) if dark else QColor(180, 180, 180), 2))
        p.setBrush(QColor(50, 50, 50) if dark else QColor(230, 230, 230))
        p.drawRoundedRect(track, 5, 5)

        # Active range highlight
        x_min = self._val_to_x(self._min_val)
        x_max = self._val_to_x(self._max_val)
        active = QRect(x_min, track.top(), x_max - x_min, track.height())
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(100, 180, 255, 140))
        p.drawRoundedRect(active, 5, 5)

        # Handles
        for val, label_text in [(self._min_val, "min"), (self._max_val, "max")]:
            hr = self._handle_rect(val)
            is_active = self._dragging == label_text
            if is_active:
                p.setBrush(QColor(255, 255, 100))
                p.setPen(QPen(QColor(200, 200, 50), 2))
            else:
                p.setBrush(QColor(255, 255, 255))
                p.setPen(
                    QPen(QColor(150, 150, 150) if dark else QColor(120, 120, 120), 1)
                )
            p.drawRoundedRect(hr, 3, 3)

        # Labels
        font = QFont()
        font.setPointSize(8)
        p.setFont(font)
        p.setPen(QColor(255, 255, 255) if dark else QColor(30, 30, 30))
        p.drawText(
            self._val_to_x(self._min_val) - 15, track.bottom() + 14, str(self._min_val)
        )
        p.drawText(
            self._val_to_x(self._max_val) - 15, track.bottom() + 14, str(self._max_val)
        )

    def mousePressEvent(self, event):
        if event.button() != Qt.MouseButton.LeftButton:
            return
        # Check max handle first (so it wins when overlapping)
        if self._handle_rect(self._max_val).contains(event.pos()):
            self._dragging = "max"
            self._drag_offset = event.pos().x() - self._val_to_x(self._max_val)
            self.setCursor(Qt.CursorShape.ClosedHandCursor)
            self.dragStarted.emit()
        elif self._handle_rect(self._min_val).contains(event.pos()):
            self._dragging = "min"
            self._drag_offset = event.pos().x() - self._val_to_x(self._min_val)
            self.setCursor(Qt.CursorShape.ClosedHandCursor)
            self.dragStarted.emit()

    def mouseMoveEvent(self, event):
        if self._dragging is None:
            return
        new_val = self._x_to_val(event.pos().x() - self._drag_offset)
        new_val = max(self.minimum, min(self.maximum, new_val))

        if self._dragging == "min":
            self._min_val = min(new_val, self._max_val)
        else:
            self._max_val = max(new_val, self._min_val)

        self.valueChanged.emit(self._min_val, self._max_val)
        self.update()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self._dragging:
            self._dragging = None
            self.setCursor(Qt.CursorShape.ArrowCursor)
            self.dragFinished.emit()

    def reset(self):
        """Reset to full range."""
        self._min_val = self.minimum
        self._max_val = self.maximum
        self.valueChanged.emit(self._min_val, self._max_val)
        self.update()


class RescaleWidget(QWidget):
    """Widget for min/max intensity rescaling of grayscale images."""

    rescaleChanged = pyqtSignal()
    dragStarted = pyqtSignal()
    dragFinished = pyqtSignal()
    histogramRequested = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._enabled = False
        self._slider_max = 255
        self._output_max = 255
        self._is_grayscale = False
        self._image_array = None  # cached for histogram
        self._crop_coords = None  # (x1, y1, x2, y2) or None
        self._lut = None  # optional LUT from presets (ndarray or None)
        self._preset_name = None  # name of active preset or None
        self._clahe_image = None  # pre-computed CLAHE result (spatial, not LUT)
        self.setupUI()

    def setupUI(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(4)

        # Title row with Hist button
        title_row = QHBoxLayout()
        title_label = QLabel("Rescale (Min/Max)")
        title_label.setStyleSheet("font-weight: bold; font-size: 11px;")
        title_row.addWidget(title_label)
        title_row.addStretch()

        self.hist_btn = QPushButton("Hist")
        self.hist_btn.setToolTip("Open histogram for visual min/max selection")
        self.hist_btn.setFixedSize(36, 20)
        self.hist_btn.setStyleSheet(
            "QPushButton { background-color: #5C6BC0; color: white;"
            " font-size: 9px; font-weight: bold; border-radius: 3px; }"
            "QPushButton:hover { background-color: #7986CB; }"
            "QPushButton:disabled { color: #888; }"
        )
        self.hist_btn.clicked.connect(self.histogramRequested.emit)
        self.hist_btn.setEnabled(False)
        title_row.addWidget(self.hist_btn)

        self.reset_btn = QPushButton("Reset")
        self.reset_btn.setToolTip("Reset rescale to full range")
        self.reset_btn.setFixedSize(40, 20)
        self.reset_btn.setStyleSheet("QPushButton { font-size: 9px; }")
        self.reset_btn.clicked.connect(self._on_reset)
        self.reset_btn.setEnabled(False)
        title_row.addWidget(self.reset_btn)

        layout.addLayout(title_row)

        # Slider
        self.slider = RescaleSlider(0, 255)
        self.slider.valueChanged.connect(self._on_slider_changed)
        self.slider.dragStarted.connect(self.dragStarted.emit)
        self.slider.dragFinished.connect(self._on_drag_finished)
        self.slider.setEnabled(False)
        layout.addWidget(self.slider)

        # Info label
        self.info_label = QLabel("Load a grayscale image to enable")
        self.info_label.setStyleSheet("font-size: 9px;")
        layout.addWidget(self.info_label)

    def update_for_image(self, image_array, crop_coords=None):
        """Update widget based on loaded image.

        Args:
            image_array: numpy array (grayscale 2D or RGB 3D)
            crop_coords: optional (x1, y1, x2, y2) crop region
        """
        self._crop_coords = crop_coords
        self._lut = None
        self._preset_name = None
        self._clahe_image = None

        if image_array is None:
            self._is_grayscale = False
            self._image_array = None
            self.slider.setEnabled(False)
            self.hist_btn.setEnabled(False)
            self.reset_btn.setEnabled(False)
            self.info_label.setText("Load a grayscale image to enable")
            return

        # Only enable for grayscale images
        is_gray = len(image_array.shape) == 2
        self._is_grayscale = is_gray
        self._image_array = image_array

        if not is_gray:
            self.slider.setEnabled(False)
            self.hist_btn.setEnabled(False)
            self.reset_btn.setEnabled(False)
            self.info_label.setText("RGB image — rescale disabled")
            return

        # Set range based on dtype
        if image_array.dtype == np.uint16:
            self._slider_max = 65535
            self._output_max = 65535
        else:
            self._slider_max = 255
            self._output_max = 255

        self.slider.set_range(0, self._slider_max)
        self.slider.setEnabled(True)
        self.hist_btn.setEnabled(True)
        self.reset_btn.setEnabled(True)
        self.info_label.setText(
            f"Range: 0–{self._slider_max}  |  Drag handles to rescale"
        )

    def set_crop_coords(self, crop_coords):
        """Update crop coordinates for histogram region."""
        self._crop_coords = crop_coords

    def _on_slider_changed(self, min_val, max_val):
        # Manual slider movement clears any preset LUT
        if self._lut is not None:
            self._lut = None
            self._preset_name = None
            self._clahe_image = None
            self.info_label.setText(
                f"Range: 0–{self._slider_max}  |  Drag handles to rescale"
            )
        self.rescaleChanged.emit()

    def _on_drag_finished(self):
        self.dragFinished.emit()
        self.rescaleChanged.emit()

    def _on_reset(self):
        self._lut = None
        self._preset_name = None
        self._clahe_image = None
        self.slider.reset()
        self.info_label.setText(
            f"Range: 0–{self._slider_max}  |  Drag handles to rescale"
        )
        self.rescaleChanged.emit()

    def has_active_rescaling(self):
        """Check if rescaling is active (handles moved or LUT set)."""
        if not self._is_grayscale or not self.slider.isEnabled():
            return False
        if self._lut is not None:
            return True
        return (
            self.slider.min_val != self.slider.minimum
            or self.slider.max_val != self.slider.maximum
        )

    def set_lut(self, lut, preset_name):
        """Set a LUT from a preset.

        Args:
            lut: 1D numpy array mapping input→output values
            preset_name: display name of the preset
        """
        self._lut = lut
        self._preset_name = preset_name
        self.info_label.setText(f"Preset: {preset_name}")
        self.rescaleChanged.emit()

    def apply_rescaling(self, image_array, crop_coords=None):
        """Apply rescaling (LUT or linear min/max) to image array.

        Args:
            image_array: numpy array to rescale
            crop_coords: optional (x1, y1, x2, y2) to restrict rescaling

        Returns:
            Rescaled image array
        """
        if not self.has_active_rescaling():
            return image_array
        if len(image_array.shape) != 2:
            return image_array

        # LUT-based rescaling (from presets)
        if self._lut is not None:
            return self._apply_lut(image_array, crop_coords)

        # Linear min/max rescaling
        min_val = float(self.slider.min_val)
        max_val = float(self.slider.max_val)
        out_max = float(self._output_max)

        if max_val <= min_val:
            return image_array

        result = image_array.copy().astype(np.float32)

        if crop_coords is not None:
            x1, y1, x2, y2 = crop_coords
            region = result[y1:y2, x1:x2]
            region = np.clip(region, min_val, max_val)
            region = (region - min_val) / (max_val - min_val) * out_max
            result[y1:y2, x1:x2] = region
        else:
            result = np.clip(result, min_val, max_val)
            result = (result - min_val) / (max_val - min_val) * out_max

        out_dtype = np.uint16 if self._output_max > 255 else np.uint8
        return result.astype(out_dtype)

    def _apply_lut(self, image_array, crop_coords=None):
        """Apply LUT-based or pre-computed transformation."""
        # CLAHE stores a pre-computed spatially-adaptive result
        if self._clahe_image is not None:
            result = image_array.copy()
            if crop_coords is not None:
                x1, y1, x2, y2 = crop_coords
                # _clahe_image is crop-sized (computed on crop region only)
                result[y1:y2, x1:x2] = self._clahe_image
            else:
                result = self._clahe_image.copy()
            return result

        # Standard LUT indexing
        result = image_array.copy()
        lut = self._lut

        if crop_coords is not None:
            x1, y1, x2, y2 = crop_coords
            result[y1:y2, x1:x2] = lut[result[y1:y2, x1:x2]]
        else:
            result = lut[result]

        return result

    def get_image_for_histogram(self):
        """Get the image region for histogram display.

        Returns crop region if crop is active, else full image.
        """
        if self._image_array is None:
            return None
        if self._crop_coords is not None:
            x1, y1, x2, y2 = self._crop_coords
            return self._image_array[y1:y2, x1:x2]
        return self._image_array

    def set_values_from_histogram(self, min_val, max_val):
        """Set slider values from the histogram dialog."""
        self._lut = None
        self._preset_name = None
        self._clahe_image = None
        self.info_label.setText(
            f"Range: 0–{self._slider_max}  |  Drag handles to rescale"
        )
        self.slider.set_values(min_val, max_val)
        self.rescaleChanged.emit()
