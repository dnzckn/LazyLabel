"""Multi-select dropdown widget for choosing export formats."""

from __future__ import annotations

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtWidgets import QMenu, QToolButton

from ...core.exporters import (
    DEFAULT_EXPORT_FORMATS,
    EXPORT_FORMAT_LABELS,
    EXPORT_FORMAT_TOOLTIPS,
    ExportFormat,
)


class ExportFormatWidget(QToolButton):
    """Drop-down checklist for selecting annotation export formats.

    Shows a compact button with abbreviated format names; clicking opens
    a menu with checkable actions for each format.
    """

    formats_changed = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._menu = QMenu(self)
        self._menu.setToolTipsVisible(True)
        self._actions: dict[ExportFormat, object] = {}

        for fmt in ExportFormat:
            action = self._menu.addAction(EXPORT_FORMAT_LABELS[fmt])
            action.setCheckable(True)
            action.setChecked(fmt in DEFAULT_EXPORT_FORMATS)
            action.setToolTip(EXPORT_FORMAT_TOOLTIPS.get(fmt, ""))
            action.toggled.connect(self._on_action_toggled)
            self._actions[fmt] = action

        self.setMenu(self._menu)
        self.setPopupMode(QToolButton.ToolButtonPopupMode.InstantPopup)
        self._update_text()

        self.setMinimumWidth(80)
        self.setMaximumWidth(140)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_selected_formats(self) -> set[ExportFormat]:
        """Return the set of currently selected export formats."""
        return {fmt for fmt, action in self._actions.items() if action.isChecked()}

    def set_selected_formats(self, formats: set[ExportFormat]) -> None:
        """Programmatically set the selected formats (no signal emitted)."""
        self.blockSignals(True)
        for fmt, action in self._actions.items():
            action.setChecked(fmt in formats)
        self.blockSignals(False)
        self._update_text()

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    _ABBREVIATIONS: dict[ExportFormat, str] = {
        ExportFormat.NPZ: "NPZ",
        ExportFormat.NPZ_CLASS_MAP: "NPZ CM",
        ExportFormat.YOLO_DETECTION: "YOLO Det",
        ExportFormat.YOLO_SEGMENTATION: "YOLO Seg",
        ExportFormat.COCO_JSON: "COCO",
        ExportFormat.PASCAL_VOC: "VOC",
        ExportFormat.CREATEML: "CML",
    }

    def _update_text(self) -> None:
        selected = self.get_selected_formats()
        total = len(ExportFormat)
        n = len(selected)
        if n == 0:
            self.setText("(none)")
        elif n == total:
            self.setText("All formats")
        elif n <= 2:
            names = [
                self._ABBREVIATIONS.get(f, f.value)
                for f in ExportFormat
                if f in selected
            ]
            self.setText(", ".join(names))
        else:
            self.setText(f"{n} formats")

    def _on_action_toggled(self, checked: bool) -> None:
        # Enforce at least one format selected
        if not checked:
            selected = self.get_selected_formats()
            if not selected:
                # Re-check the action that was just unchecked
                sender = self.sender()
                if sender is not None:
                    sender.setChecked(True)
                return

        self._update_text()
        self.formats_changed.emit()
