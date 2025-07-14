from pathlib import Path

from PyQt6.QtCore import QDir, QModelIndex, Qt
from PyQt6.QtGui import QBrush, QColor, QFileSystemModel


class CustomFileSystemModel(QFileSystemModel):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFilter(QDir.Filter.NoDotAndDotDot | QDir.Filter.Files)
        self.setNameFilterDisables(False)
        self.setNameFilters(["*.png", "*.jpg", "*.jpeg", "*.tiff", "*.tif"])
        self.highlighted_path = None

        self.npz_files = set()
        self.txt_files = set()

    def setRootPath(self, path: str) -> QModelIndex:
        self._scan_directory(path)
        return super().setRootPath(path)

    def _scan_directory(self, path: str):
        """Scans the directory once and caches the basenames of .npz and .txt files."""
        self.npz_files.clear()
        self.txt_files.clear()
        if not path:
            return

        directory = Path(path)
        if not directory.is_dir():
            return

        try:
            for file_path in directory.iterdir():
                if file_path.suffix == ".npz":
                    self.npz_files.add(file_path.stem)
                elif file_path.suffix == ".txt":
                    self.txt_files.add(file_path.stem)
        except OSError:
            pass

    def update_cache_for_path(self, saved_file_path: str):
        """Incrementally updates the cache and the view for a newly saved or deleted file."""
        if not saved_file_path:
            return

        p = Path(saved_file_path)
        base_name = p.stem

        if p.suffix == ".npz":
            if p.exists():
                self.npz_files.add(base_name)
            else:
                self.npz_files.discard(base_name)
        elif p.suffix == ".txt":
            if p.exists():
                self.txt_files.add(base_name)
            else:
                self.txt_files.discard(base_name)
        else:
            return

        # Find the model index for the corresponding image file to refresh its row
        # This assumes the image file is in the same directory (the root path)
        root_path = Path(self.rootPath())
        for image_ext in self.nameFilters():  # e.g., '*.png', '*.jpg'
            # Construct full path to the potential image file
            image_file = root_path / (base_name + image_ext.replace("*", ""))
            index = self.index(str(image_file))

            if index.isValid() and index.row() != -1:
                # Found the corresponding image file, emit signal to refresh its checkmarks
                index_col1 = self.index(index.row(), 1, index.parent())
                index_col2 = self.index(index.row(), 2, index.parent())
                self.dataChanged.emit(
                    index_col1, index_col2, [Qt.ItemDataRole.CheckStateRole]
                )
                break

    def set_highlighted_path(self, path):
        self.highlighted_path = str(Path(path)) if path else None
        self.layoutChanged.emit()

    def columnCount(self, parent: QModelIndex = QModelIndex()) -> int:
        return 3

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
                return ".npz"
            if section == 2:
                return ".txt"
        return super().headerData(section, orientation, role)

    def data(self, index: QModelIndex, role: int = Qt.ItemDataRole.DisplayRole):
        if not index.isValid():
            return None

        if role == Qt.ItemDataRole.BackgroundRole:
            filePath = self.filePath(index)
            if self.highlighted_path:
                p_file = Path(filePath)
                p_highlight = Path(self.highlighted_path)
                if p_file.with_suffix("") == p_highlight.with_suffix(""):
                    return QBrush(QColor(40, 80, 40))

        if index.column() > 0 and role == Qt.ItemDataRole.CheckStateRole:
            fileName = self.fileName(index.siblingAtColumn(0))
            base_name = Path(fileName).stem

            if index.column() == 1:
                exists = base_name in self.npz_files
            elif index.column() == 2:
                exists = base_name in self.txt_files
            else:
                return None

            return Qt.CheckState.Checked if exists else Qt.CheckState.Unchecked

        if index.column() > 0 and role == Qt.ItemDataRole.DisplayRole:
            return ""

        return super().data(index, role)
