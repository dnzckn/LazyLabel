"""Main application window."""

import hashlib
import os
from pathlib import Path

import cv2
import numpy as np
from PyQt6.QtCore import QModelIndex, QPointF, QRectF, Qt, QThread, QTimer, pyqtSignal
from PyQt6.QtGui import (
    QBrush,
    QColor,
    QIcon,
    QImage,
    QKeySequence,
    QPen,
    QPixmap,
    QPolygonF,
    QShortcut,
)
from PyQt6.QtWidgets import (
    QApplication,
    QDialog,
    QFileDialog,
    QGraphicsEllipseItem,
    QGraphicsLineItem,
    QGraphicsPolygonItem,
    QGraphicsRectItem,
    QMainWindow,
    QSplitter,
    QTableWidgetItem,
    QTableWidgetSelectionRange,
    QVBoxLayout,
    QWidget,
)

from ..config import HotkeyManager, Paths, Settings
from ..core import FileManager, ModelManager, SegmentManager
from ..utils import CustomFileSystemModel, mask_to_pixmap
from ..utils.logger import logger
from .control_panel import ControlPanel
from .editable_vertex import EditableVertexItem
from .hotkey_dialog import HotkeyDialog
from .hoverable_pixelmap_item import HoverablePixmapItem
from .hoverable_polygon_item import HoverablePolygonItem
from .numeric_table_widget_item import NumericTableWidgetItem
from .photo_viewer import PhotoViewer
from .right_panel import RightPanel
from .widgets import StatusBar


