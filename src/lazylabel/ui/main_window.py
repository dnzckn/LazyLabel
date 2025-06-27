"""Main application window."""

import os
import numpy as np
import cv2
from PyQt6.QtWidgets import (
    QMainWindow,
    QWidget,
    QHBoxLayout,
    QVBoxLayout,
    QFileDialog,
    QApplication,
    QGraphicsEllipseItem,
    QGraphicsLineItem,
    QGraphicsPolygonItem,
    QTableWidgetItem,
    QTableWidgetSelectionRange,
    QHeaderView,
    QSplitter,
    QDialog,
)
from PyQt6.QtGui import (
    QIcon,
    QKeySequence,
    QShortcut,
    QPixmap,
    QColor,
    QPen,
    QBrush,
    QPolygonF,
    QImage,
)
from PyQt6.QtCore import Qt, QTimer, QModelIndex, QPointF, pyqtSignal

from .control_panel import ControlPanel
from .right_panel import RightPanel
from .photo_viewer import PhotoViewer
from .hoverable_polygon_item import HoverablePolygonItem
from .hoverable_pixelmap_item import HoverablePixmapItem
from .editable_vertex import EditableVertexItem
from .numeric_table_widget_item import NumericTableWidgetItem
from ..core import SegmentManager, ModelManager, FileManager
from ..config import Settings, Paths, HotkeyManager
from ..utils import CustomFileSystemModel, mask_to_pixmap
from .hotkey_dialog import HotkeyDialog
from .widgets import StatusBar


class PanelPopoutWindow(QDialog):
    """Pop-out window for draggable panels."""

    panel_closed = pyqtSignal(QWidget)  # Signal emitted when panel window is closed

    def __init__(self, panel_widget, title="Panel", parent=None):
        super().__init__(parent)
        self.panel_widget = panel_widget
        self.setWindowTitle(title)
        self.setWindowFlags(Qt.WindowType.Window)  # Allow moving to other monitors

        # Make window resizable
        self.setMinimumSize(200, 300)
        self.resize(400, 600)

        # Set up layout
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.addWidget(panel_widget)

        # Store original parent for restoration
        self.original_parent = parent

    def closeEvent(self, event):
        """Handle window close - emit signal to return panel to main window."""
        self.panel_closed.emit(self.panel_widget)
        super().closeEvent(event)


