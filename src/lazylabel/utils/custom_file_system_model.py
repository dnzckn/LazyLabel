from pathlib import Path

from PyQt6.QtCore import QDir, QModelIndex, Qt
from PyQt6.QtGui import QBrush, QColor, QFileSystemModel

# Each entry: (suffix appended to image stem, column header label)
# Order determines column order (columns 1..N after "File Name").
_FORMAT_COLUMNS: list[tuple[str, str]] = [
    (".npz", "NPZ OHE"),
    ("_CM.npz", "NPZ CM"),
    (".txt", "YOLO Det"),
    ("_seg.txt", "YOLO Seg"),
    ("_coco.json", "COCO"),
    (".xml", "VOC"),
    ("_createml.json", "CreateML"),
]

# Sorted longest-first so compound suffixes match before simple ones
# (e.g. "_seg.txt" before ".txt").
_SUFFIXES_BY_LENGTH: list[tuple[str, str]] = sorted(
    _FORMAT_COLUMNS, key=lambda x: len(x[0]), reverse=True
)


class CustomFileSystemModel(QFileSystemModel):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFilter(QDir.Filter.NoDotAndDotDot | QDir.Filter.Files)
        self.setNameFilterDisables(False)
        self.setNameFilters(["*.png", "*.jpg", "*.jpeg", "*.tiff", "*.tif"])
        self.highlighted_path = None

        # Per-format sets of image basenames that have that annotation file
        self._format_files: dict[str, set[str]] = {
            suffix: set() for suffix, _ in _FORMAT_COLUMNS
        }

    def setRootPath(self, path: str) -> QModelIndex:
        self._scan_directory(path)
        return super().setRootPath(path)

    def _scan_directory(self, path: str):
        """Scan directory and cache which annotation files exist per format."""
        for s in self._format_files.values():
            s.clear()
        if not path:
            return

        directory = Path(path)
        if not directory.is_dir():
            return

        try:
            for file_path in directory.iterdir():
                name = file_path.name
                for suffix, _ in _SUFFIXES_BY_LENGTH:
                    if name.endswith(suffix):
                        # Derive the image basename by stripping the suffix
                        image_base = name[: -len(suffix)]
                        if image_base:  # guard against empty stem
                            self._format_files[suffix].add(image_base)
                        break
        except OSError:
            pass

    def update_cache_for_path(self, saved_file_path: str):
        """Incrementally update cache for a newly saved or deleted annotation file."""
        if not saved_file_path:
            return

        p = Path(saved_file_path)
        name = p.name

        matched_suffix = None
        image_base = None
        for suffix, _ in _SUFFIXES_BY_LENGTH:
            if name.endswith(suffix):
                image_base = name[: -len(suffix)]
                if image_base:
                    matched_suffix = suffix
                    break

        if matched_suffix is None:
            return

        if p.exists():
            self._format_files[matched_suffix].add(image_base)
        else:
            self._format_files[matched_suffix].discard(image_base)

        # Refresh the corresponding image row in the view
        root_path = Path(self.rootPath())
        for image_ext in self.nameFilters():
            image_file = root_path / (image_base + image_ext.replace("*", ""))
            index = self.index(str(image_file))

            if index.isValid() and index.row() != -1:
                first_col = self.index(index.row(), 1, index.parent())
                last_col = self.index(index.row(), len(_FORMAT_COLUMNS), index.parent())
                self.dataChanged.emit(
                    first_col, last_col, [Qt.ItemDataRole.CheckStateRole]
                )
                break

    def set_highlighted_path(self, path):
        self.highlighted_path = str(Path(path)) if path else None
        self.layoutChanged.emit()

    def columnCount(self, parent: QModelIndex = QModelIndex()) -> int:
        return 1 + len(_FORMAT_COLUMNS)

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
            fmt_idx = section - 1
            if 0 <= fmt_idx < len(_FORMAT_COLUMNS):
                return _FORMAT_COLUMNS[fmt_idx][1]
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

            fmt_idx = index.column() - 1
            if 0 <= fmt_idx < len(_FORMAT_COLUMNS):
                suffix = _FORMAT_COLUMNS[fmt_idx][0]
                exists = base_name in self._format_files[suffix]
                return Qt.CheckState.Checked if exists else Qt.CheckState.Unchecked
            return None

        if index.column() > 0 and role == Qt.ItemDataRole.DisplayRole:
            return ""

        return super().data(index, role)

    # --- Backward-compatible accessors ---

    @property
    def npz_files(self) -> set[str]:
        """Image basenames that have .npz annotation files."""
        return self._format_files[".npz"]

    @property
    def txt_files(self) -> set[str]:
        """Image basenames that have .txt (YOLO Detection) annotation files."""
        return self._format_files[".txt"]
