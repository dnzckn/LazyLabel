import os
from PyQt6.QtCore import Qt, QModelIndex, QDir
from PyQt6.QtGui import QFileSystemModel, QBrush, QColor


class CustomFileSystemModel(QFileSystemModel):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFilter(QDir.Filter.NoDotAndDotDot | QDir.Filter.Files)
        self.setNameFilterDisables(False)
        self.setNameFilters(["*.png", "*.jpg", "*.jpeg", "*.tiff"])
        self.highlighted_path = None

    def set_highlighted_path(self, path):
        self.highlighted_path = path

    def columnCount(self, parent: QModelIndex = QModelIndex()) -> int:
        return 2

    def headerData(
        self,
        section: int,
        orientation: Qt.Orientation,
        role: int = Qt.ItemDataRole.DisplayRole,
    ):
        if (
            orientation == Qt.Orientation.Horizontal
            and role == Qt.ItemDataRole.DisplayRole
        ):
            if section == 0:
                return "File Name"
            if section == 1:
                return "Mask"
        return super().headerData(section, orientation, role)

    def data(self, index: QModelIndex, role: int = Qt.ItemDataRole.DisplayRole):
        if not index.isValid():
            return None

        # Handle the temporary highlight for saving
        if role == Qt.ItemDataRole.BackgroundRole:
            filePath = self.filePath(index)
            if filePath == self.highlighted_path:
                return QBrush(QColor("yellow"))

        if index.column() == 1:
            if role == Qt.ItemDataRole.CheckStateRole:
                filePath = self.filePath(index.siblingAtColumn(0))
                mask_path = os.path.splitext(filePath)[0] + ".npz"
                return (
                    Qt.CheckState.Checked
                    if os.path.exists(mask_path)
                    else Qt.CheckState.Unchecked
                )
            return None

        return super().data(index, role)