class SAMUpdateWorker(QThread):
    """Worker thread for updating SAM model in background."""

    finished = pyqtSignal()
    error = pyqtSignal(str)

    def __init__(
        self,
        model_manager,
        image_path,
        operate_on_view,
        current_image=None,
        parent=None,
    ):
        super().__init__(parent)
        self.model_manager = model_manager
        self.image_path = image_path
        self.operate_on_view = operate_on_view
        self.current_image = current_image  # Numpy array of current modified image
        self._should_stop = False
        self.scale_factor = 1.0  # Track scaling factor for coordinate transformation

    def stop(self):
        """Request the worker to stop."""
        self._should_stop = True

    def get_scale_factor(self):
        """Get the scale factor used for image resizing."""
        return self.scale_factor

    def run(self):
        """Run SAM update in background thread."""
        try:
            if self._should_stop:
                return

            if self.operate_on_view and self.current_image is not None:
                # Use the provided modified image
                if self._should_stop:
                    return

                # Optimize image size for faster SAM processing
                image = self.current_image
                original_height, original_width = image.shape[:2]
                max_size = 1024

                if original_height > max_size or original_width > max_size:
                    # Calculate scaling factor
                    self.scale_factor = min(
                        max_size / original_width, max_size / original_height
                    )
                    new_width = int(original_width * self.scale_factor)
                    new_height = int(original_height * self.scale_factor)

                    # Resize using OpenCV for speed
                    image = cv2.resize(
                        image, (new_width, new_height), interpolation=cv2.INTER_AREA
                    )
                else:
                    self.scale_factor = 1.0

                if self._should_stop:
                    return

                # Set image from numpy array (FIXED: use resized image, not original)
                self.model_manager.set_image_from_array(image)
            else:
                # Load original image
                pixmap = QPixmap(self.image_path)
                if pixmap.isNull():
                    self.error.emit("Failed to load image")
                    return

                if self._should_stop:
                    return

                original_width = pixmap.width()
                original_height = pixmap.height()

                # Optimize image size for faster SAM processing
                max_size = 1024
                if original_width > max_size or original_height > max_size:
                    # Calculate scaling factor
                    self.scale_factor = min(
                        max_size / original_width, max_size / original_height
                    )

                    # Scale down while maintaining aspect ratio
                    scaled_pixmap = pixmap.scaled(
                        max_size,
                        max_size,
                        Qt.AspectRatioMode.KeepAspectRatio,
                        Qt.TransformationMode.SmoothTransformation,
                    )

                    # Convert to numpy array for SAM
                    qimage = scaled_pixmap.toImage()
                    width = qimage.width()
                    height = qimage.height()
                    ptr = qimage.bits()
                    ptr.setsize(height * width * 4)
                    arr = np.array(ptr).reshape(height, width, 4)
                    # Convert RGBA to RGB
                    image_array = arr[:, :, :3]

                    if self._should_stop:
                        return

                    # FIXED: Use the resized image array, not original path
                    self.model_manager.set_image_from_array(image_array)
                else:
                    self.scale_factor = 1.0
                    # For images that don't need resizing, use original path
                    self.model_manager.set_image_from_path(self.image_path)

            if not self._should_stop:
                self.finished.emit()

        except Exception as e:
            if not self._should_stop:
                self.error.emit(str(e))


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

        # Panel pop-out state
        self.left_panel_popout = None
        self.right_panel_popout = None

        # Annotation state
        self.point_radius = self.settings.point_radius
        self.line_thickness = self.settings.line_thickness
        self.pan_multiplier = self.settings.pan_multiplier
        self.polygon_join_threshold = self.settings.polygon_join_threshold
        self.fragment_threshold = self.settings.fragment_threshold

        # Image adjustment state
        self.brightness = self.settings.brightness
        self.contrast = self.settings.contrast
        self.gamma = self.settings.gamma

        # Drawing state
        self.point_items, self.positive_points, self.negative_points = [], [], []
        self.polygon_points, self.polygon_preview_items = [], []
        self.rubber_band_line = None
        self.rubber_band_rect = None  # New attribute for bounding box
        self.preview_mask_item = None
        self.segments, self.segment_items, self.highlight_items = [], {}, []
        self.edit_handles = []
        self.is_dragging_polygon, self.drag_start_pos, self.drag_initial_vertices = (
            False,
            None,
            {},
        )
        self.action_history = []
        self.redo_history = []

        # Update state flags to prevent recursion
        self._updating_lists = False

        # Crop feature state
        self.crop_mode = False
        self.crop_rect_item = None
        self.crop_start_pos = None
        self.crop_coords_by_size = {}  # Dictionary to store crop coordinates by image size
        self.current_crop_coords = None  # Current crop coordinates (x1, y1, x2, y2)
        self.crop_visual_overlays = []  # Visual overlays showing crop areas
        self.crop_hover_overlays = []  # Hover overlays for cropped areas
        self.crop_hover_effect_items = []  # Hover effect items
        self.is_hovering_crop = False  # Track if mouse is hovering over crop area

        # Channel threshold widget cache
        self._cached_original_image = None  # Cache for performance optimization

        # SAM model update debouncing for "operate on view" mode
        self.sam_update_timer = QTimer()
        self.sam_update_timer.setSingleShot(True)  # Only fire once
        self.sam_update_timer.timeout.connect(self._update_sam_model_image_debounced)
        self.sam_update_delay = 500  # 500ms delay for regular value changes
        self.drag_finish_delay = 150  # 150ms delay when drag finishes (more responsive)
        self.any_slider_dragging = False  # Track if any slider is being dragged
        self.sam_is_dirty = False  # Track if SAM needs updating
        self.sam_is_updating = False  # Track if SAM is currently updating

        # SAM update threading for better responsiveness
        self.sam_worker_thread = None
        self.sam_scale_factor = (
            1.0  # Track current SAM scale factor for coordinate transformation
        )

        # Smart caching for SAM embeddings to avoid redundant processing
        self.sam_embedding_cache = {}  # Cache SAM embeddings by content hash
        self.current_sam_hash = None  # Hash of currently loaded SAM image

        self._setup_ui()
        self._setup_model()
        self._setup_connections()
        self._setup_shortcuts()
        self._load_settings()

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

        sam_model = self.model_manager.initialize_default_model(
            self.settings.default_model_type
        )

        if sam_model and sam_model.is_loaded:
            device_text = str(sam_model.device).upper()
            logger.info(f"Step 6/8: SAM model loaded successfully on {device_text}")
            self.status_bar.set_permanent_message(f"Device: {device_text}")
            self._enable_sam_functionality(True)
        elif sam_model is None:
            logger.warning(
                "Step 6/8: SAM model initialization failed. Point mode will be disabled."
            )
            self._enable_sam_functionality(False)
        else:
            logger.warning(
                "Step 6/8: SAM model initialization failed. Point mode will be disabled."
            )
            self._enable_sam_functionality(False)

        # Setup model change callback
        self.model_manager.on_model_changed = self.control_panel.set_current_model

        # Initialize models list
        models = self.model_manager.get_available_models(str(self.paths.models_dir))
        self.control_panel.populate_models(models)

        if models:
            logger.info(f"Step 6/8: Found {len(models)} model(s) in models directory")

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
        self.control_panel.bbox_mode_requested.connect(self.set_bbox_mode)
        self.control_panel.selection_mode_requested.connect(self.toggle_selection_mode)
        self.control_panel.edit_mode_requested.connect(self._handle_edit_mode_request)
        self.control_panel.clear_points_requested.connect(self.clear_all_points)
        self.control_panel.fit_view_requested.connect(self.viewer.fitInView)
        self.control_panel.hotkeys_requested.connect(self._show_hotkey_dialog)
        self.control_panel.settings_widget.settings_changed.connect(
            self._handle_settings_changed
        )

        # Model management
        self.control_panel.browse_models_requested.connect(self._browse_models_folder)
        self.control_panel.refresh_models_requested.connect(self._refresh_models_list)
        self.control_panel.model_selected.connect(self._load_selected_model)

        # Adjustments
        self.control_panel.annotation_size_changed.connect(self._set_annotation_size)
        self.control_panel.pan_speed_changed.connect(self._set_pan_speed)
        self.control_panel.join_threshold_changed.connect(self._set_join_threshold)
        self.control_panel.fragment_threshold_changed.connect(
            self._set_fragment_threshold
        )
        self.control_panel.brightness_changed.connect(self._set_brightness)
        self.control_panel.contrast_changed.connect(self._set_contrast)
        self.control_panel.gamma_changed.connect(self._set_gamma)
        self.control_panel.reset_adjustments_requested.connect(
            self._reset_image_adjustments
        )
        self.control_panel.image_adjustment_changed.connect(
            self._handle_image_adjustment_changed
        )

        # Border crop connections
        self.control_panel.crop_draw_requested.connect(self._start_crop_drawing)
        self.control_panel.crop_clear_requested.connect(self._clear_crop)
        self.control_panel.crop_applied.connect(self._apply_crop_coordinates)

        # Channel threshold connections
        self.control_panel.channel_threshold_changed.connect(
            self._handle_channel_threshold_changed
        )

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
            "bbox_mode": self.set_bbox_mode,
            "selection_mode": self.toggle_selection_mode,
            "pan_mode": self.toggle_pan_mode,
            "edit_mode": self._handle_edit_mode_request,
            "clear_points": self.clear_all_points,
            "escape": self._handle_escape_press,
            "delete_segments": self._delete_selected_segments,
            "delete_segments_alt": self._delete_selected_segments,
            "merge_segments": self._handle_merge_press,
            "undo": self._undo_last_action,
            "redo": self._redo_last_action,
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
        self.control_panel.set_pan_speed(int(self.settings.pan_multiplier * 10))
        self.control_panel.set_join_threshold(self.settings.polygon_join_threshold)
        self.control_panel.set_fragment_threshold(self.settings.fragment_threshold)
        self.control_panel.set_brightness(int(self.settings.brightness))
        self.control_panel.set_contrast(int(self.settings.contrast))
        self.control_panel.set_gamma(int(self.settings.gamma * 100))
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
        """Set mode to SAM points."""
        if not self.model_manager.is_model_available():
            logger.warning("Cannot enter SAM mode: No model available")
            return
        self._set_mode("sam_points")
        # Ensure SAM model is updated when entering SAM mode (lazy update)
        self._ensure_sam_updated()

    def set_polygon_mode(self):
        """Set polygon drawing mode."""
        self._set_mode("polygon")

    def set_bbox_mode(self):
        """Set bounding box drawing mode."""
        self._set_mode("bbox")

    def toggle_selection_mode(self):
        """Toggle selection mode."""
        self._toggle_mode("selection")

    def toggle_pan_mode(self):
        """Toggle pan mode."""
        self._toggle_mode("pan")

    def toggle_edit_mode(self):
        """Toggle edit mode."""
        self._toggle_mode("edit")

    def _handle_edit_mode_request(self):
        """Handle edit mode request with validation."""
        # Check if there are any polygon segments to edit
        polygon_segments = [
            seg for seg in self.segment_manager.segments if seg.get("type") == "Polygon"
        ]

        if not polygon_segments:
            self._show_error_notification("No polygons selected!")
            return

        # Check if any polygons are actually selected
        selected_indices = self.right_panel.get_selected_segment_indices()
        selected_polygons = [
            i
            for i in selected_indices
            if self.segment_manager.segments[i].get("type") == "Polygon"
        ]

        if not selected_polygons:
            self._show_error_notification("No polygons selected!")
            return

        # Enter edit mode if validation passes
        self.toggle_edit_mode()

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
            "bbox": Qt.CursorShape.CrossCursor,
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

    def _set_fragment_threshold(self, value):
        """Set fragment threshold for AI segment filtering."""
        self.fragment_threshold = value
        self.settings.fragment_threshold = value

    def _set_brightness(self, value):
        """Set image brightness."""
        self.brightness = value
        self.settings.brightness = value
        self.viewer.set_image_adjustments(self.brightness, self.contrast, self.gamma)

    def _set_contrast(self, value):
        """Set image contrast."""
        self.contrast = value
        self.settings.contrast = value
        self.viewer.set_image_adjustments(self.brightness, self.contrast, self.gamma)

    def _set_gamma(self, value):
        """Set image gamma."""
        self.gamma = value / 100.0  # Convert slider value to 0.01-2.0 range
        self.settings.gamma = self.gamma
        self.viewer.set_image_adjustments(self.brightness, self.contrast, self.gamma)

    def _reset_image_adjustments(self):
        """Reset all image adjustment settings to their default values."""

        self.brightness = 0.0
        self.contrast = 0.0
        self.gamma = 1.0
        self.settings.brightness = self.brightness
        self.settings.contrast = self.contrast
        self.settings.gamma = self.gamma
        self.control_panel.adjustments_widget.reset_to_defaults()
        if self.current_image_path:
            self.viewer.set_image_adjustments(
                self.brightness, self.contrast, self.gamma
            )

    def _handle_settings_changed(self):
        """Handle changes in settings, e.g., 'Operate On View'."""
        # Update the main window's settings object with the latest from the widget
        self.settings.update(**self.control_panel.settings_widget.get_settings())

        # Re-load the current image to apply the new 'Operate On View' setting
        if self.current_image_path:
            self._update_sam_model_image()

    def _handle_image_adjustment_changed(self):
        """Handle changes in image adjustments (brightness, contrast, gamma)."""
        if self.settings.operate_on_view and self.current_image_path:
            self._update_sam_model_image()

    # File management methods
    def _open_folder_dialog(self):
        """Open folder dialog for images."""
        folder_path = QFileDialog.getExistingDirectory(self, "Select Image Folder")
        if folder_path:
            self.right_panel.set_folder(folder_path, self.file_model)
        self.viewer.setFocus()

    def _load_selected_image(self, index):
        """Load the selected image. Auto-saves previous work if enabled."""

        if not index.isValid() or not self.file_model.isDir(index.parent()):
            return

        self.current_file_index = index
        path = self.file_model.filePath(index)

        if os.path.isfile(path) and self.file_manager.is_image_file(path):
            if path == self.current_image_path:  # Only reset if loading a new image
                return

            # Auto-save if enabled and we have a current image (not the first load)
            if self.current_image_path and self.control_panel.get_settings().get(
                "auto_save", True
            ):
                self._save_output_to_npz()

            self.current_image_path = path
            pixmap = QPixmap(self.current_image_path)
            if not pixmap.isNull():
                self._reset_state()
                self.viewer.set_photo(pixmap)
                self.viewer.set_image_adjustments(
                    self.brightness, self.contrast, self.gamma
                )
                self._update_sam_model_image()
                self.file_manager.load_class_aliases(self.current_image_path)
                self.file_manager.load_existing_mask(self.current_image_path)
                self.right_panel.file_tree.setCurrentIndex(index)
                self._update_all_lists()
                self.viewer.setFocus()

        if self.model_manager.is_model_available():
            self._update_sam_model_image()

        # Update channel threshold widget for new image
        self._update_channel_threshold_for_image(pixmap)

        # Restore crop coordinates for this image size if they exist
        image_size = (pixmap.width(), pixmap.height())
        if image_size in self.crop_coords_by_size:
            self.current_crop_coords = self.crop_coords_by_size[image_size]
            x1, y1, x2, y2 = self.current_crop_coords
            self.control_panel.set_crop_coordinates(x1, y1, x2, y2)
            self._apply_crop_to_image()
        else:
            self.current_crop_coords = None
            self.control_panel.clear_crop_coordinates()

        # Cache original image for channel threshold processing
        self._cache_original_image()

        self._show_success_notification(f"Loaded: {Path(self.current_image_path).name}")

    def _update_sam_model_image(self):
        """Updates the SAM model's image based on the 'Operate On View' setting."""
        if not self.model_manager.is_model_available() or not self.current_image_path:
            return

        if self.settings.operate_on_view:
            # Pass the adjusted image (QImage) to SAM model
            # Convert QImage to numpy array
            qimage = self.viewer._adjusted_pixmap.toImage()
            ptr = qimage.constBits()
            ptr.setsize(qimage.bytesPerLine() * qimage.height())
            image_np = np.array(ptr).reshape(qimage.height(), qimage.width(), 4)
            # Convert from BGRA to RGB for SAM
            image_rgb = cv2.cvtColor(image_np, cv2.COLOR_BGRA2RGB)
            self.model_manager.sam_model.set_image_from_array(image_rgb)
        else:
            # Pass the original image path to SAM model
            self.model_manager.sam_model.set_image_from_path(self.current_image_path)

    def _load_next_image(self):
        """Load next image in the file list."""
        if not self.current_file_index.isValid():
            return
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
        """Load previous image in the file list."""
        if not self.current_file_index.isValid():
            return
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
                # Convert stored list of lists back to QPointF objects
                qpoints = [QPointF(p[0], p[1]) for p in seg["vertices"]]
                poly_item = QGraphicsPolygonItem(QPolygonF(qpoints))
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
        for _i, items in self.segment_items.items():
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
                # Convert stored list of lists back to QPointF objects
                qpoints = [QPointF(p[0], p[1]) for p in segment["vertices"]]

                poly_item = HoverablePolygonItem(QPolygonF(qpoints))
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
        """Save current SAM segment with fragment threshold filtering."""
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
            # COORDINATE TRANSFORMATION FIX: Scale mask back up to display size if needed
            if (
                self.sam_scale_factor != 1.0
                and self.viewer._pixmap_item
                and not self.viewer._pixmap_item.pixmap().isNull()
            ):
                # Get original image dimensions
                original_height = self.viewer._pixmap_item.pixmap().height()
                original_width = self.viewer._pixmap_item.pixmap().width()

                # Resize mask back to original dimensions for saving
                mask_resized = cv2.resize(
                    mask.astype(np.uint8),
                    (original_width, original_height),
                    interpolation=cv2.INTER_NEAREST,
                ).astype(bool)
                mask = mask_resized

            # Apply fragment threshold filtering if enabled
            filtered_mask = self._apply_fragment_threshold(mask)
            if filtered_mask is not None:
                new_segment = {
                    "mask": filtered_mask,
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
                # Clear redo history when a new action is performed
                self.redo_history.clear()
                self.clear_all_points()
                self._update_all_lists()
            else:
                self._show_warning_notification(
                    "All segments filtered out by fragment threshold"
                )

    def _apply_fragment_threshold(self, mask):
        """Apply fragment threshold filtering to remove small segments."""
        if self.fragment_threshold == 0:
            # No filtering when threshold is 0
            return mask

        # Convert mask to uint8 for OpenCV operations
        mask_uint8 = (mask * 255).astype(np.uint8)

        # Find all contours in the mask
        contours, _ = cv2.findContours(
            mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        if not contours:
            return None

        # Calculate areas for all contours
        contour_areas = [cv2.contourArea(contour) for contour in contours]
        max_area = max(contour_areas)

        if max_area == 0:
            return None

        # Calculate minimum area threshold
        min_area_threshold = (self.fragment_threshold / 100.0) * max_area

        # Filter contours based on area threshold
        filtered_contours = [
            contour
            for contour, area in zip(contours, contour_areas, strict=False)
            if area >= min_area_threshold
        ]

        if not filtered_contours:
            return None

        # Create new mask with only filtered contours
        filtered_mask = np.zeros_like(mask_uint8)
        cv2.drawContours(filtered_mask, filtered_contours, -1, 255, -1)

        # Convert back to boolean mask
        return (filtered_mask > 0).astype(bool)

    def _finalize_polygon(self):
        """Finalize polygon drawing."""
        if len(self.polygon_points) < 3:
            return

        new_segment = {
            "vertices": [[p.x(), p.y()] for p in self.polygon_points],
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
        # Clear redo history when a new action is performed
        self.redo_history.clear()

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
                        self.current_image_path,
                        (h, w),
                        class_order,
                        self.current_crop_coords,
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
                        self.current_image_path,
                        (h, w),
                        class_order,
                        class_labels,
                        self.current_crop_coords,
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

        # Save to redo history before undoing
        self.redo_history.append(last_action)

        if action_type == "add_segment":
            segment_index = last_action.get("segment_index")
            if segment_index is not None and 0 <= segment_index < len(
                self.segment_manager.segments
            ):
                # Store the segment data for redo
                last_action["segment_data"] = self.segment_manager.segments[
                    segment_index
                ].copy()

                # Remove the segment that was added
                self.segment_manager.delete_segments([segment_index])
                self.right_panel.clear_selections()  # Clear selection to prevent phantom highlights
                self._update_all_lists()
                self._show_notification("Undid: Add Segment")
        elif action_type == "add_point":
            point_type = last_action.get("point_type")
            point_item = last_action.get("point_item")
            point_list = (
                self.positive_points
                if point_type == "positive"
                else self.negative_points
            )
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
                self.segment_manager.segments[i]["vertices"] = [
                    [p[0], p[1]] for p in vertices
                ]
                self._update_polygon_item(i)
            self._display_edit_handles()
            self._highlight_selected_segments()
            self._show_notification("Undid: Move Polygon")
        elif action_type == "move_vertex":
            segment_index = last_action.get("segment_index")
            vertex_index = last_action.get("vertex_index")
            old_pos = last_action.get("old_pos")
            if (
                segment_index is not None
                and vertex_index is not None
                and old_pos is not None
            ):
                if segment_index < len(self.segment_manager.segments):
                    self.segment_manager.segments[segment_index]["vertices"][
                        vertex_index
                    ] = old_pos
                    self._update_polygon_item(segment_index)
                    self._display_edit_handles()
                    self._highlight_selected_segments()
                    self._show_notification("Undid: Move Vertex")
                else:
                    self._show_warning_notification(
                        "Cannot undo: Segment no longer exists"
                    )
                    self.redo_history.pop()  # Remove from redo history if segment is gone
            else:
                self._show_warning_notification("Cannot undo: Missing vertex data")
                self.redo_history.pop()  # Remove from redo history if data is incomplete

        # Add more undo logic for other action types here in the future
        else:
            self._show_warning_notification(
                f"Undo for action '{action_type}' not implemented."
            )
            # Remove from redo history if we couldn't undo it
            self.redo_history.pop()

    def _redo_last_action(self):
        """Redo the last undone action."""
        if not self.redo_history:
            self._show_notification("Nothing to redo.")
            return

        last_action = self.redo_history.pop()
        action_type = last_action.get("type")

        # Add back to action history for potential future undo
        self.action_history.append(last_action)

        if action_type == "add_segment":
            # Restore the segment that was removed
            if "segment_data" in last_action:
                segment_data = last_action["segment_data"]
                self.segment_manager.add_segment(segment_data)
                self._update_all_lists()
                self._show_notification("Redid: Add Segment")
            else:
                # If we don't have the segment data (shouldn't happen), we can't redo
                self._show_warning_notification("Cannot redo: Missing segment data")
                self.action_history.pop()  # Remove from action history
        elif action_type == "add_point":
            point_type = last_action.get("point_type")
            point_coords = last_action.get("point_coords")
            if point_coords:
                pos = QPointF(point_coords[0], point_coords[1])
                self._add_point(pos, positive=(point_type == "positive"))
                self._update_segmentation()
                self._show_notification("Redid: Add Point")
            else:
                self._show_warning_notification(
                    "Cannot redo: Missing point coordinates"
                )
                self.action_history.pop()
        elif action_type == "add_polygon_point":
            point_coords = last_action.get("point_coords")
            if point_coords:
                self._handle_polygon_click(point_coords)
                self._show_notification("Redid: Add Polygon Point")
            else:
                self._show_warning_notification(
                    "Cannot redo: Missing polygon point coordinates"
                )
                self.action_history.pop()
        elif action_type == "move_polygon":
            final_vertices = last_action.get("final_vertices")
            if final_vertices:
                for i, vertices in final_vertices.items():
                    if i < len(self.segment_manager.segments):
                        self.segment_manager.segments[i]["vertices"] = [
                            [p[0], p[1]] for p in vertices
                        ]
                        self._update_polygon_item(i)
                self._display_edit_handles()
                self._highlight_selected_segments()
                self._show_notification("Redid: Move Polygon")
            else:
                self._show_warning_notification("Cannot redo: Missing final vertices")
                self.action_history.pop()
        elif action_type == "move_vertex":
            segment_index = last_action.get("segment_index")
            vertex_index = last_action.get("vertex_index")
            new_pos = last_action.get("new_pos")
            if (
                segment_index is not None
                and vertex_index is not None
                and new_pos is not None
            ):
                if segment_index < len(self.segment_manager.segments):
                    self.segment_manager.segments[segment_index]["vertices"][
                        vertex_index
                    ] = new_pos
                    self._update_polygon_item(segment_index)
                    self._display_edit_handles()
                    self._highlight_selected_segments()
                    self._show_notification("Redid: Move Vertex")
                else:
                    self._show_warning_notification(
                        "Cannot redo: Segment no longer exists"
                    )
                    self.action_history.pop()  # Remove from action history if segment is gone
            else:
                self._show_warning_notification("Cannot redo: Missing vertex data")
                self.action_history.pop()  # Remove from action history if data is incomplete
        else:
            self._show_warning_notification(
                f"Redo for action '{action_type}' not implemented."
            )
            # Remove from action history if we couldn't redo it
            self.action_history.pop()

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

        # Clean up crop visuals
        self._remove_crop_visual()
        self._remove_crop_hover_overlay()
        self._remove_crop_hover_effect()

        # Reset crop state
        self.crop_mode = False
        self.crop_start_pos = None
        self.current_crop_coords = None

        items_to_remove = [
            item
            for item in self.viewer.scene().items()
            if item is not self.viewer._pixmap_item
        ]
        for item in items_to_remove:
            self.viewer.scene().removeItem(item)
        self.segment_items.clear()
        self.highlight_items.clear()
        self.action_history.clear()
        self.redo_history.clear()

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
                    i: [
                        [p.x(), p.y()] if isinstance(p, QPointF) else p
                        for p in self.segment_manager.segments[i]["vertices"]
                    ]
                    for i in selected_indices
                    if self.segment_manager.segments[i].get("type") == "Polygon"
                }
                event.accept()
                return

        # Call the original scene handler.
        self._original_mouse_press(event)

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
        elif self.mode == "bbox":
            if event.button() == Qt.MouseButton.LeftButton:
                self.drag_start_pos = pos
                self.rubber_band_rect = QGraphicsRectItem()
                self.rubber_band_rect.setPen(
                    QPen(Qt.GlobalColor.red, self.line_thickness, Qt.PenStyle.DashLine)
                )
                self.viewer.scene().addItem(self.rubber_band_rect)
        elif self.mode == "selection" and event.button() == Qt.MouseButton.LeftButton:
            self._handle_segment_selection_click(pos)
        elif self.mode == "crop" and event.button() == Qt.MouseButton.LeftButton:
            self.crop_start_pos = pos
            self.crop_rect_item = QGraphicsRectItem()
            self.crop_rect_item.setPen(
                QPen(Qt.GlobalColor.blue, 2, Qt.PenStyle.DashLine)
            )
            self.viewer.scene().addItem(self.crop_rect_item)

    def _scene_mouse_move(self, event):
        """Handle mouse move events in the scene."""
        if self.mode == "edit" and self.is_dragging_polygon:
            delta = event.scenePos() - self.drag_start_pos
            for i, initial_verts in self.drag_initial_vertices.items():
                # initial_verts are lists, convert to QPointF for addition with delta
                self.segment_manager.segments[i]["vertices"] = [
                    [
                        (QPointF(p[0], p[1]) + delta).x(),
                        (QPointF(p[0], p[1]) + delta).y(),
                    ]
                    for p in initial_verts
                ]
                self._update_polygon_item(i)
            self._display_edit_handles()  # Redraw handles at new positions
            self._highlight_selected_segments()  # Redraw highlight at new position
            event.accept()
            return

        self._original_mouse_move(event)

        if self.mode == "bbox" and self.rubber_band_rect and self.drag_start_pos:
            current_pos = event.scenePos()
            rect = QRectF(self.drag_start_pos, current_pos).normalized()
            self.rubber_band_rect.setRect(rect)
            event.accept()
            return

        if self.mode == "crop" and self.crop_rect_item and self.crop_start_pos:
            current_pos = event.scenePos()
            rect = QRectF(self.crop_start_pos, current_pos).normalized()
            self.crop_rect_item.setRect(rect)
            event.accept()
            return

    def _scene_mouse_release(self, event):
        """Handle mouse release events in the scene."""
        if self.mode == "edit" and self.is_dragging_polygon:
            # Record the action for undo
            final_vertices = {
                i: [
                    [p.x(), p.y()] if isinstance(p, QPointF) else p
                    for p in self.segment_manager.segments[i]["vertices"]
                ]
                for i in self.drag_initial_vertices
            }
            self.action_history.append(
                {
                    "type": "move_polygon",
                    "initial_vertices": {
                        k: list(v) for k, v in self.drag_initial_vertices.items()
                    },
                    "final_vertices": final_vertices,
                }
            )
            # Clear redo history when a new action is performed
            self.redo_history.clear()
            self.is_dragging_polygon = False
            self.drag_initial_vertices.clear()
            event.accept()
            return

        if self.mode == "pan":
            self.viewer.set_cursor(Qt.CursorShape.OpenHandCursor)
        elif self.mode == "bbox" and self.rubber_band_rect:
            self.viewer.scene().removeItem(self.rubber_band_rect)
            rect = self.rubber_band_rect.rect()
            self.rubber_band_rect = None
            self.drag_start_pos = None

            if rect.width() > 0 and rect.height() > 0:
                # Convert QRectF to QPolygonF
                polygon = QPolygonF()
                polygon.append(rect.topLeft())
                polygon.append(rect.topRight())
                polygon.append(rect.bottomRight())
                polygon.append(rect.bottomLeft())

                new_segment = {
                    "vertices": [[p.x(), p.y()] for p in list(polygon)],
                    "type": "Polygon",  # Bounding boxes are stored as polygons
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
                # Clear redo history when a new action is performed
                self.redo_history.clear()
                self._update_all_lists()
            event.accept()
            return

        if self.mode == "crop" and self.crop_rect_item:
            rect = self.crop_rect_item.rect()
            # Clean up the drawing rectangle
            self.viewer.scene().removeItem(self.crop_rect_item)
            self.crop_rect_item = None
            self.crop_start_pos = None

            if rect.width() > 5 and rect.height() > 5:  # Minimum crop size
                # Get actual crop coordinates
                x1, y1 = int(rect.left()), int(rect.top())
                x2, y2 = int(rect.right()), int(rect.bottom())

                # Apply the crop coordinates
                self._apply_crop_coordinates(x1, y1, x2, y2)
                self.crop_mode = False
                self._set_mode("sam_points")  # Return to default mode

            event.accept()
            return

        self._original_mouse_release(event)

    def _add_point(self, pos, positive):
        """Add a point for SAM segmentation."""
        # RACE CONDITION FIX: Block clicks during SAM updates
        if self.sam_is_updating:
            self._show_warning_notification(
                "AI model is updating, please wait...", 2000
            )
            return

        # Ensure SAM is updated before using it
        self._ensure_sam_updated()

        # Wait for SAM to finish updating if it started
        if self.sam_is_updating:
            self._show_warning_notification(
                "AI model is updating, please wait...", 2000
            )
            return

        # COORDINATE TRANSFORMATION FIX: Scale coordinates for SAM model
        sam_x = int(pos.x() * self.sam_scale_factor)
        sam_y = int(pos.y() * self.sam_scale_factor)

        point_list = self.positive_points if positive else self.negative_points
        point_list.append([sam_x, sam_y])

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

        # Record the action for undo (store display coordinates)
        self.action_history.append(
            {
                "type": "add_point",
                "point_type": "positive" if positive else "negative",
                "point_coords": [int(pos.x()), int(pos.y())],  # Display coordinates
                "sam_coords": [sam_x, sam_y],  # SAM coordinates
                "point_item": point_item,
            }
        )
        # Clear redo history when a new action is performed
        self.redo_history.clear()

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
            # COORDINATE TRANSFORMATION FIX: Scale mask back up to display size if needed
            if (
                self.sam_scale_factor != 1.0
                and self.viewer._pixmap_item
                and not self.viewer._pixmap_item.pixmap().isNull()
            ):
                # Get original image dimensions
                original_height = self.viewer._pixmap_item.pixmap().height()
                original_width = self.viewer._pixmap_item.pixmap().width()

                # Resize mask back to original dimensions for saving
                mask_resized = cv2.resize(
                    mask.astype(np.uint8),
                    (original_width, original_height),
                    interpolation=cv2.INTER_NEAREST,
                ).astype(bool)
                mask = mask_resized

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
        # Clear redo history when a new action is performed
        self.redo_history.clear()

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
                # Convert stored list of lists back to QPointF objects for rasterization
                qpoints = [QPointF(p[0], p[1]) for p in seg["vertices"]]
                points_np = np.array([[p.x(), p.y()] for p in qpoints], dtype=np.int32)
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
                for v_idx, pt_list in enumerate(seg["vertices"]):
                    pt = QPointF(pt_list[0], pt_list[1])  # Convert list to QPointF
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
                        "old_pos": [old_pos[0], old_pos[1]],  # Store as list
                        "new_pos": [new_pos.x(), new_pos.y()],  # Store as list
                    }
                )
                # Clear redo history when a new action is performed
                self.redo_history.clear()
            seg["vertices"][vertex_index] = [
                new_pos.x(),
                new_pos.y(),  # Store as list
            ]
            self._update_polygon_item(segment_index)
            self._highlight_selected_segments()  # Keep the highlight in sync with the new shape

    def _update_polygon_item(self, segment_index):
        """Efficiently update the visual polygon item for a given segment."""
        items = self.segment_items.get(segment_index, [])
        for item in items:
            if isinstance(item, HoverablePolygonItem):
                # Convert stored list of lists back to QPointF objects
                qpoints = [
                    QPointF(p[0], p[1])
                    for p in self.segment_manager.segments[segment_index]["vertices"]
                ]
                item.setPolygon(QPolygonF(qpoints))
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

    # Additional methods for new features
    def _handle_settings_changed(self):
        """Handle changes in settings, e.g., 'Operate On View'."""
        # Update the main window's settings object with the latest from the widget
        self.settings.update(**self.control_panel.settings_widget.get_settings())

        # Re-load the current image to apply the new 'Operate On View' setting
        if self.current_image_path:
            self._update_sam_model_image()

    def _handle_channel_threshold_changed(self):
        """Handle changes in channel thresholding - optimized to avoid unnecessary work."""
        if not self.current_image_path:
            return

        # Get channel threshold widget
        threshold_widget = self.control_panel.get_channel_threshold_widget()

        # Check if there's actually any active thresholding
        if not threshold_widget.has_active_thresholding():
            # No active thresholding - just reload original image without SAM update
            self._reload_original_image_without_sam()
            return

        # Always update visuals immediately for responsive UI
        self._apply_channel_thresholding_fast()

        # Mark SAM as dirty instead of updating immediately
        # Only update SAM when user actually needs it (enters SAM mode)
        if self.settings.operate_on_view:
            self._mark_sam_dirty()

    def _mark_sam_dirty(self):
        """Mark SAM model as needing update, but don't update immediately."""
        self.sam_is_dirty = True
        # Cancel any pending SAM updates since we're going lazy
        self.sam_update_timer.stop()

    def _ensure_sam_updated(self):
        """Ensure SAM model is up-to-date when user needs it (lazy update with threading)."""
        if not self.sam_is_dirty or self.sam_is_updating:
            return

        if not self.current_image_path or not self.model_manager.is_model_available():
            return

        # Get current image (with modifications if operate_on_view is enabled)
        current_image = None
        image_hash = None

        if (
            self.settings.operate_on_view
            and hasattr(self, "_cached_original_image")
            and self._cached_original_image is not None
        ):
            # Apply current modifications to get the view image
            current_image = self._get_current_modified_image()
            image_hash = self._get_image_hash(current_image)
        else:
            # Use original image path as hash for non-modified images
            image_hash = hashlib.md5(self.current_image_path.encode()).hexdigest()

        # Check if this exact image state is already loaded in SAM
        if image_hash and image_hash == self.current_sam_hash:
            # SAM already has this exact image state - no update needed
            self.sam_is_dirty = False
            return

        # Stop any existing worker
        if self.sam_worker_thread and self.sam_worker_thread.isRunning():
            self.sam_worker_thread.stop()
            self.sam_worker_thread.wait(1000)  # Wait up to 1 second

        # Show status message
        if hasattr(self, "status_bar"):
            self.status_bar.show_message("Loading image view into AI model...", 0)

        # Mark as updating
        self.sam_is_updating = True
        self.sam_is_dirty = False

        # Create and start worker thread
        self.sam_worker_thread = SAMUpdateWorker(
            self.model_manager,
            self.current_image_path,
            self.settings.operate_on_view,
            current_image,  # Pass current image directly
            self,
        )
        self.sam_worker_thread.finished.connect(
            lambda: self._on_sam_update_finished(image_hash)
        )
        self.sam_worker_thread.error.connect(self._on_sam_update_error)

        self.sam_worker_thread.start()

    def _on_sam_update_finished(self, image_hash):
        """Handle completion of SAM update in background thread."""
        self.sam_is_updating = False

        # Clear status message
        if hasattr(self, "status_bar"):
            self.status_bar.clear_message()

        # Update scale factor from worker thread
        if self.sam_worker_thread:
            self.sam_scale_factor = self.sam_worker_thread.get_scale_factor()

        # Clean up worker thread
        if self.sam_worker_thread:
            self.sam_worker_thread.deleteLater()
            self.sam_worker_thread = None

        # Update current_sam_hash after successful update
        self.current_sam_hash = image_hash

    def _on_sam_update_error(self, error_message):
        """Handle error during SAM update."""
        self.sam_is_updating = False

        # Show error in status bar
        if hasattr(self, "status_bar"):
            self.status_bar.show_message(
                f"Error loading AI model: {error_message}", 5000
            )

        # Clean up worker thread
        if self.sam_worker_thread:
            self.sam_worker_thread.deleteLater()
            self.sam_worker_thread = None

    def _get_current_modified_image(self):
        """Get the current image with all modifications applied (excluding crop for SAM)."""
        if self._cached_original_image is None:
            return None

        # Start with cached original
        result_image = self._cached_original_image.copy()

        # Apply channel thresholding if active
        threshold_widget = self.control_panel.get_channel_threshold_widget()
        if threshold_widget and threshold_widget.has_active_thresholding():
            result_image = threshold_widget.apply_thresholding(result_image)

        # NOTE: Crop is NOT applied here - it's only a visual overlay and should only affect saved masks
        # The crop visual overlay is handled by _apply_crop_to_image() which adds QGraphicsRectItem overlays

        return result_image

    def _get_image_hash(self, image_array=None):
        """Compute hash of current image state for caching (excluding crop)."""
        if image_array is None:
            image_array = self._get_current_modified_image()

        if image_array is None:
            return None

        # Create hash based on image content and modifications
        hasher = hashlib.md5()
        hasher.update(image_array.tobytes())

        # Include modification parameters in hash
        threshold_widget = self.control_panel.get_channel_threshold_widget()
        if threshold_widget and threshold_widget.has_active_thresholding():
            # Add threshold parameters to hash
            params = str(threshold_widget.get_threshold_params()).encode()
            hasher.update(params)

        # NOTE: Crop coordinates are NOT included in hash since crop doesn't affect SAM processing
        # Crop is only a visual overlay and affects final saved masks, not the AI model input

        return hasher.hexdigest()

    def _reload_original_image_without_sam(self):
        """Reload original image without triggering expensive SAM update."""
        if not self.current_image_path:
            return

        pixmap = QPixmap(self.current_image_path)
        if not pixmap.isNull():
            self.viewer.set_photo(pixmap)
            self.viewer.set_image_adjustments(
                self.brightness, self.contrast, self.gamma
            )
            # Reapply crop overlays if they exist
            if self.current_crop_coords:
                self._apply_crop_to_image()
            # Clear cached image
            self._cached_original_image = None
            # Don't call _update_sam_model_image() - that's the expensive part!

    def _apply_channel_thresholding_fast(self):
        """Apply channel thresholding using cached image data for better performance."""
        if not self.current_image_path:
            return

        # Get channel threshold widget
        threshold_widget = self.control_panel.get_channel_threshold_widget()

        # If no active thresholding, reload original image
        if not threshold_widget.has_active_thresholding():
            self._reload_original_image_without_sam()
            return

        # Use cached image array if available, otherwise load and cache
        if (
            not hasattr(self, "_cached_original_image")
            or self._cached_original_image is None
        ):
            self._cache_original_image()

        if self._cached_original_image is None:
            return

        # Apply thresholding to cached image
        thresholded_image = threshold_widget.apply_thresholding(
            self._cached_original_image
        )

        # Convert back to QPixmap efficiently
        qimage = self._numpy_to_qimage(thresholded_image)
        thresholded_pixmap = QPixmap.fromImage(qimage)

        # Apply to viewer
        self.viewer.set_photo(thresholded_pixmap)
        self.viewer.set_image_adjustments(self.brightness, self.contrast, self.gamma)

        # Reapply crop overlays if they exist
        if self.current_crop_coords:
            self._apply_crop_to_image()

    def _cache_original_image(self):
        """Cache the original image as numpy array for fast processing."""
        if not self.current_image_path:
            self._cached_original_image = None
            return

        # Load original image
        pixmap = QPixmap(self.current_image_path)
        if pixmap.isNull():
            self._cached_original_image = None
            return

        # Convert pixmap to numpy array
        qimage = pixmap.toImage()
        ptr = qimage.constBits()
        ptr.setsize(qimage.bytesPerLine() * qimage.height())
        image_np = np.array(ptr).reshape(qimage.height(), qimage.width(), 4)
        # Convert from BGRA to RGB
        self._cached_original_image = image_np[
            :, :, [2, 1, 0]
        ]  # BGR to RGB, ignore alpha

    def _numpy_to_qimage(self, image_array):
        """Convert numpy array to QImage efficiently."""
        # Ensure array is contiguous
        image_array = np.ascontiguousarray(image_array)

        if len(image_array.shape) == 2:
            # Grayscale
            height, width = image_array.shape
            bytes_per_line = width
            return QImage(
                bytes(image_array.data),  # Convert memoryview to bytes
                width,
                height,
                bytes_per_line,
                QImage.Format.Format_Grayscale8,
            )
        else:
            # RGB
            height, width, channels = image_array.shape
            bytes_per_line = width * channels
            return QImage(
                bytes(image_array.data),  # Convert memoryview to bytes
                width,
                height,
                bytes_per_line,
                QImage.Format.Format_RGB888,
            )

    def _apply_channel_thresholding(self):
        """Apply channel thresholding to the current image - legacy method."""
        # Use the optimized version
        self._apply_channel_thresholding_fast()

    def _update_channel_threshold_for_image(self, pixmap):
        """Update channel threshold widget for the given image pixmap."""
        if pixmap.isNull():
            self.control_panel.update_channel_threshold_for_image(None)
            return

        # Convert pixmap to numpy array
        qimage = pixmap.toImage()
        ptr = qimage.constBits()
        ptr.setsize(qimage.bytesPerLine() * qimage.height())
        image_np = np.array(ptr).reshape(qimage.height(), qimage.width(), 4)
        # Convert from BGRA to RGB, ignore alpha
        image_rgb = image_np[:, :, [2, 1, 0]]

        # Check if image is grayscale (all channels are the same)
        if np.array_equal(image_rgb[:, :, 0], image_rgb[:, :, 1]) and np.array_equal(
            image_rgb[:, :, 1], image_rgb[:, :, 2]
        ):
            # Convert to single channel grayscale
            image_array = image_rgb[:, :, 0]
        else:
            # Keep as RGB
            image_array = image_rgb

        # Update the channel threshold widget
        self.control_panel.update_channel_threshold_for_image(image_array)

    # Border crop methods
    def _start_crop_drawing(self):
        """Start crop drawing mode."""
        self.crop_mode = True
        self._set_mode("crop")
        self.control_panel.set_crop_status("Click and drag to draw crop rectangle")
        self._show_notification("Click and drag to draw crop rectangle")

    def _clear_crop(self):
        """Clear current crop."""
        self.current_crop_coords = None
        self.control_panel.clear_crop_coordinates()
        self._remove_crop_visual()
        if self.current_image_path:
            # Clear crop for current image size
            pixmap = QPixmap(self.current_image_path)
            if not pixmap.isNull():
                image_size = (pixmap.width(), pixmap.height())
                if image_size in self.crop_coords_by_size:
                    del self.crop_coords_by_size[image_size]
        self._show_notification("Crop cleared")

    def _apply_crop_coordinates(self, x1, y1, x2, y2):
        """Apply crop coordinates from text input."""
        if not self.current_image_path:
            self.control_panel.set_crop_status("No image loaded")
            return

        pixmap = QPixmap(self.current_image_path)
        if pixmap.isNull():
            self.control_panel.set_crop_status("Invalid image")
            return

        # Round to nearest pixel
        x1, y1, x2, y2 = round(x1), round(y1), round(x2), round(y2)

        # Validate coordinates are within image bounds
        img_width, img_height = pixmap.width(), pixmap.height()
        x1 = max(0, min(x1, img_width - 1))
        x2 = max(0, min(x2, img_width - 1))
        y1 = max(0, min(y1, img_height - 1))
        y2 = max(0, min(y2, img_height - 1))

        # Ensure proper ordering
        if x1 > x2:
            x1, x2 = x2, x1
        if y1 > y2:
            y1, y2 = y2, y1

        # Store crop coordinates
        self.current_crop_coords = (x1, y1, x2, y2)
        image_size = (img_width, img_height)
        self.crop_coords_by_size[image_size] = self.current_crop_coords

        # Update display coordinates in case they were adjusted
        self.control_panel.set_crop_coordinates(x1, y1, x2, y2)

        # Apply crop to current image
        self._apply_crop_to_image()
        self._show_notification(f"Crop applied: {x1}:{x2}, {y1}:{y2}")

    def _apply_crop_to_image(self):
        """Add visual overlays to show crop areas."""
        if not self.current_crop_coords or not self.current_image_path:
            return

        # Add visual crop overlays
        self._add_crop_visual_overlays()

        # Add crop hover overlay
        self._add_crop_hover_overlay()

    def _add_crop_visual_overlays(self):
        """Add simple black overlays to show cropped areas."""
        if not self.current_crop_coords:
            return

        # Remove existing visual overlays
        self._remove_crop_visual_overlays()

        x1, y1, x2, y2 = self.current_crop_coords

        # Get image dimensions
        pixmap = QPixmap(self.current_image_path)
        if pixmap.isNull():
            return

        img_width, img_height = pixmap.width(), pixmap.height()

        # Import needed classes
        from PyQt6.QtCore import QRectF
        from PyQt6.QtGui import QBrush, QColor
        from PyQt6.QtWidgets import QGraphicsRectItem

        # Create black overlays for the 4 cropped regions
        self.crop_visual_overlays = []

        # Semi-transparent black color
        overlay_color = QColor(0, 0, 0, 120)  # Black with transparency

        # Top rectangle
        if y1 > 0:
            top_overlay = QGraphicsRectItem(QRectF(0, 0, img_width, y1))
            top_overlay.setBrush(QBrush(overlay_color))
            top_overlay.setPen(QPen(Qt.GlobalColor.transparent))
            top_overlay.setZValue(25)  # Above image but below other UI elements
            self.crop_visual_overlays.append(top_overlay)

        # Bottom rectangle
        if y2 < img_height:
            bottom_overlay = QGraphicsRectItem(
                QRectF(0, y2, img_width, img_height - y2)
            )
            bottom_overlay.setBrush(QBrush(overlay_color))
            bottom_overlay.setPen(QPen(Qt.GlobalColor.transparent))
            bottom_overlay.setZValue(25)
            self.crop_visual_overlays.append(bottom_overlay)

        # Left rectangle
        if x1 > 0:
            left_overlay = QGraphicsRectItem(QRectF(0, y1, x1, y2 - y1))
            left_overlay.setBrush(QBrush(overlay_color))
            left_overlay.setPen(QPen(Qt.GlobalColor.transparent))
            left_overlay.setZValue(25)
            self.crop_visual_overlays.append(left_overlay)

        # Right rectangle
        if x2 < img_width:
            right_overlay = QGraphicsRectItem(QRectF(x2, y1, img_width - x2, y2 - y1))
            right_overlay.setBrush(QBrush(overlay_color))
            right_overlay.setPen(QPen(Qt.GlobalColor.transparent))
            right_overlay.setZValue(25)
            self.crop_visual_overlays.append(right_overlay)

        # Add all visual overlays to scene
        for overlay in self.crop_visual_overlays:
            self.viewer.scene().addItem(overlay)

    def _remove_crop_visual_overlays(self):
        """Remove crop visual overlays."""
        if hasattr(self, "crop_visual_overlays"):
            for overlay in self.crop_visual_overlays:
                if overlay and overlay.scene():
                    self.viewer.scene().removeItem(overlay)
            self.crop_visual_overlays = []

    def _remove_crop_visual(self):
        """Remove visual crop rectangle and overlays."""
        if self.crop_rect_item and self.crop_rect_item.scene():
            self.viewer.scene().removeItem(self.crop_rect_item)
        self.crop_rect_item = None

        # Remove all crop-related visuals
        self._remove_crop_visual_overlays()
        self._remove_crop_hover_overlay()
        self._remove_crop_hover_effect()

    def _add_crop_hover_overlay(self):
        """Add invisible hover overlays for cropped areas (outside the crop rectangle)."""
        if not self.current_crop_coords:
            return

        # Remove existing overlays
        self._remove_crop_hover_overlay()

        x1, y1, x2, y2 = self.current_crop_coords

        # Get image dimensions
        if not self.current_image_path:
            return
        pixmap = QPixmap(self.current_image_path)
        if pixmap.isNull():
            return

        img_width, img_height = pixmap.width(), pixmap.height()

        # Import needed classes
        from PyQt6.QtCore import QRectF
        from PyQt6.QtGui import QBrush, QPen
        from PyQt6.QtWidgets import QGraphicsRectItem

        # Create hover overlays for the 4 cropped regions (outside the crop rectangle)
        self.crop_hover_overlays = []

        # Top rectangle (0, 0, img_width, y1)
        if y1 > 0:
            top_overlay = QGraphicsRectItem(QRectF(0, 0, img_width, y1))
            self.crop_hover_overlays.append(top_overlay)

        # Bottom rectangle (0, y2, img_width, img_height - y2)
        if y2 < img_height:
            bottom_overlay = QGraphicsRectItem(
                QRectF(0, y2, img_width, img_height - y2)
            )
            self.crop_hover_overlays.append(bottom_overlay)

        # Left rectangle (0, y1, x1, y2 - y1)
        if x1 > 0:
            left_overlay = QGraphicsRectItem(QRectF(0, y1, x1, y2 - y1))
            self.crop_hover_overlays.append(left_overlay)

        # Right rectangle (x2, y1, img_width - x2, y2 - y1)
        if x2 < img_width:
            right_overlay = QGraphicsRectItem(QRectF(x2, y1, img_width - x2, y2 - y1))
            self.crop_hover_overlays.append(right_overlay)

        # Configure each overlay
        for overlay in self.crop_hover_overlays:
            overlay.setBrush(QBrush(QColor(0, 0, 0, 0)))  # Transparent
            overlay.setPen(QPen(Qt.GlobalColor.transparent))
            overlay.setAcceptHoverEvents(True)
            overlay.setZValue(50)  # Above image but below other items

            # Custom hover events
            original_hover_enter = overlay.hoverEnterEvent
            original_hover_leave = overlay.hoverLeaveEvent

            def hover_enter_event(event, orig_func=original_hover_enter):
                self._on_crop_hover_enter()
                orig_func(event)

            def hover_leave_event(event, orig_func=original_hover_leave):
                self._on_crop_hover_leave()
                orig_func(event)

            overlay.hoverEnterEvent = hover_enter_event
            overlay.hoverLeaveEvent = hover_leave_event

            self.viewer.scene().addItem(overlay)

    def _remove_crop_hover_overlay(self):
        """Remove crop hover overlays."""
        if hasattr(self, "crop_hover_overlays"):
            for overlay in self.crop_hover_overlays:
                if overlay and overlay.scene():
                    self.viewer.scene().removeItem(overlay)
            self.crop_hover_overlays = []
        self.is_hovering_crop = False

    def _on_crop_hover_enter(self):
        """Handle mouse entering crop area."""
        if not self.current_crop_coords:
            return

        self.is_hovering_crop = True
        self._apply_crop_hover_effect()

    def _on_crop_hover_leave(self):
        """Handle mouse leaving crop area."""
        self.is_hovering_crop = False
        self._remove_crop_hover_effect()

    def _apply_crop_hover_effect(self):
        """Apply simple highlight to cropped areas on hover."""
        if not self.current_crop_coords or not self.current_image_path:
            return

        # Remove existing hover effect
        self._remove_crop_hover_effect()

        x1, y1, x2, y2 = self.current_crop_coords

        # Get image dimensions
        pixmap = QPixmap(self.current_image_path)
        if pixmap.isNull():
            return

        img_width, img_height = pixmap.width(), pixmap.height()

        # Import needed classes
        from PyQt6.QtCore import QRectF
        from PyQt6.QtGui import QBrush, QColor
        from PyQt6.QtWidgets import QGraphicsRectItem

        # Create simple colored overlays for the 4 cropped regions
        self.crop_hover_effect_items = []

        # Use a simple semi-transparent yellow overlay
        hover_color = QColor(255, 255, 0, 60)  # Light yellow with transparency

        # Top rectangle
        if y1 > 0:
            top_effect = QGraphicsRectItem(QRectF(0, 0, img_width, y1))
            top_effect.setBrush(QBrush(hover_color))
            top_effect.setPen(QPen(Qt.GlobalColor.transparent))
            top_effect.setZValue(75)  # Above crop overlay
            self.crop_hover_effect_items.append(top_effect)

        # Bottom rectangle
        if y2 < img_height:
            bottom_effect = QGraphicsRectItem(QRectF(0, y2, img_width, img_height - y2))
            bottom_effect.setBrush(QBrush(hover_color))
            bottom_effect.setPen(QPen(Qt.GlobalColor.transparent))
            bottom_effect.setZValue(75)
            self.crop_hover_effect_items.append(bottom_effect)

        # Left rectangle
        if x1 > 0:
            left_effect = QGraphicsRectItem(QRectF(0, y1, x1, y2 - y1))
            left_effect.setBrush(QBrush(hover_color))
            left_effect.setPen(QPen(Qt.GlobalColor.transparent))
            left_effect.setZValue(75)
            self.crop_hover_effect_items.append(left_effect)

        # Right rectangle
        if x2 < img_width:
            right_effect = QGraphicsRectItem(QRectF(x2, y1, img_width - x2, y2 - y1))
            right_effect.setBrush(QBrush(hover_color))
            right_effect.setPen(QPen(Qt.GlobalColor.transparent))
            right_effect.setZValue(75)
            self.crop_hover_effect_items.append(right_effect)

        # Add all hover effect items to scene
        for effect_item in self.crop_hover_effect_items:
            self.viewer.scene().addItem(effect_item)

    def _remove_crop_hover_effect(self):
        """Remove crop hover effect."""
        if hasattr(self, "crop_hover_effect_items"):
            for effect_item in self.crop_hover_effect_items:
                if effect_item and effect_item.scene():
                    self.viewer.scene().removeItem(effect_item)
            self.crop_hover_effect_items = []

    def _reload_current_image(self):
        """Reload current image without crop."""
        if not self.current_image_path:
            return

        pixmap = QPixmap(self.current_image_path)
        if not pixmap.isNull():
            self.viewer.set_photo(pixmap)
            self.viewer.set_image_adjustments(
                self.brightness, self.contrast, self.gamma
            )
            if self.model_manager.is_model_available():
                self._update_sam_model_image()

    def _update_sam_model_image_debounced(self):
        """Update SAM model image after debounce delay."""
        # This is called after the user stops interacting with sliders
        self._update_sam_model_image()
