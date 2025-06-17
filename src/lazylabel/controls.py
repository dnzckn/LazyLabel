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

        # Mode Buttons
        self.btn_sam_mode = QPushButton("Point Mode (1)")
        self.btn_sam_mode.setToolTip("Switch to Point Mode for AI segmentation (1)")
        self.btn_polygon_mode = QPushButton("Polygon Mode (2)")
        self.btn_polygon_mode.setToolTip("Switch to Polygon Drawing Mode (2)")
        self.btn_selection_mode = QPushButton("Selection Mode (E)")
        self.btn_selection_mode.setToolTip("Toggle segment selection (E)")
        layout.addWidget(self.btn_sam_mode)
        layout.addWidget(self.btn_polygon_mode)
        layout.addWidget(self.btn_selection_mode)

        layout.addSpacing(20)
        line1 = QFrame()
        line1.setFrameShape(QFrame.Shape.HLine)
        layout.addWidget(line1)
        layout.addSpacing(10)

        # Action Buttons
        self.btn_fit_view = QPushButton("Fit View (.)")
        self.btn_fit_view.setToolTip("Reset image zoom and pan to fit the view (.)")
        self.btn_clear_points = QPushButton("Clear Clicks (C)")
        self.btn_clear_points.setToolTip("Clear current temporary points/vertices (C)")
        layout.addWidget(self.btn_fit_view)
        layout.addWidget(self.btn_clear_points)

        layout.addStretch()

        # Notification Label
        self.notification_label = QLabel("")
        font = self.notification_label.font()
        font.setItalic(True)
        self.notification_label.setFont(font)
        self.notification_label.setStyleSheet(
            "color: #ffa500;"
        )  # Orange color for visibility
        self.notification_label.setWordWrap(True)
        layout.addWidget(self.notification_label)

        # Device Label
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
        self.btn_open_folder.setToolTip("Open a directory of images")
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
        self.class_filter_combo.setToolTip("Filter segments list by class")
        class_filter_layout.addWidget(self.class_filter_combo)
        segment_layout.addLayout(class_filter_layout)

        self.segment_table = QTableWidget()
        self.segment_table.setColumnCount(3)
        self.segment_table.setHorizontalHeaderLabels(["Index", "Class ID", "Type"])
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
        self.btn_merge_selection.setToolTip(
            "Merge selected segments into a single class (M)"
        )
        self.btn_delete_selection = QPushButton("Delete")
        self.btn_delete_selection.setToolTip(
            "Delete selected segments (Delete/Backspace)"
        )
        segment_action_layout.addWidget(self.btn_merge_selection)
        segment_action_layout.addWidget(self.btn_delete_selection)
        segment_layout.addLayout(segment_action_layout)
        layout.addLayout(segment_layout, 2)

        # Class Table
        class_layout = QVBoxLayout()
        class_layout.addWidget(QLabel("Class Order:"))
        self.class_table = ReorderableClassTable()
        self.class_table.setToolTip(
            "Set class aliases and drag to reorder channels for saving."
        )
        self.class_table.setColumnCount(2)
        self.class_table.setHorizontalHeaderLabels(["Alias", "Channel Index"])
        self.class_table.horizontalHeader().setSectionResizeMode(
            0, QHeaderView.ResizeMode.Stretch
        )
        self.class_table.horizontalHeader().setSectionResizeMode(
            1, QHeaderView.ResizeMode.ResizeToContents
        )

        class_layout.addWidget(self.class_table)
        self.btn_reassign_classes = QPushButton("Reassign Class IDs")
        self.btn_reassign_classes.setToolTip(
            "Re-index class channels based on the current order in this table"
        )
        class_layout.addWidget(self.btn_reassign_classes)
        layout.addLayout(class_layout, 1)

        self.setFixedWidth(350)