class MainWindow(QMainWindow):
    """Main application window."""

    def __init__(self):
        super().__init__()

        print("[3/20] Starting LazyLabel...")
        print("[4/20] Loading configuration and settings...")

        # Initialize configuration
        self.paths = Paths()
        self.settings = Settings.load_from_file(str(self.paths.settings_file))
        self.hotkey_manager = HotkeyManager(str(self.paths.config_dir))

        print("[5/20] Initializing core managers...")

        # Initialize managers
        self.segment_manager = SegmentManager()
        self.model_manager = ModelManager(self.paths)
        self.file_manager = FileManager(self.segment_manager)

        print("[6/20] Setting up user interface...")

        # Initialize UI state
        self.mode = "sam_points"
        self.previous_mode = "sam_points"
        self.current_image_path = None
        self.current_file_index = QModelIndex()

        # Panel pop-out state
        self.left_panel_popout = None
        self.right_panel_popout = None

        # Annotation state
        self.point_radius = self.settings.point_radius
        self.line_thickness = self.settings.line_thickness
        self.pan_multiplier = self.settings.pan_multiplier
        self.polygon_join_threshold = self.settings.polygon_join_threshold

        # Drawing state
        self.point_items, self.positive_points, self.negative_points = [], [], []
        self.polygon_points, self.polygon_preview_items = [], []
        self.rubber_band_line = None
        self.preview_mask_item = None
        self.segments, self.segment_items, self.highlight_items = [], {}, []
        self.edit_handles = []
        self.is_dragging_polygon, self.drag_start_pos, self.drag_initial_vertices = (
            False,
            None,
            {},
        )
        self.action_history = []

        # Update state flags to prevent recursion
        self._updating_lists = False

        self._setup_ui()
        self._setup_model()

        print("[17/20] Connecting UI signals and shortcuts...")
        self._setup_connections()
        self._setup_shortcuts()
        self._load_settings()

        print("[18/20] LazyLabel initialization complete!")

    def _setup_ui(self):
        """Setup the user interface."""
        self.setWindowTitle("LazyLabel by DNC")
        self.setGeometry(
            50, 50, self.settings.window_width, self.settings.window_height
        )

        # Set window icon
        if self.paths.logo_path.exists():
            self.setWindowIcon(QIcon(str(self.paths.logo_path)))

        # Create panels
        self.control_panel = ControlPanel()
        self.right_panel = RightPanel()
        self.viewer = PhotoViewer(self)
        self.viewer.setMouseTracking(True)

        # Setup file model
        self.file_model = CustomFileSystemModel()
        self.right_panel.setup_file_model(self.file_model)

        # Create status bar
        self.status_bar = StatusBar()
        self.setStatusBar(self.status_bar)

        # Create horizontal splitter for main panels
        self.main_splitter = QSplitter(Qt.Orientation.Horizontal)
        self.main_splitter.addWidget(self.control_panel)
        self.main_splitter.addWidget(self.viewer)
        self.main_splitter.addWidget(self.right_panel)

        # Set minimum sizes for panels to prevent shrinking below preferred width
        self.control_panel.setMinimumWidth(self.control_panel.preferred_width)
        self.right_panel.setMinimumWidth(self.right_panel.preferred_width)

        # Set splitter sizes - give most space to viewer
        self.main_splitter.setSizes([250, 800, 350])
        self.main_splitter.setStretchFactor(0, 0)  # Control panel doesn't stretch
        self.main_splitter.setStretchFactor(1, 1)  # Viewer stretches
        self.main_splitter.setStretchFactor(2, 0)  # Right panel doesn't stretch

        # Set splitter child sizes policy
        self.main_splitter.setChildrenCollapsible(True)

        # Connect splitter signals for intelligent expand/collapse
        self.main_splitter.splitterMoved.connect(self._handle_splitter_moved)

        # Main vertical layout to accommodate status bar
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)
        main_layout.addWidget(self.main_splitter, 1)

        central_widget = QWidget()
        central_widget.setLayout(main_layout)
        self.setCentralWidget(central_widget)

    def _setup_model(self):
        """Setup the SAM model."""
        print("[7/20] Initializing SAM model (this may take a moment)...")

        sam_model = self.model_manager.initialize_default_model(
            self.settings.default_model_type
        )

        if sam_model and sam_model.is_loaded:
            device_text = str(sam_model.device).upper()
            print(f"[14/20] SAM model loaded successfully on {device_text}")
            self.status_bar.set_permanent_message(f"Device: {device_text}")
            self._enable_sam_functionality(True)
        elif sam_model is None:
            print(
                "[14/20] SAM model initialization failed. Point mode will be disabled."
            )
            self.status_bar.set_permanent_message("Model initialization failed")
            self._enable_sam_functionality(False)
        else:
            print("[14/20] SAM model failed to load. Point mode will be disabled.")
            self.status_bar.set_permanent_message("Model loading failed")
            self._enable_sam_functionality(False)

        print("[15/20] Scanning available models...")

        # Setup model change callback
        self.model_manager.on_model_changed = self.control_panel.set_current_model

        # Initialize models list
        models = self.model_manager.get_available_models(str(self.paths.models_dir))
        self.control_panel.populate_models(models)

        if models:
            print(f"[16/20] Found {len(models)} model(s) in models directory")

    def _enable_sam_functionality(self, enabled: bool):
        """Enable or disable SAM point functionality."""
        self.control_panel.set_sam_mode_enabled(enabled)
        if not enabled and self.mode == "sam_points":
            # Switch to polygon mode if SAM is disabled and we're in SAM mode
            self.set_polygon_mode()

    def _setup_connections(self):
        """Setup signal connections."""
        # Control panel connections
        self.control_panel.sam_mode_requested.connect(self.set_sam_mode)
        self.control_panel.polygon_mode_requested.connect(self.set_polygon_mode)
        self.control_panel.selection_mode_requested.connect(self.toggle_selection_mode)
        self.control_panel.clear_points_requested.connect(self.clear_all_points)
        self.control_panel.fit_view_requested.connect(self.viewer.fitInView)
        self.control_panel.hotkeys_requested.connect(self._show_hotkey_dialog)

        # Model management
        self.control_panel.browse_models_requested.connect(self._browse_models_folder)
        self.control_panel.refresh_models_requested.connect(self._refresh_models_list)
        self.control_panel.model_selected.connect(self._load_selected_model)

        # Adjustments
        self.control_panel.annotation_size_changed.connect(self._set_annotation_size)
        self.control_panel.pan_speed_changed.connect(self._set_pan_speed)
        self.control_panel.join_threshold_changed.connect(self._set_join_threshold)

        # Right panel connections
        self.right_panel.open_folder_requested.connect(self._open_folder_dialog)
        self.right_panel.image_selected.connect(self._load_selected_image)
        self.right_panel.merge_selection_requested.connect(
            self._assign_selected_to_class
        )
        self.right_panel.delete_selection_requested.connect(
            self._delete_selected_segments
        )
        self.right_panel.segments_selection_changed.connect(
            self._highlight_selected_segments
        )
        self.right_panel.class_alias_changed.connect(self._handle_alias_change)
        self.right_panel.reassign_classes_requested.connect(self._reassign_class_ids)
        self.right_panel.class_filter_changed.connect(self._update_segment_table)
        self.right_panel.class_toggled.connect(self._handle_class_toggle)

        # Panel pop-out functionality
        self.control_panel.pop_out_requested.connect(self._pop_out_left_panel)
        self.right_panel.pop_out_requested.connect(self._pop_out_right_panel)

        # Mouse events (will be implemented in a separate handler)
        self._setup_mouse_events()

    def _setup_shortcuts(self):
        """Setup keyboard shortcuts based on hotkey manager."""
        self.shortcuts = []  # Keep track of shortcuts for updating
        self._update_shortcuts()

    def _update_shortcuts(self):
        """Update shortcuts based on current hotkey configuration."""
        # Clear existing shortcuts
        for shortcut in self.shortcuts:
            shortcut.setParent(None)
        self.shortcuts.clear()

        # Map action names to callbacks
        action_callbacks = {
            "load_next_image": self._load_next_image,
            "load_previous_image": self._load_previous_image,
            "sam_mode": self.set_sam_mode,
            "polygon_mode": self.set_polygon_mode,
            "selection_mode": self.toggle_selection_mode,
            "pan_mode": self.toggle_pan_mode,
            "edit_mode": self.toggle_edit_mode,
            "clear_points": self.clear_all_points,
            "escape": self._handle_escape_press,
            "delete_segments": self._delete_selected_segments,
            "delete_segments_alt": self._delete_selected_segments,
            "merge_segments": self._handle_merge_press,
            "undo": self._undo_last_action,
            "select_all": lambda: self.right_panel.select_all_segments(),
            "save_segment": self._handle_space_press,
            "save_output": self._handle_enter_press,
            "save_output_alt": self._handle_enter_press,
            "fit_view": self.viewer.fitInView,
            "zoom_in": self._handle_zoom_in,
            "zoom_out": self._handle_zoom_out,
            "pan_up": lambda: self._handle_pan_key("up"),
            "pan_down": lambda: self._handle_pan_key("down"),
            "pan_left": lambda: self._handle_pan_key("left"),
            "pan_right": lambda: self._handle_pan_key("right"),
        }

        # Create shortcuts for each action
        for action_name, callback in action_callbacks.items():
            primary_key, secondary_key = self.hotkey_manager.get_key_for_action(
                action_name
            )

            # Create primary shortcut
            if primary_key:
                shortcut = QShortcut(QKeySequence(primary_key), self, callback)
                self.shortcuts.append(shortcut)

            # Create secondary shortcut
            if secondary_key:
                shortcut = QShortcut(QKeySequence(secondary_key), self, callback)
                self.shortcuts.append(shortcut)

    def _load_settings(self):
        """Load and apply settings."""
        self.control_panel.set_settings(self.settings.__dict__)
        self.control_panel.set_annotation_size(
            int(self.settings.annotation_size_multiplier * 10)
        )
        self.control_panel.set_join_threshold(self.settings.polygon_join_threshold)
        # Set initial mode based on model availability
        if self.model_manager.is_model_available():
            self.set_sam_mode()
        else:
            self.set_polygon_mode()

    def _setup_mouse_events(self):
        """Setup mouse event handling."""
        self._original_mouse_press = self.viewer.scene().mousePressEvent
        self._original_mouse_move = self.viewer.scene().mouseMoveEvent
        self._original_mouse_release = self.viewer.scene().mouseReleaseEvent

        self.viewer.scene().mousePressEvent = self._scene_mouse_press
        self.viewer.scene().mouseMoveEvent = self._scene_mouse_move
        self.viewer.scene().mouseReleaseEvent = self._scene_mouse_release

    # Mode management methods
    def set_sam_mode(self):
        """Set SAM points mode."""
        if not self.model_manager.is_model_available():
            print("Cannot enter SAM mode: No model available")
            return
        self._set_mode("sam_points")

    def set_polygon_mode(self):
        """Set polygon drawing mode."""
        self._set_mode("polygon")

    def toggle_selection_mode(self):
        """Toggle selection mode."""
        self._toggle_mode("selection")

    def toggle_pan_mode(self):
        """Toggle pan mode."""
        self._toggle_mode("pan")

    def toggle_edit_mode(self):
        """Toggle edit mode."""
        self._toggle_mode("edit")

    def _set_mode(self, mode_name, is_toggle=False):
        """Set the current mode."""
        if not is_toggle and self.mode not in ["selection", "edit"]:
            self.previous_mode = self.mode

        self.mode = mode_name
        self.control_panel.set_mode_text(mode_name)
        self.clear_all_points()

        # Set cursor and drag mode based on mode
        cursor_map = {
            "sam_points": Qt.CursorShape.CrossCursor,
            "polygon": Qt.CursorShape.CrossCursor,
            "selection": Qt.CursorShape.ArrowCursor,
            "edit": Qt.CursorShape.SizeAllCursor,
            "pan": Qt.CursorShape.OpenHandCursor,
        }
        self.viewer.set_cursor(cursor_map.get(self.mode, Qt.CursorShape.ArrowCursor))

        drag_mode = (
            self.viewer.DragMode.ScrollHandDrag
            if self.mode == "pan"
            else self.viewer.DragMode.NoDrag
        )
        self.viewer.setDragMode(drag_mode)

        # Update highlights and handles based on the new mode
        self._highlight_selected_segments()
        if mode_name == "edit":
            self._display_edit_handles()
        else:
            self._clear_edit_handles()

    def _toggle_mode(self, new_mode):
        """Toggle between modes."""
        if self.mode == new_mode:
            self._set_mode(self.previous_mode, is_toggle=True)
        else:
            if self.mode not in ["selection", "edit"]:
                self.previous_mode = self.mode
            self._set_mode(new_mode, is_toggle=True)

    # Model management methods
    def _browse_models_folder(self):
        """Browse for models folder."""
        folder_path = QFileDialog.getExistingDirectory(self, "Select Models Folder")
        if folder_path:
            self.model_manager.set_models_folder(folder_path)
            models = self.model_manager.get_available_models(folder_path)
            self.control_panel.populate_models(models)
        self.viewer.setFocus()

    def _refresh_models_list(self):
        """Refresh the models list."""
        folder = self.model_manager.get_models_folder()
        if folder and os.path.exists(folder):
            models = self.model_manager.get_available_models(folder)
            self.control_panel.populate_models(models)
            self._show_success_notification("Models list refreshed.")
        else:
            self._show_warning_notification("No models folder selected.")

    def _load_selected_model(self, model_text):
        """Load the selected model."""
        if not model_text or model_text == "Default (vit_h)":
            self.control_panel.set_current_model("Current: Default SAM Model")
            return

        model_path = self.control_panel.model_widget.get_selected_model_path()
        if not model_path or not os.path.exists(model_path):
            self._show_error_notification("Selected model file not found.")
            return

        self.control_panel.set_current_model("Loading model...")
        QApplication.processEvents()

        try:
            success = self.model_manager.load_custom_model(model_path)
            if success:
                # Re-enable SAM functionality if model loaded successfully
                self._enable_sam_functionality(True)
                if self.model_manager.sam_model:
                    device_text = str(self.model_manager.sam_model.device).upper()
                    self.status_bar.set_permanent_message(f"Device: {device_text}")
            else:
                self.control_panel.set_current_model("Current: Default SAM Model")
                self._show_error_notification(
                    "Failed to load selected model. Using default."
                )
                self.control_panel.model_widget.reset_to_default()
                self._enable_sam_functionality(False)
        except Exception as e:
            self.control_panel.set_current_model("Current: Default SAM Model")
            self._show_error_notification(f"Error loading model: {str(e)}")
            self.control_panel.model_widget.reset_to_default()
            self._enable_sam_functionality(False)

    # Adjustment methods
    def _set_annotation_size(self, value):
        """Set annotation size."""
        multiplier = value / 10.0
        self.point_radius = self.settings.point_radius * multiplier
        self.line_thickness = self.settings.line_thickness * multiplier
        self.settings.annotation_size_multiplier = multiplier
        # Update display (implementation would go here)

    def _set_pan_speed(self, value):
        """Set pan speed."""
        self.pan_multiplier = value / 10.0
        self.settings.pan_multiplier = self.pan_multiplier

    def _set_join_threshold(self, value):
        """Set polygon join threshold."""
        self.polygon_join_threshold = value
        self.settings.polygon_join_threshold = value

    # File management methods
    def _open_folder_dialog(self):
        """Open folder dialog for images."""
        folder_path = QFileDialog.getExistingDirectory(self, "Select Image Folder")
        if folder_path:
            self.right_panel.set_folder(folder_path, self.file_model)
        self.viewer.setFocus()

    def _load_selected_image(self, index):
        """Load the selected image."""
        if not index.isValid() or not self.file_model.isDir(index.parent()):
            return

        self.current_file_index = index
        path = self.file_model.filePath(index)

        if os.path.isfile(path) and self.file_manager.is_image_file(path):
            self.current_image_path = path
            pixmap = QPixmap(self.current_image_path)
            if not pixmap.isNull():
                self._reset_state()
                self.viewer.set_photo(pixmap)
                if self.model_manager.is_model_available():
                    self.model_manager.sam_model.set_image(self.current_image_path)
                self.file_manager.load_class_aliases(self.current_image_path)
                self.file_manager.load_existing_mask(self.current_image_path)
                self.right_panel.file_tree.setCurrentIndex(index)
                self._update_all_lists()
                self.viewer.setFocus()

    def _load_next_image(self):
        """Load next image in the file list, with auto-save if enabled."""
        if not self.current_file_index.isValid():
            return
        # Auto-save if enabled
        if self.control_panel.get_settings().get("auto_save", True):
            self._save_output_to_npz()
        parent = self.current_file_index.parent()
        row = self.current_file_index.row()
        # Find next valid image file
        for next_row in range(row + 1, self.file_model.rowCount(parent)):
            next_index = self.file_model.index(next_row, 0, parent)
            path = self.file_model.filePath(next_index)
            if os.path.isfile(path) and self.file_manager.is_image_file(path):
                self._load_selected_image(next_index)
                return

    def _load_previous_image(self):
        """Load previous image in the file list, with auto-save if enabled."""
        if not self.current_file_index.isValid():
            return
        # Auto-save if enabled
        if self.control_panel.get_settings().get("auto_save", True):
            self._save_output_to_npz()
        parent = self.current_file_index.parent()
        row = self.current_file_index.row()
        # Find previous valid image file
        for prev_row in range(row - 1, -1, -1):
            prev_index = self.file_model.index(prev_row, 0, parent)
            path = self.file_model.filePath(prev_index)
            if os.path.isfile(path) and self.file_manager.is_image_file(path):
                self._load_selected_image(prev_index)
                return

    # Segment management methods
    def _assign_selected_to_class(self):
        """Assign selected segments to class."""
        selected_indices = self.right_panel.get_selected_segment_indices()
        self.segment_manager.assign_segments_to_class(selected_indices)
        self._update_all_lists()

    def _delete_selected_segments(self):
        """Delete selected segments and remove any highlight overlays."""
        # Remove highlight overlays before deleting segments
        if hasattr(self, "highlight_items"):
            for item in self.highlight_items:
                self.viewer.scene().removeItem(item)
            self.highlight_items = []
        selected_indices = self.right_panel.get_selected_segment_indices()
        self.segment_manager.delete_segments(selected_indices)
        self._update_all_lists()

    def _highlight_selected_segments(self):
        """Highlight selected segments. In edit mode, use a brighter hover-like effect."""
        # Remove previous highlight overlays
        if hasattr(self, "highlight_items"):
            for item in self.highlight_items:
                if item.scene():
                    self.viewer.scene().removeItem(item)
        self.highlight_items = []

        selected_indices = self.right_panel.get_selected_segment_indices()
        if not selected_indices:
            return

        for i in selected_indices:
            seg = self.segment_manager.segments[i]
            base_color = self._get_color_for_class(seg.get("class_id"))

            if self.mode == "edit":
                # Use a brighter, hover-like highlight in edit mode
                highlight_brush = QBrush(
                    QColor(base_color.red(), base_color.green(), base_color.blue(), 170)
                )
            else:
                # Use the standard yellow overlay for selection
                highlight_brush = QBrush(QColor(255, 255, 0, 180))

            if seg["type"] == "Polygon" and seg.get("vertices"):
                poly_item = QGraphicsPolygonItem(QPolygonF(seg["vertices"]))
                poly_item.setBrush(highlight_brush)
                poly_item.setPen(QPen(Qt.GlobalColor.transparent))
                poly_item.setZValue(99)
                self.viewer.scene().addItem(poly_item)
                self.highlight_items.append(poly_item)
            elif seg.get("mask") is not None:
                # For non-polygon types, we still use the mask-to-pixmap approach.
                # If in edit mode, we could consider skipping non-polygons.
                if self.mode != "edit":
                    mask = seg.get("mask")
                    pixmap = mask_to_pixmap(mask, (255, 255, 0), alpha=180)
                    highlight_item = self.viewer.scene().addPixmap(pixmap)
                    highlight_item.setZValue(100)
                    self.highlight_items.append(highlight_item)

    def _handle_alias_change(self, class_id, alias):
        """Handle class alias change."""
        if self._updating_lists:
            return  # Prevent recursion
        self.segment_manager.set_class_alias(class_id, alias)
        self._update_all_lists()

    def _reassign_class_ids(self):
        """Reassign class IDs."""
        new_order = self.right_panel.get_class_order()
        self.segment_manager.reassign_class_ids(new_order)
        self._update_all_lists()

    def _update_segment_table(self):
        """Update segment table."""
        table = self.right_panel.segment_table
        table.blockSignals(True)
        selected_indices = self.right_panel.get_selected_segment_indices()
        table.clearContents()
        table.setRowCount(0)

        # Get current filter
        filter_text = self.right_panel.class_filter_combo.currentText()
        show_all = filter_text == "All Classes"
        filter_class_id = -1
        if not show_all:
            try:
                # Parse format like "Alias: ID" or "Class ID"
                if ":" in filter_text:
                    filter_class_id = int(filter_text.split(":")[-1].strip())
                else:
                    filter_class_id = int(filter_text.split()[-1])
            except (ValueError, IndexError):
                show_all = True  # If parsing fails, show all

        # Filter segments based on class filter
        display_segments = []
        for i, seg in enumerate(self.segment_manager.segments):
            seg_class_id = seg.get("class_id")
            should_include = show_all or seg_class_id == filter_class_id
            if should_include:
                display_segments.append((i, seg))

        table.setRowCount(len(display_segments))

        # Populate table rows
        for row, (original_index, seg) in enumerate(display_segments):
            class_id = seg.get("class_id")
            color = self._get_color_for_class(class_id)
            class_id_str = str(class_id) if class_id is not None else "N/A"

            alias_str = "N/A"
            if class_id is not None:
                alias_str = self.segment_manager.get_class_alias(class_id)

            # Create table items (1-based segment ID for display)
            index_item = NumericTableWidgetItem(str(original_index + 1))
            class_item = NumericTableWidgetItem(class_id_str)
            alias_item = QTableWidgetItem(alias_str)

            # Set items as non-editable
            index_item.setFlags(index_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            class_item.setFlags(class_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            alias_item.setFlags(alias_item.flags() & ~Qt.ItemFlag.ItemIsEditable)

            # Store original index for selection tracking
            index_item.setData(Qt.ItemDataRole.UserRole, original_index)

            # Set items in table
            table.setItem(row, 0, index_item)
            table.setItem(row, 1, class_item)
            table.setItem(row, 2, alias_item)

            # Set background color based on class
            for col in range(table.columnCount()):
                if table.item(row, col):
                    table.item(row, col).setBackground(QBrush(color))

        # Restore selection
        table.setSortingEnabled(False)
        for row in range(table.rowCount()):
            item = table.item(row, 0)
            if item and item.data(Qt.ItemDataRole.UserRole) in selected_indices:
                table.selectRow(row)
        table.setSortingEnabled(True)

        table.blockSignals(False)
        self.viewer.setFocus()

        # Update active class display
        active_class = self.segment_manager.get_active_class()
        self.right_panel.update_active_class_display(active_class)

    def _update_all_lists(self):
        """Update all UI lists."""
        if self._updating_lists:
            return  # Prevent recursion

        self._updating_lists = True
        try:
            self._update_class_list()
            self._update_segment_table()
            self._update_class_filter()
            self._display_all_segments()
            if self.mode == "edit":
                self._display_edit_handles()
            else:
                self._clear_edit_handles()
        finally:
            self._updating_lists = False

    def _update_class_list(self):
        """Update the class list in the right panel."""
        class_table = self.right_panel.class_table
        class_table.blockSignals(True)

        # Get unique class IDs
        unique_class_ids = self.segment_manager.get_unique_class_ids()

        class_table.clearContents()
        class_table.setRowCount(len(unique_class_ids))

        for row, cid in enumerate(unique_class_ids):
            alias_item = QTableWidgetItem(self.segment_manager.get_class_alias(cid))
            id_item = QTableWidgetItem(str(cid))
            id_item.setFlags(id_item.flags() & ~Qt.ItemFlag.ItemIsEditable)

            color = self._get_color_for_class(cid)
            alias_item.setBackground(QBrush(color))
            id_item.setBackground(QBrush(color))

            class_table.setItem(row, 0, alias_item)
            class_table.setItem(row, 1, id_item)

        # Update active class display BEFORE re-enabling signals
        active_class = self.segment_manager.get_active_class()
        self.right_panel.update_active_class_display(active_class)

        class_table.blockSignals(False)

    def _update_class_filter(self):
        """Update the class filter combo box."""
        combo = self.right_panel.class_filter_combo
        current_text = combo.currentText()

        combo.blockSignals(True)
        combo.clear()
        combo.addItem("All Classes")

        # Add class options
        unique_class_ids = self.segment_manager.get_unique_class_ids()
        for class_id in unique_class_ids:
            alias = self.segment_manager.get_class_alias(class_id)
            display_text = f"{alias}: {class_id}" if alias else f"Class {class_id}"
            combo.addItem(display_text)

        # Restore selection if possible
        index = combo.findText(current_text)
        if index >= 0:
            combo.setCurrentIndex(index)
        else:
            combo.setCurrentIndex(0)

        combo.blockSignals(False)

    def _display_all_segments(self):
        """Display all segments on the viewer."""
        # Clear existing segment items
        for i, items in self.segment_items.items():
            for item in items:
                if item.scene():
                    self.viewer.scene().removeItem(item)
        self.segment_items.clear()
        self._clear_edit_handles()

        # Display segments from segment manager
        for i, segment in enumerate(self.segment_manager.segments):
            self.segment_items[i] = []
            class_id = segment.get("class_id")
            base_color = self._get_color_for_class(class_id)

            if segment["type"] == "Polygon" and segment.get("vertices"):
                poly_item = HoverablePolygonItem(QPolygonF(segment["vertices"]))
                default_brush = QBrush(
                    QColor(base_color.red(), base_color.green(), base_color.blue(), 70)
                )
                hover_brush = QBrush(
                    QColor(base_color.red(), base_color.green(), base_color.blue(), 170)
                )
                poly_item.set_brushes(default_brush, hover_brush)
                poly_item.setPen(QPen(Qt.GlobalColor.transparent))
                self.viewer.scene().addItem(poly_item)
                self.segment_items[i].append(poly_item)
            elif segment.get("mask") is not None:
                default_pixmap = mask_to_pixmap(
                    segment["mask"], base_color.getRgb()[:3], alpha=70
                )
                hover_pixmap = mask_to_pixmap(
                    segment["mask"], base_color.getRgb()[:3], alpha=170
                )
                pixmap_item = HoverablePixmapItem()
                pixmap_item.set_pixmaps(default_pixmap, hover_pixmap)
                self.viewer.scene().addItem(pixmap_item)
                pixmap_item.setZValue(i + 1)
                self.segment_items[i].append(pixmap_item)

    # Event handlers
    def _handle_escape_press(self):
        """Handle escape key press."""
        self.right_panel.clear_selections()
        self.clear_all_points()
        self.viewer.setFocus()

    def _handle_space_press(self):
        """Handle space key press."""
        if self.mode == "polygon" and self.polygon_points:
            self._finalize_polygon()
        else:
            self._save_current_segment()

    def _handle_enter_press(self):
        """Handle enter key press."""
        if self.mode == "polygon" and self.polygon_points:
            self._finalize_polygon()
        else:
            self._save_output_to_npz()

    def _save_current_segment(self):
        """Save current SAM segment."""
        if (
            self.mode != "sam_points"
            or not hasattr(self, "preview_mask_item")
            or not self.preview_mask_item
            or not self.model_manager.is_model_available()
        ):
            return

        mask = self.model_manager.sam_model.predict(
            self.positive_points, self.negative_points
        )
        if mask is not None:
            new_segment = {
                "mask": mask,
                "type": "SAM",
                "vertices": None,
            }
            self.segment_manager.add_segment(new_segment)
            # Record the action for undo
            self.action_history.append(
                {
                    "type": "add_segment",
                    "segment_index": len(self.segment_manager.segments) - 1,
                }
            )
            self.clear_all_points()
            self._update_all_lists()

    def _finalize_polygon(self):
        """Finalize polygon drawing."""
        if len(self.polygon_points) < 3:
            return

        new_segment = {
            "vertices": list(self.polygon_points),
            "type": "Polygon",
            "mask": None,
        }
        self.segment_manager.add_segment(new_segment)
        # Record the action for undo
        self.action_history.append(
            {
                "type": "add_segment",
                "segment_index": len(self.segment_manager.segments) - 1,
            }
        )

        self.polygon_points.clear()
        self.clear_all_points()
        self._update_all_lists()

    def _save_output_to_npz(self):
        """Save output to NPZ and TXT files as enabled, and update file list tickboxes/highlight. If no segments, delete associated files."""
        if not self.current_image_path:
            self._show_warning_notification("No image loaded.")
            return

        # If no segments, delete associated files
        if not self.segment_manager.segments:
            base, _ = os.path.splitext(self.current_image_path)
            deleted_files = []
            for ext in [".npz", ".txt", ".json"]:
                file_path = base + ext
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                        deleted_files.append(file_path)
                        self.file_model.update_cache_for_path(file_path)
                    except Exception as e:
                        self._show_error_notification(
                            f"Error deleting {file_path}: {e}"
                        )
            if deleted_files:
                self._show_notification(
                    f"Deleted: {', '.join(os.path.basename(f) for f in deleted_files)}"
                )
            else:
                self._show_warning_notification("No segments to save.")
            return

        try:
            settings = self.control_panel.get_settings()
            npz_path = None
            txt_path = None
            if settings.get("save_npz", True):
                h, w = (
                    self.viewer._pixmap_item.pixmap().height(),
                    self.viewer._pixmap_item.pixmap().width(),
                )
                class_order = self.segment_manager.get_unique_class_ids()
                if class_order:
                    npz_path = self.file_manager.save_npz(
                        self.current_image_path, (h, w), class_order
                    )
                    self._show_success_notification(
                        f"Saved: {os.path.basename(npz_path)}"
                    )
                else:
                    self._show_warning_notification("No classes defined for saving.")
            if settings.get("save_txt", True):
                h, w = (
                    self.viewer._pixmap_item.pixmap().height(),
                    self.viewer._pixmap_item.pixmap().width(),
                )
                class_order = self.segment_manager.get_unique_class_ids()
                if settings.get("yolo_use_alias", True):
                    class_labels = [
                        self.segment_manager.get_class_alias(cid) for cid in class_order
                    ]
                else:
                    class_labels = [str(cid) for cid in class_order]
                if class_order:
                    txt_path = self.file_manager.save_yolo_txt(
                        self.current_image_path, (h, w), class_order, class_labels
                    )
            # Efficiently update file list tickboxes and highlight
            for path in [npz_path, txt_path]:
                if path:
                    self.file_model.update_cache_for_path(path)
                    self.file_model.set_highlighted_path(path)
                    QTimer.singleShot(
                        1500,
                        lambda p=path: (
                            self.file_model.set_highlighted_path(None)
                            if self.file_model.highlighted_path == p
                            else None
                        ),
                    )
        except Exception as e:
            self._show_error_notification(f"Error saving: {str(e)}")

    def _handle_merge_press(self):
        """Handle merge key press."""
        self._assign_selected_to_class()
        self.right_panel.clear_selections()

    def _undo_last_action(self):
        """Undo the last action recorded in the history."""
        if not self.action_history:
            self._show_notification("Nothing to undo.")
            return

        last_action = self.action_history.pop()
        action_type = last_action.get("type")

        if action_type == "add_segment":
            segment_index = last_action.get("segment_index")
            if segment_index is not None and 0 <= segment_index < len(
                self.segment_manager.segments
            ):
                # Remove the segment that was added
                self.segment_manager.delete_segments([segment_index])
                self.right_panel.clear_selections() # Clear selection to prevent phantom highlights
                self._update_all_lists()
                self._show_notification("Undid: Add Segment")
        elif action_type == "add_point":
            point_type = last_action.get("point_type")
            point_item = last_action.get("point_item")
            point_list = self.positive_points if point_type == "positive" else self.negative_points
            if point_list:
                point_list.pop()
                if point_item in self.point_items:
                    self.point_items.remove(point_item)
                    self.viewer.scene().removeItem(point_item)
                self._update_segmentation()
                self._show_notification("Undid: Add Point")
        elif action_type == "add_polygon_point":
            dot_item = last_action.get("dot_item")
            if self.polygon_points:
                self.polygon_points.pop()
                if dot_item in self.polygon_preview_items:
                    self.polygon_preview_items.remove(dot_item)
                    self.viewer.scene().removeItem(dot_item)
                self._draw_polygon_preview()
            self._show_notification("Undid: Add Polygon Point")
        elif action_type == "move_polygon":
            initial_vertices = last_action.get("initial_vertices")
            for i, vertices in initial_vertices.items():
                self.segment_manager.segments[i]["vertices"] = vertices
                self._update_polygon_item(i)
            self._display_edit_handles()
            self._highlight_selected_segments()
            self._show_notification("Undid: Move Polygon")
        elif action_type == "move_vertex":
            segment_index = last_action.get("segment_index")
            vertex_index = last_action.get("vertex_index")
            old_pos = last_action.get("old_pos")
            self.segment_manager.segments[segment_index]["vertices"][vertex_index] = old_pos
            self._update_polygon_item(segment_index)
            self._display_edit_handles()
            self._highlight_selected_segments()
            self._show_notification("Undid: Move Vertex")

        # Add more undo logic for other action types here in the future
        else:
            self._show_warning_notification(f"Undo for action '{action_type}' not implemented.")

    def clear_all_points(self):
        """Clear all temporary points."""
        if hasattr(self, "rubber_band_line") and self.rubber_band_line:
            self.viewer.scene().removeItem(self.rubber_band_line)
            self.rubber_band_line = None

        self.positive_points.clear()
        self.negative_points.clear()

        for item in self.point_items:
            self.viewer.scene().removeItem(item)
        self.point_items.clear()

        self.polygon_points.clear()
        for item in self.polygon_preview_items:
            self.viewer.scene().removeItem(item)
        self.polygon_preview_items.clear()

        if hasattr(self, "preview_mask_item") and self.preview_mask_item:
            self.viewer.scene().removeItem(self.preview_mask_item)
            self.preview_mask_item = None

    def _show_notification(self, message, duration=3000):
        """Show notification message."""
        self.status_bar.show_message(message, duration)

    def _show_error_notification(self, message, duration=8000):
        """Show error notification message."""
        self.status_bar.show_error_message(message, duration)

    def _show_success_notification(self, message, duration=3000):
        """Show success notification message."""
        self.status_bar.show_success_message(message, duration)

    def _show_warning_notification(self, message, duration=5000):
        """Show warning notification message."""
        self.status_bar.show_warning_message(message, duration)

    def _show_hotkey_dialog(self):
        """Show the hotkey configuration dialog."""
        dialog = HotkeyDialog(self.hotkey_manager, self)
        dialog.exec()
        # Update shortcuts after dialog closes
        self._update_shortcuts()

    def _handle_zoom_in(self):
        """Handle zoom in."""
        current_val = self.control_panel.get_annotation_size()
        self.control_panel.set_annotation_size(min(current_val + 1, 50))

    def _handle_zoom_out(self):
        """Handle zoom out."""
        current_val = self.control_panel.get_annotation_size()
        self.control_panel.set_annotation_size(max(current_val - 1, 1))

    def _handle_pan_key(self, direction):
        """Handle WASD pan keys."""
        if not hasattr(self, "viewer"):
            return

        amount = int(self.viewer.height() * 0.1 * self.pan_multiplier)

        if direction == "up":
            self.viewer.verticalScrollBar().setValue(
                self.viewer.verticalScrollBar().value() - amount
            )
        elif direction == "down":
            self.viewer.verticalScrollBar().setValue(
                self.viewer.verticalScrollBar().value() + amount
            )
        elif direction == "left":
            amount = int(self.viewer.width() * 0.1 * self.pan_multiplier)
            self.viewer.horizontalScrollBar().setValue(
                self.viewer.horizontalScrollBar().value() - amount
            )
        elif direction == "right":
            amount = int(self.viewer.width() * 0.1 * self.pan_multiplier)
            self.viewer.horizontalScrollBar().setValue(
                self.viewer.horizontalScrollBar().value() + amount
            )

    def closeEvent(self, event):
        """Handle application close."""
        # Close any popped-out panels first
        if self.left_panel_popout is not None:
            self.left_panel_popout.close()
        if self.right_panel_popout is not None:
            self.right_panel_popout.close()

        # Save settings
        self.settings.save_to_file(str(self.paths.settings_file))
        super().closeEvent(event)

    def _reset_state(self):
        """Reset application state."""
        self.clear_all_points()
        self.segment_manager.clear()
        self._update_all_lists()
        items_to_remove = [
            item
            for item in self.viewer.scene().items()
            if item is not self.viewer._pixmap_item
        ]
        for item in items_to_remove:
            self.viewer.scene().removeItem(item)
        self.segment_items.clear()
        self.highlight_items.clear()

    def _scene_mouse_press(self, event):
        """Handle mouse press events in the scene."""
        # Map scene coordinates to the view so items() works correctly.
        view_pos = self.viewer.mapFromScene(event.scenePos())
        items_at_pos = self.viewer.items(view_pos)
        is_handle_click = any(
            isinstance(item, EditableVertexItem) for item in items_at_pos
        )

        # Allow vertex handles to process their own mouse events.
        if is_handle_click:
            self._original_mouse_press(event)
            return

        if self.mode == "edit" and event.button() == Qt.MouseButton.LeftButton:
            pos = event.scenePos()
            if self.viewer._pixmap_item.pixmap().rect().contains(pos.toPoint()):
                self.is_dragging_polygon = True
                self.drag_start_pos = pos
                selected_indices = self.right_panel.get_selected_segment_indices()
                self.drag_initial_vertices = {
                    i: [QPointF(p) for p in self.segment_manager.segments[i]["vertices"]]
                    for i in selected_indices
                    if self.segment_manager.segments[i].get("type") == "Polygon"
                }
                event.accept()
                return

        # Call the original scene handler.
        self._original_mouse_press(event)
        # Skip further processing unless we're in selection mode.
        if event.isAccepted() and self.mode != "selection":
            return

        if self.is_dragging_polygon:
            return

        pos = event.scenePos()
        if (
            self.viewer._pixmap_item.pixmap().isNull()
            or not self.viewer._pixmap_item.pixmap().rect().contains(pos.toPoint())
        ):
            return

        if self.mode == "pan":
            self.viewer.set_cursor(Qt.CursorShape.ClosedHandCursor)
        elif self.mode == "sam_points":
            if event.button() == Qt.MouseButton.LeftButton:
                self._add_point(pos, positive=True)
                self._update_segmentation()
            elif event.button() == Qt.MouseButton.RightButton:
                self._add_point(pos, positive=False)
                self._update_segmentation()
        elif self.mode == "polygon":
            if event.button() == Qt.MouseButton.LeftButton:
                self._handle_polygon_click(pos)
        elif self.mode == "selection":
            if event.button() == Qt.MouseButton.LeftButton:
                self._handle_segment_selection_click(pos)

    def _scene_mouse_move(self, event):
        """Handle mouse move events in the scene."""
        if self.mode == "edit" and self.is_dragging_polygon:
            delta = event.scenePos() - self.drag_start_pos
            for i, initial_verts in self.drag_initial_vertices.items():
                self.segment_manager.segments[i]["vertices"] = [
                    QPointF(v) + delta for v in initial_verts
                ]
                self._update_polygon_item(i)
            self._display_edit_handles()  # Redraw handles at new positions
            self._highlight_selected_segments()  # Redraw highlight at new position
            event.accept()
            return

        self._original_mouse_move(event)

    def _scene_mouse_release(self, event):
        """Handle mouse release events in the scene."""
        if self.mode == "edit" and self.is_dragging_polygon:
            # Record the action for undo
            final_vertices = {
                i: list(self.segment_manager.segments[i]["vertices"])
                for i in self.drag_initial_vertices.keys()
            }
            self.action_history.append(
                {
                    "type": "move_polygon",
                    "initial_vertices": {k: list(v) for k, v in self.drag_initial_vertices.items()},
                    "final_vertices": final_vertices,
                }
            )
            self.is_dragging_polygon = False
            self.drag_initial_vertices.clear()
            event.accept()
            return

        if self.mode == "pan":
            self.viewer.set_cursor(Qt.CursorShape.OpenHandCursor)
        self._original_mouse_release(event)

    def _add_point(self, pos, positive):
        """Add a point for SAM segmentation."""
        point_list = self.positive_points if positive else self.negative_points
        point_list.append([int(pos.x()), int(pos.y())])

        point_color = (
            QColor(Qt.GlobalColor.green) if positive else QColor(Qt.GlobalColor.red)
        )
        point_color.setAlpha(150)
        point_diameter = self.point_radius * 2

        point_item = QGraphicsEllipseItem(
            pos.x() - self.point_radius,
            pos.y() - self.point_radius,
            point_diameter,
            point_diameter,
        )
        point_item.setBrush(QBrush(point_color))
        point_item.setPen(QPen(Qt.GlobalColor.transparent))
        self.viewer.scene().addItem(point_item)
        self.point_items.append(point_item)

        # Record the action for undo
        self.action_history.append(
            {
                "type": "add_point",
                "point_type": "positive" if positive else "negative",
                "point_coords": [int(pos.x()), int(pos.y())],
                "point_item": point_item,
            }
        )

    def _update_segmentation(self):
        """Update SAM segmentation preview."""
        if hasattr(self, "preview_mask_item") and self.preview_mask_item:
            self.viewer.scene().removeItem(self.preview_mask_item)
        if not self.positive_points or not self.model_manager.is_model_available():
            return

        mask = self.model_manager.sam_model.predict(
            self.positive_points, self.negative_points
        )
        if mask is not None:
            pixmap = mask_to_pixmap(mask, (255, 255, 0))
            self.preview_mask_item = self.viewer.scene().addPixmap(pixmap)
            self.preview_mask_item.setZValue(50)

    def _handle_polygon_click(self, pos):
        """Handle polygon drawing clicks."""
        # Check if clicking near the first point to close polygon
        if self.polygon_points and len(self.polygon_points) > 2:
            first_point = self.polygon_points[0]
            distance_squared = (pos.x() - first_point.x()) ** 2 + (
                pos.y() - first_point.y()
            ) ** 2
            if distance_squared < self.polygon_join_threshold**2:
                self._finalize_polygon()
                return

        # Add new point to polygon
        self.polygon_points.append(pos)

        # Create visual point
        point_diameter = self.point_radius * 2
        point_color = QColor(Qt.GlobalColor.blue)
        point_color.setAlpha(150)
        dot = QGraphicsEllipseItem(
            pos.x() - self.point_radius,
            pos.y() - self.point_radius,
            point_diameter,
            point_diameter,
        )
        dot.setBrush(QBrush(point_color))
        dot.setPen(QPen(Qt.GlobalColor.transparent))
        self.viewer.scene().addItem(dot)
        self.polygon_preview_items.append(dot)

        # Update polygon preview
        self._draw_polygon_preview()

        # Record the action for undo
        self.action_history.append(
            {
                "type": "add_polygon_point",
                "point_coords": pos,
                "dot_item": dot,
            }
        )

    def _draw_polygon_preview(self):
        """Draw polygon preview lines and fill."""
        # Remove old preview lines and polygons (keep dots)
        for item in self.polygon_preview_items[:]:
            if not isinstance(item, QGraphicsEllipseItem):
                if item.scene():
                    self.viewer.scene().removeItem(item)
                self.polygon_preview_items.remove(item)

        if len(self.polygon_points) > 2:
            # Create preview polygon fill
            preview_poly = QGraphicsPolygonItem(QPolygonF(self.polygon_points))
            preview_poly.setBrush(QBrush(QColor(0, 255, 255, 100)))
            preview_poly.setPen(QPen(Qt.GlobalColor.transparent))
            self.viewer.scene().addItem(preview_poly)
            self.polygon_preview_items.append(preview_poly)

        if len(self.polygon_points) > 1:
            # Create preview lines between points
            line_color = QColor(Qt.GlobalColor.cyan)
            line_color.setAlpha(150)
            for i in range(len(self.polygon_points) - 1):
                line = QGraphicsLineItem(
                    self.polygon_points[i].x(),
                    self.polygon_points[i].y(),
                    self.polygon_points[i + 1].x(),
                    self.polygon_points[i + 1].y(),
                )
                line.setPen(QPen(line_color, self.line_thickness))
                self.viewer.scene().addItem(line)
                self.polygon_preview_items.append(line)

    def _handle_segment_selection_click(self, pos):
        """Handle segment selection clicks (toggle behavior)."""
        x, y = int(pos.x()), int(pos.y())
        for i in range(len(self.segment_manager.segments) - 1, -1, -1):
            seg = self.segment_manager.segments[i]
            # Determine mask for hit-testing
            if seg["type"] == "Polygon" and seg.get("vertices"):
                # Rasterize polygon
                if self.viewer._pixmap_item.pixmap().isNull():
                    continue
                h = self.viewer._pixmap_item.pixmap().height()
                w = self.viewer._pixmap_item.pixmap().width()
                points_np = np.array(
                    [[p.x(), p.y()] for p in seg["vertices"]], dtype=np.int32
                )
                # Ensure points are within bounds
                points_np = np.clip(points_np, 0, [w - 1, h - 1])
                mask = np.zeros((h, w), dtype=np.uint8)
                cv2.fillPoly(mask, [points_np], 1)
                mask = mask.astype(bool)
            else:
                mask = seg.get("mask")
            if (
                mask is not None
                and y < mask.shape[0]
                and x < mask.shape[1]
                and mask[y, x]
            ):
                # Find the corresponding row in the segment table and toggle selection
                table = self.right_panel.segment_table
                for j in range(table.rowCount()):
                    item = table.item(j, 0)
                    if item and item.data(Qt.ItemDataRole.UserRole) == i:
                        # Toggle selection for this row using the original working method
                        is_selected = table.item(j, 0).isSelected()
                        range_to_select = QTableWidgetSelectionRange(
                            j, 0, j, table.columnCount() - 1
                        )
                        table.setRangeSelected(range_to_select, not is_selected)
                        self._highlight_selected_segments()
                        return
        self.viewer.setFocus()

    def _get_color_for_class(self, class_id):
        """Get color for a class ID."""
        if class_id is None:
            return QColor.fromHsv(0, 0, 128)
        hue = int((class_id * 222.4922359) % 360)
        color = QColor.fromHsv(hue, 220, 220)
        if not color.isValid():
            return QColor(Qt.GlobalColor.white)
        return color

    def _display_edit_handles(self):
        """Display draggable vertex handles for selected polygons in edit mode."""
        self._clear_edit_handles()
        if self.mode != "edit":
            return
        selected_indices = self.right_panel.get_selected_segment_indices()
        handle_radius = self.point_radius
        handle_diam = handle_radius * 2
        for seg_idx in selected_indices:
            seg = self.segment_manager.segments[seg_idx]
            if seg["type"] == "Polygon" and seg.get("vertices"):
                for v_idx, pt in enumerate(seg["vertices"]):
                    handle = EditableVertexItem(
                        self,
                        seg_idx,
                        v_idx,
                        -handle_radius,
                        -handle_radius,
                        handle_diam,
                        handle_diam,
                    )
                    handle.setPos(pt)  # Use setPos to handle zoom correctly
                    handle.setZValue(200)  # Ensure handles are on top
                    # Make sure the handle can receive mouse events
                    handle.setAcceptHoverEvents(True)
                    self.viewer.scene().addItem(handle)
                    self.edit_handles.append(handle)

    def _clear_edit_handles(self):
        """Remove all editable vertex handles from the scene."""
        if hasattr(self, "edit_handles"):
            for h in self.edit_handles:
                if h.scene():
                    self.viewer.scene().removeItem(h)
            self.edit_handles = []

    def update_vertex_pos(self, segment_index, vertex_index, new_pos, record_undo=True):
        """Update the position of a vertex in a polygon segment."""
        seg = self.segment_manager.segments[segment_index]
        if seg.get("type") == "Polygon":
            old_pos = seg["vertices"][vertex_index]
            if record_undo:
                self.action_history.append(
                    {
                        "type": "move_vertex",
                        "segment_index": segment_index,
                        "vertex_index": vertex_index,
                        "old_pos": old_pos,
                        "new_pos": new_pos,
                    }
                )
            seg["vertices"][
                vertex_index
            ] = new_pos  # new_pos is already the correct scene coordinate
            self._update_polygon_item(segment_index)
            self._highlight_selected_segments()  # Keep the highlight in sync with the new shape

    def _update_polygon_item(self, segment_index):
        """Efficiently update the visual polygon item for a given segment."""
        items = self.segment_items.get(segment_index, [])
        for item in items:
            if isinstance(item, HoverablePolygonItem):
                item.setPolygon(
                    QPolygonF(self.segment_manager.segments[segment_index]["vertices"])
                )
                return

    def _handle_class_toggle(self, class_id):
        """Handle class toggle."""
        is_active = self.segment_manager.toggle_active_class(class_id)

        if is_active:
            self._show_notification(f"Class {class_id} activated for new segments")
            # Update visual display
            self.right_panel.update_active_class_display(class_id)
        else:
            self._show_notification(
                "No active class - new segments will create new classes"
            )
            # Update visual display to clear active class
            self.right_panel.update_active_class_display(None)

    def _pop_out_left_panel(self):
        """Pop out the left control panel into a separate window."""
        if self.left_panel_popout is not None:
            # Panel is already popped out, return it to main window
            self._return_left_panel(self.control_panel)
            return

        # Remove panel from main splitter
        self.control_panel.setParent(None)

        # Create pop-out window
        self.left_panel_popout = PanelPopoutWindow(
            self.control_panel, "Control Panel", self
        )
        self.left_panel_popout.panel_closed.connect(self._return_left_panel)
        self.left_panel_popout.show()

        # Update panel's pop-out button
        self.control_panel.set_popout_mode(True)

        # Make pop-out window resizable
        self.left_panel_popout.setMinimumSize(200, 400)
        self.left_panel_popout.resize(self.control_panel.preferred_width + 20, 600)

    def _pop_out_right_panel(self):
        """Pop out the right panel into a separate window."""
        if self.right_panel_popout is not None:
            # Panel is already popped out, return it to main window
            self._return_right_panel(self.right_panel)
            return

        # Remove panel from main splitter
        self.right_panel.setParent(None)

        # Create pop-out window
        self.right_panel_popout = PanelPopoutWindow(
            self.right_panel, "File Explorer & Segments", self
        )
        self.right_panel_popout.panel_closed.connect(self._return_right_panel)
        self.right_panel_popout.show()

        # Update panel's pop-out button
        self.right_panel.set_popout_mode(True)

        # Make pop-out window resizable
        self.right_panel_popout.setMinimumSize(250, 400)
        self.right_panel_popout.resize(self.right_panel.preferred_width + 20, 600)

    def _return_left_panel(self, panel_widget):
        """Return the left panel to the main window."""
        if self.left_panel_popout is not None:
            # Close the pop-out window
            self.left_panel_popout.close()

            # Return panel to main splitter
            self.main_splitter.insertWidget(0, self.control_panel)
            self.left_panel_popout = None

            # Update panel's pop-out button
            self.control_panel.set_popout_mode(False)

            # Restore splitter sizes
            self.main_splitter.setSizes([250, 800, 350])

    def _handle_splitter_moved(self, pos, index):
        """Handle splitter movement for intelligent expand/collapse behavior."""
        sizes = self.main_splitter.sizes()

        # Left panel (index 0) - expand/collapse logic
        if index == 1:  # Splitter between left panel and viewer
            left_size = sizes[0]
            # Only snap to collapsed if user drags very close to collapse
            if left_size < 50:  # Collapsed threshold
                # Panel is being collapsed, snap to collapsed state
                new_sizes = [0] + sizes[1:]
                new_sizes[1] = new_sizes[1] + left_size  # Give space back to viewer
                self.main_splitter.setSizes(new_sizes)
                # Temporarily override minimum width to allow collapsing
                self.control_panel.setMinimumWidth(0)

        # Right panel (index 2) - expand/collapse logic
        elif index == 2:  # Splitter between viewer and right panel
            right_size = sizes[2]
            # Only snap to collapsed if user drags very close to collapse
            if right_size < 50:  # Collapsed threshold
                # Panel is being collapsed, snap to collapsed state
                new_sizes = sizes[:-1] + [0]
                new_sizes[1] = new_sizes[1] + right_size  # Give space back to viewer
                self.main_splitter.setSizes(new_sizes)
                # Temporarily override minimum width to allow collapsing
                self.right_panel.setMinimumWidth(0)

    def _expand_left_panel(self):
        """Expand the left panel to its preferred width."""
        sizes = self.main_splitter.sizes()
        if sizes[0] < 50:  # Only expand if currently collapsed
            # Restore minimum width first
            self.control_panel.setMinimumWidth(self.control_panel.preferred_width)

            space_needed = self.control_panel.preferred_width
            viewer_width = sizes[1] - space_needed
            if viewer_width > 400:  # Ensure viewer has minimum space
                new_sizes = [self.control_panel.preferred_width, viewer_width] + sizes[
                    2:
                ]
                self.main_splitter.setSizes(new_sizes)

    def _expand_right_panel(self):
        """Expand the right panel to its preferred width."""
        sizes = self.main_splitter.sizes()
        if sizes[2] < 50:  # Only expand if currently collapsed
            # Restore minimum width first
            self.right_panel.setMinimumWidth(self.right_panel.preferred_width)

            space_needed = self.right_panel.preferred_width
            viewer_width = sizes[1] - space_needed
            if viewer_width > 400:  # Ensure viewer has minimum space
                new_sizes = sizes[:-1] + [
                    viewer_width,
                    self.right_panel.preferred_width,
                ]
                self.main_splitter.setSizes(new_sizes)

    def _return_right_panel(self, panel_widget):
        """Return the right panel to the main window."""
        if self.right_panel_popout is not None:
            # Close the pop-out window
            self.right_panel_popout.close()

            # Return panel to main splitter
            self.main_splitter.addWidget(self.right_panel)
            self.right_panel_popout = None

            # Update panel's pop-out button
            self.right_panel.set_popout_mode(False)

            # Restore splitter sizes
            self.main_splitter.setSizes([250, 800, 350])
