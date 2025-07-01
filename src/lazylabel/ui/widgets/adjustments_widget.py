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
        layout.setSpacing(3)  # Reduced spacing between controls

        # Helper function to create compact slider rows
        def create_slider_row(
            label_text, default_value, slider_range, tooltip, is_float=False
        ):
            row_layout = QHBoxLayout()
            row_layout.setSpacing(8)

            # Label with fixed width for alignment
            label = QLabel(label_text)
            label.setFixedWidth(80)
            label.setAlignment(
                Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter
            )

            # Text edit with smaller width
            text_edit = QLineEdit(str(default_value))
            text_edit.setFixedWidth(35)

            # Slider takes remaining space
            slider = QSlider(Qt.Orientation.Horizontal)
            slider.setRange(slider_range[0], slider_range[1])

            # Convert default_value to appropriate type before setting slider value
            if is_float:
                float_value = float(default_value)
                slider.setValue(int(float_value * 10))
            else:
                int_value = int(default_value)
                slider.setValue(int_value)

            slider.setToolTip(tooltip)

            row_layout.addWidget(label)
            row_layout.addWidget(text_edit)
            row_layout.addWidget(slider, 1)  # Stretch factor of 1

            return row_layout, label, text_edit, slider

        # Annotation size
        size_row, self.size_label, self.size_edit, self.size_slider = create_slider_row(
            "Size:",
            "1.0",
            (1, 50),
            "Adjusts the size of points and lines (Ctrl +/-)",
            True,
        )
        layout.addLayout(size_row)

        # Pan speed
        pan_row, self.pan_label, self.pan_edit, self.pan_slider = create_slider_row(
            "Pan:",
            "1.0",
            (1, 100),
            "Adjusts the speed of WASD panning. Hold Shift for 5x boost.",
            True,
        )
        layout.addLayout(pan_row)

        # Polygon join threshold
        join_row, self.join_label, self.join_edit, self.join_slider = create_slider_row(
            "Join:", "2", (1, 10), "The pixel distance to 'snap' a polygon closed."
        )
        layout.addLayout(join_row)

        # Add separator for image adjustments
        layout.addSpacing(8)

        # Brightness
        (
            brightness_row,
            self.brightness_label,
            self.brightness_edit,
            self.brightness_slider,
        ) = create_slider_row("Bright:", "0", (-100, 100), "Adjust image brightness")
        layout.addLayout(brightness_row)

        # Contrast
        contrast_row, self.contrast_label, self.contrast_edit, self.contrast_slider = (
            create_slider_row("Contrast:", "0", (-100, 100), "Adjust image contrast")
        )
        layout.addLayout(contrast_row)

        # Gamma (uses different scaling: slider_value / 100.0)
        gamma_row, self.gamma_label, self.gamma_edit, self.gamma_slider = (
            create_slider_row("Gamma:", "100", (1, 200), "Adjust image gamma")
        )
        # Set display text to show actual gamma value
        self.gamma_edit.setText("1.0")
        layout.addLayout(gamma_row)

        # Main layout
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.addWidget(group)

        self.btn_reset = QPushButton("Reset to Defaults")
        self.btn_reset.setToolTip(
            "Reset all image adjustment and annotation size settings to their default values."
        )
        self.btn_reset.setMinimumHeight(28)
        self.btn_reset.setStyleSheet(self._get_button_style())
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

    def _get_button_style(self):
        """Get consistent button styling."""
        return """
            QPushButton {
                background-color: rgba(70, 100, 130, 0.8);
                border: 1px solid rgba(90, 120, 150, 0.8);
                border-radius: 6px;
                color: #E0E0E0;
                font-weight: bold;
                font-size: 10px;
                padding: 4px 8px;
            }
            QPushButton:hover {
                background-color: rgba(90, 120, 150, 0.9);
                border-color: rgba(110, 140, 170, 0.9);
            }
            QPushButton:pressed {
                background-color: rgba(50, 80, 110, 0.9);
            }
        """
