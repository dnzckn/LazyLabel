"""Main application window."""

import os
import numpy as np
import cv2
from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QHBoxLayout, QFileDialog, QApplication,
    QGraphicsEllipseItem, QGraphicsLineItem, QGraphicsPolygonItem,
    QTableWidgetItem, QTableWidgetSelectionRange, QHeaderView
)
from PyQt6.QtGui import (
    QIcon, QKeySequence, QShortcut, QPixmap, QColor, QPen, QBrush, QPolygonF
)
from PyQt6.QtCore import Qt, QTimer, QModelIndex, QPointF

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


class MainWindow(QMainWindow):
    """Main application window."""
    
    def __init__(self):
        super().__init__()
        
        # Initialize configuration
        self.paths = Paths()
        self.settings = Settings.load_from_file(str(self.paths.settings_file))
        self.hotkey_manager = HotkeyManager(str(self.paths.config_dir))
        
        # Initialize managers
        self.segment_manager = SegmentManager()
        self.model_manager = ModelManager(self.paths)
        self.file_manager = FileManager(self.segment_manager)
        
        # Initialize UI state
        self.mode = "sam_points"
        self.previous_mode = "sam_points"
        self.current_image_path = None
        self.current_file_index = QModelIndex()
        
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
        self.segment_items, self.highlight_items = {}, []
        self.is_dragging_polygon, self.drag_start_pos, self.drag_initial_vertices = (
            False, None, {}
        )
        
        self._setup_ui()
        self._setup_model()
        self._setup_connections()
        self._setup_shortcuts()
        self._load_settings()
    
    def _setup_ui(self):
        """Setup the user interface."""
        self.setWindowTitle("LazyLabel by DNC")
        self.setGeometry(50, 50, self.settings.window_width, self.settings.window_height)
        
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
        
        # Layout
        main_layout = QHBoxLayout()
        main_layout.addWidget(self.control_panel)
        main_layout.addWidget(self.viewer, 1)
        main_layout.addWidget(self.right_panel)
        
        central_widget = QWidget()
        central_widget.setLayout(main_layout)
        self.setCentralWidget(central_widget)
    
    def _setup_model(self):
        """Setup the SAM model."""
        sam_model = self.model_manager.initialize_default_model(self.settings.default_model_type)
        
        if sam_model and sam_model.is_loaded:
            self.control_panel.set_device_text(str(sam_model.device))
            self._enable_sam_functionality(True)
        else:
            self.control_panel.set_device_text("No model loaded")
            self._enable_sam_functionality(False)
            print("SAM model failed to load. Point mode will be disabled.")
        
        # Setup model change callback
        self.model_manager.on_model_changed = self.control_panel.set_current_model
        
        # Initialize models list
        models = self.model_manager.get_available_models(str(self.paths.models_dir))
        self.control_panel.populate_models(models)
    
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
        self.right_panel.merge_selection_requested.connect(self._assign_selected_to_class)
        self.right_panel.delete_selection_requested.connect(self._delete_selected_segments)
        self.right_panel.segments_selection_changed.connect(self._highlight_selected_segments)
        self.right_panel.class_alias_changed.connect(self._handle_alias_change)
        self.right_panel.reassign_classes_requested.connect(self._reassign_class_ids)
        self.right_panel.class_filter_changed.connect(self._update_segment_table)
        
        # Panel visibility
        self.control_panel.btn_toggle_visibility.clicked.connect(self.control_panel.toggle_visibility)
        self.right_panel.btn_toggle_visibility.clicked.connect(self.right_panel.toggle_visibility)
        
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
            'load_next_image': self._load_next_image,
            'load_previous_image': self._load_previous_image,
            'sam_mode': self.set_sam_mode,
            'polygon_mode': self.set_polygon_mode,
            'selection_mode': self.toggle_selection_mode,
            'pan_mode': self.toggle_pan_mode,
            'edit_mode': self.toggle_edit_mode,
            'clear_points': self.clear_all_points,
            'escape': self._handle_escape_press,
            'delete_segments': self._delete_selected_segments,
            'delete_segments_alt': self._delete_selected_segments,
            'merge_segments': self._handle_merge_press,
            'undo': self._undo_last_action,
            'select_all': lambda: self.right_panel.select_all_segments(),
            'save_segment': self._handle_space_press,
            'save_output': self._handle_enter_press,
            'save_output_alt': self._handle_enter_press,
            'fit_view': self.viewer.fitInView,
            'zoom_in': self._handle_zoom_in,
            'zoom_out': self._handle_zoom_out,
            'pan_up': lambda: self._handle_pan_key('up'),
            'pan_down': lambda: self._handle_pan_key('down'),
            'pan_left': lambda: self._handle_pan_key('left'),
            'pan_right': lambda: self._handle_pan_key('right'),
        }
        
        # Create shortcuts for each action
        for action_name, callback in action_callbacks.items():
            primary_key, secondary_key = self.hotkey_manager.get_key_for_action(action_name)
            
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
        self.control_panel.set_annotation_size(int(self.settings.annotation_size_multiplier * 10))
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
        
        drag_mode = (self.viewer.DragMode.ScrollHandDrag if self.mode == "pan" 
                    else self.viewer.DragMode.NoDrag)
        self.viewer.setDragMode(drag_mode)
    
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
            self._show_notification("Models list refreshed.")
        else:
            self._show_notification("No models folder selected.")
    
    def _load_selected_model(self, model_text):
        """Load the selected model."""
        if not model_text or model_text == "Default (vit_h)":
            self.control_panel.set_current_model("Current: Default SAM Model")
            return
        
        model_path = self.control_panel.model_widget.get_selected_model_path()
        if not model_path or not os.path.exists(model_path):
            self._show_notification("Selected model file not found.")
            return
        
        self.control_panel.set_current_model("Loading model...")
        QApplication.processEvents()
        
        try:
            success = self.model_manager.load_custom_model(model_path)
            if success:
                # Re-enable SAM functionality if model loaded successfully
                self._enable_sam_functionality(True)
                if self.model_manager.sam_model:
                    self.control_panel.set_device_text(str(self.model_manager.sam_model.device))
            else:
                self.control_panel.set_current_model("Current: Default SAM Model")
                self._show_notification("Failed to load selected model. Using default.")
                self.control_panel.model_widget.reset_to_default()
                self._enable_sam_functionality(False)
        except Exception as e:
            self.control_panel.set_current_model("Current: Default SAM Model")
            self._show_notification(f"Error loading model: {str(e)}")
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
        """Load next image."""
        # Implementation would go here
        pass
    
    def _load_previous_image(self):
        """Load previous image."""
        # Implementation would go here
        pass
    
    # Segment management methods
    def _assign_selected_to_class(self):
        """Assign selected segments to class."""
        selected_indices = self.right_panel.get_selected_segment_indices()
        self.segment_manager.assign_segments_to_class(selected_indices)
        self._update_all_lists()
    
    def _delete_selected_segments(self):
        """Delete selected segments."""
        selected_indices = self.right_panel.get_selected_segment_indices()
        self.segment_manager.delete_segments(selected_indices)
        self._update_all_lists()
    
    def _highlight_selected_segments(self):
        """Highlight selected segments."""
        # Implementation would go here
        pass
    
    def _handle_alias_change(self, class_id, alias):
        """Handle class alias change."""
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
    
    def _update_all_lists(self):
        """Update all UI lists."""
        self._update_class_list()
        self._update_segment_table()
        self._update_class_filter()
        self._display_all_segments()
    
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
                self.viewer.scene().removeItem(item)
        self.segment_items.clear()
        
        # Display segments from segment manager
        for i, segment in enumerate(self.segment_manager.segments):
            self.segment_items[i] = []
            class_id = segment.get("class_id")
            base_color = self._get_color_for_class(class_id)
            
            if segment["type"] == "Polygon" and segment.get("vertices"):
                poly_item = HoverablePolygonItem(QPolygonF(segment["vertices"]))
                default_brush = QBrush(QColor(base_color.red(), base_color.green(), base_color.blue(), 70))
                hover_brush = QBrush(QColor(base_color.red(), base_color.green(), base_color.blue(), 170))
                poly_item.set_brushes(default_brush, hover_brush)
                poly_item.setPen(QPen(Qt.GlobalColor.transparent))
                self.viewer.scene().addItem(poly_item)
                self.segment_items[i].append(poly_item)
            elif segment.get("mask") is not None:
                default_pixmap = mask_to_pixmap(segment["mask"], base_color.getRgb()[:3], alpha=70)
                hover_pixmap = mask_to_pixmap(segment["mask"], base_color.getRgb()[:3], alpha=170)
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
        if (self.mode != "sam_points" or not hasattr(self, "preview_mask_item") 
            or not self.preview_mask_item or not self.model_manager.is_model_available()):
            return
            
        mask = self.model_manager.sam_model.predict(self.positive_points, self.negative_points)
        if mask is not None:
            self.segment_manager.add_segment({
                "mask": mask,
                "type": "SAM",
                "vertices": None,
            })
            self.clear_all_points()
            self._update_all_lists()
    
    def _finalize_polygon(self):
        """Finalize polygon drawing."""
        if len(self.polygon_points) < 3:
            return
            
        self.segment_manager.add_segment({
            "vertices": list(self.polygon_points),
            "type": "Polygon",
            "mask": None,
        })
        self.polygon_points.clear()
        self.clear_all_points()
        self._update_all_lists()
    
    def _save_output_to_npz(self):
        """Save output to NPZ file."""
        if not self.current_image_path or not self.segment_manager.segments:
            self._show_notification("No segments to save.")
            return
            
        try:
            settings = self.control_panel.get_settings()
            if settings.get('save_npz', True):
                h, w = (self.viewer._pixmap_item.pixmap().height(),
                       self.viewer._pixmap_item.pixmap().width())
                class_order = self.segment_manager.get_unique_class_ids()
                
                if class_order:
                    npz_path = self.file_manager.save_npz(self.current_image_path, (h, w), class_order)
                    self._show_notification(f"Saved: {os.path.basename(npz_path)}")
                else:
                    self._show_notification("No classes defined for saving.")
        except Exception as e:
            self._show_notification(f"Error saving: {str(e)}")
    
    def _handle_merge_press(self):
        """Handle merge key press."""
        self._assign_selected_to_class()
        self.right_panel.clear_selections()
    
    def _undo_last_action(self):
        """Undo last action."""
        # Implementation would go here
        pass
    
    def clear_all_points(self):
        """Clear all temporary points."""
        if hasattr(self, 'rubber_band_line') and self.rubber_band_line:
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
        self.control_panel.show_notification(message)
        QTimer.singleShot(duration, self.control_panel.clear_notification)
    
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
        if not hasattr(self, 'viewer'):
            return
            
        amount = int(self.viewer.height() * 0.1 * self.pan_multiplier)
        
        if direction == 'up':
            self.viewer.verticalScrollBar().setValue(
                self.viewer.verticalScrollBar().value() - amount
            )
        elif direction == 'down':
            self.viewer.verticalScrollBar().setValue(
                self.viewer.verticalScrollBar().value() + amount
            )
        elif direction == 'left':
            amount = int(self.viewer.width() * 0.1 * self.pan_multiplier)
            self.viewer.horizontalScrollBar().setValue(
                self.viewer.horizontalScrollBar().value() - amount
            )
        elif direction == 'right':
            amount = int(self.viewer.width() * 0.1 * self.pan_multiplier)
            self.viewer.horizontalScrollBar().setValue(
                self.viewer.horizontalScrollBar().value() + amount
            )
    
    def closeEvent(self, event):
        """Handle application close."""
        # Save settings
        self.settings.save_to_file(str(self.paths.settings_file))
        super().closeEvent(event)
    
    # Essential missing implementations
    def _reset_state(self):
        """Reset application state."""
        self.clear_all_points()
        self.segment_manager.clear()
        self._update_all_lists()
        items_to_remove = [
            item for item in self.viewer.scene().items()
            if item is not self.viewer._pixmap_item
        ]
        for item in items_to_remove:
            self.viewer.scene().removeItem(item)
        self.segment_items.clear()
        self.highlight_items.clear()
    
    def _scene_mouse_press(self, event):
        """Handle mouse press events in the scene."""
        self._original_mouse_press(event)
        if event.isAccepted():
            return

        if self.mode == "pan":
            self.viewer.set_cursor(Qt.CursorShape.ClosedHandCursor)

        pos = event.scenePos()
        if (self.viewer._pixmap_item.pixmap().isNull() or 
            not self.viewer._pixmap_item.pixmap().rect().contains(pos.toPoint())):
            return
            
        if self.mode == "sam_points":
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
        self._original_mouse_move(event)
    
    def _scene_mouse_release(self, event):
        """Handle mouse release events in the scene."""
        if self.mode == "pan":
            self.viewer.set_cursor(Qt.CursorShape.OpenHandCursor)
        self._original_mouse_release(event)
    
    def _add_point(self, pos, positive):
        """Add a point for SAM segmentation."""
        point_list = self.positive_points if positive else self.negative_points
        point_list.append([int(pos.x()), int(pos.y())])
        
        point_color = QColor(Qt.GlobalColor.green) if positive else QColor(Qt.GlobalColor.red)
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
    
    def _update_segmentation(self):
        """Update SAM segmentation preview."""
        if hasattr(self, "preview_mask_item") and self.preview_mask_item:
            self.viewer.scene().removeItem(self.preview_mask_item)
        if not self.positive_points or not self.model_manager.is_model_available():
            return
            
        mask = self.model_manager.sam_model.predict(self.positive_points, self.negative_points)
        if mask is not None:
            pixmap = mask_to_pixmap(mask, (255, 255, 0))
            self.preview_mask_item = self.viewer.scene().addPixmap(pixmap)
            self.preview_mask_item.setZValue(50)
    
    def _handle_polygon_click(self, pos):
        """Handle polygon drawing clicks."""
        # Check if clicking near the first point to close polygon
        if self.polygon_points and len(self.polygon_points) > 2:
            first_point = self.polygon_points[0]
            distance_squared = ((pos.x() - first_point.x()) ** 2 + 
                              (pos.y() - first_point.y()) ** 2)
            if distance_squared < self.polygon_join_threshold ** 2:
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
        """Handle segment selection clicks."""
        # Basic selection implementation - can be expanded
        pass
    
    def _get_color_for_class(self, class_id):
        """Get color for a class ID."""
        if class_id is None:
            return QColor.fromHsv(0, 0, 128)
        hue = int((class_id * 222.4922359) % 360)
        color = QColor.fromHsv(hue, 220, 220)
        if not color.isValid():
            return QColor(Qt.GlobalColor.white)
        return color