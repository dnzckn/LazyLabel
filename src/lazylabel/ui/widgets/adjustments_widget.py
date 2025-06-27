"""Adjustments widget for sliders and controls."""

from PyQt6.QtWidgets import QWidget, QVBoxLayout, QLabel, QSlider, QGroupBox
from PyQt6.QtCore import Qt, pyqtSignal


class AdjustmentsWidget(QWidget):
    """Widget for adjustment controls."""
    
    annotation_size_changed = pyqtSignal(int)
    pan_speed_changed = pyqtSignal(int)
    join_threshold_changed = pyqtSignal(int)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self._setup_ui()
        self._connect_signals()
    
    def _setup_ui(self):
        """Setup the UI layout."""
        group = QGroupBox("Adjustments")
        layout = QVBoxLayout(group)
        
        # Annotation size
        self.size_label = QLabel("Annotation Size: 1.0x")
        self.size_slider = QSlider(Qt.Orientation.Horizontal)
        self.size_slider.setRange(1, 50)
        self.size_slider.setValue(10)
        self.size_slider.setToolTip("Adjusts the size of points and lines (Ctrl +/-)")
        layout.addWidget(self.size_label)
        layout.addWidget(self.size_slider)
        
        layout.addSpacing(10)
        
        # Pan speed
        self.pan_label = QLabel("Pan Speed: 1.0x")
        self.pan_slider = QSlider(Qt.Orientation.Horizontal)
        self.pan_slider.setRange(1, 100)
        self.pan_slider.setValue(10)
        self.pan_slider.setToolTip(
            "Adjusts the speed of WASD panning. Hold Shift for 5x boost."
        )
        layout.addWidget(self.pan_label)
        layout.addWidget(self.pan_slider)
        
        layout.addSpacing(10)
        
        # Polygon join threshold
        self.join_label = QLabel("Polygon Join Distance: 2px")
        self.join_slider = QSlider(Qt.Orientation.Horizontal)
        self.join_slider.setRange(1, 10)
        self.join_slider.setValue(2)
        self.join_slider.setToolTip("The pixel distance to 'snap' a polygon closed.")
        layout.addWidget(self.join_label)
        layout.addWidget(self.join_slider)
        
        # Main layout
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.addWidget(group)
    
    def _connect_signals(self):
        """Connect internal signals."""
        self.size_slider.valueChanged.connect(self._on_size_changed)
        self.pan_slider.valueChanged.connect(self._on_pan_changed)
        self.join_slider.valueChanged.connect(self._on_join_changed)
    
    def _on_size_changed(self, value):
        """Handle annotation size change."""
        multiplier = value / 10.0
        self.size_label.setText(f"Annotation Size: {multiplier:.1f}x")
        self.annotation_size_changed.emit(value)
    
    def _on_pan_changed(self, value):
        """Handle pan speed change."""
        multiplier = value / 10.0
        self.pan_label.setText(f"Pan Speed: {multiplier:.1f}x")
        self.pan_speed_changed.emit(value)
    
    def _on_join_changed(self, value):
        """Handle join threshold change."""
        self.join_label.setText(f"Polygon Join Distance: {value}px")
        self.join_threshold_changed.emit(value)
    
    def get_annotation_size(self):
        """Get current annotation size value."""
        return self.size_slider.value()
    
    def set_annotation_size(self, value):
        """Set annotation size value."""
        self.size_slider.setValue(value)
    
    def get_pan_speed(self):
        """Get current pan speed value."""
        return self.pan_slider.value()
    
    def set_pan_speed(self, value):
        """Set pan speed value."""
        self.pan_slider.setValue(value)
    
    def get_join_threshold(self):
        """Get current join threshold value."""
        return self.join_slider.value()
    
    def set_join_threshold(self, value):
        """Set join threshold value."""
        self.join_slider.setValue(value)
        self.join_label.setText(f"Polygon Join Distance: {value}px")