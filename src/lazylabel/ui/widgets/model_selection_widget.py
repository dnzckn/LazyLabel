"""Model selection widget."""

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QMenu,
    QPushButton,
    QToolButton,
    QVBoxLayout,
    QWidget,
)


class CustomDropdown(QToolButton):
    """Custom dropdown using QToolButton + QMenu for reliable closing behavior."""

    activated = pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setText("Default (vit_h)")
        self.setPopupMode(QToolButton.ToolButtonPopupMode.InstantPopup)
        self.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextOnly)

        # Create the menu
        self.menu = QMenu(self)
        self.setMenu(self.menu)

        # Store items for access
        self.items = []

        # Style to match app theme (dark theme with consistent colors)
        self.setStyleSheet("""
            QToolButton {
                background-color: rgba(40, 40, 40, 0.8);
                border: 1px solid rgba(80, 80, 80, 0.6);
                border-radius: 6px;
                color: #E0E0E0;
                font-size: 10px;
                padding: 5px 8px;
                text-align: left;
                min-width: 150px;
            }
            QToolButton:hover {
                background-color: rgba(60, 60, 60, 0.8);
                border-color: rgba(90, 120, 150, 0.8);
            }
            QToolButton:pressed {
                background-color: rgba(70, 100, 130, 0.8);
            }
            QToolButton::menu-indicator {
                subcontrol-origin: padding;
                subcontrol-position: top right;
                width: 16px;
                border-left: 1px solid rgba(80, 80, 80, 0.6);
            }
        """)

    def addItem(self, text, data=None):
        """Add an item to the dropdown."""
        action = self.menu.addAction(text)
        action.setData(data)
        self.items.append((text, data))

        # Connect to selection handler
        action.triggered.connect(
            lambda checked, idx=len(self.items) - 1: self._on_item_selected(idx)
        )

        # Set first item as current
        if len(self.items) == 1:
            self.setText(text)

    def clear(self):
        """Clear all items."""
        self.menu.clear()
        self.items.clear()

    def _on_item_selected(self, index):
        """Handle item selection."""
        if 0 <= index < len(self.items):
            text, data = self.items[index]
            self.setText(text)
            self.activated.emit(index)

    def itemText(self, index):
        """Get text of item at index."""
        if 0 <= index < len(self.items):
            return self.items[index][0]
        return ""

    def itemData(self, index):
        """Get data of item at index."""
        if 0 <= index < len(self.items):
            return self.items[index][1]
        return None

    def currentIndex(self):
        """Get current selected index."""
        current_text = self.text()
        for i, (text, _) in enumerate(self.items):
            if text == current_text:
                return i
        return 0

    def setCurrentIndex(self, index):
        """Set current selected index."""
        if 0 <= index < len(self.items):
            text, _ = self.items[index]
            self.setText(text)

    def blockSignals(self, block):
        """Block/unblock signals."""
        super().blockSignals(block)


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
        self.btn_browse.setMinimumHeight(28)
        self.btn_browse.setStyleSheet(self._get_button_style())

        self.btn_refresh = QPushButton("Refresh")
        self.btn_refresh.setToolTip("Refresh the list of available models")
        self.btn_refresh.setMinimumHeight(28)
        self.btn_refresh.setStyleSheet(self._get_button_style())

        button_layout.addWidget(self.btn_browse)
        button_layout.addWidget(self.btn_refresh)
        layout.addLayout(button_layout)

        # Model combo
        layout.addWidget(QLabel("Available Models:"))
        self.model_combo = CustomDropdown()
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
        # Use activated signal which fires when user actually selects an item
        self.model_combo.activated.connect(self._on_model_activated)

    def _on_model_activated(self, index):
        """Handle model selection when user clicks on an item."""
        # Get the selected text
        selected_text = self.model_combo.itemText(index)

        # Emit the signal immediately
        self.model_selected.emit(selected_text)

    def populate_models(self, models: list[tuple[str, str]]):
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
