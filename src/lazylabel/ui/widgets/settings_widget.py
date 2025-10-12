"""Settings widget for save options."""

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtWidgets import (
    QButtonGroup,
    QCheckBox,
    QGroupBox,
    QHBoxLayout,
    QPushButton,
    QRadioButton,
    QVBoxLayout,
    QWidget,
)


class SettingsWidget(QWidget):
    """Widget for application settings."""

    settings_changed = pyqtSignal()
    reset_to_default_requested = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._setup_ui()
        self._connect_signals()

    def _setup_ui(self):
        """Setup the UI layout."""
        group = QGroupBox("Settings")
        layout = QVBoxLayout(group)

        # Auto-save
        self.chk_auto_save = QCheckBox("Auto-Save on Navigate")
        self.chk_auto_save.setToolTip(
            "Automatically save work when switching to any new image (navigation keys, double-click, etc.)"
        )
        self.chk_auto_save.setChecked(True)
        layout.addWidget(self.chk_auto_save)

        # Save NPZ
        self.chk_save_npz = QCheckBox("Save .npz")
        self.chk_save_npz.setChecked(True)
        self.chk_save_npz.setToolTip(
            "Save the final mask as a compressed NumPy NPZ file."
        )
        layout.addWidget(self.chk_save_npz)

        # Save TXT
        self.chk_save_txt = QCheckBox("Save .txt")
        self.chk_save_txt.setChecked(True)
        self.chk_save_txt.setToolTip(
            "Save bounding box annotations in YOLO TXT format."
        )
        layout.addWidget(self.chk_save_txt)

        # YOLO with aliases
        self.chk_yolo_use_alias = QCheckBox("Save YOLO with Class Aliases")
        self.chk_yolo_use_alias.setToolTip(
            "If checked, saves YOLO .txt files using class alias names instead of numeric IDs.\n"
            "This is useful when a separate .yaml or .names file defines the classes."
        )
        self.chk_yolo_use_alias.setChecked(True)
        layout.addWidget(self.chk_yolo_use_alias)

        # Save class aliases
        self.chk_save_class_aliases = QCheckBox("Save Class Aliases (.json)")
        self.chk_save_class_aliases.setToolTip(
            "Save class aliases to a companion JSON file."
        )
        self.chk_save_class_aliases.setChecked(False)
        layout.addWidget(self.chk_save_class_aliases)

        # Operate on View
        self.chk_operate_on_view = QCheckBox("Operate On View")
        self.chk_operate_on_view.setToolTip(
            "If checked, SAM model will operate on the currently displayed (adjusted) image.\n"
            "Otherwise, it operates on the original image."
        )
        self.chk_operate_on_view.setChecked(False)
        layout.addWidget(self.chk_operate_on_view)

        # Pixel Priority
        self.chk_pixel_priority_enabled = QCheckBox("Enable Pixel Priority")
        self.chk_pixel_priority_enabled.setToolTip(
            "Control pixel ownership when multiple classes overlap"
        )
        layout.addWidget(self.chk_pixel_priority_enabled)

        # Pixel Priority direction (indented)
        priority_direction_layout = QHBoxLayout()
        priority_direction_layout.addSpacing(20)  # Indent

        self.radio_priority_ascending = QRadioButton("Ascending")
        self.radio_priority_ascending.setToolTip(
            "Lower class indices take priority over higher ones"
        )
        self.radio_priority_descending = QRadioButton("Descending")
        self.radio_priority_descending.setToolTip(
            "Higher class indices take priority over lower ones"
        )

        # Group radio buttons so only one can be selected
        self.priority_direction_group = QButtonGroup()
        self.priority_direction_group.addButton(self.radio_priority_ascending)
        self.priority_direction_group.addButton(self.radio_priority_descending)

        priority_direction_layout.addWidget(self.radio_priority_ascending)
        priority_direction_layout.addWidget(self.radio_priority_descending)
        priority_direction_layout.addStretch()

        layout.addLayout(priority_direction_layout)

        # Default state
        self.radio_priority_ascending.setChecked(True)
        self.radio_priority_ascending.setEnabled(False)
        self.radio_priority_descending.setEnabled(False)

        # Reset to Default button
        self.btn_reset_to_default = QPushButton("Reset to Default")
        self.btn_reset_to_default.setToolTip(
            "Reset all settings in this tab to their default values"
        )
        self.btn_reset_to_default.setStyleSheet(
            """
            QPushButton {
                background-color: rgba(80, 80, 80, 0.8);
                border: 1px solid rgba(100, 100, 100, 0.6);
                border-radius: 5px;
                color: #E0E0E0;
                font-size: 11px;
                padding: 6px 12px;
                min-height: 22px;
            }
            QPushButton:hover {
                background-color: rgba(100, 100, 100, 0.9);
            }
            QPushButton:pressed {
                background-color: rgba(60, 60, 60, 0.9);
            }
        """
        )
        layout.addWidget(self.btn_reset_to_default)

        # Main layout
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.addWidget(group)

    def _connect_signals(self):
        """Connect internal signals."""
        self.chk_save_npz.stateChanged.connect(self._handle_save_checkbox_change)
        self.chk_save_txt.stateChanged.connect(self._handle_save_checkbox_change)

        # Connect all checkboxes to settings changed signal
        for checkbox in [
            self.chk_auto_save,
            self.chk_save_npz,
            self.chk_save_txt,
            self.chk_yolo_use_alias,
            self.chk_save_class_aliases,
            self.chk_operate_on_view,
            self.chk_pixel_priority_enabled,
        ]:
            checkbox.stateChanged.connect(self.settings_changed)

        # Connect pixel priority checkbox to enable/disable radio buttons
        self.chk_pixel_priority_enabled.stateChanged.connect(
            self._on_pixel_priority_enabled_changed
        )

        # Connect radio buttons
        self.radio_priority_ascending.toggled.connect(self.settings_changed)
        self.radio_priority_descending.toggled.connect(self.settings_changed)

        # Connect reset button
        self.btn_reset_to_default.clicked.connect(self._handle_reset_to_default)

    def _handle_save_checkbox_change(self):
        """Ensure at least one save format is selected."""
        is_npz_checked = self.chk_save_npz.isChecked()
        is_txt_checked = self.chk_save_txt.isChecked()

        if not is_npz_checked and not is_txt_checked:
            sender = self.sender()
            if sender == self.chk_save_npz:
                self.chk_save_txt.setChecked(True)
            else:
                self.chk_save_npz.setChecked(True)

    def _on_pixel_priority_enabled_changed(self, state):
        """Enable/disable pixel priority direction radio buttons."""
        enabled = state != 0
        self.radio_priority_ascending.setEnabled(enabled)
        self.radio_priority_descending.setEnabled(enabled)

    def get_settings(self):
        """Get current settings as dictionary."""
        return {
            "auto_save": self.chk_auto_save.isChecked(),
            "save_npz": self.chk_save_npz.isChecked(),
            "save_txt": self.chk_save_txt.isChecked(),
            "yolo_use_alias": self.chk_yolo_use_alias.isChecked(),
            "save_class_aliases": self.chk_save_class_aliases.isChecked(),
            "operate_on_view": self.chk_operate_on_view.isChecked(),
            "pixel_priority_enabled": self.chk_pixel_priority_enabled.isChecked(),
            "pixel_priority_ascending": self.radio_priority_ascending.isChecked(),
        }

    def set_settings(self, settings):
        """Set settings from dictionary."""
        # Block signals during programmatic setting to avoid triggering settings_changed
        self.blockSignals(True)

        self.chk_auto_save.setChecked(settings.get("auto_save", True))
        self.chk_save_npz.setChecked(settings.get("save_npz", True))
        self.chk_save_txt.setChecked(settings.get("save_txt", True))
        self.chk_yolo_use_alias.setChecked(settings.get("yolo_use_alias", True))
        self.chk_save_class_aliases.setChecked(
            settings.get("save_class_aliases", False)
        )
        self.chk_operate_on_view.setChecked(settings.get("operate_on_view", False))

        # Pixel priority
        enabled = settings.get("pixel_priority_enabled", False)
        ascending = settings.get("pixel_priority_ascending", True)

        self.chk_pixel_priority_enabled.setChecked(enabled)
        if ascending:
            self.radio_priority_ascending.setChecked(True)
        else:
            self.radio_priority_descending.setChecked(True)

        # Restore signals
        self.blockSignals(False)

    def _handle_reset_to_default(self):
        """Reset all settings to their default values."""
        default_settings = {
            "auto_save": True,
            "save_npz": True,
            "save_txt": True,
            "yolo_use_alias": True,
            "save_class_aliases": False,
            "operate_on_view": False,
            "pixel_priority_enabled": False,
            "pixel_priority_ascending": True,
        }
        self.set_settings(default_settings)
        self.settings_changed.emit()
