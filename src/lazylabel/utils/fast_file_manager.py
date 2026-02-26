"""
Fast file manager with lazy loading, sorting, and efficient navigation
"""

import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from PyQt6.QtCore import (
    QAbstractTableModel,
    QMimeData,
    QModelIndex,
    QSortFilterProxyModel,
    Qt,
    QThread,
    pyqtSignal,
)
from PyQt6.QtGui import QColor, QPixmap
from PyQt6.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMenu,
    QPushButton,
    QTableView,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from ..utils.logger import logger

# Image extensions supported
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tiff", ".tif"}


class CustomDropdown(QToolButton):
    """Custom dropdown using QToolButton + QMenu for reliable closing behavior."""

    activated = pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setText("⚏")  # Grid/settings icon
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
                min-width: 30px;
                max-width: 30px;
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
            QMenu {
                background-color: rgba(50, 50, 50, 0.9);
                border: 1px solid rgba(80, 80, 80, 0.4);
                color: #E0E0E0;
            }
            QMenu::item {
                padding: 4px 8px;
            }
            QMenu::item:selected {
                background-color: rgba(100, 100, 200, 0.5);
            }
        """)

    def addCheckableItem(self, text, checked=True, data=None):
        """Add a checkable item to the dropdown."""
        action = self.menu.addAction(text)
        action.setCheckable(True)
        action.setChecked(checked)
        action.setData(data)
        self.items.append((text, data, action))

        # Connect to selection handler
        action.triggered.connect(
            lambda checked_state, idx=len(self.items) - 1: self._on_item_toggled(
                idx, checked_state
            )
        )

    def clear(self):
        """Clear all items."""
        self.menu.clear()
        self.items.clear()

    def _on_item_toggled(self, index, checked):
        """Handle item toggle."""
        if 0 <= index < len(self.items):
            self.activated.emit(index)

    def isItemChecked(self, index):
        """Check if item at index is checked."""
        if 0 <= index < len(self.items):
            return self.items[index][2].isChecked()
        return False

    def setItemChecked(self, index, checked):
        """Set checked state of item at index."""
        if 0 <= index < len(self.items):
            self.items[index][2].setChecked(checked)

    def addItem(self, text, data=None):
        """Add a non-checkable item to the dropdown (QComboBox compatibility)."""
        action = self.menu.addAction(text)
        action.setCheckable(False)
        action.setData(data)
        self.items.append((text, data, action))

        # Connect to selection handler
        action.triggered.connect(lambda: self._on_item_selected(len(self.items) - 1))

    def _on_item_selected(self, index):
        """Handle item selection (for non-checkable items)."""
        if 0 <= index < len(self.items):
            text, data, action = self.items[index]
            self.setText(text)
            self.activated.emit(index)

    def count(self):
        """Return number of items (QComboBox compatibility)."""
        return len(self.items)

    def itemData(self, index):
        """Get data for item at index (QComboBox compatibility)."""
        if 0 <= index < len(self.items):
            return self.items[index][1]
        return None

    def setCurrentIndex(self, index):
        """Set current selection index (QComboBox compatibility)."""
        if 0 <= index < len(self.items):
            text, data, action = self.items[index]
            self.setText(text)

    def currentIndex(self):
        """Get current selection index (QComboBox compatibility)."""
        current_text = self.text()
        for i, (text, _data, _action) in enumerate(self.items):
            if text == current_text:
                return i
        return -1


@dataclass
class FileInfo:
    """Information about a file"""

    path: Path
    name: str
    size: int = 0  # Lazy load for speed
    modified: float = 0.0  # Lazy load for speed
    has_npz: bool = False
    has_txt: bool = False
    thumbnail: QPixmap | None = None


class FileScanner(QThread):
    """Background thread for scanning files"""

    filesFound = pyqtSignal(list)  # Emits batches of FileInfo
    scanComplete = pyqtSignal(int)  # Total file count
    progress = pyqtSignal(int, int)  # Current, total

    def __init__(self, directory: Path):
        super().__init__()
        self.directory = directory
        self._stop_flag = False

    def run(self):
        """Scan directory in background - OPTIMIZED FOR SPEED"""
        batch_size = 1000  # Larger batches = fewer UI updates = faster
        batch = []
        total_files = 0

        try:
            # Use os.scandir() - MUCH faster than Path.iterdir()
            # Single pass to collect all file info
            npz_stems = set()
            txt_stems = set()
            image_entries = []

            with os.scandir(self.directory) as entries:
                for entry in entries:
                    if self._stop_flag:
                        break

                    # Check file extension
                    name = entry.name
                    ext = os.path.splitext(name)[1].lower()

                    if ext == ".npz":
                        npz_stems.add(os.path.splitext(name)[0])
                    elif ext == ".txt":
                        txt_stems.add(os.path.splitext(name)[0])
                    elif ext in IMAGE_EXTENSIONS:
                        image_entries.append((entry.path, name))

            # Process images in batches
            total_count = len(image_entries)

            for i, (path, name) in enumerate(image_entries):
                if self._stop_flag:
                    break

                stem = os.path.splitext(name)[0]

                # Create FileInfo - NO STAT CALLS for speed!
                file_info = FileInfo(
                    path=Path(path),
                    name=name,
                    has_npz=stem in npz_stems,
                    has_txt=stem in txt_stems,
                )

                batch.append(file_info)
                total_files += 1

                if len(batch) >= batch_size:
                    self.filesFound.emit(batch)
                    batch = []

                # Progress updates less frequently
                if i % 1000 == 0 and i > 0:
                    self.progress.emit(i, total_count)

            # Emit remaining files
            if batch:
                self.filesFound.emit(batch)

            self.scanComplete.emit(total_files)

        except Exception as e:
            logger.error(f"Error scanning directory: {e}")

    def stop(self):
        """Stop the scanning thread"""
        self._stop_flag = True


class FastFileModel(QAbstractTableModel):
    """High-performance file model with background loading"""

    fileSelected = pyqtSignal(Path)
    highlightChanged = pyqtSignal(
        bool
    )  # Emits True when highlight is active, False when cleared

    def __init__(self):
        super().__init__()
        self._files: list[FileInfo] = []
        self._path_to_index: dict[str, int] = {}  # For O(1) lookups
        self._scanner: FileScanner | None = None

        # Column management - New order: Name, NPZ, TXT, Modified, Size
        self._all_columns = ["Name", "NPZ", "TXT", "Modified", "Size"]
        self._column_map = {0: 0, 1: 1, 2: 2, 3: 3, 4: 4}  # logical to physical mapping
        self._visible_columns = [True, True, True, True, True]  # Default all visible

        # Sequence range highlighting
        self._highlighted_rows: set[int] = set()
        self._start_row: int | None = None  # Start frame row
        self._end_row: int | None = None  # End frame row
        self._range_color = QColor(50, 90, 50)  # Dark green for range
        self._start_color = QColor(100, 200, 100)  # Light green for start
        self._end_color = QColor(200, 80, 80)  # Red for end

    def rowCount(self, parent=QModelIndex()):
        return len(self._files)

    def flags(self, index):
        default = super().flags(index)
        if index.isValid():
            return (
                default | Qt.ItemFlag.ItemIsDragEnabled | Qt.ItemFlag.ItemIsDropEnabled
            )
        return default | Qt.ItemFlag.ItemIsDropEnabled

    def mimeTypes(self):
        return ["application/x-lazylabel-file-rows"]

    def mimeData(self, indexes):
        mime = QMimeData()
        rows = sorted({idx.row() for idx in indexes})
        mime.setData(
            "application/x-lazylabel-file-rows",
            ",".join(str(r) for r in rows).encode(),
        )
        return mime

    def supportedDropActions(self):
        return Qt.DropAction.MoveAction

    def moveFileRows(self, source_rows, dest_row):
        """Move rows from source positions to dest position.

        Uses slice-based operations instead of per-element pop/insert
        to avoid O(n²) overhead on large file lists.
        """
        self.layoutAboutToBeChanged.emit()

        source_set = set(source_rows)
        # Partition into: items before dest, moved items, items after dest
        # while preserving relative order within each group
        moved = [self._files[r] for r in sorted(source_rows)]

        # Adjust dest for removed rows above it
        adjusted_dest = dest_row - sum(1 for r in source_rows if r < dest_row)

        # Build new list in one pass: keep non-moved items, splice moved items at dest
        remaining = [f for i, f in enumerate(self._files) if i not in source_set]
        self._files = remaining[:adjusted_dest] + moved + remaining[adjusted_dest:]

        self._rebuild_path_index()
        self.layoutChanged.emit()

    def _rebuild_path_index(self):
        """Rebuild the path-to-index mapping from current file list."""
        self._path_to_index = {str(f.path): i for i, f in enumerate(self._files)}

    def columnCount(self, parent=QModelIndex()):
        return sum(self._visible_columns)  # Count visible columns

    def getVisibleColumnIndex(self, logical_column):
        """Convert logical column index to visible column index"""
        if (
            logical_column >= len(self._visible_columns)
            or not self._visible_columns[logical_column]
        ):
            return -1

        visible_index = 0
        for i in range(logical_column):
            if self._visible_columns[i]:
                visible_index += 1
        return visible_index

    def getLogicalColumnIndex(self, visible_column):
        """Convert visible column index to logical column index"""
        visible_count = 0
        for i, visible in enumerate(self._visible_columns):
            if visible:
                if visible_count == visible_column:
                    return i
                visible_count += 1
        return -1

    def setColumnVisible(self, column, visible):
        """Set column visibility"""
        if (
            0 <= column < len(self._visible_columns)
            and self._visible_columns[column] != visible
        ):
            self.beginResetModel()
            self._visible_columns[column] = visible
            self.endResetModel()

    def isColumnVisible(self, column):
        """Check if column is visible"""
        if 0 <= column < len(self._visible_columns):
            return self._visible_columns[column]
        return False

    def moveColumn(self, from_column, to_column):
        """Move column to new position"""
        if (
            0 <= from_column < len(self._all_columns)
            and 0 <= to_column < len(self._all_columns)
            and from_column != to_column
        ):
            self.beginResetModel()
            # Move in all arrays
            self._all_columns.insert(to_column, self._all_columns.pop(from_column))
            self._visible_columns.insert(
                to_column, self._visible_columns.pop(from_column)
            )
            self.endResetModel()

    def data(self, index: QModelIndex, role=Qt.ItemDataRole.DisplayRole):
        if not index.isValid():
            return None

        file_info = self._files[index.row()]
        visible_col = index.column()

        # Convert visible column to logical column
        logical_col = self.getLogicalColumnIndex(visible_col)
        if logical_col == -1:
            return None

        column_name = self._all_columns[logical_col]

        if role == Qt.ItemDataRole.DisplayRole:
            if column_name == "Name":
                return file_info.name
            elif column_name == "NPZ":
                return "✓" if file_info.has_npz else ""
            elif column_name == "TXT":
                return "✓" if file_info.has_txt else ""
            elif column_name == "Modified":
                # Lazy load modified time only when displayed
                if file_info.modified == 0.0:
                    try:
                        file_info.modified = file_info.path.stat().st_mtime
                    except OSError:
                        file_info.modified = -1  # Mark as error
                return (
                    datetime.fromtimestamp(file_info.modified).strftime(
                        "%Y-%m-%d %H:%M"
                    )
                    if file_info.modified > 0
                    else "-"
                )
            elif column_name == "Size":
                # Lazy load size only when displayed
                if file_info.size == 0:
                    try:
                        file_info.size = file_info.path.stat().st_size
                    except OSError:
                        file_info.size = -1  # Mark as error
                return self._format_size(file_info.size) if file_info.size >= 0 else "-"
        elif role == Qt.ItemDataRole.UserRole:
            # Return the FileInfo object for custom access
            return file_info
        elif role == Qt.ItemDataRole.TextAlignmentRole and column_name in [
            "NPZ",
            "TXT",
        ]:  # Center checkmarks
            return Qt.AlignmentFlag.AlignCenter
        elif role == Qt.ItemDataRole.BackgroundRole:
            row = index.row()
            from PyQt6.QtGui import QBrush

            # Start frame - light green
            if row == self._start_row:
                return QBrush(self._start_color)
            # End frame - red
            elif row == self._end_row:
                return QBrush(self._end_color)
            # Range between start and end - dark green
            elif row in self._highlighted_rows:
                return QBrush(self._range_color)

        return None

    def headerData(self, section, orientation, role):
        if (
            orientation == Qt.Orientation.Horizontal
            and role == Qt.ItemDataRole.DisplayRole
        ):
            logical_col = self.getLogicalColumnIndex(section)
            if logical_col >= 0 and logical_col < len(self._all_columns):
                return self._all_columns[logical_col]
        return None

    def _format_size(self, size: int) -> str:
        """Format file size in human readable format"""
        for unit in ["B", "KB", "MB", "GB"]:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} TB"

    def setDirectory(self, directory: Path):
        """Set directory to scan"""
        # Stop previous scanner if running
        if self._scanner and self._scanner.isRunning():
            self._scanner.stop()
            self._scanner.wait()

        # Clear current files
        self.beginResetModel()
        self._files.clear()
        self._path_to_index.clear()
        self.endResetModel()

        # Start new scan
        self._scanner = FileScanner(directory)
        self._scanner.filesFound.connect(self._on_files_found)
        self._scanner.scanComplete.connect(self._on_scan_complete)
        self._scanner.start()

    def _on_files_found(self, files: list[FileInfo]):
        """Handle batch of files found"""
        start_row = len(self._files)
        end_row = start_row + len(files) - 1
        self.beginInsertRows(QModelIndex(), start_row, end_row)

        # Add files and update path-to-index mapping
        for i, file_info in enumerate(files):
            idx = start_row + i
            self._files.append(file_info)
            self._path_to_index[str(file_info.path)] = idx

        self.endInsertRows()

    def _on_scan_complete(self, total: int):
        """Handle scan completion"""
        pass  # Scan completion is handled by the UI status update

    def getFileCounts(self):
        """Get counts of total files, NPZ files, and TXT files"""
        total_files = len(self._files)
        npz_count = sum(1 for file_info in self._files if file_info.has_npz)
        txt_count = sum(1 for file_info in self._files if file_info.has_txt)
        return total_files, npz_count, txt_count

    def getFileInfo(self, index: int) -> FileInfo | None:
        """Get file info at index"""
        if 0 <= index < len(self._files):
            return self._files[index]
        return None

    def updateNpzStatus(self, image_path: Path):
        """Update NPZ status for a specific image file"""
        image_path_str = str(image_path)
        npz_path = image_path.with_suffix(".npz")
        has_npz = npz_path.exists()

        # Find and update the file info
        for i, file_info in enumerate(self._files):
            if str(file_info.path) == image_path_str:
                old_has_npz = file_info.has_npz
                file_info.has_npz = has_npz

                # Only emit dataChanged if status actually changed
                if old_has_npz != has_npz:
                    index = self.index(i, 3)  # NPZ column
                    self.dataChanged.emit(index, index)
                break

    def updateFileStatus(self, image_path: Path):
        """Update both NPZ and TXT status for a specific image file"""
        image_path_str = str(image_path)
        npz_path = image_path.with_suffix(".npz")
        txt_path = image_path.with_suffix(".txt")
        has_npz = npz_path.exists()
        has_txt = txt_path.exists()

        # O(1) lookup using path-to-index mapping
        if image_path_str not in self._path_to_index:
            return  # File not in current view

        i = self._path_to_index[image_path_str]
        file_info = self._files[i]

        # Update status and emit changes only if needed
        old_has_npz = file_info.has_npz
        old_has_txt = file_info.has_txt
        file_info.has_npz = has_npz
        file_info.has_txt = has_txt

        # Emit dataChanged for NPZ column if status changed
        if old_has_npz != has_npz:
            index = self.index(i, 3)  # NPZ column
            self.dataChanged.emit(index, index)

        # Emit dataChanged for TXT column if status changed
        if old_has_txt != has_txt:
            index = self.index(i, 4)  # TXT column
            self.dataChanged.emit(index, index)

    def getFileIndex(self, path: Path) -> int:
        """Get index of file by path"""
        return self._path_to_index.get(str(path), -1)

    def batchUpdateFileStatus(self, image_paths: list[Path]):
        """Batch update file status for multiple files"""
        if not image_paths:
            return

        changed_indices = []

        for image_path in image_paths:
            image_path_str = str(image_path)

            # O(1) lookup using path-to-index mapping
            if image_path_str not in self._path_to_index:
                continue  # File not in current view

            i = self._path_to_index[image_path_str]
            file_info = self._files[i]

            # Check file existence
            npz_path = image_path.with_suffix(".npz")
            txt_path = image_path.with_suffix(".txt")
            has_npz = npz_path.exists()
            has_txt = txt_path.exists()

            # Update status and track changes
            old_has_npz = file_info.has_npz
            old_has_txt = file_info.has_txt
            file_info.has_npz = has_npz
            file_info.has_txt = has_txt

            # Track changed indices for batch emission
            if old_has_npz != has_npz:
                changed_indices.append((i, 3))  # NPZ column
            if old_has_txt != has_txt:
                changed_indices.append((i, 4))  # TXT column

        # Batch emit dataChanged signals
        for i, col in changed_indices:
            index = self.index(i, col)
            self.dataChanged.emit(index, index)

    def setHighlightedRange(self, start_idx: int, end_idx: int) -> None:
        """Set the highlighted range for sequence selection.

        Args:
            start_idx: Start row index (inclusive)
            end_idx: End row index (inclusive)
        """
        # Store original order for start/end colors
        original_start = start_idx
        original_end = end_idx

        # Ensure proper ordering for range
        if start_idx > end_idx:
            start_idx, end_idx = end_idx, start_idx

        # Track start and end rows for special coloring
        self._start_row = original_start
        self._end_row = original_end

        # Create new highlighted set (for range between start and end)
        old_highlighted = self._highlighted_rows
        old_start = getattr(self, "_start_row", None)
        old_end = getattr(self, "_end_row", None)
        was_highlighted = bool(old_highlighted) or old_start is not None
        self._highlighted_rows = set(range(start_idx, end_idx + 1))

        # Emit dataChanged for affected rows
        all_affected = old_highlighted | self._highlighted_rows
        if old_start is not None:
            all_affected.add(old_start)
        if old_end is not None:
            all_affected.add(old_end)
        if all_affected:
            min_row = min(all_affected)
            max_row = max(all_affected)
            top_left = self.index(min_row, 0)
            bottom_right = self.index(max_row, self.columnCount() - 1)
            self.dataChanged.emit(top_left, bottom_right)

        # Notify view to toggle alternating row colors
        if not was_highlighted:
            self.highlightChanged.emit(True)

    def clearHighlightedRange(self) -> None:
        """Clear all highlighted rows."""
        if (
            self._highlighted_rows
            or self._start_row is not None
            or self._end_row is not None
        ):
            old_highlighted = self._highlighted_rows.copy()
            old_start = self._start_row
            old_end = self._end_row

            self._highlighted_rows = set()
            self._start_row = None
            self._end_row = None

            # Emit dataChanged for previously highlighted rows
            all_affected = old_highlighted
            if old_start is not None:
                all_affected.add(old_start)
            if old_end is not None:
                all_affected.add(old_end)

            if all_affected:
                min_row = min(all_affected)
                max_row = max(all_affected)
                top_left = self.index(min_row, 0)
                bottom_right = self.index(max_row, self.columnCount() - 1)
                self.dataChanged.emit(top_left, bottom_right)

            # Notify view to restore alternating row colors
            self.highlightChanged.emit(False)

    def getHighlightedRange(self) -> tuple[int, int] | None:
        """Get the current highlighted range.

        Returns:
            Tuple of (start_idx, end_idx) or None if no range is highlighted
        """
        if self._highlighted_rows:
            return (min(self._highlighted_rows), max(self._highlighted_rows))
        return None


class FileSortProxyModel(QSortFilterProxyModel):
    """Custom proxy model for proper sorting of file data."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._custom_order = False
        self._hidden_source_rows: set[int] = set()

    def setCustomOrder(self, enabled: bool):
        self._custom_order = enabled
        self.invalidate()

    def isCustomOrder(self) -> bool:
        return self._custom_order

    def hideSourceRows(self, rows: set[int]):
        """Add source rows to the hidden set."""
        self._hidden_source_rows |= rows
        self.invalidateFilter()

    def showAllRows(self):
        """Clear all hidden rows."""
        if self._hidden_source_rows:
            self._hidden_source_rows.clear()
            self.invalidateFilter()

    def hasHiddenRows(self) -> bool:
        return bool(self._hidden_source_rows)

    def hiddenCount(self) -> int:
        return len(self._hidden_source_rows)

    def filterAcceptsRow(self, source_row, source_parent):
        if source_row in self._hidden_source_rows:
            return False
        return super().filterAcceptsRow(source_row, source_parent)

    def lessThan(self, left: QModelIndex, right: QModelIndex) -> bool:
        """Custom sorting comparison."""
        if self._custom_order:
            return left.row() < right.row()

        # Get the file info objects
        left_info = self.sourceModel().getFileInfo(left.row())
        right_info = self.sourceModel().getFileInfo(right.row())

        if not left_info or not right_info:
            return False

        visible_col = left.column()

        # Convert visible column to logical column
        logical_col = self.sourceModel().getLogicalColumnIndex(visible_col)
        if logical_col == -1:
            return False

        column_name = self.sourceModel()._all_columns[logical_col]

        # Sort based on column type
        if column_name == "Name":
            return left_info.name.lower() < right_info.name.lower()
        elif column_name == "Size":
            # Lazy load size if needed for sorting
            if left_info.size == 0:
                try:
                    left_info.size = left_info.path.stat().st_size
                except OSError:
                    left_info.size = -1
            if right_info.size == 0:
                try:
                    right_info.size = right_info.path.stat().st_size
                except OSError:
                    right_info.size = -1
            return left_info.size < right_info.size
        elif column_name == "Modified":
            # Lazy load modified time if needed for sorting
            if left_info.modified == 0.0:
                try:
                    left_info.modified = left_info.path.stat().st_mtime
                except OSError:
                    left_info.modified = -1
            if right_info.modified == 0.0:
                try:
                    right_info.modified = right_info.path.stat().st_mtime
                except OSError:
                    right_info.modified = -1
            return left_info.modified < right_info.modified
        elif column_name == "NPZ":
            return left_info.has_npz < right_info.has_npz
        elif column_name == "TXT":
            return left_info.has_txt < right_info.has_txt

        return False


