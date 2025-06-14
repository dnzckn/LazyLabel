from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QPushButton,
    QLabel,
    QFrame,
    QTableWidget,
    QTreeView,
    QAbstractItemView,
    QHBoxLayout,
    QComboBox,
    QHeaderView,
)
from PyQt6.QtCore import Qt
from .reorderable_class_table import ReorderableClassTable


class ControlPanel(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.mode_label = QLabel("Mode: Points")
        font = self.mode_label.font()
        font.setPointSize(14)
        font.setBold(True)
        self.mode_label.setFont(font)
        layout.addWidget(self.mode_label)
        self.btn_sam_mode = QPushButton("Point Mode (1)")
        self.btn_polygon_mode = QPushButton("Polygon Mode (2)")
        self.btn_selection_mode = QPushButton("Selection Mode (E)")
        layout.addWidget(self.btn_sam_mode)
        layout.addWidget(self.btn_polygon_mode)
        layout.addWidget(self.btn_selection_mode)
        layout.addSpacing(20)
        line1 = QFrame()
        line1.setFrameShape(QFrame.Shape.HLine)
        layout.addWidget(line1)
        layout.addSpacing(10)
        self.btn_clear_points = QPushButton("Clear Clicks (C)")
        layout.addWidget(self.btn_clear_points)
        layout.addStretch()
        self.device_label = QLabel("Device: Unknown")
        layout.addWidget(self.device_label)
        self.setFixedWidth(250)


class RightPanel(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)

        # File Explorer
        file_explorer_layout = QVBoxLayout()
        self.btn_open_folder = QPushButton("Open Image Folder")
        self.file_tree = QTreeView()
        file_explorer_layout.addWidget(self.btn_open_folder)
        file_explorer_layout.addWidget(self.file_tree)
        layout.addLayout(file_explorer_layout)

        # Status Label
        self.status_label = QLabel("")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.status_label)

        # Segment Table
        segment_layout = QVBoxLayout()
        class_filter_layout = QHBoxLayout()
        class_filter_layout.addWidget(QLabel("Filter Class:"))
        self.class_filter_combo = QComboBox()
        class_filter_layout.addWidget(self.class_filter_combo)
        segment_layout.addLayout(class_filter_layout)

        self.segment_table = QTableWidget()
        self.segment_table.setColumnCount(3)
        self.segment_table.setHorizontalHeaderLabels(["Index", "Class", "Type"])
        self.segment_table.horizontalHeader().setSectionResizeMode(
            QHeaderView.ResizeMode.Stretch
        )
        self.segment_table.setSelectionBehavior(
            QAbstractItemView.SelectionBehavior.SelectRows
        )
        self.segment_table.setSortingEnabled(True)
        segment_layout.addWidget(self.segment_table)

        segment_action_layout = QHBoxLayout()
        self.btn_merge_selection = QPushButton("Merge to Class")
        self.btn_delete_selection = QPushButton("Delete")
        segment_action_layout.addWidget(self.btn_merge_selection)
        segment_action_layout.addWidget(self.btn_delete_selection)
        segment_layout.addLayout(segment_action_layout)
        layout.addLayout(segment_layout, 2)

        # Class Table
        class_layout = QVBoxLayout()
        class_layout.addWidget(QLabel("Class Order:"))
        self.class_table = ReorderableClassTable()
        self.class_table.setColumnCount(1)
        self.class_table.setHorizontalHeaderLabels(["Class ID"])
        self.class_table.horizontalHeader().setSectionResizeMode(
            QHeaderView.ResizeMode.Stretch
        )
        class_layout.addWidget(self.class_table)
        self.btn_reassign_classes = QPushButton("Reassign Class IDs")
        class_layout.addWidget(self.btn_reassign_classes)
        layout.addLayout(class_layout, 1)

        self.setFixedWidth(350)
