"""Hotkey configuration dialog."""

from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QColor, QFont, QKeySequence
from PyQt6.QtWidgets import (
    QDialog,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from ..config import HotkeyAction, HotkeyManager
from ..utils.logger import logger


class HotkeyLineEdit(QLineEdit):
    """Custom line edit that captures key sequences."""

    key_captured = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setReadOnly(True)
        self.setPlaceholderText("Click and press a key (Esc to cancel)")
        self.capturing = False
        self.original_style = self.styleSheet()

        # Timeout timer to auto-cancel capture
        self.timeout_timer = QTimer()
        self.timeout_timer.setSingleShot(True)
        self.timeout_timer.timeout.connect(self._timeout_capture)
        self.timeout_duration = 15000  # 15 seconds

    def mousePressEvent(self, event):
        """Start capturing keys when clicked."""
        if event.button() == Qt.MouseButton.LeftButton:
            self.start_capture()
        super().mousePressEvent(event)

    def start_capture(self):
        """Start capturing key input."""
        self.capturing = True
        self.setText("Press a key (Esc to cancel)")
        self.setStyleSheet("background-color: #ffeb3b; color: black;")
        self.setFocus()
        self.timeout_timer.start(self.timeout_duration)

    def stop_capture(self):
        """Stop capturing key input."""
        self.capturing = False
        self.setStyleSheet(self.original_style)
        self.clearFocus()
        self.timeout_timer.stop()

    def keyPressEvent(self, event):
        """Capture key press events."""
        if not self.capturing:
            super().keyPressEvent(event)
            return

        # Handle Escape key to cancel capture
        if event.key() == Qt.Key.Key_Escape:
            self.setText("")  # Clear the field
            self.stop_capture()
            return

        # Ignore modifier-only keys and other problematic keys
        ignored_keys = {
            Qt.Key.Key_Control,
            Qt.Key.Key_Shift,
            Qt.Key.Key_Alt,
            Qt.Key.Key_Meta,
            Qt.Key.Key_CapsLock,
            Qt.Key.Key_NumLock,
            Qt.Key.Key_ScrollLock,
            Qt.Key.Key_unknown,
            Qt.Key.Key_Tab,
            Qt.Key.Key_Backtab,
        }

        if event.key() in ignored_keys:
            return

        try:
            # Create key sequence - properly handle modifiers
            modifiers = event.modifiers()
            key = event.key()

            # Skip invalid keys
            if key == 0 or key == Qt.Key.Key_unknown:
                return

            # Convert modifiers to int and combine with key
            modifier_int = (
                int(modifiers.value) if hasattr(modifiers, "value") else int(modifiers)
            )
            key_combination = key | modifier_int

            key_sequence = QKeySequence(key_combination)
            key_string = key_sequence.toString()

            # Only accept valid, non-empty key strings
            if key_string and key_string.strip():
                self.setText(key_string)
                self.key_captured.emit(key_string)
                self.stop_capture()
            else:
                # Invalid key combination, just ignore
                return

        except Exception as e:
            logger.error(f"Error capturing key sequence: {e}")
            # Cancel capture on any error
            self.setText("")
            self.stop_capture()

    def focusOutEvent(self, event):
        """Stop capturing when focus is lost."""
        if self.capturing:
            self.stop_capture()
            if not self.text() or self.text().startswith("Press a key"):
                self.setText("")
        super().focusOutEvent(event)

    def _timeout_capture(self):
        """Handle capture timeout."""
        if self.capturing:
            self.setText("")
            self.stop_capture()


class HotkeyDialog(QDialog):
    """Dialog for configuring hotkeys."""

    def __init__(self, hotkey_manager: HotkeyManager, parent=None):
        super().__init__(parent)
        self.hotkey_manager = hotkey_manager
        self.modified = False
        self.key_widgets = {}  # Maps (action_name, key_type) to widget

        self.setWindowTitle("Hotkey Configuration")
        self.setModal(True)
        self.resize(800, 600)

        self._setup_ui()
        self._populate_hotkeys()

    def _setup_ui(self):
        """Setup the dialog UI."""
        layout = QVBoxLayout(self)

        # Title
        title = QLabel("Hotkey Configuration")
        title_font = QFont()
        title_font.setPointSize(16)
        title_font.setBold(True)
        title.setFont(title_font)
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(title)

        # Instructions
        instructions = QLabel(
            "Click on a hotkey field and press the desired key combination. "
            "Mouse-related actions cannot be modified."
        )
        instructions.setWordWrap(True)
        instructions.setStyleSheet("color: #666; margin: 10px;")
        layout.addWidget(instructions)

        # Tab widget for categories
        self.tab_widget = QTabWidget()
        layout.addWidget(self.tab_widget)

        # Button layout
        button_layout = QHBoxLayout()

        # Save button
        self.save_button = QPushButton("Save Hotkeys")
        self.save_button.setToolTip(
            "Save hotkeys to file for persistence between sessions"
        )
        self.save_button.clicked.connect(self._save_hotkeys)
        button_layout.addWidget(self.save_button)

        # Defaults button
        self.defaults_button = QPushButton("Reset to Defaults")
        self.defaults_button.setToolTip("Reset all hotkeys to default values")
        self.defaults_button.clicked.connect(self._reset_to_defaults)
        button_layout.addWidget(self.defaults_button)

        button_layout.addStretch()

        # Close button
        self.close_button = QPushButton("Close")
        self.close_button.clicked.connect(self.accept)
        button_layout.addWidget(self.close_button)

        layout.addLayout(button_layout)

    def _create_category_tab(
        self, category_name: str, actions: list[HotkeyAction]
    ) -> QWidget:
        """Create a tab for a category of hotkeys."""
        widget = QWidget()
        layout = QVBoxLayout(widget)

        # Create table
        table = QTableWidget()
        table.setColumnCount(4)
        table.setHorizontalHeaderLabels(
            ["Action", "Description", "Primary Key", "Secondary Key"]
        )
        table.setRowCount(len(actions))

        # Configure table
        header = table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)

        table.setAlternatingRowColors(True)
        table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)

        # Populate table
        for row, action in enumerate(actions):
            # Action name
            name_item = QTableWidgetItem(action.name.replace("_", " ").title())
            name_item.setFlags(name_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            table.setItem(row, 0, name_item)

            # Description
            desc_item = QTableWidgetItem(action.description)
            desc_item.setFlags(desc_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            table.setItem(row, 1, desc_item)

            # Primary key
            primary_edit = HotkeyLineEdit()
            primary_edit.setText(action.primary_key or "")
            primary_edit.setEnabled(not action.mouse_related)
            if action.mouse_related:
                primary_edit.setStyleSheet("background-color: #f0f0f0; color: #666;")
                primary_edit.setToolTip("Mouse-related actions cannot be modified")
            else:
                primary_edit.key_captured.connect(
                    lambda key, name=action.name: self._update_primary_key(name, key)
                )
            table.setCellWidget(row, 2, primary_edit)
            self.key_widgets[(action.name, "primary")] = primary_edit

            # Secondary key
            secondary_edit = HotkeyLineEdit()
            secondary_edit.setText(action.secondary_key or "")
            secondary_edit.setEnabled(not action.mouse_related)
            if action.mouse_related:
                secondary_edit.setStyleSheet("background-color: #f0f0f0; color: #666;")
                secondary_edit.setToolTip("Mouse-related actions cannot be modified")
            else:
                secondary_edit.key_captured.connect(
                    lambda key, name=action.name: self._update_secondary_key(name, key)
                )
            table.setCellWidget(row, 3, secondary_edit)
            self.key_widgets[(action.name, "secondary")] = secondary_edit

            # Style mouse-related rows
            if action.mouse_related:
                for col in range(4):
                    item = table.item(row, col)
                    if item:
                        item.setBackground(QColor("#f8f8f8"))

        layout.addWidget(table)
        return widget

    def _populate_hotkeys(self):
        """Populate the hotkey tabs."""
        categories = self.hotkey_manager.get_actions_by_category()

        # Define tab order
        tab_order = [
            "Modes",
            "Actions",
            "Navigation",
            "Segments",
            "View",
            "Movement",
            "Mouse",
            "General",
        ]

        for category in tab_order:
            if category in categories:
                tab_widget = self._create_category_tab(category, categories[category])
                self.tab_widget.addTab(tab_widget, category)

        # Add any remaining categories
        for category, actions in categories.items():
            if category not in tab_order:
                tab_widget = self._create_category_tab(category, actions)
                self.tab_widget.addTab(tab_widget, category)

    def _update_primary_key(self, action_name: str, key: str):
        """Update primary key for an action."""
        # Check for conflicts
        conflict = self.hotkey_manager.is_key_in_use(key, exclude_action=action_name)
        if conflict:
            QMessageBox.warning(
                self,
                "Key Conflict",
                f"The key '{key}' is already used by '{conflict.replace('_', ' ').title()}'. "
                "Please choose a different key.",
            )
            # Reset the field
            widget = self.key_widgets.get((action_name, "primary"))
            if widget:
                action = self.hotkey_manager.get_action(action_name)
                widget.setText(action.primary_key if action else "")
            return

        # Update the hotkey
        if self.hotkey_manager.set_primary_key(action_name, key):
            self.modified = True

    def _update_secondary_key(self, action_name: str, key: str):
        """Update secondary key for an action."""
        # Allow empty key for secondary
        if not key:
            self.hotkey_manager.set_secondary_key(action_name, None)
            self.modified = True
            return

        # Check for conflicts
        conflict = self.hotkey_manager.is_key_in_use(key, exclude_action=action_name)
        if conflict:
            QMessageBox.warning(
                self,
                "Key Conflict",
                f"The key '{key}' is already used by '{conflict.replace('_', ' ').title()}'. "
                "Please choose a different key.",
            )
            # Reset the field
            widget = self.key_widgets.get((action_name, "secondary"))
            if widget:
                action = self.hotkey_manager.get_action(action_name)
                widget.setText(action.secondary_key or "")
            return

        # Update the hotkey
        if self.hotkey_manager.set_secondary_key(action_name, key):
            self.modified = True

    def _save_hotkeys(self):
        """Save hotkeys to file."""
        try:
            self.hotkey_manager.save_hotkeys()
            QMessageBox.information(
                self,
                "Hotkeys Saved",
                "Hotkeys have been saved and will persist between sessions.",
            )
        except Exception as e:
            QMessageBox.critical(
                self, "Save Error", f"Failed to save hotkeys: {str(e)}"
            )

    def _reset_to_defaults(self):
        """Reset all hotkeys to defaults."""
        reply = QMessageBox.question(
            self,
            "Reset Hotkeys",
            "Are you sure you want to reset all hotkeys to their default values?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )

        if reply == QMessageBox.StandardButton.Yes:
            self.hotkey_manager.reset_to_defaults()
            self.modified = True

            # Update all widgets
            for (action_name, key_type), widget in self.key_widgets.items():
                action = self.hotkey_manager.get_action(action_name)
                if action:
                    if key_type == "primary":
                        widget.setText(action.primary_key or "")
                    else:
                        widget.setText(action.secondary_key or "")

    def closeEvent(self, event):
        """Handle dialog close."""
        if self.modified:
            reply = QMessageBox.question(
                self,
                "Unsaved Changes",
                "You have unsaved hotkey changes. Do you want to apply them for this session?",
                QMessageBox.StandardButton.Yes
                | QMessageBox.StandardButton.No
                | QMessageBox.StandardButton.Cancel,
                QMessageBox.StandardButton.Yes,
            )

            if reply == QMessageBox.StandardButton.Cancel:
                event.ignore()
                return
            elif reply == QMessageBox.StandardButton.No:
                # Reload from file to discard changes
                self.hotkey_manager.load_hotkeys()

        super().closeEvent(event)
