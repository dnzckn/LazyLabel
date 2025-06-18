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
    QCheckBox,
    QSlider,
    QGroupBox,
    QSplitter,
)
from PyQt6.QtCore import Qt
from .reorderable_class_table import ReorderableClassTable


class ControlPanel(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        toggle_layout = QHBoxLayout()
        self.btn_toggle_visibility = QPushButton("< Hide")
        self.btn_toggle_visibility.setToolTip("Hide this panel")
        toggle_layout.addWidget(self.btn_toggle_visibility)
        toggle_layout.addStretch()
        layout.addLayout(toggle_layout)

        self.main_controls_widget = QWidget()
        main_layout = QVBoxLayout(self.main_controls_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)

        self.mode_label = QLabel("Mode: Points")
        font = self.mode_label.font()
        font.setPointSize(14)
        font.setBold(True)
        self.mode_label.setFont(font)
        main_layout.addWidget(self.mode_label)

        self.btn_sam_mode = QPushButton("Point Mode (1)")
        self.btn_sam_mode.setToolTip("Switch to Point Mode for AI segmentation (1)")
        self.btn_polygon_mode = QPushButton("Polygon Mode (2)")
        self.btn_polygon_mode.setToolTip("Switch to Polygon Drawing Mode (2)")
        self.btn_selection_mode = QPushButton("Selection Mode (E)")
        self.btn_selection_mode.setToolTip("Toggle segment selection (E)")
        main_layout.addWidget(self.btn_sam_mode)
        main_layout.addWidget(self.btn_polygon_mode)
        main_layout.addWidget(self.btn_selection_mode)

        main_layout.addSpacing(20)
        line1 = QFrame()
        line1.setFrameShape(QFrame.Shape.HLine)
        main_layout.addWidget(line1)
        main_layout.addSpacing(10)

        self.btn_fit_view = QPushButton("Fit View (.)")
        self.btn_fit_view.setToolTip("Reset image zoom and pan to fit the view (.)")
        self.btn_clear_points = QPushButton("Clear Clicks (C)")
        self.btn_clear_points.setToolTip("Clear current temporary points/vertices (C)")
        main_layout.addWidget(self.btn_fit_view)
        main_layout.addWidget(self.btn_clear_points)

        main_layout.addSpacing(10)

        settings_group = QGroupBox("Settings")
        settings_layout = QVBoxLayout()

        self.chk_auto_save = QCheckBox("Auto-Save on Navigate")
        self.chk_auto_save.setToolTip(
            "Automatically save work when using arrow keys to change images."
        )
        self.chk_auto_save.setChecked(True)
        settings_layout.addWidget(self.chk_auto_save)

        self.chk_save_npz = QCheckBox("Save .npz")
        self.chk_save_npz.setChecked(True)
        self.chk_save_npz.setToolTip(
            "Save the final mask as a compressed NumPy NPZ file."
        )
        settings_layout.addWidget(self.chk_save_npz)

        self.chk_save_txt = QCheckBox("Save .txt")
        self.chk_save_txt.setChecked(True)
        self.chk_save_txt.setToolTip(
            "Save bounding box annotations in YOLO TXT format."
        )
        settings_layout.addWidget(self.chk_save_txt)

        self.chk_yolo_use_alias = QCheckBox("Save YOLO with Class Aliases")
        self.chk_yolo_use_alias.setToolTip(
            "If checked, saves YOLO .txt files using class alias names instead of numeric IDs.\nThis is useful when a separate .yaml or .names file defines the classes."
        )
        self.chk_yolo_use_alias.setChecked(True)
        settings_layout.addWidget(self.chk_yolo_use_alias)

        self.chk_save_class_aliases = QCheckBox("Save Class Aliases (.json)")
        self.chk_save_class_aliases.setToolTip(
            "Save class aliases to a companion JSON file."
        )
        self.chk_save_class_aliases.setChecked(False)
        settings_layout.addWidget(self.chk_save_class_aliases)

        settings_group.setLayout(settings_layout)
        main_layout.addWidget(settings_group)

        sliders_group = QGroupBox("Adjustments")
        sliders_layout = QVBoxLayout()

        self.size_label = QLabel("Annotation Size: 1.0x")
        self.size_slider = QSlider(Qt.Orientation.Horizontal)
        self.size_slider.setRange(1, 50)
        self.size_slider.setValue(10)
        self.size_slider.setToolTip("Adjusts the size of points and lines (Ctrl +/-)")
        sliders_layout.addWidget(self.size_label)
        sliders_layout.addWidget(self.size_slider)

        sliders_layout.addSpacing(10)

        self.pan_label = QLabel("Pan Speed: 1.0x")
        self.pan_slider = QSlider(Qt.Orientation.Horizontal)
        self.pan_slider.setRange(1, 100)
        self.pan_slider.setValue(10)
        self.pan_slider.setToolTip(
            "Adjusts the speed of WASD panning. Hold Shift for 5x boost."
        )
        sliders_layout.addWidget(self.pan_label)
        sliders_layout.addWidget(self.pan_slider)

        sliders_layout.addSpacing(10)

        self.join_label = QLabel("Polygon Join Distance: 2px")
        self.join_slider = QSlider(Qt.Orientation.Horizontal)
        self.join_slider.setRange(1, 10)
        self.join_slider.setValue(2)
        self.join_slider.setToolTip("The pixel distance to 'snap' a polygon closed.")
        sliders_layout.addWidget(self.join_label)
        sliders_layout.addWidget(self.join_slider)

        sliders_group.setLayout(sliders_layout)
        main_layout.addWidget(sliders_group)

        main_layout.addStretch()

        self.notification_label = QLabel("")
        font = self.notification_label.font()
        font.setItalic(True)
        self.notification_label.setFont(font)
        self.notification_label.setStyleSheet("color: #ffa500;")
        self.notification_label.setWordWrap(True)
        main_layout.addWidget(self.notification_label)

        self.device_label = QLabel("Device: Unknown")
        main_layout.addWidget(self.device_label)

        layout.addWidget(self.main_controls_widget)
        self.setFixedWidth(250)


class RightPanel(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.v_layout = QVBoxLayout(self)

        toggle_layout = QHBoxLayout()
        toggle_layout.addStretch()
        self.btn_toggle_visibility = QPushButton("Hide >")
        self.btn_toggle_visibility.setToolTip("Hide this panel")
        toggle_layout.addWidget(self.btn_toggle_visibility)
        self.v_layout.addLayout(toggle_layout)

        self.main_controls_widget = QWidget()
        main_layout = QVBoxLayout(self.main_controls_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)

        v_splitter = QSplitter(Qt.Orientation.Vertical)

        file_explorer_widget = QWidget()
        file_explorer_layout = QVBoxLayout(file_explorer_widget)
        file_explorer_layout.setContentsMargins(0, 0, 0, 0)
        self.btn_open_folder = QPushButton("Open Image Folder")
        self.btn_open_folder.setToolTip("Open a directory of images")
        self.file_tree = QTreeView()
        file_explorer_layout.addWidget(self.btn_open_folder)
        file_explorer_layout.addWidget(self.file_tree)
        v_splitter.addWidget(file_explorer_widget)

        segment_widget = QWidget()
        segment_layout = QVBoxLayout(segment_widget)
        segment_layout.setContentsMargins(0, 0, 0, 0)

        class_filter_layout = QHBoxLayout()
        class_filter_layout.addWidget(QLabel("Filter Class:"))
        self.class_filter_combo = QComboBox()
        self.class_filter_combo.setToolTip("Filter segments list by class")
        class_filter_layout.addWidget(self.class_filter_combo)
        segment_layout.addLayout(class_filter_layout)

        self.segment_table = QTableWidget()
        self.segment_table.setColumnCount(3)
        self.segment_table.setHorizontalHeaderLabels(
            ["Segment ID", "Class ID", "Alias"]
        )
        self.segment_table.horizontalHeader().setSectionResizeMode(
            QHeaderView.ResizeMode.Stretch
        )
        self.segment_table.setSelectionBehavior(
            QAbstractItemView.SelectionBehavior.SelectRows
        )
        self.segment_table.setSortingEnabled(True)
        self.segment_table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
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
        v_splitter.addWidget(segment_widget)

        class_widget = QWidget()
        class_layout = QVBoxLayout(class_widget)
        class_layout.setContentsMargins(0, 0, 0, 0)
        class_layout.addWidget(QLabel("Class Order:"))
        self.class_table = ReorderableClassTable()
        self.class_table.setToolTip(
            "Double-click to set class aliases and drag to reorder channels for saving."
        )
        self.class_table.setColumnCount(2)
        self.class_table.setHorizontalHeaderLabels(["Alias", "Class ID"])
        self.class_table.horizontalHeader().setSectionResizeMode(
            0, QHeaderView.ResizeMode.Stretch
        )
        self.class_table.horizontalHeader().setSectionResizeMode(
            1, QHeaderView.ResizeMode.ResizeToContents
        )
        self.class_table.setEditTriggers(QAbstractItemView.EditTrigger.DoubleClicked)
        class_layout.addWidget(self.class_table)
        self.btn_reassign_classes = QPushButton("Reassign Class IDs")
        self.btn_reassign_classes.setToolTip(
            "Re-index class channels based on the current order in this table"
        )
        class_layout.addWidget(self.btn_reassign_classes)
        v_splitter.addWidget(class_widget)

        main_layout.addWidget(v_splitter)

        self.status_label = QLabel("")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(self.status_label)

        self.v_layout.addWidget(self.main_controls_widget)
        self.setFixedWidth(350)
