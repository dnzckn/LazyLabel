"""Settings widget for save options."""

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtWidgets import QCheckBox, QGroupBox, QVBoxLayout, QWidget


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
        return {
            "auto_save": self.chk_auto_save.isChecked(),
            "save_npz": self.chk_save_npz.isChecked(),
            "save_txt": self.chk_save_txt.isChecked(),
            "yolo_use_alias": self.chk_yolo_use_alias.isChecked(),
            "save_class_aliases": self.chk_save_class_aliases.isChecked(),
            "operate_on_view": self.chk_operate_on_view.isChecked(),
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
