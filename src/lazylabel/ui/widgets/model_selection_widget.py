"""Model selection widget."""

from PyQt6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QComboBox, QGroupBox
from PyQt6.QtCore import pyqtSignal
from typing import List, Tuple


class ModelSelectionWidget(QWidget):
    """Widget for model selection and management."""
    
    browse_requested = pyqtSignal()
    refresh_requested = pyqtSignal()
    model_selected = pyqtSignal(str)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self._setup_ui()
        self._connect_signals()
    
    def _setup_ui(self):
        """Setup the UI layout."""
        group = QGroupBox("Model Selection")
        layout = QVBoxLayout(group)
        
        # Buttons
        button_layout = QHBoxLayout()
        self.btn_browse = QPushButton("Browse Models")
        self.btn_browse.setToolTip("Browse for a folder containing .pth model files")
        self.btn_refresh = QPushButton("Refresh")
        self.btn_refresh.setToolTip("Refresh the list of available models")
        
        button_layout.addWidget(self.btn_browse)
        button_layout.addWidget(self.btn_refresh)
        layout.addLayout(button_layout)
        
        # Model combo
        layout.addWidget(QLabel("Available Models:"))
        self.model_combo = QComboBox()
        self.model_combo.setToolTip("Select a .pth model file to use")
        self.model_combo.addItem("Default (vit_h)")
        layout.addWidget(self.model_combo)
        
        # Current model label
        self.current_model_label = QLabel("Current: Default SAM Model")
        self.current_model_label.setWordWrap(True)
        self.current_model_label.setStyleSheet("color: #90EE90; font-style: italic;")
        layout.addWidget(self.current_model_label)
        
        # Main layout
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.addWidget(group)
    
    def _connect_signals(self):
        """Connect internal signals."""
        self.btn_browse.clicked.connect(self.browse_requested)
        self.btn_refresh.clicked.connect(self.refresh_requested)
        self.model_combo.currentTextChanged.connect(self.model_selected)
    
    def populate_models(self, models: List[Tuple[str, str]]):
        """Populate the models combo box.
        
        Args:
            models: List of (display_name, full_path) tuples
        """
        self.model_combo.blockSignals(True)
        self.model_combo.clear()
        
        # Add default option
        self.model_combo.addItem("Default (vit_h)")
        
        # Add custom models
        for display_name, full_path in models:
            self.model_combo.addItem(display_name, full_path)
        
        self.model_combo.blockSignals(False)
    
    def set_current_model(self, model_name: str):
        """Set the current model display."""
        self.current_model_label.setText(model_name)
    
    def get_selected_model_path(self) -> str:
        """Get the path of the currently selected model."""
        current_index = self.model_combo.currentIndex()
        if current_index <= 0:  # Default option
            return ""
        return self.model_combo.itemData(current_index) or ""
    
    def reset_to_default(self):
        """Reset selection to default model."""
        self.model_combo.blockSignals(True)
        self.model_combo.setCurrentIndex(0)
        self.model_combo.blockSignals(False)
        self.set_current_model("Current: Default SAM Model")