"""Annotation settings widget for size, pan, and join controls."""

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


class AnnotationSettingsWidget(QWidget):
    """Widget for annotation-related settings (size, pan speed, join threshold)."""

    annotation_size_changed = pyqtSignal(int)
    pan_speed_changed = pyqtSignal(int)
    join_threshold_changed = pyqtSignal(int)
    reset_requested = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._setup_ui()
        self._connect_signals()

    def _setup_ui(self):
        """Setup the UI layout."""
        group = QGroupBox("Annotation Settings")
        layout = QVBoxLayout(group)
        layout.setSpacing(3)

        # Helper function to create compact slider rows
        def create_slider_row(
            label_text, default_value, slider_range, tooltip, is_float=False
        ):
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

            if is_float:
                float_value = float(default_value)
                slider.setValue(int(float_value * 10))
            else:
                int_value = int(default_value)
                slider.setValue(int_value)

            slider.setToolTip(tooltip)

            row_layout.addWidget(label)
            row_layout.addWidget(text_edit)
            row_layout.addWidget(slider, 1)

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

        # Main layout
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.addWidget(group)

        self.btn_reset = QPushButton("Reset Annotation Settings")
        self.btn_reset.setToolTip(
            "Reset annotation size, pan speed, and join threshold to defaults."
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
        self.btn_reset.clicked.connect(self._on_reset_clicked)

    def _on_reset_clicked(self):
        """Handle reset button click."""
        self.reset_to_defaults()
        self.reset_requested.emit()

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

    def reset_to_defaults(self):
        """Reset all annotation settings to their default states."""
        self.set_annotation_size(10)  # Default value (1.0)
        self.set_pan_speed(10)  # Default value (1.0)
        self.set_join_threshold(2)  # Default value

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