class FileTableView(QTableView):
    """Table view subclass with drag-drop row reordering and auto-scroll."""

    rowsDropped = pyqtSignal(list, int)  # proxy_rows, dest_proxy_row
    scroll_margin = 40

    def dropEvent(self, event):
        if event.source() == self:
            drop_row = self.indexAt(event.position().toPoint()).row()
            if drop_row < 0:
                drop_row = self.model().rowCount()
            selected_proxy_rows = sorted({idx.row() for idx in self.selectedIndexes()})
            self.rowsDropped.emit(selected_proxy_rows, drop_row)
            event.accept()
        else:
            super().dropEvent(event)

    def dragMoveEvent(self, event):
        pos = event.position().toPoint()
        rect = self.viewport().rect()
        if pos.y() < rect.top() + self.scroll_margin:
            self.verticalScrollBar().setValue(self.verticalScrollBar().value() - 1)
        elif pos.y() > rect.bottom() - self.scroll_margin:
            self.verticalScrollBar().setValue(self.verticalScrollBar().value() + 1)
        super().dragMoveEvent(event)


class FastFileManager(QWidget):
    """Main file manager widget with improved performance"""

    fileSelected = pyqtSignal(Path)
    displaySettingsChanged = (
        pyqtSignal()
    )  # Emitted when column visibility or sort changes

    def __init__(self):
        super().__init__()
        self._current_directory = None
        self._current_sort_index = 0  # Default: Name (A-Z)
        self._custom_order = False
        self._init_ui()

    def _init_ui(self):
        """Initialize the UI"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        # Header with controls
        header = self._create_header()
        layout.addWidget(header)

        # File table view
        self._table_view = FileTableView()
        self._table_view.setAlternatingRowColors(True)
        self._table_view.setSelectionBehavior(QTableView.SelectionBehavior.SelectRows)
        self._table_view.setSelectionMode(QTableView.SelectionMode.ExtendedSelection)
        self._table_view.setSortingEnabled(False)  # We'll handle sorting manually
        self._table_view.setEditTriggers(QTableView.EditTrigger.NoEditTriggers)

        # Drag-and-drop reordering
        self._table_view.setDragEnabled(True)
        self._table_view.setAcceptDrops(True)
        self._table_view.setDropIndicatorShown(True)
        self._table_view.setDragDropMode(QTableView.DragDropMode.InternalMove)
        self._table_view.setDefaultDropAction(Qt.DropAction.MoveAction)

        # Context menu
        self._table_view.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self._table_view.customContextMenuRequested.connect(self._show_context_menu)

        # Set up model and proxy
        self._model = FastFileModel()
        self._model.fileSelected.connect(self.fileSelected)
        self._model.highlightChanged.connect(self._on_highlight_changed)

        # Set up custom sorting proxy
        self._proxy_model = FileSortProxyModel()
        self._proxy_model.setSourceModel(self._model)
        self._table_view.setModel(self._proxy_model)

        # Enable sorting
        self._table_view.setSortingEnabled(True)
        self._table_view.sortByColumn(0, Qt.SortOrder.AscendingOrder)

        # Configure headers with drag-and-drop reordering
        header = self._table_view.horizontalHeader()
        header.setSectionsMovable(True)  # Enable drag-and-drop reordering
        header.sectionMoved.connect(self._on_column_moved)

        # Initial header sizing (will be updated by _update_header_sizing)
        self._update_header_sizing()

        # Style the table to match the existing UI
        self._table_view.setStyleSheet("""
            QTableView {
                background-color: transparent;
                alternate-background-color: rgba(255, 255, 255, 0.03);
                gridline-color: rgba(255, 255, 255, 0.1);
                color: #E0E0E0;
            }
            QTableView::item {
                padding: 2px;
                color: #E0E0E0;
            }
            QTableView::item:selected {
                background-color: rgba(100, 100, 200, 0.5);
            }
            QHeaderView::section {
                background-color: rgba(60, 60, 60, 0.5);
                color: #E0E0E0;
                padding: 4px;
                border: 1px solid rgba(80, 80, 80, 0.4);
                font-weight: bold;
            }
        """)

        # Connect selection — double-click to load, single-click for selection only
        self._table_view.doubleClicked.connect(self._on_item_double_clicked)
        self._table_view.rowsDropped.connect(self._on_rows_dropped)

        layout.addWidget(self._table_view)

        # Status bar
        self._status_label = QLabel("No folder selected")
        self._status_label.setStyleSheet(
            "padding: 5px; background: rgba(60, 60, 60, 0.3); color: #E0E0E0;"
        )
        layout.addWidget(self._status_label)

    def _create_header(self) -> QWidget:
        """Create header with controls"""
        header = QWidget()
        header.setStyleSheet("background: rgba(60, 60, 60, 0.3); padding: 5px;")
        layout = QHBoxLayout(header)
        layout.setContentsMargins(5, 5, 5, 5)

        # Search box
        self._search_box = QLineEdit()
        self._search_box.setPlaceholderText("Search files...")
        self._search_box.textChanged.connect(self._on_search_changed)
        self._search_box.setStyleSheet("""
            QLineEdit {
                background-color: rgba(50, 50, 50, 0.5);
                border: 1px solid rgba(80, 80, 80, 0.4);
                color: #E0E0E0;
                padding: 4px;
                border-radius: 3px;
            }
        """)
        layout.addWidget(self._search_box)

        # Sort dropdown
        sort_label = QLabel("Sort:")
        sort_label.setStyleSheet("color: #E0E0E0;")
        layout.addWidget(sort_label)

        # Create custom sort dropdown
        class SortDropdown(QToolButton):
            activated = pyqtSignal(int)

            def __init__(self, parent=None):
                super().__init__(parent)
                self.setText("Name (A-Z)")
                self.setPopupMode(QToolButton.ToolButtonPopupMode.InstantPopup)
                self.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextOnly)

                self.menu = QMenu(self)
                self.setMenu(self.menu)
                self.items = []

                # Same style as CustomDropdown
                self.setStyleSheet("""
                    QToolButton {
                        background-color: rgba(40, 40, 40, 0.8);
                        border: 1px solid rgba(80, 80, 80, 0.6);
                        border-radius: 6px;
                        color: #E0E0E0;
                        font-size: 10px;
                        padding: 5px 8px;
                        text-align: left;
                        min-width: 70px;
                        max-width: 70px;
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
                    QMenu {
                        background-color: rgba(50, 50, 50, 0.9);
                        border: 1px solid rgba(80, 80, 80, 0.4);
                        color: #E0E0E0;
                    }
                    QMenu::item {
                        padding: 4px 8px;
                    }
                    QMenu::item:selected {
                        background-color: rgba(100, 100, 200, 0.5);
                    }
                """)

            def addItem(self, text, data=None):
                action = self.menu.addAction(text)
                action.setData(data)
                self.items.append((text, data))
                action.triggered.connect(
                    lambda checked, idx=len(self.items) - 1: self._on_item_selected(idx)
                )
                if len(self.items) == 1:
                    self.setText(text)

            def _on_item_selected(self, index):
                if 0 <= index < len(self.items):
                    text, data = self.items[index]
                    self.setText(text)
                    self.activated.emit(index)

        self._sort_combo = SortDropdown()
        self._sort_combo.addItem("Name (A-Z)", 0)
        self._sort_combo.addItem("Name (Z-A)", 1)
        self._sort_combo.addItem("Date (Oldest)", 2)
        self._sort_combo.addItem("Date (Newest)", 3)
        self._sort_combo.addItem("Size (Smallest)", 4)
        self._sort_combo.addItem("Size (Largest)", 5)
        self._sort_combo.activated.connect(self._on_sort_changed)
        layout.addWidget(self._sort_combo)

        # Column visibility dropdown
        self._column_dropdown = CustomDropdown()
        self._column_dropdown.addCheckableItem("Name", True, 0)
        self._column_dropdown.addCheckableItem("NPZ", True, 1)
        self._column_dropdown.addCheckableItem("TXT", True, 2)
        self._column_dropdown.addCheckableItem("Modified", True, 3)
        self._column_dropdown.addCheckableItem("Size", True, 4)
        self._column_dropdown.activated.connect(self._on_column_visibility_changed)
        layout.addWidget(self._column_dropdown)

        btn_style = """
            QPushButton {
                background-color: rgba(70, 70, 70, 0.6);
                border: 1px solid rgba(80, 80, 80, 0.4);
                color: #E0E0E0;
                padding: 4px 8px;
                border-radius: 3px;
            }
            QPushButton:hover {
                background-color: rgba(90, 90, 90, 0.8);
            }
            QPushButton:pressed {
                background-color: rgba(50, 50, 50, 0.8);
            }
        """

        # Refresh button
        refresh_btn = QPushButton("Refresh")
        refresh_btn.clicked.connect(self._refresh)
        refresh_btn.setStyleSheet(btn_style)
        layout.addWidget(refresh_btn)

        # Hide selected button
        self._hide_btn = QPushButton("Hide")
        self._hide_btn.setToolTip("Hide selected files from the list")
        self._hide_btn.clicked.connect(self._hide_selected)
        self._hide_btn.setStyleSheet(btn_style)
        layout.addWidget(self._hide_btn)

        # Show All button (visible only when rows are hidden)
        self._show_all_btn = QPushButton("Show All")
        self._show_all_btn.setToolTip("Restore all hidden files")
        self._show_all_btn.clicked.connect(self._show_all)
        self._show_all_btn.setStyleSheet(btn_style)
        self._show_all_btn.setVisible(False)
        layout.addWidget(self._show_all_btn)

        layout.addStretch()

        return header

    def setDirectory(self, directory: Path):
        """Set the directory to display"""
        self._current_directory = directory
        # Reset hidden rows and custom order on new directory
        self._proxy_model.showAllRows()
        self._show_all_btn.setVisible(False)
        if self._custom_order:
            self._custom_order = False
            self._proxy_model.setCustomOrder(False)
        self._model.setDirectory(directory)
        self._update_status(f"Loading: {directory.name}")

        # Connect to scan complete signal
        if self._model._scanner:
            self._model._scanner.scanComplete.connect(
                lambda count: self._update_detailed_status(directory.name)
            )

    def _on_search_changed(self, text: str):
        """Handle search text change"""
        self._proxy_model.setFilterFixedString(text)
        self._proxy_model.setFilterCaseSensitivity(Qt.CaseSensitivity.CaseInsensitive)
        self._proxy_model.setFilterKeyColumn(0)  # Filter on name column

    def _on_sort_changed(self, index: int):
        """Handle sort order change"""
        # Reset custom order if active
        if self._custom_order:
            self._custom_order = False
            self._proxy_model.setCustomOrder(False)

        # Map combo index to column and order
        column_map = {
            0: 0,
            1: 0,
            2: 2,
            3: 2,
            4: 1,
            5: 1,
        }  # Name, Name, Date, Date, Size, Size
        order_map = {
            0: Qt.SortOrder.AscendingOrder,
            1: Qt.SortOrder.DescendingOrder,
            2: Qt.SortOrder.AscendingOrder,
            3: Qt.SortOrder.DescendingOrder,
            4: Qt.SortOrder.AscendingOrder,
            5: Qt.SortOrder.DescendingOrder,
        }

        column = column_map.get(index, 0)
        order = order_map.get(index, Qt.SortOrder.AscendingOrder)

        self._table_view.sortByColumn(column, order)
        self._current_sort_index = index
        self.displaySettingsChanged.emit()

    def _refresh(self):
        """Refresh current directory"""
        if self._current_directory:
            self.setDirectory(self._current_directory)

    def _on_column_visibility_changed(self, column_index):
        """Handle column visibility toggle"""
        is_checked = self._column_dropdown.isItemChecked(column_index)
        self._model.setColumnVisible(column_index, is_checked)

        # Update header sizing for visible columns
        self._update_header_sizing()
        self.displaySettingsChanged.emit()

    def _update_header_sizing(self):
        """Update header column sizing for visible columns"""
        header = self._table_view.horizontalHeader()
        visible_columns = sum(self._model._visible_columns)

        if visible_columns == 0:
            return

        # Set all columns to Interactive mode for manual resizing
        for i in range(visible_columns):
            # Find logical column for this visible index
            logical_col = self._model.getLogicalColumnIndex(i)
            if logical_col >= 0:
                column_name = self._model._all_columns[logical_col]
                # All columns are interactive (manually resizable)
                header.setSectionResizeMode(i, QHeaderView.ResizeMode.Interactive)

                # Set appropriate default sizes
                if column_name == "Name":
                    header.resizeSection(i, 200)  # Default name column width
                elif column_name in ["NPZ", "TXT"]:
                    header.resizeSection(i, 50)  # Compact for checkmarks
                elif column_name == "Modified":
                    header.resizeSection(i, 120)  # Date needs more space
                elif column_name == "Size":
                    header.resizeSection(i, 80)  # Size needs moderate space

        # Disable stretch last section to allow all columns to be manually resized
        header.setStretchLastSection(False)

    def _on_column_moved(self, logical_index, old_visual_index, new_visual_index):
        """Handle column reordering via drag-and-drop"""
        # For now, just update the header sizing to maintain proper resize modes
        # The QHeaderView handles the visual reordering automatically
        self._update_header_sizing()

    def _on_highlight_changed(self, is_highlighted: bool):
        """Handle highlight state change - toggle alternating row colors."""
        # Disable alternating row colors when highlighting is active
        # so the highlight color shows through clearly
        self._table_view.setAlternatingRowColors(not is_highlighted)
        self._table_view.viewport().update()

    def updateNpzStatus(self, image_path: Path):
        """Update NPZ status for a specific image file"""
        self._model.updateNpzStatus(image_path)

    def updateFileStatus(self, image_path: Path):
        """Update both NPZ and TXT status for a specific image file"""
        self._model.updateFileStatus(image_path)
        # Update status counts when file status changes
        if self._current_directory:
            self._update_detailed_status(self._current_directory.name)
        # Force table view to repaint immediately
        self._table_view.viewport().update()
        self._table_view.repaint()

    def refreshFile(self, image_path: Path):
        """Refresh status for a specific file"""
        self.updateFileStatus(image_path)

    def batchUpdateFileStatus(self, image_paths: list[Path]):
        """Batch update file status for multiple files"""
        self._model.batchUpdateFileStatus(image_paths)
        # Update status counts after batch update
        if self._current_directory:
            self._update_detailed_status(self._current_directory.name)
        # Force table view to repaint immediately
        self._table_view.viewport().update()
        self._table_view.repaint()

    def _get_proxy_row_for_path(self, path: Path) -> int:
        """Get proxy model row for a given path using O(1) lookup."""
        # Use source model's O(1) path-to-index lookup
        source_row = self._model.getFileIndex(path)
        if source_row < 0:
            return -1
        # Map to proxy model row
        source_index = self._model.index(source_row, 0)
        proxy_index = self._proxy_model.mapFromSource(source_index)
        if proxy_index.isValid():
            return proxy_index.row()
        return -1

    def getSurroundingFiles(self, current_path: Path, count: int) -> list[Path]:
        """Get files in current sorted/filtered order surrounding the given path"""
        files = []

        # Use O(1) lookup instead of iterating all rows
        current_index = self._get_proxy_row_for_path(current_path)

        if current_index == -1:
            return []  # File not found in current view

        # Get surrounding files in proxy order
        for i in range(count):
            row = current_index + i
            if row < self._proxy_model.rowCount():
                proxy_index = self._proxy_model.index(row, 0)
                source_index = self._proxy_model.mapToSource(proxy_index)
                file_info = self._model.getFileInfo(source_index.row())
                if file_info:
                    files.append(file_info.path)
                else:
                    files.append(None)
            else:
                files.append(None)

        return files

    def getPreviousFiles(self, current_path: Path, count: int) -> list[Path]:
        """Get previous files in current sorted/filtered order before the given path"""
        files = []

        # Use O(1) lookup instead of iterating all rows
        current_index = self._get_proxy_row_for_path(current_path)

        if current_index == -1:
            return []  # File not found in current view

        # Get previous files going backward from current position
        start_row = current_index - count
        if start_row < 0:
            start_row = 0

        # Get consecutive files starting from start_row
        for i in range(count):
            row = start_row + i
            if row < current_index and row >= 0:
                proxy_index = self._proxy_model.index(row, 0)
                source_index = self._proxy_model.mapToSource(proxy_index)
                file_info = self._model.getFileInfo(source_index.row())
                if file_info:
                    files.append(file_info.path)
                else:
                    files.append(None)
            else:
                files.append(None)

        return files

    def getNextFilePair(self, current_path: Path) -> tuple[Path | None, Path | None]:
        """Get the next pair of files after current position (for multi-view navigation).

        Args:
            current_path: Path of current first viewer's image

        Returns:
            Tuple of (next_file_1, next_file_2) in sorted order, None if at end
        """
        current_index = self._get_proxy_row_for_path(current_path)
        if current_index == -1:
            return (None, None)

        # Next pair starts 2 positions ahead (skip current pair)
        next_start = current_index + 2
        total_rows = self._proxy_model.rowCount()

        if next_start >= total_rows:
            return (None, None)  # At end of list

        file1 = None
        file2 = None

        # Get first file of next pair
        proxy_index = self._proxy_model.index(next_start, 0)
        source_index = self._proxy_model.mapToSource(proxy_index)
        file_info = self._model.getFileInfo(source_index.row())
        if file_info:
            file1 = file_info.path

        # Get second file of next pair
        if next_start + 1 < total_rows:
            proxy_index = self._proxy_model.index(next_start + 1, 0)
            source_index = self._proxy_model.mapToSource(proxy_index)
            file_info = self._model.getFileInfo(source_index.row())
            if file_info:
                file2 = file_info.path

        return (file1, file2)

    def getPreviousFilePair(
        self, current_path: Path
    ) -> tuple[Path | None, Path | None]:
        """Get the previous pair of files before current position (for multi-view navigation).

        Args:
            current_path: Path of current first viewer's image

        Returns:
            Tuple of (prev_file_1, prev_file_2) in sorted order, None if at start
        """
        current_index = self._get_proxy_row_for_path(current_path)
        if current_index == -1:
            return (None, None)

        # Previous pair starts 2 positions back
        prev_start = current_index - 2

        if prev_start < 0:
            return (None, None)  # At start of list

        file1 = None
        file2 = None

        # Get first file of previous pair
        proxy_index = self._proxy_model.index(prev_start, 0)
        source_index = self._proxy_model.mapToSource(proxy_index)
        file_info = self._model.getFileInfo(source_index.row())
        if file_info:
            file1 = file_info.path

        # Get second file of previous pair
        if prev_start + 1 < self._proxy_model.rowCount():
            proxy_index = self._proxy_model.index(prev_start + 1, 0)
            source_index = self._proxy_model.mapToSource(proxy_index)
            file_info = self._model.getFileInfo(source_index.row())
            if file_info:
                file2 = file_info.path

        return (file1, file2)

    def getFilePairAtIndex(self, start_index: int) -> tuple[Path | None, Path | None]:
        """Get a pair of consecutive files starting at the given proxy index.

        Args:
            start_index: Starting row index in the sorted/filtered view

        Returns:
            Tuple of (file1, file2), None for missing files
        """
        total_rows = self._proxy_model.rowCount()
        if start_index < 0 or start_index >= total_rows:
            return (None, None)

        file1 = None
        file2 = None

        # Get first file
        proxy_index = self._proxy_model.index(start_index, 0)
        source_index = self._proxy_model.mapToSource(proxy_index)
        file_info = self._model.getFileInfo(source_index.row())
        if file_info:
            file1 = file_info.path

        # Get second file
        if start_index + 1 < total_rows:
            proxy_index = self._proxy_model.index(start_index + 1, 0)
            source_index = self._proxy_model.mapToSource(proxy_index)
            file_info = self._model.getFileInfo(source_index.row())
            if file_info:
                file2 = file_info.path

        return (file1, file2)

    def getConsecutiveFile(self, current_path: Path) -> Path | None:
        """Get the next consecutive file after the given path in current sorted order.

        This respects the current sort order of the file list, so if the list is
        sorted in reverse order, it returns the file that appears next in the
        displayed list (which may be "earlier" alphabetically).

        Args:
            current_path: Path of the current file

        Returns:
            Path of the next file in sorted order, or None if at end
        """
        current_index = self._get_proxy_row_for_path(current_path)
        if current_index == -1:
            return None

        next_index = current_index + 1
        if next_index >= self._proxy_model.rowCount():
            return None

        proxy_index = self._proxy_model.index(next_index, 0)
        source_index = self._proxy_model.mapToSource(proxy_index)
        file_info = self._model.getFileInfo(source_index.row())
        if file_info:
            return file_info.path
        return None

    def _on_item_double_clicked(self, index: QModelIndex):
        """Handle item double click"""
        # Map proxy index to source index
        source_index = self._proxy_model.mapToSource(index)
        file_info = self._model.getFileInfo(source_index.row())
        if file_info:
            self.fileSelected.emit(file_info.path)

    def _on_rows_dropped(self, proxy_rows, dest_proxy_row):
        """Handle drag-drop row reordering."""
        # Map proxy rows to source rows before any model changes
        source_rows = []
        for pr in proxy_rows:
            source_idx = self._proxy_model.mapToSource(self._proxy_model.index(pr, 0))
            source_rows.append(source_idx.row())

        # Map dest proxy row to source row
        if dest_proxy_row < self._proxy_model.rowCount():
            dest_source = self._proxy_model.mapToSource(
                self._proxy_model.index(dest_proxy_row, 0)
            ).row()
        else:
            dest_source = self._model.rowCount()

        # Enter custom order mode (set flag without invalidating -
        # moveFileRows will emit layoutChanged which refreshes the proxy)
        if not self._custom_order:
            self._custom_order = True
            self._proxy_model._custom_order = True
            self._sort_combo.setText("Custom")
            # Clear highlight to avoid stale indices
            self._model.clearHighlightedRange()

        self._model.moveFileRows(source_rows, dest_source)

    def _show_context_menu(self, position):
        """Show right-click context menu for copying filenames."""
        selected_indexes = self._table_view.selectionModel().selectedRows()
        if not selected_indexes:
            return

        filenames = []
        filepaths = []
        for idx in selected_indexes:
            source_index = self._proxy_model.mapToSource(idx)
            file_info = self._model.getFileInfo(source_index.row())
            if file_info:
                filenames.append(file_info.name)
                filepaths.append(str(file_info.path))

        if not filenames:
            return

        menu = QMenu(self)
        n = len(filenames)
        if n == 1:
            copy_name_action = menu.addAction("Copy filename")
            copy_path_action = menu.addAction("Copy path")
        else:
            copy_name_action = menu.addAction(f"Copy {n} filenames")
            copy_path_action = menu.addAction(f"Copy {n} paths")

        menu.addSeparator()
        if n == 1:
            hide_action = menu.addAction("Hide file")
        else:
            hide_action = menu.addAction(f"Hide {n} files")

        result = menu.exec(self._table_view.viewport().mapToGlobal(position))
        if result == copy_name_action:
            clipboard = QApplication.clipboard()
            if n == 1:
                clipboard.setText(filenames[0])
            else:
                import json

                clipboard.setText(json.dumps(filenames))
        elif result == copy_path_action:
            clipboard = QApplication.clipboard()
            if n == 1:
                clipboard.setText(filepaths[0])
            else:
                clipboard.setText("\n".join(filepaths))
        elif result == hide_action:
            self._hide_selected()

    def _hide_selected(self):
        """Hide selected rows from the file list."""
        selected_indexes = self._table_view.selectionModel().selectedRows()
        if not selected_indexes:
            return

        source_rows = set()
        for idx in selected_indexes:
            source_index = self._proxy_model.mapToSource(idx)
            source_rows.add(source_index.row())

        self._proxy_model.hideSourceRows(source_rows)
        self._table_view.clearSelection()
        self._show_all_btn.setVisible(True)
        self._show_all_btn.setText(f"Show All ({self._proxy_model.hiddenCount()})")

    def _show_all(self):
        """Restore all hidden rows."""
        self._proxy_model.showAllRows()
        self._show_all_btn.setVisible(False)

    def _update_status(self, text: str):
        """Update status label"""
        self._status_label.setText(text)

    def _update_detailed_status(self, directory_name: str):
        """Update status label with detailed file counts"""
        total_files, npz_count, txt_count = self._model.getFileCounts()

        if total_files == 0:
            status_text = f"No files in {directory_name}"
        else:
            # Build the status message parts
            parts = []
            parts.append(f"{total_files} image{'s' if total_files != 1 else ''}")

            if npz_count > 0:
                parts.append(f"{npz_count} npz")

            if txt_count > 0:
                parts.append(f"{txt_count} txt")

            status_text = f"{', '.join(parts)} in {directory_name}"

        self._status_label.setText(status_text)

    def selectFile(self, path: Path):
        """Select a specific file in the view"""
        index = self._model.getFileIndex(path)
        if index >= 0:
            source_index = self._model.index(index, 0)
            proxy_index = self._proxy_model.mapFromSource(source_index)
            self._table_view.setCurrentIndex(proxy_index)
            self._table_view.scrollTo(proxy_index)
            # Select the entire row
            selection_model = self._table_view.selectionModel()
            selection_model.select(
                proxy_index,
                selection_model.SelectionFlag.ClearAndSelect
                | selection_model.SelectionFlag.Rows,
            )

    def getSelectedFile(self) -> Path | None:
        """Get currently selected file"""
        index = self._table_view.currentIndex()
        if index.isValid():
            source_index = self._proxy_model.mapToSource(index)
            file_info = self._model.getFileInfo(source_index.row())
            if file_info:
                return file_info.path
        return None

    def navigateNext(self):
        """Navigate to next file"""
        current = self._table_view.currentIndex()

        # If no current selection and we have files, select first
        if not current.isValid() and self._proxy_model.rowCount() > 0:
            first_index = self._proxy_model.index(0, 0)
            self._table_view.setCurrentIndex(first_index)
            selection_model = self._table_view.selectionModel()
            selection_model.select(
                first_index,
                selection_model.SelectionFlag.ClearAndSelect
                | selection_model.SelectionFlag.Rows,
            )
            # Emit file selection
            source_index = self._proxy_model.mapToSource(first_index)
            file_info = self._model.getFileInfo(source_index.row())
            if file_info:
                self.fileSelected.emit(file_info.path)
            return

        if current.isValid() and current.row() < self._proxy_model.rowCount() - 1:
            next_index = self._proxy_model.index(current.row() + 1, 0)
            self._table_view.setCurrentIndex(next_index)
            # Select entire row
            selection_model = self._table_view.selectionModel()
            selection_model.select(
                next_index,
                selection_model.SelectionFlag.ClearAndSelect
                | selection_model.SelectionFlag.Rows,
            )
            # Emit file selection
            source_index = self._proxy_model.mapToSource(next_index)
            file_info = self._model.getFileInfo(source_index.row())
            if file_info:
                self.fileSelected.emit(file_info.path)

    def navigatePrevious(self):
        """Navigate to previous file"""
        current = self._table_view.currentIndex()

        # If no current selection and we have files, select last
        if not current.isValid() and self._proxy_model.rowCount() > 0:
            last_index = self._proxy_model.index(self._proxy_model.rowCount() - 1, 0)
            self._table_view.setCurrentIndex(last_index)
            selection_model = self._table_view.selectionModel()
            selection_model.select(
                last_index,
                selection_model.SelectionFlag.ClearAndSelect
                | selection_model.SelectionFlag.Rows,
            )
            # Emit file selection
            source_index = self._proxy_model.mapToSource(last_index)
            file_info = self._model.getFileInfo(source_index.row())
            if file_info:
                self.fileSelected.emit(file_info.path)
            return

        if current.isValid() and current.row() > 0:
            prev_index = self._proxy_model.index(current.row() - 1, 0)
            self._table_view.setCurrentIndex(prev_index)
            # Select entire row
            selection_model = self._table_view.selectionModel()
            selection_model.select(
                prev_index,
                selection_model.SelectionFlag.ClearAndSelect
                | selection_model.SelectionFlag.Rows,
            )
            # Emit file selection
            source_index = self._proxy_model.mapToSource(prev_index)
            file_info = self._model.getFileInfo(source_index.row())
            if file_info:
                self.fileSelected.emit(file_info.path)

    # Display settings getter/setter methods
    def getDisplaySettings(self) -> dict:
        """Get current display settings as a dictionary."""
        return {
            "show_name": self._column_dropdown.isItemChecked(0),
            "show_npz": self._column_dropdown.isItemChecked(1),
            "show_txt": self._column_dropdown.isItemChecked(2),
            "show_modified": self._column_dropdown.isItemChecked(3),
            "show_size": self._column_dropdown.isItemChecked(4),
            "sort_order": self._current_sort_index,
        }

    def setDisplaySettings(self, settings: dict):
        """Set display settings from a dictionary (no signals emitted)."""
        # Block signals during setup to avoid triggering saves
        self._column_dropdown.blockSignals(True)
        self._sort_combo.blockSignals(True)

        # Set column visibility
        self._column_dropdown.setItemChecked(0, settings.get("show_name", True))
        self._column_dropdown.setItemChecked(1, settings.get("show_npz", True))
        self._column_dropdown.setItemChecked(2, settings.get("show_txt", True))
        self._column_dropdown.setItemChecked(3, settings.get("show_modified", True))
        self._column_dropdown.setItemChecked(4, settings.get("show_size", True))

        # Apply to model
        for i in range(5):
            is_checked = self._column_dropdown.isItemChecked(i)
            self._model.setColumnVisible(i, is_checked)

        # Set sort order
        sort_index = settings.get("sort_order", 0)
        self._current_sort_index = sort_index

        # Apply sort by simulating the index selection
        column_map = {0: 0, 1: 0, 2: 2, 3: 2, 4: 1, 5: 1}
        order_map = {
            0: Qt.SortOrder.AscendingOrder,
            1: Qt.SortOrder.DescendingOrder,
            2: Qt.SortOrder.AscendingOrder,
            3: Qt.SortOrder.DescendingOrder,
            4: Qt.SortOrder.AscendingOrder,
            5: Qt.SortOrder.DescendingOrder,
        }
        column = column_map.get(sort_index, 0)
        order = order_map.get(sort_index, Qt.SortOrder.AscendingOrder)
        self._table_view.sortByColumn(column, order)

        # Update UI
        self._update_header_sizing()

        # Restore signals
        self._column_dropdown.blockSignals(False)
        self._sort_combo.blockSignals(False)

    def setHighlightedRange(self, start_path: Path, end_path: Path) -> bool:
        """Set the highlighted range for sequence selection.

        Args:
            start_path: Path of the start file
            end_path: Path of the end file

        Returns:
            True if range was set successfully, False if files not found
        """
        start_proxy_idx = self._get_proxy_row_for_path(start_path)
        end_proxy_idx = self._get_proxy_row_for_path(end_path)

        if start_proxy_idx == -1 or end_proxy_idx == -1:
            return False

        # Map start and end to source rows for special coloring
        start_source_idx = self._proxy_model.mapToSource(
            self._proxy_model.index(start_proxy_idx, 0)
        ).row()
        end_source_idx = self._proxy_model.mapToSource(
            self._proxy_model.index(end_proxy_idx, 0)
        ).row()

        # Get all source rows in the proxy range
        source_rows = set()
        min_proxy = min(start_proxy_idx, end_proxy_idx)
        max_proxy = max(start_proxy_idx, end_proxy_idx)
        for proxy_row in range(min_proxy, max_proxy + 1):
            source_idx = self._proxy_model.mapToSource(
                self._proxy_model.index(proxy_row, 0)
            ).row()
            source_rows.add(source_idx)

        # Track old values for dataChanged signal
        old_highlighted = self._model._highlighted_rows.copy()
        old_start = self._model._start_row
        old_end = self._model._end_row
        was_highlighted = bool(old_highlighted) or old_start is not None

        # Set start and end rows for special coloring (light green / red)
        self._model._start_row = start_source_idx
        self._model._end_row = end_source_idx
        self._model._highlighted_rows = source_rows

        # Emit dataChanged for all affected rows
        all_affected = old_highlighted | source_rows
        if old_start is not None:
            all_affected.add(old_start)
        if old_end is not None:
            all_affected.add(old_end)
        all_affected.add(start_source_idx)
        all_affected.add(end_source_idx)

        if all_affected:
            min_row = min(all_affected)
            max_row = max(all_affected)
            top_left = self._model.index(min_row, 0)
            bottom_right = self._model.index(max_row, self._model.columnCount() - 1)
            self._model.dataChanged.emit(top_left, bottom_right)

        # Notify view to toggle alternating row colors
        if not was_highlighted:
            self._model.highlightChanged.emit(True)

        return True

    def clearHighlightedRange(self) -> None:
        """Clear all highlighted rows."""
        self._model.clearHighlightedRange()

    def getFilesInRange(self, start_path: Path, end_path: Path) -> list[Path]:
        """Get all files in the range between start and end paths.

        Args:
            start_path: Path of the start file
            end_path: Path of the end file

        Returns:
            List of paths in the range (inclusive), in proxy sort order
        """
        start_idx = self._get_proxy_row_for_path(start_path)
        end_idx = self._get_proxy_row_for_path(end_path)

        if start_idx == -1 or end_idx == -1:
            return []

        # Ensure proper ordering
        if start_idx > end_idx:
            start_idx, end_idx = end_idx, start_idx

        files = []
        for proxy_row in range(start_idx, end_idx + 1):
            proxy_index = self._proxy_model.index(proxy_row, 0)
            source_index = self._proxy_model.mapToSource(proxy_index)
            file_info = self._model.getFileInfo(source_index.row())
            if file_info:
                files.append(file_info.path)

        return files
