"""Fragment threshold widget for AI segmentation filtering."""

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QSlider,
    QVBoxLayout,
    QWidget,
)


class FragmentThresholdWidget(QWidget):
    """Widget for fragment threshold control specific to AI segmentation."""

    fragment_threshold_changed = pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._setup_ui()
        self._connect_signals()

    def _setup_ui(self):
        """Setup the UI layout."""
        group = QGroupBox("AI Fragment Filter")
        layout = QVBoxLayout(group)
        layout.setSpacing(8)

        # Fragment threshold row
        row_layout = QHBoxLayout()
        row_layout.setSpacing(8)

        # Label with fixed width for alignment
        label = QLabel("Filter:")
        label.setFixedWidth(40)
        label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)

        # Text edit with smaller width
        self.fragment_edit = QLineEdit("0")
        self.fragment_edit.setFixedWidth(35)
        self.fragment_edit.setToolTip("Fragment threshold value (0-100)")

        # Slider takes remaining space
        self.fragment_slider = QSlider(Qt.Orientation.Horizontal)
        self.fragment_slider.setRange(0, 100)
        self.fragment_slider.setValue(0)
        self.fragment_slider.setToolTip(
            "Filter out small AI segments. 0=no filtering, 50=drop <50% of largest, 100=only keep largest"
        )

        row_layout.addWidget(label)
        row_layout.addWidget(self.fragment_edit)
        row_layout.addWidget(self.fragment_slider, 1)  # Stretch factor of 1

        layout.addLayout(row_layout)

        # Description label
        desc_label = QLabel("Filters small AI segments relative to the largest segment")
        desc_label.setStyleSheet("color: #888; font-size: 9px; font-style: italic;")
        desc_label.setWordWrap(True)
        layout.addWidget(desc_label)

        # Main layout
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.addWidget(group)

    def _connect_signals(self):
        """Connect internal signals."""
        self.fragment_slider.valueChanged.connect(self._on_fragment_slider_changed)
        self.fragment_edit.editingFinished.connect(self._on_fragment_edit_finished)

    def _on_fragment_slider_changed(self, value):
        """Handle fragment threshold slider change."""
        self.fragment_edit.setText(f"{value}")
        self.fragment_threshold_changed.emit(value)

    def _on_fragment_edit_finished(self):
        """Handle fragment threshold text edit change."""
        try:
            value = int(self.fragment_edit.text())
            slider_value = max(0, min(100, value))
            self.fragment_slider.setValue(slider_value)
            self.fragment_threshold_changed.emit(slider_value)
        except ValueError:
            self.fragment_edit.setText(f"{self.fragment_slider.value()}")

    def get_fragment_threshold(self):
        """Get current fragment threshold value."""
        return self.fragment_slider.value()

    def set_fragment_threshold(self, value):
        """Set fragment threshold value."""
        self.fragment_slider.setValue(value)
        self.fragment_edit.setText(f"{value}")
