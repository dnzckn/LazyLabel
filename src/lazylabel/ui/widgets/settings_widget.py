"""Settings widget for save options."""

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtWidgets import QCheckBox, QGroupBox, QVBoxLayout, QWidget


class PixelPriorityCheckBox(QCheckBox):
    """Custom tri-state checkbox for pixel priority settings."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._state = 0  # 0: disabled, 1: ascending, 2: descending
        self._update_display()
        self.clicked.connect(self._cycle_state)

    def _cycle_state(self):
        """Cycle through the three states."""
        self._state = (self._state + 1) % 3
        self._update_display()

    def _update_display(self):
        """Update checkbox text and check state based on current state."""
        if self._state == 0:
            self.setText("Pixel Priority Ascending")
            self.setChecked(False)
        elif self._state == 1:
            self.setText("Pixel Priority Ascending")
            self.setChecked(True)
        else:  # state == 2
            self.setText("Pixel Priority Descending")
            self.setChecked(True)

    def get_pixel_priority_settings(self):
        """Get current pixel priority settings."""
        return {"enabled": self._state != 0, "ascending": self._state == 1}

    def set_pixel_priority_settings(self, enabled: bool, ascending: bool):
        """Set pixel priority settings."""
        if not enabled:
            self._state = 0
        elif ascending:
            self._state = 1
        else:
            self._state = 2
        self._update_display()


class SettingsWidget(QWidget):
    """Widget for application settings."""

    settings_changed = pyqtSignal()

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
        self.chk_pixel_priority = PixelPriorityCheckBox()
        self.chk_pixel_priority.setToolTip(
            "Control pixel ownership when multiple classes overlap.\n"
            "Click to cycle through: Off → Ascending → Descending → Off\n"
            "Ascending: Lower class indices take priority\n"
            "Descending: Higher class indices take priority"
        )
        layout.addWidget(self.chk_pixel_priority)

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
        ]:
            checkbox.stateChanged.connect(self.settings_changed)

        # Connect pixel priority checkbox (uses clicked signal instead of stateChanged)
        self.chk_pixel_priority.clicked.connect(self.settings_changed)

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

    def get_settings(self):
        """Get current settings as dictionary."""
        pixel_priority_settings = self.chk_pixel_priority.get_pixel_priority_settings()
        return {
            "auto_save": self.chk_auto_save.isChecked(),
            "save_npz": self.chk_save_npz.isChecked(),
            "save_txt": self.chk_save_txt.isChecked(),
            "yolo_use_alias": self.chk_yolo_use_alias.isChecked(),
            "save_class_aliases": self.chk_save_class_aliases.isChecked(),
            "operate_on_view": self.chk_operate_on_view.isChecked(),
            "pixel_priority_enabled": pixel_priority_settings["enabled"],
            "pixel_priority_ascending": pixel_priority_settings["ascending"],
        }

    def set_settings(self, settings):
        """Set settings from dictionary."""
        self.chk_auto_save.setChecked(settings.get("auto_save", True))
        self.chk_save_npz.setChecked(settings.get("save_npz", True))
        self.chk_save_txt.setChecked(settings.get("save_txt", True))
        self.chk_yolo_use_alias.setChecked(settings.get("yolo_use_alias", True))
        self.chk_save_class_aliases.setChecked(
            settings.get("save_class_aliases", False)
        )
        self.chk_operate_on_view.setChecked(settings.get("operate_on_view", False))
        self.chk_pixel_priority.set_pixel_priority_settings(
            settings.get("pixel_priority_enabled", False),
            settings.get("pixel_priority_ascending", True),
        )
