"""Adjustments widget for sliders and controls."""

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QSlider,
    QVBoxLayout,
    QWidget,
)


class AdjustmentsWidget(QWidget):
    """Widget for adjustment controls."""

    annotation_size_changed = pyqtSignal(int)
    pan_speed_changed = pyqtSignal(int)
    join_threshold_changed = pyqtSignal(int)
    brightness_changed = pyqtSignal(int)
    contrast_changed = pyqtSignal(int)
    gamma_changed = pyqtSignal(int)
    reset_requested = pyqtSignal()
    image_adjustment_changed = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._setup_ui()
        self._connect_signals()

    def _setup_ui(self):
        """Setup the UI layout."""
        group = QGroupBox("Adjustments")
        layout = QVBoxLayout(group)

        # Annotation size
        size_layout = QHBoxLayout()
        self.size_label = QLabel("Annotation Size:")
        self.size_edit = QLineEdit("1.0")
        self.size_edit.setFixedWidth(50)
        self.size_slider = QSlider(Qt.Orientation.Horizontal)
        self.size_slider.setRange(1, 50)
        self.size_slider.setValue(10)
        self.size_slider.setToolTip("Adjusts the size of points and lines (Ctrl +/-)")
        size_layout.addWidget(self.size_label)
        size_layout.addWidget(self.size_edit)
        size_layout.addStretch()
        layout.addLayout(size_layout)
        layout.addWidget(self.size_slider)

        layout.addSpacing(10)

        # Pan speed
        pan_layout = QHBoxLayout()
        self.pan_label = QLabel("Pan Speed:")
        self.pan_edit = QLineEdit("1.0")
        self.pan_edit.setFixedWidth(50)
        self.pan_slider = QSlider(Qt.Orientation.Horizontal)
        self.pan_slider.setRange(1, 100)
        self.pan_slider.setValue(10)
        self.pan_slider.setToolTip(
            "Adjusts the speed of WASD panning. Hold Shift for 5x boost."
        )
        pan_layout.addWidget(self.pan_label)
        pan_layout.addWidget(self.pan_edit)
        pan_layout.addStretch()
        layout.addLayout(pan_layout)
        layout.addWidget(self.pan_slider)

        layout.addSpacing(10)

        # Polygon join threshold
        join_layout = QHBoxLayout()
        self.join_label = QLabel("Polygon Join Distance:")
        self.join_edit = QLineEdit("2")
        self.join_edit.setFixedWidth(50)
        self.join_slider = QSlider(Qt.Orientation.Horizontal)
        self.join_slider.setRange(1, 10)
        self.join_slider.setValue(2)
        self.join_slider.setToolTip("The pixel distance to 'snap' a polygon closed.")
        join_layout.addWidget(self.join_label)
        join_layout.addWidget(self.join_edit)
        join_layout.addStretch()
        layout.addLayout(join_layout)
        layout.addWidget(self.join_slider)

        layout.addSpacing(10)

        # Brightness
        brightness_layout = QHBoxLayout()
        self.brightness_label = QLabel("Brightness:")
        self.brightness_edit = QLineEdit("0")
        self.brightness_edit.setFixedWidth(50)
        self.brightness_slider = QSlider(Qt.Orientation.Horizontal)
        self.brightness_slider.setRange(-100, 100)
        self.brightness_slider.setValue(0)
        self.brightness_slider.setToolTip("Adjust image brightness")
        brightness_layout.addWidget(self.brightness_label)
        brightness_layout.addWidget(self.brightness_edit)
        brightness_layout.addStretch()
        layout.addLayout(brightness_layout)
        layout.addWidget(self.brightness_slider)

        layout.addSpacing(10)

        # Contrast
        contrast_layout = QHBoxLayout()
        self.contrast_label = QLabel("Contrast:")
        self.contrast_edit = QLineEdit("0")
        self.contrast_edit.setFixedWidth(50)
        self.contrast_slider = QSlider(Qt.Orientation.Horizontal)
        self.contrast_slider.setRange(-100, 100)
        self.contrast_slider.setValue(0)
        self.contrast_slider.setToolTip("Adjust image contrast")
        contrast_layout.addWidget(self.contrast_label)
        contrast_layout.addWidget(self.contrast_edit)
        contrast_layout.addStretch()
        layout.addLayout(contrast_layout)
        layout.addWidget(self.contrast_slider)

        layout.addSpacing(10)

        # Gamma
        gamma_layout = QHBoxLayout()
        self.gamma_label = QLabel("Gamma:")
        self.gamma_edit = QLineEdit("1.0")
        self.gamma_edit.setFixedWidth(50)
        self.gamma_slider = QSlider(Qt.Orientation.Horizontal)
        self.gamma_slider.setRange(1, 200)  # Represents 0.01 to 2.00
        self.gamma_slider.setValue(100)  # Default 1.00
        self.gamma_slider.setToolTip("Adjust image gamma")
        gamma_layout.addWidget(self.gamma_label)
        gamma_layout.addWidget(self.gamma_edit)
        gamma_layout.addStretch()
        layout.addLayout(gamma_layout)
        layout.addWidget(self.gamma_slider)

        # Main layout
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.addWidget(group)

        self.btn_reset = QPushButton("Reset to Defaults")
        self.btn_reset.setToolTip(
            "Reset all image adjustment and annotation size settings to their default values."
        )
        main_layout.addWidget(self.btn_reset)

    def _connect_signals(self):
        """Connect internal signals."""
        self.size_slider.valueChanged.connect(self._on_size_slider_changed)
        self.size_edit.editingFinished.connect(self._on_size_edit_finished)
        self.pan_slider.valueChanged.connect(self._on_pan_slider_changed)
        self.pan_edit.editingFinished.connect(self._on_pan_edit_finished)
        self.join_slider.valueChanged.connect(self._on_join_slider_changed)
        self.join_edit.editingFinished.connect(self._on_join_edit_finished)
        self.brightness_slider.valueChanged.connect(self._on_brightness_slider_changed)
        self.brightness_slider.sliderReleased.connect(
            self._on_image_adjustment_slider_released
        )
        self.brightness_edit.editingFinished.connect(self._on_brightness_edit_finished)
        self.contrast_slider.valueChanged.connect(self._on_contrast_slider_changed)
        self.contrast_slider.sliderReleased.connect(
            self._on_image_adjustment_slider_released
        )
        self.contrast_edit.editingFinished.connect(self._on_contrast_edit_finished)
        self.gamma_slider.valueChanged.connect(self._on_gamma_slider_changed)
        self.gamma_slider.sliderReleased.connect(
            self._on_image_adjustment_slider_released
        )
        self.gamma_edit.editingFinished.connect(self._on_gamma_edit_finished)
        self.btn_reset.clicked.connect(self.reset_requested)

    def _on_size_slider_changed(self, value):
        """Handle annotation size slider change."""
        multiplier = value / 10.0
        self.size_edit.setText(f"{multiplier:.1f}")
        self.annotation_size_changed.emit(value)

    def _on_size_edit_finished(self):
        try:
            value = float(self.size_edit.text())
            slider_value = int(value * 10)
            slider_value = max(1, min(50, slider_value))
            self.size_slider.setValue(slider_value)
            self.annotation_size_changed.emit(slider_value)
        except ValueError:
            self.size_edit.setText(f"{self.size_slider.value() / 10.0:.1f}")

    def _on_pan_slider_changed(self, value):
        """Handle pan speed slider change."""
        multiplier = value / 10.0
        self.pan_edit.setText(f"{multiplier:.1f}")
        self.pan_speed_changed.emit(value)

    def _on_pan_edit_finished(self):
        try:
            value = float(self.pan_edit.text())
            slider_value = int(value * 10)
            slider_value = max(1, min(100, slider_value))
            self.pan_slider.setValue(slider_value)
            self.pan_speed_changed.emit(slider_value)
        except ValueError:
            self.pan_edit.setText(f"{self.pan_slider.value() / 10.0:.1f}")

    def _on_join_slider_changed(self, value):
        """Handle join threshold slider change."""
        self.join_edit.setText(f"{value}")
        self.join_threshold_changed.emit(value)

    def _on_join_edit_finished(self):
        try:
            value = int(self.join_edit.text())
            slider_value = max(1, min(10, value))
            self.join_slider.setValue(slider_value)
            self.join_threshold_changed.emit(slider_value)
        except ValueError:
            self.join_edit.setText(f"{self.join_slider.value()}")

    def _on_brightness_slider_changed(self, value):
        """Handle brightness slider change."""
        self.brightness_edit.setText(f"{value}")
        self.brightness_changed.emit(value)

    def _on_brightness_edit_finished(self):
        try:
            value = int(self.brightness_edit.text())
            slider_value = max(-100, min(100, value))
            self.brightness_slider.setValue(slider_value)
            self.brightness_changed.emit(slider_value)
        except ValueError:
            self.brightness_edit.setText(f"{self.brightness_slider.value()}")

    def _on_contrast_slider_changed(self, value):
        """Handle contrast slider change."""
        self.contrast_edit.setText(f"{value}")
        self.contrast_changed.emit(value)

    def _on_contrast_edit_finished(self):
        try:
            value = int(self.contrast_edit.text())
            slider_value = max(-100, min(100, value))
            self.contrast_slider.setValue(slider_value)
            self.contrast_changed.emit(slider_value)
        except ValueError:
            self.contrast_edit.setText(f"{self.contrast_slider.value()}")

    def _on_gamma_slider_changed(self, value):
        """Handle gamma slider change."""
        gamma_val = value / 100.0
        self.gamma_edit.setText(f"{gamma_val:.2f}")
        self.gamma_changed.emit(value)

    def _on_gamma_edit_finished(self):
        try:
            value = float(self.gamma_edit.text())
            slider_value = int(value * 100)
            slider_value = max(1, min(200, slider_value))
            self.gamma_slider.setValue(slider_value)
            self.gamma_changed.emit(slider_value)
        except ValueError:
            self.gamma_edit.setText(f"{self.gamma_slider.value() / 100.0:.2f}")

    def _on_image_adjustment_slider_released(self):
        """Emit signal when any image adjustment slider is released."""
        self.image_adjustment_changed.emit()

    def get_annotation_size(self):
        """Get current annotation size value."""
        return self.size_slider.value()

    def set_annotation_size(self, value):
        """Set annotation size value."""

        self.size_slider.setValue(value)
        self.size_edit.setText(f"{value / 10.0:.1f}")

    def get_pan_speed(self):
        """Get current pan speed value."""

        return self.pan_slider.value()

    def set_pan_speed(self, value):
        """Set pan speed value."""

        self.pan_slider.setValue(value)
        self.pan_edit.setText(f"{value / 10.0:.1f}")

    def get_join_threshold(self):
        """Get current join threshold value."""

        return self.join_slider.value()

    def set_join_threshold(self, value):
        """Set join threshold value."""

        self.join_slider.setValue(value)
        self.join_edit.setText(f"{value}")

    def get_brightness(self):
        """Get current brightness value."""

        return self.brightness_slider.value()

    def set_brightness(self, value):
        """Set brightness value."""

        self.brightness_slider.setValue(value)
        self.brightness_edit.setText(f"{value}")

    def get_contrast(self):
        """Get current contrast value."""

        return self.contrast_slider.value()

    def set_contrast(self, value):
        """Set contrast value."""

        self.contrast_slider.setValue(value)
        self.contrast_edit.setText(f"{value}")

    def get_gamma(self):
        """Get current gamma value."""

        return self.gamma_slider.value()

    def set_gamma(self, value):
        """Set gamma value."""

        self.gamma_slider.setValue(value)
        self.gamma_edit.setText(f"{value / 100.0:.2f}")

    def reset_to_defaults(self):
        """Reset all adjustment values to their default states."""

        self.set_annotation_size(10)  # Default value
        self.set_pan_speed(10)  # Default value
        self.set_join_threshold(2)  # Default value
        self.set_brightness(0)  # Default value
        self.set_contrast(0)  # Default value
        self.set_gamma(100)  # Default value (1.0)
