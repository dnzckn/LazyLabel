"""Settings widget for save options."""

import contextlib

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtWidgets import (
    QButtonGroup,
    QCheckBox,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QRadioButton,
    QVBoxLayout,
    QWidget,
)

from ...core.exporters import DEFAULT_EXPORT_FORMATS, ExportFormat
from .export_format_widget import ExportFormatWidget


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

        # Export formats dropdown
        export_layout = QHBoxLayout()
        export_label = QLabel("Export Formats:")
        export_label.setStyleSheet("font-size: 11px;")
        self.export_format_widget = ExportFormatWidget()
        self.export_format_widget.setToolTip(
            "Select which annotation formats to save.\n"
            "At least one format must be selected."
        )
        export_layout.addWidget(export_label)
        export_layout.addWidget(self.export_format_widget, 1)
        layout.addLayout(export_layout)

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
        pass
        layout.addWidget(self.btn_reset_to_default)

        # Main layout
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.addWidget(group)

    def _connect_signals(self):
        """Connect internal signals."""
        # Connect checkboxes to settings changed signal
        for checkbox in [
            self.chk_auto_save,
            self.chk_operate_on_view,
            self.chk_pixel_priority_enabled,
        ]:
            checkbox.stateChanged.connect(self.settings_changed)

        # Connect export format widget
        self.export_format_widget.formats_changed.connect(self.settings_changed)

        # Connect pixel priority checkbox to enable/disable radio buttons
        self.chk_pixel_priority_enabled.stateChanged.connect(
            self._on_pixel_priority_enabled_changed
        )

        # Connect radio buttons
        self.radio_priority_ascending.toggled.connect(self.settings_changed)
        self.radio_priority_descending.toggled.connect(self.settings_changed)

        # Connect reset button
        self.btn_reset_to_default.clicked.connect(self._handle_reset_to_default)

    def _on_pixel_priority_enabled_changed(self, state):
        """Enable/disable pixel priority direction radio buttons."""
        enabled = state != 0
        self.radio_priority_ascending.setEnabled(enabled)
        self.radio_priority_descending.setEnabled(enabled)

    def get_settings(self):
        """Get current settings as dictionary."""
        return {
            "auto_save": self.chk_auto_save.isChecked(),
            "export_formats": self.export_format_widget.get_selected_formats(),
            "operate_on_view": self.chk_operate_on_view.isChecked(),
            "pixel_priority_enabled": self.chk_pixel_priority_enabled.isChecked(),
            "pixel_priority_ascending": self.radio_priority_ascending.isChecked(),
        }

    def set_settings(self, settings):
        """Set settings from dictionary."""
        self.blockSignals(True)

        self.chk_auto_save.setChecked(settings.get("auto_save", True))
        self.chk_operate_on_view.setChecked(settings.get("operate_on_view", False))

        # Export formats — accept set[ExportFormat] or list[str]
        raw = settings.get("export_formats")
        if raw is not None:
            if (
                isinstance(raw, set)
                and raw
                and isinstance(next(iter(raw)), ExportFormat)
            ):
                self.export_format_widget.set_selected_formats(raw)
            elif isinstance(raw, list | set):
                fmts = set()
                for v in raw:
                    with contextlib.suppress(ValueError):
                        fmts.add(ExportFormat(v) if isinstance(v, str) else v)
                self.export_format_widget.set_selected_formats(
                    fmts or DEFAULT_EXPORT_FORMATS
                )
        else:
            self.export_format_widget.set_selected_formats(DEFAULT_EXPORT_FORMATS)

        # Pixel priority
        enabled = settings.get("pixel_priority_enabled", False)
        ascending = settings.get("pixel_priority_ascending", True)

        self.chk_pixel_priority_enabled.setChecked(enabled)
        if ascending:
            self.radio_priority_ascending.setChecked(True)
        else:
            self.radio_priority_descending.setChecked(True)

        self.blockSignals(False)

    def _handle_reset_to_default(self):
        """Reset all settings to their default values."""
        default_settings = {
            "auto_save": True,
            "export_formats": DEFAULT_EXPORT_FORMATS,
            "operate_on_view": False,
            "pixel_priority_enabled": False,
            "pixel_priority_ascending": True,
        }
        self.set_settings(default_settings)
        self.settings_changed.emit()
