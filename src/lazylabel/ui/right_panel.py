"""Right panel with file explorer and segment management."""

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QComboBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QPushButton,
    QSplitter,
    QTableWidget,
    QTreeView,
    QVBoxLayout,
    QWidget,
)

from .reorderable_class_table import ReorderableClassTable


class RightPanel(QWidget):
    """Right panel with file explorer and segment management."""

    # Signals
    open_folder_requested = pyqtSignal()
    image_selected = pyqtSignal("QModelIndex")
    merge_selection_requested = pyqtSignal()
    delete_selection_requested = pyqtSignal()
    segments_selection_changed = pyqtSignal()
    class_alias_changed = pyqtSignal(int, str)  # class_id, alias
    reassign_classes_requested = pyqtSignal()
    class_filter_changed = pyqtSignal()
    class_toggled = pyqtSignal(int)  # class_id
    pop_out_requested = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumWidth(50)  # Allow collapsing but maintain minimum
        self.preferred_width = 350  # Store preferred width for expansion
        self._setup_ui()
        self._connect_signals()

    def _setup_ui(self):
        """Setup the UI layout."""
        self.v_layout = QVBoxLayout(self)

        # Top button row
        toggle_layout = QHBoxLayout()

        self.btn_popout = QPushButton("⋯")
        self.btn_popout.setToolTip("Pop out panel to separate window")
        self.btn_popout.setMaximumWidth(30)
        toggle_layout.addWidget(self.btn_popout)

        toggle_layout.addStretch()

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

        # Action history section (new)
        self.action_pane_widget = QWidget()  # Placeholder for ActionPane
        action_pane_layout = QVBoxLayout(self.action_pane_widget)
        action_pane_layout.setContentsMargins(0, 0, 0, 0)
        v_splitter.addWidget(self.action_pane_widget)

        main_layout.addWidget(v_splitter)

        # Status label
        self.status_label = QLabel("")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(self.status_label)

        self.v_layout.addWidget(self.main_controls_widget)

    def set_action_pane(self, action_pane_widget):
        """Sets the ActionPane widget into the right panel."""
        # Clear existing layout in the placeholder widget
        while self.action_pane_widget.layout().count():
            item = self.action_pane_widget.layout().takeAt(0)
            if item.widget():
                item.widget().setParent(None)
        self.action_pane_widget.layout().addWidget(action_pane_widget)
        action_pane_widget.setParent(
            self.action_pane_widget
        )  # Ensure correct parentage

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
        self.segment_table.setHorizontalHeaderLabels(
            ["Segment ID", "Class ID", "Alias"]
        )
        self.segment_table.horizontalHeader().setSectionResizeMode(
            QHeaderView.ResizeMode.Stretch
        )
        self.segment_table.setSelectionBehavior(
            QTableWidget.SelectionBehavior.SelectRows
        )
        self.segment_table.setSortingEnabled(True)
        self.segment_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        layout.addWidget(self.segment_table)

        # Action buttons
        action_layout = QHBoxLayout()
        self.btn_merge_selection = QPushButton("Merge to Class")
        self.btn_merge_selection.setToolTip(
            "Merge selected segments into a single class (M)"
        )
        self.btn_delete_selection = QPushButton("Delete")
        self.btn_delete_selection.setToolTip(
            "Delete selected segments (Delete/Backspace)"
        )
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
            "Double-click to set class aliases and drag to reorder channels for saving.\nClick once to toggle as active class for new segments."
        )
        self.class_table.setColumnCount(2)
        self.class_table.setHorizontalHeaderLabels(["Alias", "Class ID"])
        self.class_table.horizontalHeader().setSectionResizeMode(
            0, QHeaderView.ResizeMode.Stretch
        )
        self.class_table.horizontalHeader().setSectionResizeMode(
            1, QHeaderView.ResizeMode.ResizeToContents
        )
        self.class_table.setEditTriggers(QTableWidget.EditTrigger.DoubleClicked)
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
        self.class_table.cellClicked.connect(self._handle_class_toggle)
        self.btn_reassign_classes.clicked.connect(self.reassign_classes_requested)
        self.class_filter_combo.currentIndexChanged.connect(self.class_filter_changed)
        self.btn_popout.clicked.connect(self.pop_out_requested)

    def mouseDoubleClickEvent(self, event):
        """Handle double-click to expand collapsed panel."""
        if (
            self.width() < 50
            and self.parent()
            and hasattr(self.parent(), "_expand_right_panel")
        ):
            self.parent()._expand_right_panel()
        super().mouseDoubleClickEvent(event)

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

    def _handle_class_toggle(self, row, column):
        """Handle class table cell click for toggling active class."""
        # Get the class ID from the clicked row
        id_item = self.class_table.item(row, 1)
        if id_item:
            try:
                class_id = int(id_item.text())
                self.class_toggled.emit(class_id)
            except (ValueError, AttributeError):
                pass

    def update_active_class_display(self, active_class_id):
        """Update the visual display to show which class is active."""
        # Block signals to prevent triggering change events during update
        self.class_table.blockSignals(True)

        for row in range(self.class_table.rowCount()):
            id_item = self.class_table.item(row, 1)
            alias_item = self.class_table.item(row, 0)
            if id_item and alias_item:
                try:
                    class_id = int(id_item.text())
                    if class_id == active_class_id:
                        # Make active class bold and add indicator
                        font = alias_item.font()
                        font.setBold(True)
                        alias_item.setFont(font)
                        id_item.setFont(font)
                        # Add visual indicator
                        if not alias_item.text().startswith("🔸 "):
                            alias_item.setText(f"🔸 {alias_item.text()}")
                    else:
                        # Make inactive classes normal
                        font = alias_item.font()
                        font.setBold(False)
                        alias_item.setFont(font)
                        id_item.setFont(font)
                        # Remove visual indicator
                        if alias_item.text().startswith("🔸 "):
                            alias_item.setText(alias_item.text()[2:])
                except (ValueError, AttributeError):
                    pass

        # Re-enable signals
        self.class_table.blockSignals(False)

    def setup_file_model(self, file_model):
        """Setup the file model for the tree view."""
        self.file_tree.setModel(file_model)
        self.file_tree.setColumnWidth(0, 200)

    def set_folder(self, folder_path, file_model):
        """Set the folder for file browsing."""
        self.file_tree.setRootIndex(file_model.setRootPath(folder_path))

    def get_selected_segment_indices(self):
        """Get indices of selected segments."""
        selected_items = self.segment_table.selectedItems()
        selected_rows = sorted({item.row() for item in selected_items})
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

    def set_popout_mode(self, is_popped_out: bool):
        """Update the pop-out button based on panel state."""
        if is_popped_out:
            self.btn_popout.setText("⇤")
            self.btn_popout.setToolTip("Return panel to main window")
        else:
            self.btn_popout.setText("⋯")
            self.btn_popout.setToolTip("Pop out panel to separate window")
