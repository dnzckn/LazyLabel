"""Image adjustments widget for brightness, contrast, gamma, and saturation controls."""

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
    """Widget for image adjustment controls (brightness, contrast, gamma, saturation)."""

    brightness_changed = pyqtSignal(int)
    contrast_changed = pyqtSignal(int)
    gamma_changed = pyqtSignal(int)
    saturation_changed = pyqtSignal(int)
    reset_requested = pyqtSignal()
    image_adjustment_changed = pyqtSignal()
    # Signals for tracking slider drag state
    slider_drag_started = pyqtSignal()
    slider_drag_finished = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._setup_ui()
        self._connect_signals()

    def _setup_ui(self):
        """Setup the UI layout."""
        group = QGroupBox("Image Adjustments")
        layout = QVBoxLayout(group)
        layout.setSpacing(3)

        # Helper function to create compact slider rows
        def create_slider_row(label_text, default_value, slider_range, tooltip):
            row_layout = QHBoxLayout()
            row_layout.setSpacing(8)

            label = QLabel(label_text)
            label.setFixedWidth(80)
            label.setAlignment(
                Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter
            )

            text_edit = QLineEdit(str(default_value))
            text_edit.setFixedWidth(45)

            slider = QSlider(Qt.Orientation.Horizontal)
            slider.setRange(slider_range[0], slider_range[1])
            slider.setValue(int(default_value))
            slider.setToolTip(tooltip)

            row_layout.addWidget(label)
            row_layout.addWidget(text_edit)
            row_layout.addWidget(slider, 1)

            return row_layout, label, text_edit, slider

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
        self.gamma_edit.setText("1.0")
        layout.addLayout(gamma_row)

        # Saturation (slider 0-200, where 100 = 1.0 normal saturation)
        (
            saturation_row,
            self.saturation_label,
            self.saturation_edit,
            self.saturation_slider,
        ) = create_slider_row(
            "Saturate:", "100", (0, 200), "Adjust image saturation (0 = grayscale)"
        )
        self.saturation_edit.setText("1.0")
        layout.addLayout(saturation_row)

        # Main layout
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.addWidget(group)

        self.btn_reset = QPushButton("Reset Image Adjustments")
        self.btn_reset.setToolTip(
            "Reset brightness, contrast, gamma, and saturation to defaults."
        )
        self.btn_reset.setMinimumHeight(28)
        self.btn_reset.setStyleSheet(self._get_button_style())
        main_layout.addWidget(self.btn_reset)

    def _connect_signals(self):
        """Connect internal signals."""
        self.brightness_slider.valueChanged.connect(self._on_brightness_slider_changed)
        self.brightness_slider.sliderPressed.connect(self.slider_drag_started)
        self.brightness_slider.sliderReleased.connect(
            self._on_image_adjustment_slider_released
        )
        self.brightness_edit.editingFinished.connect(self._on_brightness_edit_finished)
        self.contrast_slider.valueChanged.connect(self._on_contrast_slider_changed)
        self.contrast_slider.sliderPressed.connect(self.slider_drag_started)
        self.contrast_slider.sliderReleased.connect(
            self._on_image_adjustment_slider_released
        )
        self.contrast_edit.editingFinished.connect(self._on_contrast_edit_finished)
        self.gamma_slider.valueChanged.connect(self._on_gamma_slider_changed)
        self.gamma_slider.sliderPressed.connect(self.slider_drag_started)
        self.gamma_slider.sliderReleased.connect(
            self._on_image_adjustment_slider_released
        )
        self.gamma_edit.editingFinished.connect(self._on_gamma_edit_finished)
        self.saturation_slider.valueChanged.connect(self._on_saturation_slider_changed)
        self.saturation_slider.sliderPressed.connect(self.slider_drag_started)
        self.saturation_slider.sliderReleased.connect(
            self._on_image_adjustment_slider_released
        )
        self.saturation_edit.editingFinished.connect(self._on_saturation_edit_finished)
        self.btn_reset.clicked.connect(self._on_reset_clicked)

    def _on_reset_clicked(self):
        """Handle reset button click."""
        self.reset_to_defaults()
        self.reset_requested.emit()

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

    def _on_saturation_slider_changed(self, value):
        """Handle saturation slider change."""
        saturation_val = value / 100.0
        self.saturation_edit.setText(f"{saturation_val:.2f}")
        self.saturation_changed.emit(value)

    def _on_saturation_edit_finished(self):
        try:
            value = float(self.saturation_edit.text())
            slider_value = int(value * 100)
            slider_value = max(0, min(200, slider_value))
            self.saturation_slider.setValue(slider_value)
            self.saturation_changed.emit(slider_value)
        except ValueError:
            self.saturation_edit.setText(
                f"{self.saturation_slider.value() / 100.0:.2f}"
            )

    def _on_image_adjustment_slider_released(self):
        """Emit signal when any image adjustment slider is released."""
        self.slider_drag_finished.emit()
        self.image_adjustment_changed.emit()

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

    def get_saturation(self):
        """Get current saturation value."""
        return self.saturation_slider.value()

    def set_saturation(self, value):
        """Set saturation value."""
        self.saturation_slider.setValue(value)
        self.saturation_edit.setText(f"{value / 100.0:.2f}")

    def reset_to_defaults(self):
        """Reset all image adjustment values to their default states."""
        self.set_brightness(0)
        self.set_contrast(0)
        self.set_gamma(100)  # 1.0
        self.set_saturation(100)  # 1.0

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
