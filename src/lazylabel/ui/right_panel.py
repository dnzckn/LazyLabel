"""Right panel with file explorer and segment management."""

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QPushButton, QLabel, QHBoxLayout,
    QTableWidget, QTreeView, QComboBox, QSplitter, QSpacerItem
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QBrush, QColor

from .reorderable_class_table import ReorderableClassTable
from .numeric_table_widget_item import NumericTableWidgetItem


class RightPanel(QWidget):
    """Right panel with file explorer and segment management."""
    
    # Signals
    open_folder_requested = pyqtSignal()
    image_selected = pyqtSignal('QModelIndex')
    merge_selection_requested = pyqtSignal()
    delete_selection_requested = pyqtSignal()
    segments_selection_changed = pyqtSignal()
    class_alias_changed = pyqtSignal(int, str)  # class_id, alias
    reassign_classes_requested = pyqtSignal()
    class_filter_changed = pyqtSignal()
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedWidth(350)
        self._setup_ui()
        self._connect_signals()
    
    def _setup_ui(self):
        """Setup the UI layout."""
        self.v_layout = QVBoxLayout(self)
        
        # Toggle button
        toggle_layout = QHBoxLayout()
        toggle_layout.addStretch()
        self.btn_toggle_visibility = QPushButton("Hide >")
        self.btn_toggle_visibility.setToolTip("Hide this panel")
        toggle_layout.addWidget(self.btn_toggle_visibility)
        self.v_layout.addLayout(toggle_layout)
        
        # Main controls widget
        self.main_controls_widget = QWidget()
        main_layout = QVBoxLayout(self.main_controls_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        
        # Vertical splitter for sections
        v_splitter = QSplitter(Qt.Orientation.Vertical)
        
        # File explorer section
        self._setup_file_explorer(v_splitter)
        
        # Segment management section
        self._setup_segment_management(v_splitter)
        
        # Class management section
        self._setup_class_management(v_splitter)
        
        main_layout.addWidget(v_splitter)
        
        # Status label
        self.status_label = QLabel("")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(self.status_label)
        
        self.v_layout.addWidget(self.main_controls_widget)
    
    def _setup_file_explorer(self, splitter):
        """Setup file explorer section."""
        file_explorer_widget = QWidget()
        layout = QVBoxLayout(file_explorer_widget)
        layout.setContentsMargins(0, 0, 0, 0)
        
        self.btn_open_folder = QPushButton("Open Image Folder")
        self.btn_open_folder.setToolTip("Open a directory of images")
        layout.addWidget(self.btn_open_folder)
        
        self.file_tree = QTreeView()
        layout.addWidget(self.file_tree)
        
        splitter.addWidget(file_explorer_widget)
    
    def _setup_segment_management(self, splitter):
        """Setup segment management section."""
        segment_widget = QWidget()
        layout = QVBoxLayout(segment_widget)
        layout.setContentsMargins(0, 0, 0, 0)
        
        # Class filter
        filter_layout = QHBoxLayout()
        filter_layout.addWidget(QLabel("Filter Class:"))
        self.class_filter_combo = QComboBox()
        self.class_filter_combo.setToolTip("Filter segments list by class")
        filter_layout.addWidget(self.class_filter_combo)
        layout.addLayout(filter_layout)
        
        # Segment table
        self.segment_table = QTableWidget()
        self.segment_table.setColumnCount(3)
        self.segment_table.setHorizontalHeaderLabels(["Segment ID", "Class ID", "Alias"])
        layout.addWidget(self.segment_table)
        
        # Action buttons
        action_layout = QHBoxLayout()
        self.btn_merge_selection = QPushButton("Merge to Class")
        self.btn_merge_selection.setToolTip("Merge selected segments into a single class (M)")
        self.btn_delete_selection = QPushButton("Delete")
        self.btn_delete_selection.setToolTip("Delete selected segments (Delete/Backspace)")
        action_layout.addWidget(self.btn_merge_selection)
        action_layout.addWidget(self.btn_delete_selection)
        layout.addLayout(action_layout)
        
        splitter.addWidget(segment_widget)
    
    def _setup_class_management(self, splitter):
        """Setup class management section."""
        class_widget = QWidget()
        layout = QVBoxLayout(class_widget)
        layout.setContentsMargins(0, 0, 0, 0)
        
        layout.addWidget(QLabel("Class Order:"))
        
        self.class_table = ReorderableClassTable()
        self.class_table.setToolTip(
            "Double-click to set class aliases and drag to reorder channels for saving."
        )
        self.class_table.setColumnCount(2)
        self.class_table.setHorizontalHeaderLabels(["Alias", "Class ID"])
        layout.addWidget(self.class_table)
        
        self.btn_reassign_classes = QPushButton("Reassign Class IDs")
        self.btn_reassign_classes.setToolTip(
            "Re-index class channels based on the current order in this table"
        )
        layout.addWidget(self.btn_reassign_classes)
        
        splitter.addWidget(class_widget)
    
    def _connect_signals(self):
        """Connect internal signals."""
        self.btn_open_folder.clicked.connect(self.open_folder_requested)
        self.file_tree.doubleClicked.connect(self.image_selected)
        self.btn_merge_selection.clicked.connect(self.merge_selection_requested)
        self.btn_delete_selection.clicked.connect(self.delete_selection_requested)
        self.segment_table.itemSelectionChanged.connect(self.segments_selection_changed)
        self.class_table.itemChanged.connect(self._handle_class_alias_change)
        self.btn_reassign_classes.clicked.connect(self.reassign_classes_requested)
        self.class_filter_combo.currentIndexChanged.connect(self.class_filter_changed)
    
    def _handle_class_alias_change(self, item):
        """Handle class alias change in table."""
        if item.column() != 0:  # Only handle alias column
            return
        
        class_table = self.class_table
        id_item = class_table.item(item.row(), 1)
        if id_item:
            try:
                class_id = int(id_item.text())
                self.class_alias_changed.emit(class_id, item.text())
            except (ValueError, AttributeError):
                pass
    
    def setup_file_model(self, file_model):
        """Setup the file model for the tree view."""
        self.file_tree.setModel(file_model)
        self.file_tree.setColumnWidth(0, 200)
    
    def set_folder(self, folder_path, file_model):
        """Set the folder for file browsing."""
        self.file_tree.setRootIndex(file_model.setRootPath(folder_path))
    
    def toggle_visibility(self):
        """Toggle panel visibility."""
        is_visible = self.main_controls_widget.isVisible()
        self.main_controls_widget.setVisible(not is_visible)
        
        if is_visible:  # Content is now hidden
            self.v_layout.addStretch(1)
            self.btn_toggle_visibility.setText("< Show")
            self.setFixedWidth(self.btn_toggle_visibility.sizeHint().width() + 20)
        else:  # Content is now visible
            # Remove the stretch
            for i in range(self.v_layout.count()):
                item = self.v_layout.itemAt(i)
                if isinstance(item, QSpacerItem):
                    self.v_layout.removeItem(item)
                    break
            self.btn_toggle_visibility.setText("Hide >")
            self.setFixedWidth(350)
    
    def get_selected_segment_indices(self):
        """Get indices of selected segments."""
        selected_items = self.segment_table.selectedItems()
        selected_rows = sorted(list({item.row() for item in selected_items}))
        return [
            self.segment_table.item(row, 0).data(Qt.ItemDataRole.UserRole)
            for row in selected_rows
            if self.segment_table.item(row, 0)
        ]
    
    def get_class_order(self):
        """Get the current class order from the class table."""
        ordered_ids = []
        for row in range(self.class_table.rowCount()):
            id_item = self.class_table.item(row, 1)
            if id_item and id_item.text():
                try:
                    ordered_ids.append(int(id_item.text()))
                except ValueError:
                    continue
        return ordered_ids
    
    def clear_selections(self):
        """Clear all selections."""
        self.segment_table.clearSelection()
        self.class_table.clearSelection()
    
    def select_all_segments(self):
        """Select all segments."""
        self.segment_table.selectAll()
    
    def set_status(self, message):
        """Set status message."""
        self.status_label.setText(message)
    
    def clear_status(self):
        """Clear status message."""
        self.status_label.clear()