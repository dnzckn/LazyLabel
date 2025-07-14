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
    QDialog,
    QFileDialog,
    QGraphicsEllipseItem,
    QGraphicsLineItem,
    QGraphicsPolygonItem,
    QGraphicsRectItem,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QSplitter,
    QTableWidgetItem,
    QTableWidgetSelectionRange,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from ..config import HotkeyManager, Paths, Settings
from ..core import FileManager, ModelManager, SegmentManager
from ..utils import CustomFileSystemModel, mask_to_pixmap
from ..utils.logger import logger
from .control_panel import ControlPanel
from .editable_vertex import EditableVertexItem, MultiViewEditableVertexItem
from .hotkey_dialog import HotkeyDialog
from .hoverable_pixelmap_item import HoverablePixmapItem
from .hoverable_polygon_item import HoverablePolygonItem
from .modes import MultiViewModeHandler
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


class SingleViewSAMInitWorker(QThread):
    """Worker thread for initializing single-view SAM model in background."""

    model_initialized = pyqtSignal(object)  # model_instance
    finished = pyqtSignal()
    error = pyqtSignal(str)
    progress = pyqtSignal(str)  # status message

    def __init__(self, model_manager, default_model_type, custom_model_path=None):
        super().__init__()
        self.model_manager = model_manager
        self.default_model_type = default_model_type
        self.custom_model_path = custom_model_path
        self._should_stop = False

    def stop(self):
        """Stop the worker gracefully."""
        self._should_stop = True

    def run(self):
        """Initialize SAM model in background."""
        try:
            if self._should_stop:
                return

            if self.custom_model_path:
                # Load custom model
                model_name = os.path.basename(self.custom_model_path)
                self.progress.emit(f"Loading {model_name}...")

                success = self.model_manager.load_custom_model(self.custom_model_path)
                if not success:
                    raise Exception(f"Failed to load custom model: {model_name}")

                sam_model = self.model_manager.sam_model
            else:
                # Initialize the default model
                self.progress.emit("Initializing AI model...")
                sam_model = self.model_manager.initialize_default_model(
                    self.default_model_type
                )

            if self._should_stop:
                return

            if sam_model and sam_model.is_loaded:
                self.model_initialized.emit(sam_model)
                self.progress.emit("AI model initialized")
            else:
                self.error.emit("Model failed to load")

        except Exception as e:
            if not self._should_stop:
                self.error.emit(f"Failed to load AI model: {str(e)}")


class MultiViewSAMInitWorker(QThread):
    """Worker thread for initializing multi-view SAM models in background."""

    model_initialized = pyqtSignal(int, object)  # viewer_index, model_instance
    all_models_initialized = pyqtSignal(int)  # total_models_count
    error = pyqtSignal(str)
    progress = pyqtSignal(int, int)  # current, total

    def __init__(self, model_manager, parent=None):
        super().__init__(parent)
        self.model_manager = model_manager
        self._should_stop = False
        self.models_created = []

    def stop(self):
        """Request the worker to stop."""
        self._should_stop = True

    def run(self):
        """Initialize multi-view SAM models in background thread."""
        try:
            if self._should_stop:
                return

            # Import the required model classes
            from ..models.sam_model import SamModel

            try:
                from ..models.sam2_model import Sam2Model

                SAM2_AVAILABLE = True
            except ImportError:
                Sam2Model = None
                SAM2_AVAILABLE = False

            # Determine which type of model to create
            # Get the currently selected model from the GUI
            parent = self.parent()
            custom_model_path = None
            default_model_type = "vit_h"  # fallback

            if parent and hasattr(parent, "control_panel"):
                # Get the selected model path from the model selection widget
                model_path = parent.control_panel.model_widget.get_selected_model_path()
                if model_path:
                    # User has selected a custom model
                    custom_model_path = model_path
                    # Detect model type from filename
                    default_model_type = self.model_manager.detect_model_type(
                        model_path
                    )
                else:
                    # Using default model
                    default_model_type = (
                        parent.settings.default_model_type
                        if hasattr(parent, "settings")
                        else "vit_h"
                    )

            is_sam2 = default_model_type.startswith("sam2")

            # Create model instances for all viewers - but optimize memory usage
            config = parent._get_multi_view_config()
            num_viewers = config["num_viewers"]

            # Warn about performance implications for VIT_H in multi-view
            if num_viewers > 2 and default_model_type == "vit_h":
                logger.warning(
                    f"Using vit_h model with {num_viewers} viewers may cause performance issues. Consider using vit_b for better performance."
                )
            for i in range(num_viewers):
                if self._should_stop:
                    return

                self.progress.emit(i + 1, num_viewers)

                try:
                    if is_sam2 and SAM2_AVAILABLE:
                        # Create SAM2 model instance
                        if custom_model_path:
                            model_instance = Sam2Model(custom_model_path)
                        else:
                            model_instance = Sam2Model(model_type=default_model_type)
                    else:
                        # Create SAM1 model instance
                        if custom_model_path:
                            model_instance = SamModel(
                                model_type=default_model_type,
                                custom_model_path=custom_model_path,
                            )
                        else:
                            model_instance = SamModel(model_type=default_model_type)

                    if self._should_stop:
                        return

                    if model_instance and getattr(model_instance, "is_loaded", False):
                        self.models_created.append(model_instance)
                        self.model_initialized.emit(i, model_instance)

                        # Synchronize and clear GPU cache after each model for stability
                        try:
                            import torch

                            if torch.cuda.is_available():
                                torch.cuda.synchronize()  # Ensure model is fully loaded
                                torch.cuda.empty_cache()
                        except ImportError:
                            pass  # PyTorch not available
                    else:
                        raise Exception(f"Model instance {i + 1} failed to load")

                except Exception as model_error:
                    logger.error(
                        f"Error creating model instance {i + 1}: {model_error}"
                    )
                    if not self._should_stop:
                        self.error.emit(
                            f"Failed to create model instance {i + 1}: {model_error}"
                        )
                    return

            if not self._should_stop:
                self.all_models_initialized.emit(len(self.models_created))

        except Exception as e:
            if not self._should_stop:
                self.error.emit(str(e))


class ImageDiscoveryWorker(QThread):
    """Worker thread for discovering all image file paths in background."""

    images_discovered = pyqtSignal(list)  # List of all image file paths
    progress = pyqtSignal(str)  # Progress message
    error = pyqtSignal(str)

    def __init__(self, file_model, file_manager, parent=None):
        super().__init__(parent)
        self.file_model = file_model
        self.file_manager = file_manager
        self._should_stop = False

    def stop(self):
        """Request the worker to stop."""
        self._should_stop = True

    def run(self):
        """Discover all image file paths in background."""
        try:
            if self._should_stop:
                return

            self.progress.emit("Scanning for images...")

            if (
                not hasattr(self.file_model, "rootPath")
                or not self.file_model.rootPath()
            ):
                self.images_discovered.emit([])
                return

            all_image_paths = []
            root_index = self.file_model.index(self.file_model.rootPath())

            def scan_directory(parent_index):
                if self._should_stop:
                    return

                for row in range(self.file_model.rowCount(parent_index)):
                    if self._should_stop:
                        return

                    index = self.file_model.index(row, 0, parent_index)
                    if self.file_model.isDir(index):
                        scan_directory(index)  # Recursively scan subdirectories
                    else:
                        path = self.file_model.filePath(index)
                        if self.file_manager.is_image_file(path):
                            # Simply add all image file paths without checking for NPZ
                            all_image_paths.append(path)

            scan_directory(root_index)

            if not self._should_stop:
                self.progress.emit(f"Found {len(all_image_paths)} images")
                self.images_discovered.emit(sorted(all_image_paths))

        except Exception as e:
            if not self._should_stop:
                self.error.emit(f"Error discovering images: {str(e)}")


class MultiViewSAMUpdateWorker(QThread):
    """Worker thread for updating SAM model image in multi-view mode."""

    finished = pyqtSignal(int)  # viewer_index
    error = pyqtSignal(int, str)  # viewer_index, error_message

    def __init__(
        self,
        viewer_index,
        model,
        image_path,
        operate_on_view=False,
        current_image=None,
        parent=None,
    ):
        super().__init__(parent)
        self.viewer_index = viewer_index
        self.model = model
        self.image_path = image_path
        self.operate_on_view = operate_on_view
        self.current_image = current_image
        self._should_stop = False
        self.scale_factor = 1.0

    def stop(self):
        """Request the worker to stop."""
        self._should_stop = True

    def get_scale_factor(self):
        """Get the scale factor used for image resizing."""
        return self.scale_factor

    def run(self):
        """Update SAM model image in background thread."""
        try:
            if self._should_stop:
                return

            # Clear GPU cache to reduce memory pressure in multi-view mode
            try:
                import torch

                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass  # PyTorch not available

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

                # Set image from numpy array
                self.model.set_image_from_array(image)
            else:
                # Load original image
                if self._should_stop:
                    return

                # Optimize image size for faster SAM processing
                pixmap = QPixmap(self.image_path)
                if pixmap.isNull():
                    if not self._should_stop:
                        self.error.emit(self.viewer_index, "Failed to load image")
                    return

                original_width = pixmap.width()
                original_height = pixmap.height()
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

                    # Add CUDA synchronization for multi-model scenarios
                    try:
                        import torch

                        if torch.cuda.is_available():
                            torch.cuda.synchronize()
                    except ImportError:
                        pass

                    self.model.set_image_from_array(image_array)
                else:
                    self.scale_factor = 1.0

                    # Add CUDA synchronization for multi-model scenarios
                    try:
                        import torch

                        if torch.cuda.is_available():
                            torch.cuda.synchronize()
                    except ImportError:
                        pass

                    self.model.set_image_from_path(self.image_path)

            if not self._should_stop:
                self.finished.emit(self.viewer_index)

        except Exception as e:
            if not self._should_stop:
                self.error.emit(self.viewer_index, str(e))


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
        self.main_window = parent  # Store reference to main window for key forwarding

    def keyPressEvent(self, event):
        """Forward key events to main window to preserve hotkey functionality."""
        if self.main_window and hasattr(self.main_window, "keyPressEvent"):
            # Forward the key event to the main window
            self.main_window.keyPressEvent(event)
        else:
            # Default handling if main window not available
            super().keyPressEvent(event)

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

        # Lazy model loading state
        self.pending_custom_model_path = None  # Path to custom model for lazy loading

        # Multi-view mode state
        self.view_mode = "single"  # "single" or "multi"
        self.multi_view_models = []  # SAM model instances for multi-view

        # Initialize dynamic lists based on settings
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]
        self.multi_view_images = [None] * num_viewers  # Image paths for each viewer
        self.multi_view_linked = [True] * num_viewers  # Link status for each image
        self.multi_view_viewers = []  # PhotoViewer instances (set up later)
        self.multi_view_segments = [
            [] for _ in range(num_viewers)
        ]  # Segments for each image
        self.multi_view_segment_items = {
            i: {} for i in range(num_viewers)
        }  # Visual items for segments per viewer

        # Multi-view worker threads
        self.multi_view_init_worker = None  # Worker for initializing models
        self.multi_view_update_workers = [
            None
        ] * num_viewers  # Workers for updating model images
        self.multi_view_models_dirty = [
            False
        ] * num_viewers  # Track if models need image updates
        self.multi_view_models_updating = [
            False
        ] * num_viewers  # Track if models are updating
        self._last_multi_view_images = [
            None
        ] * num_viewers  # Track last loaded images to avoid unnecessary updates

        # Background image discovery for global image list
        self.image_discovery_worker = None
        self.cached_image_paths = []  # Cached list of image file paths (not image data)
        self.images_discovery_in_progress = False

        # Multi-view polygon state (using same pattern as single view)
        # Initialize with default 2-viewer config, will be updated when multi-view is activated
        self.multi_view_polygon_points = [[], []]  # QPointF objects for each viewer
        self.multi_view_polygon_preview_items = [
            [],
            [],
        ]  # Visual preview items for each viewer

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

        # AI mode state
        self.ai_click_start_pos = None
        self.ai_click_time = 0
        self.ai_rubber_band_rect = None
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

        # Single-view SAM model initialization threading
        self.single_view_sam_init_worker = None
        self.single_view_model_initializing = False

        # Smart caching for SAM embeddings to avoid redundant processing
        self.sam_embedding_cache = {}  # Cache SAM embeddings by content hash
        self.current_sam_hash = None  # Hash of currently loaded SAM image

        # Add bounding box preview state
        self.ai_bbox_preview_mask = None
        self.ai_bbox_preview_rect = None

        self._setup_ui()
        logger.info("Step 5/8: Discovering available models...")
        self._setup_model_manager()  # Just setup manager, don't load model
        self._setup_connections()
        self._setup_shortcuts()
        self._load_settings()

    def _setup_ui(self):
        """Setup the main user interface."""
        self.setWindowTitle("LazyLabel by DNC")
        self.setGeometry(
            50, 50, self.settings.window_width, self.settings.window_height
        )

        # Set window icon
        if self.paths.logo_path.exists():
            self.setWindowIcon(QIcon(str(self.paths.logo_path)))

        # Central widget
        central_widget = QWidget()
        self.setCentralWidget(central_widget)

        # Main layout
        main_layout = QHBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)

        # Create splitter
        self.main_splitter = QSplitter(Qt.Orientation.Horizontal)

        # Left panel (Control Panel)
        self.control_panel = ControlPanel()
        self.main_splitter.addWidget(self.control_panel)

        # Center area - Create tab widget for Single/Multi view
        self.view_tab_widget = QTabWidget()
        self.view_tab_widget.currentChanged.connect(self._on_view_mode_changed)

        # Single view tab
        self.single_view_widget = QWidget()
        single_layout = QVBoxLayout(self.single_view_widget)
        single_layout.setContentsMargins(0, 0, 0, 0)

        self.viewer = PhotoViewer(self)
        self.viewer.setMouseTracking(True)
        single_layout.addWidget(self.viewer)

        self.view_tab_widget.addTab(self.single_view_widget, "Single")

        # Multi view tab
        self.multi_view_widget = QWidget()
        self._setup_multi_view_layout()

        self.view_tab_widget.addTab(self.multi_view_widget, "Multi")

        self.main_splitter.addWidget(self.view_tab_widget)

        # Right panel
        self.right_panel = RightPanel()
        self.main_splitter.addWidget(self.right_panel)

        # Set splitter proportions
        self.main_splitter.setSizes([250, 800, 350])

        main_layout.addWidget(self.main_splitter)

        # Status bar
        self.status_bar = StatusBar()
        self.setStatusBar(self.status_bar)

        # Setup file model
        self.file_model = CustomFileSystemModel()
        self.right_panel.setup_file_model(self.file_model)

        # Set minimum sizes for panels to prevent shrinking below preferred width
        self.control_panel.setMinimumWidth(self.control_panel.preferred_width)
        self.right_panel.setMinimumWidth(self.right_panel.preferred_width)

        # Set splitter properties
        self.main_splitter.setStretchFactor(0, 0)  # Control panel doesn't stretch
        self.main_splitter.setStretchFactor(1, 1)  # Viewer stretches
        self.main_splitter.setStretchFactor(2, 0)  # Right panel doesn't stretch
        self.main_splitter.setChildrenCollapsible(True)

        # Connect splitter signals for intelligent expand/collapse
        self.main_splitter.splitterMoved.connect(self._handle_splitter_moved)

    def _get_multi_view_config(self):
        """Get multi-view configuration based on settings."""
        if self.settings.multi_view_grid_mode == "4_view":
            return {"num_viewers": 4, "grid_rows": 2, "grid_cols": 2, "use_grid": True}
        else:  # Default to 2_view
            return {"num_viewers": 2, "grid_rows": 1, "grid_cols": 2, "use_grid": False}

    def _setup_multi_view_layout(self):
        """Setup the dynamic multi-view layout (2-view or 4-view)."""
        # Get configuration
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]
        grid_cols = config["grid_cols"]
        use_grid = config["use_grid"]

        layout = QVBoxLayout(self.multi_view_widget)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(5)

        # Create grid widget
        grid_widget = QWidget()

        # Use grid layout for 4-view, horizontal layout for 2-view
        if use_grid:
            from PyQt6.QtWidgets import QGridLayout

            grid_layout = QGridLayout(grid_widget)
        else:
            grid_layout = QHBoxLayout(grid_widget)
        grid_layout.setSpacing(5)

        self.multi_view_viewers = []
        self.multi_view_info_labels = []
        self.multi_view_unlink_buttons = []

        # Initialize multi-view polygon arrays for dynamic viewer count
        self.multi_view_polygon_points = [[] for _ in range(num_viewers)]
        self.multi_view_polygon_preview_items = [[] for _ in range(num_viewers)]

        for i in range(num_viewers):
            # Container for each image panel
            panel_container = QWidget()
            panel_layout = QVBoxLayout(panel_container)
            panel_layout.setContentsMargins(2, 2, 2, 2)
            panel_layout.setSpacing(2)

            # Header with filename and unlink button
            header_widget = QWidget()
            header_layout = QHBoxLayout(header_widget)
            header_layout.setContentsMargins(0, 0, 0, 0)

            info_label = QLabel(f"Image {i + 1}: No image loaded")
            info_label.setStyleSheet("font-weight: bold; padding: 2px;")
            header_layout.addWidget(info_label)

            unlink_button = QPushButton("X")
            unlink_button.setFixedSize(20, 20)
            unlink_button.setToolTip("Unlink this image from mirroring")
            unlink_button.clicked.connect(
                lambda checked, idx=i: self._toggle_multi_view_link(idx)
            )
            header_layout.addWidget(unlink_button)

            panel_layout.addWidget(header_widget)

            # Photo viewer for this panel
            viewer = PhotoViewer()
            panel_layout.addWidget(viewer)

            # Add to layout based on grid mode
            if use_grid:
                row = i // grid_cols
                col = i % grid_cols
                grid_layout.addWidget(panel_container, row, col)
            else:
                grid_layout.addWidget(panel_container)

            self.multi_view_viewers.append(viewer)
            self.multi_view_info_labels.append(info_label)
            self.multi_view_unlink_buttons.append(unlink_button)

        # Connect zoom synchronization signals
        for i, viewer in enumerate(self.multi_view_viewers):
            viewer.zoom_changed.connect(
                lambda factor, src_idx=i: self._sync_multi_view_zoom(factor, src_idx)
            )

        layout.addWidget(grid_widget)

        # Multi-view controls
        controls_widget = QWidget()
        controls_layout = QHBoxLayout(controls_widget)

        # Grid mode selector
        grid_mode_label = QLabel("View Mode:")
        controls_layout.addWidget(grid_mode_label)

        from PyQt6.QtWidgets import QComboBox

        self.grid_mode_combo = QComboBox()
        self.grid_mode_combo.addItem("2 Views (1x2)", "2_view")
        self.grid_mode_combo.addItem("4 Views (2x2)", "4_view")

        # Set current selection based on settings
        current_mode = self.settings.multi_view_grid_mode
        for i in range(self.grid_mode_combo.count()):
            if self.grid_mode_combo.itemData(i) == current_mode:
                self.grid_mode_combo.setCurrentIndex(i)
                break

        self.grid_mode_combo.currentTextChanged.connect(self._on_grid_mode_changed)
        controls_layout.addWidget(self.grid_mode_combo)

        controls_layout.addStretch()

        layout.addWidget(controls_widget)

    def _on_grid_mode_changed(self):
        """Handle grid mode change from combo box."""
        current_data = self.grid_mode_combo.currentData()
        if current_data and current_data != self.settings.multi_view_grid_mode:
            # Update settings
            self.settings.multi_view_grid_mode = current_data
            self.settings.save_to_file(str(self.paths.settings_file))

            # For now, just show a notification that restart is needed
            # This avoids the complex Qt layout rebuilding issues
            self._show_notification(
                "Grid mode changed. Please restart the application to apply changes.",
                duration=5000,
            )

    def _rebuild_multi_view_layout(self):
        """Rebuild the multi-view layout with new configuration."""
        # Save current state if needed
        current_images = []
        if hasattr(self, "multi_view_viewers") and self.multi_view_viewers:
            for i, _ in enumerate(self.multi_view_viewers):
                if hasattr(self, "multi_view_images") and i < len(
                    self.multi_view_images
                ):
                    current_images.append(self.multi_view_images[i])
                else:
                    current_images.append(None)

        # Clear existing layout safely
        self._clear_multi_view_layout_safe()

        # Recreate layout
        self._setup_multi_view_layout()

        # Restore images if we have them
        if current_images and hasattr(self, "multi_view_viewers"):
            new_viewer_count = len(self.multi_view_viewers)
            for i in range(min(len(current_images), new_viewer_count)):
                if current_images[i] is not None:
                    # Restore image to viewer
                    self.multi_view_images[i] = current_images[i]
                    # Note: Image display will be handled when images are next loaded

    def _clear_multi_view_layout_safe(self):
        """Safely clear the existing multi-view layout without Qt issues."""
        # Disconnect all signals to prevent issues during cleanup
        if hasattr(self, "multi_view_viewers"):
            for viewer in self.multi_view_viewers:
                if viewer:
                    from contextlib import suppress

                    with suppress(Exception):
                        viewer.zoom_changed.disconnect()

        # Clear viewer references first
        self.multi_view_viewers = []
        self.multi_view_info_labels = []
        self.multi_view_unlink_buttons = []

        # Clear layout more carefully with better error handling
        layout = self.multi_view_widget.layout()
        if layout:
            # Hide all child widgets first with safety checks
            def hide_all_widgets(layout_to_process):
                if not layout_to_process:
                    return
                for i in range(layout_to_process.count()):
                    child = layout_to_process.itemAt(i)
                    if child and child.widget():
                        child.widget().hide()
                        child.widget().setParent(None)
                    elif child and child.layout():
                        hide_all_widgets(child.layout())

            try:
                hide_all_widgets(layout)

                # Now clear the layout
                while layout.count():
                    child = layout.takeAt(0)
                    if child and child.widget():
                        child.widget().deleteLater()
                    elif child and child.layout():
                        # Don't delete child layouts immediately
                        pass

                # Clear the main layout
                self.multi_view_widget.setLayout(None)
                layout.deleteLater()
            except Exception as e:
                # If layout clearing fails, just reset the viewer lists
                print(f"Layout clearing failed: {e}")
                pass

    def _clear_multi_view_layout(self):
        """Clear the existing multi-view layout."""
        # Clean up existing viewers and their connections
        if hasattr(self, "multi_view_viewers"):
            for viewer in self.multi_view_viewers:
                if viewer and viewer.parent():
                    viewer.setParent(None)
                    viewer.deleteLater()

        # Clear the widget's layout more thoroughly
        layout = self.multi_view_widget.layout()
        if layout:
            # Recursively clear all child layouts and widgets
            def clear_layout_recursive(layout_to_clear):
                while layout_to_clear.count():
                    child = layout_to_clear.takeAt(0)
                    if child.widget():
                        child.widget().deleteLater()
                    elif child.layout():
                        clear_layout_recursive(child.layout())
                        child.layout().deleteLater()

            clear_layout_recursive(layout)
            # Delete the layout itself
            self.multi_view_widget.setLayout(None)
            layout.deleteLater()

        # Reset viewer lists
        self.multi_view_viewers = []
        self.multi_view_info_labels = []
        self.multi_view_unlink_buttons = []

    def _setup_model_manager(self):
        """Setup the model manager without loading any models."""
        # Setup model change callback
        self.model_manager.on_model_changed = self.control_panel.set_current_model

        # Initialize models list
        models = self.model_manager.get_available_models(str(self.paths.models_dir))
        self.control_panel.populate_models(models)

        if models:
            if len(models) == 1:
                logger.info("Step 6/8: Found 1 model in models directory")
            else:
                logger.info(f"Step 6/8: Found {len(models)} models in models directory")
        else:
            logger.info("Step 6/8: No models found in models directory")

    def _enable_sam_functionality(self, enabled: bool):
        """Enable or disable SAM point functionality."""
        self.control_panel.set_sam_mode_enabled(enabled)
        if not enabled and self.mode in ["sam_points", "ai"]:
            # Switch to polygon mode if SAM is disabled and we're in SAM/AI mode
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
        self.control_panel.fit_view_requested.connect(self._handle_fit_view)
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

        # FFT threshold connections
        self.control_panel.fft_threshold_changed.connect(
            self._handle_fft_threshold_changed
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
            "fit_view": self._handle_fit_view,
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
                shortcut.setContext(
                    Qt.ShortcutContext.ApplicationShortcut
                )  # Work app-wide
                self.shortcuts.append(shortcut)

            # Create secondary shortcut
            if secondary_key:
                shortcut = QShortcut(QKeySequence(secondary_key), self, callback)
                shortcut.setContext(
                    Qt.ShortcutContext.ApplicationShortcut
                )  # Work app-wide
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

        # Note: Multi-view mouse events will be set up when switching to multi-view mode

        # Spacebar is now handled by the hotkey manager (calls _handle_space_press)

    def _setup_multi_view_mouse_events(self):
        """Setup mouse event handling for multi-view viewers."""
        if not self.multi_view_viewers:
            return

        for i, viewer in enumerate(self.multi_view_viewers):
            # Store original event handlers
            setattr(
                viewer.scene(),
                f"_original_mouse_press_{i}",
                viewer.scene().mousePressEvent,
            )
            setattr(
                viewer.scene(),
                f"_original_mouse_move_{i}",
                viewer.scene().mouseMoveEvent,
            )
            setattr(
                viewer.scene(),
                f"_original_mouse_release_{i}",
                viewer.scene().mouseReleaseEvent,
            )

            # Create wrapper functions that include viewer index - fix closure issue
            def make_mouse_handler(viewer_idx, handler_name):
                def wrapper(event):
                    return getattr(self, f"_multi_view_{handler_name}")(
                        event, viewer_idx
                    )

                return wrapper

            # Connect events - capture i properly
            viewer.scene().mousePressEvent = make_mouse_handler(i, "mouse_press")
            viewer.scene().mouseMoveEvent = make_mouse_handler(i, "mouse_move")
            viewer.scene().mouseReleaseEvent = make_mouse_handler(i, "mouse_release")

    # Mode management methods
    def set_sam_mode(self):
        """Set mode to AI (combines SAM points and bounding box)."""
        # Allow entering AI mode even without a loaded model (lazy loading)
        self._set_mode("ai")
        # Note: Model will be loaded on first click/use, similar to multi-view mode

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
            "ai": Qt.CursorShape.CrossCursor,
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

        # Also set drag mode for multi-view viewers
        if self.view_mode == "multi" and hasattr(self, "multi_view_viewers"):
            for viewer in self.multi_view_viewers:
                if viewer:
                    viewer.setDragMode(drag_mode)

        # Update highlights and handles based on the new mode
        self._highlight_selected_segments()
        if mode_name == "edit":
            if self.view_mode == "multi":
                self._display_multi_view_edit_handles()
            else:
                self._display_edit_handles()
        else:
            if self.view_mode == "multi":
                self._clear_multi_view_edit_handles()
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
        """Set the selected model for lazy loading (don't load immediately)."""
        if not model_text or model_text == "Default (vit_h)":
            # Clear any pending custom model and use default
            self.pending_custom_model_path = None
            self.control_panel.set_current_model("Current: Default SAM Model")
            # Clear existing model to free memory until needed
            self._reset_sam_state_for_model_switch()
            return

        model_path = self.control_panel.model_widget.get_selected_model_path()
        if not model_path or not os.path.exists(model_path):
            self._show_error_notification("Selected model file not found.")
            return

        # Store the model path for lazy loading BEFORE clearing state
        self.pending_custom_model_path = model_path

        # Clear existing model to free memory and mark for lazy loading
        self._reset_sam_state_for_model_switch()

        # Update UI to show which model is selected (but not loaded yet)
        model_name = os.path.basename(model_path)
        self.control_panel.set_current_model(f"Selected: {model_name}")

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
        self._apply_image_adjustments_to_all_viewers()

    def _set_contrast(self, value):
        """Set image contrast."""
        self.contrast = value
        self.settings.contrast = value
        self._apply_image_adjustments_to_all_viewers()

    def _set_gamma(self, value):
        """Set image gamma."""
        self.gamma = value / 100.0  # Convert slider value to 0.01-2.0 range
        self.settings.gamma = self.gamma
        self._apply_image_adjustments_to_all_viewers()

    def _apply_image_adjustments_to_all_viewers(self):
        """Apply current image adjustments to all active viewers."""
        # Apply to single view viewer if it has an image
        if (
            self.current_image_path
            and hasattr(self.viewer, "_original_image")
            and self.viewer._original_image is not None
            and hasattr(self.viewer, "_original_image_bgr")
            and self.viewer._original_image_bgr is not None
        ):
            self.viewer.set_image_adjustments(
                self.brightness, self.contrast, self.gamma
            )

        # Apply to multi-view viewers if they have images
        if self.view_mode == "multi" and hasattr(self, "multi_view_viewers"):
            for i, viewer in enumerate(self.multi_view_viewers):
                if (
                    i < len(self.multi_view_images)
                    and self.multi_view_images[i] is not None
                    and hasattr(viewer, "_original_image")
                    and viewer._original_image is not None
                    and hasattr(viewer, "_original_image_bgr")
                    and viewer._original_image_bgr is not None
                ):
                    viewer.set_image_adjustments(
                        self.brightness, self.contrast, self.gamma
                    )

    def _reset_image_adjustments(self):
        """Reset all image adjustment settings to their default values."""

        self.brightness = 0.0
        self.contrast = 0.0
        self.gamma = 1.0
        self.settings.brightness = self.brightness
        self.settings.contrast = self.contrast
        self.settings.gamma = self.gamma
        self.control_panel.adjustments_widget.reset_to_defaults()
        if self.current_image_path or (
            self.view_mode == "multi" and any(self.multi_view_images)
        ):
            self._apply_image_adjustments_to_all_viewers()

    def _handle_settings_changed(self):
        """Handle changes in settings."""
        # Get old operate_on_view setting
        old_operate_on_view = self.settings.operate_on_view

        # Update the main window's settings object with the latest from the widget
        self.settings.update(**self.control_panel.settings_widget.get_settings())

        # Only mark SAM as dirty if operate_on_view setting actually changed (lazy loading)
        if (
            old_operate_on_view != self.settings.operate_on_view
            and self.current_image_path
        ):
            # When operate on view setting changes, mark SAM as dirty but don't load immediately
            # Only load when user actually tries to use AI mode (lazy loading)
            logger.debug(
                f"Operate on view changed from {old_operate_on_view} to {self.settings.operate_on_view}"
            )
            # Mark SAM as dirty and reset scale factor to force proper recalculation
            self.sam_is_dirty = True
            self.sam_scale_factor = 1.0  # Reset to default
            self.current_sam_hash = None  # Invalidate cache
            # Don't call _ensure_sam_updated() here - let it load lazily when user uses AI mode

    def _handle_image_adjustment_changed(self):
        """Handle changes in image adjustments (brightness, contrast, gamma)."""
        if self.settings.operate_on_view:
            # Handle single view mode - mark as dirty for lazy loading
            if self.current_image_path:
                self._mark_sam_dirty()

            # Handle multi view mode - mark models as dirty so they get updated with adjusted images
            elif self.view_mode == "multi" and hasattr(self, "multi_view_models"):
                for i in range(len(self.multi_view_models)):
                    if (
                        self.multi_view_images[i]
                        and self.multi_view_models[i] is not None
                    ):
                        self._mark_multi_view_sam_dirty(i)

    # File management methods
    def _open_folder_dialog(self):
        """Open folder dialog for images."""
        folder_path = QFileDialog.getExistingDirectory(self, "Select Image Folder")
        if folder_path:
            self.right_panel.set_folder(folder_path, self.file_model)
            # Start background image discovery for global image list
            self._start_background_image_discovery()
        self.viewer.setFocus()

    def _load_selected_image(self, index):
        """Load the selected image. Auto-saves previous work if enabled."""

        if not index.isValid() or not self.file_model.isDir(index.parent()):
            return

        self.current_file_index = index
        path = self.file_model.filePath(index)

        if os.path.isfile(path) and self.file_manager.is_image_file(path):
            # Check if we're in multi-view mode
            if hasattr(self, "view_mode") and self.view_mode == "multi":
                self._load_selected_image_multi_view(index, path)
                return

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

    def _load_selected_image_multi_view(self, index, path):
        """Load selected image in multi-view mode starting from the selected file."""
        # Auto-save if enabled and we have current images (not the first load)
        if self.multi_view_images[0] and self.control_panel.get_settings().get(
            "auto_save", True
        ):
            self._save_multi_view_output()

        # Get the number of viewers to load
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]

        # Load consecutive images starting from the selected file
        images_to_load = []
        current_index = index

        for i in range(num_viewers):
            if i == 0:
                # First image is the selected one
                images_to_load.append(path)
            else:
                # Get subsequent images from file model
                next_image = self._get_next_image_from_file_model(current_index)
                if next_image:
                    images_to_load.append(next_image)
                    # Update current_index to continue the sequence
                    current_index = self._get_index_for_path(next_image)
                else:
                    images_to_load.append(None)

        # Load all images into multi-view
        self._load_multi_view_images(images_to_load)

        # Set the current file index for consistency
        self.current_file_index = index
        self.right_panel.file_tree.setCurrentIndex(index)

    def _get_index_for_path(self, path):
        """Get the QModelIndex for a given file path."""
        if not self.file_model or not path:
            return None

        # Use the file model to find the index for this path
        index = self.file_model.index(path)
        return index if index.isValid() else None

    def _get_next_image_from_file_model(self, current_index):
        """Get the next image file from the file model without scanning all files."""
        if not self.file_model or not current_index.isValid():
            return None

        parent_index = current_index.parent()
        current_row = current_index.row()

        # Look for the next image file starting from the next row
        for row in range(current_row + 1, self.file_model.rowCount(parent_index)):
            next_index = self.file_model.index(row, 0, parent_index)
            if next_index.isValid():
                next_path = self.file_model.filePath(next_index)
                if os.path.isfile(next_path) and self.file_manager.is_image_file(
                    next_path
                ):
                    return next_path

        return None

    def _load_multi_view_images(self, image_paths):
        """Load multiple images into multi-view without relying on batch system."""
        # Only cancel ongoing SAM loading if it's safe to do so
        # Avoid canceling if workers are in critical PyTorch/CUDA operations
        self._safe_cancel_multi_view_sam_loading()

        # Clear all previous state like single view mode does
        self._reset_multi_view_state()

        # Get the number of viewers
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]

        # Ensure we have enough slots for all viewers
        while len(self.multi_view_images) < num_viewers:
            self.multi_view_images.append(None)

        # Store the current images
        for i in range(num_viewers):
            if i < len(image_paths):
                self.multi_view_images[i] = image_paths[i]
            else:
                self.multi_view_images[i] = None

        # Load images into all viewers
        for i in range(num_viewers):
            if i < len(self.multi_view_viewers):
                image_path = self.multi_view_images[i]

                if image_path:
                    pixmap = QPixmap(image_path)
                    if not pixmap.isNull():
                        self.multi_view_viewers[i].set_photo(pixmap)
                        # Apply current image adjustments to the newly loaded image
                        self.multi_view_viewers[i].set_image_adjustments(
                            self.brightness, self.contrast, self.gamma
                        )
                        self.multi_view_viewers[i].show()
                        self.multi_view_info_labels[i].setText(
                            f"Image {i + 1}: {Path(image_path).name}"
                        )
                    else:
                        self.multi_view_viewers[i].set_photo(QPixmap())
                        self.multi_view_info_labels[i].setText(
                            f"Image {i + 1}: Failed to load"
                        )
                else:
                    self.multi_view_viewers[i].set_photo(QPixmap())
                    self.multi_view_info_labels[i].setText(f"Image {i + 1}: No image")

        # Update SAM models if needed - mark dirty if image actually changed
        if not hasattr(self, "_last_multi_view_images"):
            self._last_multi_view_images = [None] * num_viewers

        # Ensure _last_multi_view_images has enough slots
        while len(self._last_multi_view_images) < num_viewers:
            self._last_multi_view_images.append(None)

        # Check and update SAM models for all viewers
        for i in range(num_viewers):
            image_path = (
                self.multi_view_images[i] if i < len(self.multi_view_images) else None
            )
            if (
                i < len(self.multi_view_models)
                and self._last_multi_view_images[i] != image_path
            ):
                self._last_multi_view_images[i] = image_path
                self._mark_multi_view_sam_dirty(i)

        # Load existing segments for all loaded images
        valid_image_paths = [path for path in image_paths if path is not None]
        if valid_image_paths:
            self._load_multi_view_segments(valid_image_paths)

    def _load_multi_view_pair(self, image1_path, image2_path):
        """Load a pair of images into multi-view (legacy method for backward compatibility)."""
        self._load_multi_view_images([image1_path, image2_path])

        # Load existing segments for all viewers
        self._load_multi_view_segments([image1_path, image2_path])

    def _reset_multi_view_state(self):
        """Reset all state when loading new images in multi-view mode (like _reset_state for single view)."""
        # Clear all points and temporary elements
        self.clear_all_points()

        # Clear segment manager - same as single view
        self.segment_manager.clear()

        # Clear multi-view specific scene items
        for _viewer_idx, viewer in enumerate(self.multi_view_viewers):
            # Remove all items except the pixmap from each viewer's scene
            items_to_remove = [
                item
                for item in viewer.scene().items()
                if item is not viewer._pixmap_item
            ]
            for item in items_to_remove:
                viewer.scene().removeItem(item)

        # Clear action history
        self.action_history.clear()
        self.redo_history.clear()

        # Update UI lists to reflect cleared state
        self._update_all_lists()

    def _load_multi_view_segments(self, image_paths):
        """Load existing segments for all viewers with proper origin tracking."""
        try:
            all_segments = []

            # Load segments for each viewer
            for viewer_index, image_path in enumerate(image_paths):
                if image_path:
                    try:
                        self.file_manager.load_class_aliases(image_path)
                        self.file_manager.load_existing_mask(image_path)
                        # Tag segments with their source viewer
                        viewer_segments = list(self.segment_manager.segments)
                        for segment in viewer_segments:
                            if "views" not in segment:  # Only tag legacy segments
                                segment["_source_viewer"] = viewer_index
                        all_segments.extend(viewer_segments)
                        self.segment_manager.segments.clear()
                    except Exception as e:
                        print(f"Error loading segments for viewer {viewer_index}: {e}")

            # Set all segments at once
            self.segment_manager.segments = all_segments

            # Update all UI components to reflect the loaded segments
            if all_segments:
                # Update segment list, class list, and display segments
                self._update_all_lists()

                # Force a repaint of the viewers to ensure visibility
                for viewer in self.multi_view_viewers:
                    viewer.scene().update()
                    viewer.update()

            else:
                # Even if no segments, update the lists to clear them
                self._update_all_lists()

        except Exception as e:
            print(f"Error in _load_multi_view_segments: {e}")
            self.segment_manager.segments.clear()

    def _cancel_multi_view_sam_loading(self):
        """Cancel any ongoing SAM model loading operations to prevent conflicts."""
        # Stop all running SAM update workers safely
        for i in range(len(self.multi_view_update_workers)):
            if (
                self.multi_view_update_workers[i]
                and self.multi_view_update_workers[i].isRunning()
            ):
                # Request the worker to stop gracefully
                self.multi_view_update_workers[i].stop()
                self.multi_view_update_workers[i].quit()

                # Give it a reasonable time to finish gracefully
                if self.multi_view_update_workers[i].wait(2000):  # Wait up to 2 seconds
                    # Worker finished gracefully
                    self.multi_view_update_workers[i].deleteLater()
                    self.multi_view_update_workers[i] = None
                else:
                    # Worker didn't finish - mark it for cleanup but don't force terminate
                    # Let the timeout mechanism handle it to avoid crashes
                    pass

        # Clean up all timeout timers
        if hasattr(self, "multi_view_update_timers"):
            for i, timer in list(self.multi_view_update_timers.items()):
                timer.stop()
                timer.deleteLater()
                del self.multi_view_update_timers[i]

        # Reset loading state flags
        for i in range(len(self.multi_view_models_updating)):
            self.multi_view_models_updating[i] = False

        # Reset progress tracking to avoid stale state
        if hasattr(self, "_multi_view_loading_step"):
            self._multi_view_loading_step = 0
        if hasattr(self, "_multi_view_total_steps"):
            self._multi_view_total_steps = 0

    def _safe_cancel_multi_view_sam_loading(self):
        """Safely cancel SAM loading without forcing termination to avoid crashes."""
        # Clean up timeout timers first (these are safe to cancel)
        if hasattr(self, "multi_view_update_timers"):
            for i, timer in list(self.multi_view_update_timers.items()):
                timer.stop()
                timer.deleteLater()
                del self.multi_view_update_timers[i]

        # For workers, just request stop but don't force cleanup
        # Let them finish gracefully or timeout naturally
        for i in range(len(self.multi_view_update_workers)):
            if (
                self.multi_view_update_workers[i]
                and self.multi_view_update_workers[i].isRunning()
            ):
                # Request graceful stop but don't wait or force cleanup
                self.multi_view_update_workers[i].stop()

        # Reset progress tracking to clean state
        if hasattr(self, "_multi_view_loading_step"):
            self._multi_view_loading_step = 0
        if hasattr(self, "_multi_view_total_steps"):
            self._multi_view_total_steps = 0

    def _load_next_multi_view_pair(self):
        """Load the next pair of images in multi-view mode."""
        if not self.current_file_index.isValid():
            return

        # Auto-save if enabled and we have current images (not the first load)
        if self.multi_view_images[0] and self.control_panel.get_settings().get(
            "auto_save", True
        ):
            self._save_multi_view_output()

        # Get the next image from current position
        next_index = self._get_next_image_index_from_file_model(self.current_file_index)
        if next_index:
            next_path = self.file_model.filePath(next_index)
            next_next_path = self._get_next_image_from_file_model(next_index)

            # Load the new pair
            self._load_multi_view_pair(next_path, next_next_path)

            # Update current file index
            self.current_file_index = next_index
            self.right_panel.file_tree.setCurrentIndex(next_index)

    def _load_previous_multi_view_pair(self):
        """Load the previous pair of images in multi-view mode."""
        if not self.current_file_index.isValid():
            return

        # Auto-save if enabled and we have current images (not the first load)
        if self.multi_view_images[0] and self.control_panel.get_settings().get(
            "auto_save", True
        ):
            self._save_multi_view_output()

        # Get the previous image from current position
        prev_index = self._get_previous_image_index_from_file_model(
            self.current_file_index
        )
        if prev_index:
            prev_path = self.file_model.filePath(prev_index)
            next_path = self._get_next_image_from_file_model(prev_index)

            # Load the new pair
            self._load_multi_view_pair(prev_path, next_path)

            # Update current file index
            self.current_file_index = prev_index
            self.right_panel.file_tree.setCurrentIndex(prev_index)

    def _get_next_image_index_from_file_model(self, current_index):
        """Get the next image file index from the file model."""
        if not self.file_model or not current_index.isValid():
            return None

        parent_index = current_index.parent()
        current_row = current_index.row()

        # Look for the next image file starting from the next row
        for row in range(current_row + 1, self.file_model.rowCount(parent_index)):
            next_index = self.file_model.index(row, 0, parent_index)
            if next_index.isValid():
                next_path = self.file_model.filePath(next_index)
                if os.path.isfile(next_path) and self.file_manager.is_image_file(
                    next_path
                ):
                    return next_index

        return None

    def _get_previous_image_index_from_file_model(self, current_index):
        """Get the previous image file index from the file model."""
        if not self.file_model or not current_index.isValid():
            return None

        parent_index = current_index.parent()
        current_row = current_index.row()

        # Look for the previous image file starting from the previous row
        for row in range(current_row - 1, -1, -1):
            prev_index = self.file_model.index(row, 0, parent_index)
            if prev_index.isValid():
                prev_path = self.file_model.filePath(prev_index)
                if os.path.isfile(prev_path) and self.file_manager.is_image_file(
                    prev_path
                ):
                    return prev_index

        return None

    def _get_next_multi_images_from_file_model(self, current_index, count):
        """Get the next 'count' image file paths from the file model."""
        if not self.file_model or not current_index.isValid():
            return []

        parent_index = current_index.parent()
        current_row = current_index.row()
        images = []

        # Look for the next image files starting from the next row
        for row in range(current_row + 1, self.file_model.rowCount(parent_index)):
            if len(images) >= count:
                break
            next_index = self.file_model.index(row, 0, parent_index)
            if next_index.isValid():
                next_path = self.file_model.filePath(next_index)
                if os.path.isfile(next_path) and self.file_manager.is_image_file(
                    next_path
                ):
                    images.append(next_path)

        return images

    def _get_previous_multi_images_from_file_model(self, current_index, count):
        """Get the previous 'count' image file paths from the file model."""
        if not self.file_model or not current_index.isValid():
            return []

        parent_index = current_index.parent()
        current_row = current_index.row()
        images = []

        # Look for the previous image files starting from the previous rows
        # We need to go back 'count' images from current position
        for row in range(current_row - 1, -1, -1):
            if len(images) >= count:
                break
            prev_index = self.file_model.index(row, 0, parent_index)
            if prev_index.isValid():
                prev_path = self.file_model.filePath(prev_index)
                if os.path.isfile(prev_path) and self.file_manager.is_image_file(
                    prev_path
                ):
                    images.append(prev_path)

        # Reverse the list since we collected them in reverse order
        return images[::-1]

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
        # Handle multi-view mode by loading next batch of 2
        if hasattr(self, "view_mode") and self.view_mode == "multi":
            self._load_next_multi_batch()
            return

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
        # Handle multi-view mode by loading previous batch of 2
        if hasattr(self, "view_mode") and self.view_mode == "multi":
            self._load_previous_multi_batch()
            return

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
                if item.scene():
                    item.scene().removeItem(item)
            self.highlight_items = []

        # Also clear multi-view highlight items
        if hasattr(self, "multi_view_highlight_items"):
            for _viewer_idx, items in self.multi_view_highlight_items.items():
                for item in items:
                    if item.scene():
                        item.scene().removeItem(item)
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_highlight_items = {i: [] for i in range(num_viewers)}

        selected_indices = self.right_panel.get_selected_segment_indices()
        self.segment_manager.delete_segments(selected_indices)
        self._update_all_lists()

    def _highlight_selected_segments(self):
        """Highlight selected segments. In edit mode, use a brighter hover-like effect."""
        # Remove previous highlight overlays
        if hasattr(self, "highlight_items"):
            for item in self.highlight_items:
                if item.scene():
                    # Remove from the correct scene
                    item.scene().removeItem(item)
        self.highlight_items = []

        # Also clear multi-view highlight items if they exist
        if hasattr(self, "multi_view_highlight_items"):
            for _viewer_idx, items in self.multi_view_highlight_items.items():
                for item in items:
                    if item.scene():
                        item.scene().removeItem(item)
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_highlight_items = {i: [] for i in range(num_viewers)}

        selected_indices = self.right_panel.get_selected_segment_indices()
        if not selected_indices:
            return

        # Handle single view mode
        if self.view_mode == "single":
            self._highlight_segments_single_view(selected_indices)
        elif self.view_mode == "multi":
            self._highlight_segments_multi_view(selected_indices)

    def _highlight_segments_single_view(self, selected_indices):
        """Highlight segments in single view mode."""
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
                poly_item.setZValue(999)
                self.viewer.scene().addItem(poly_item)
                self.highlight_items.append(poly_item)
            elif seg.get("mask") is not None:
                # For non-polygon types, we still use the mask-to-pixmap approach.
                # If in edit mode, we could consider skipping non-polygons.
                if self.mode != "edit":
                    mask = seg.get("mask")
                    pixmap = mask_to_pixmap(mask, (255, 255, 0), alpha=180)
                    highlight_item = self.viewer.scene().addPixmap(pixmap)
                    highlight_item.setZValue(1000)
                    self.highlight_items.append(highlight_item)

    def _highlight_segments_multi_view(self, selected_indices):
        """Highlight segments in multi view mode."""
        if not hasattr(self, "multi_view_highlight_items"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_highlight_items = {i: [] for i in range(num_viewers)}

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

            # Check if segment has view-specific data
            if "views" in seg:
                # New multi-view format - highlight in relevant viewers
                for viewer_idx in range(len(self.multi_view_viewers)):
                    if viewer_idx in seg["views"]:
                        self._add_highlight_to_viewer(
                            i,
                            seg,
                            viewer_idx,
                            highlight_brush,
                            seg["views"][viewer_idx],
                        )
            else:
                # Legacy single-view format - highlight in all viewers
                for viewer_idx in range(len(self.multi_view_viewers)):
                    self._add_highlight_to_viewer(
                        i, seg, viewer_idx, highlight_brush, seg
                    )

    def _add_highlight_to_viewer(
        self, segment_index, segment, viewer_idx, highlight_brush, segment_data
    ):
        """Add highlight overlay to a specific viewer."""
        viewer = self.multi_view_viewers[viewer_idx]

        if segment["type"] == "Polygon" and segment_data.get("vertices"):
            # Convert stored list of lists back to QPointF objects
            qpoints = [QPointF(p[0], p[1]) for p in segment_data["vertices"]]
            poly_item = QGraphicsPolygonItem(QPolygonF(qpoints))
            poly_item.setBrush(highlight_brush)
            poly_item.setPen(QPen(Qt.GlobalColor.transparent))
            poly_item.setZValue(999)

            viewer.scene().addItem(poly_item)
            self.multi_view_highlight_items[viewer_idx].append(poly_item)

        elif segment_data.get("mask") is not None:
            # For non-polygon types, we still use the mask-to-pixmap approach.
            # If in edit mode, we could consider skipping non-polygons.
            if self.mode != "edit":
                mask = segment_data.get("mask")
                pixmap = mask_to_pixmap(mask, (255, 255, 0), alpha=180)
                highlight_item = viewer.scene().addPixmap(pixmap)
                highlight_item.setZValue(1000)
                self.multi_view_highlight_items[viewer_idx].append(highlight_item)

    def _trigger_segment_hover(self, segment_id, hover_state, triggering_item=None):
        """Handle segment hover events for multi-view synchronization."""
        if self.view_mode != "multi":
            return

        # Trigger hover state on corresponding segments in all viewers
        if hasattr(self, "multi_view_segment_items"):
            for _viewer_idx, viewer_segments in self.multi_view_segment_items.items():
                if segment_id in viewer_segments:
                    for item in viewer_segments[segment_id]:
                        # Skip the item that triggered the hover to avoid recursion
                        if item is triggering_item:
                            continue

                        if hasattr(item, "set_hover_state"):
                            item.set_hover_state(hover_state)
                        elif (
                            hasattr(item, "setBrush")
                            and hasattr(item, "hover_brush")
                            and hasattr(item, "default_brush")
                        ):
                            # For HoverablePolygonItem
                            item.setBrush(
                                item.hover_brush if hover_state else item.default_brush
                            )
                        elif (
                            hasattr(item, "setPixmap")
                            and hasattr(item, "hover_pixmap")
                            and hasattr(item, "default_pixmap")
                        ):
                            # For HoverablePixmapItem
                            item.setPixmap(
                                item.hover_pixmap
                                if hover_state
                                else item.default_pixmap
                            )

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
                if self.view_mode == "multi":
                    self._display_multi_view_edit_handles()
                else:
                    self._display_edit_handles()
            else:
                if self.view_mode == "multi":
                    self._clear_multi_view_edit_handles()
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
        if self.view_mode == "multi":
            # Handle multi-view mode
            self._display_all_multi_view_segments()
            return

        # Single-view mode
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
                poly_item.set_segment_info(i, self)
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
                pixmap_item.set_segment_info(i, self)
                self.viewer.scene().addItem(pixmap_item)
                pixmap_item.setZValue(i + 1)
                self.segment_items[i].append(pixmap_item)

    def _display_all_multi_view_segments(self):
        """Display all segments in multi-view mode."""
        logger.debug(
            f"Displaying {len(self.segment_manager.segments)} segments in multi-view mode"
        )

        # Clear existing segment items from all viewers
        if hasattr(self, "multi_view_segment_items"):
            for viewer_idx, viewer_segments in self.multi_view_segment_items.items():
                for _segment_idx, items in viewer_segments.items():
                    for item in items[
                        :
                    ]:  # Create a copy to avoid modification during iteration
                        try:
                            if item.scene():
                                self.multi_view_viewers[viewer_idx].scene().removeItem(
                                    item
                                )
                        except RuntimeError:
                            # Object has been deleted, skip it
                            pass

        # Clear all segment-related items from scenes (defensive cleanup)
        # Only remove items that are actually segment display items, not UI elements
        for _viewer_idx, viewer in enumerate(self.multi_view_viewers):
            items_to_remove = []
            for item in viewer.scene().items():
                # Only remove items that are confirmed segment display items
                # Skip pixmap items (could be the image itself) and temporary graphics items
                if (
                    hasattr(item, "segment_id")
                    or isinstance(item, HoverablePixmapItem | HoverablePolygonItem)
                ) or (
                    hasattr(item, "__class__")
                    and item.__class__.__name__ == "QGraphicsPolygonItem"
                    and hasattr(item, "segment_id")
                ):
                    items_to_remove.append(item)

            for item in items_to_remove:
                try:
                    if item.scene():
                        viewer.scene().removeItem(item)
                except RuntimeError:
                    # Object has been deleted, skip it
                    pass

        # Initialize segment items tracking for multi-view
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]
        self.multi_view_segment_items = {i: {} for i in range(num_viewers)}

        # Display segments on each viewer
        for i, segment in enumerate(self.segment_manager.segments):
            class_id = segment.get("class_id")
            base_color = self._get_color_for_class(class_id)

            # Check if segment has view-specific data
            if "views" in segment:
                # New multi-view format with paired data
                for viewer_idx in range(len(self.multi_view_viewers)):
                    if viewer_idx in segment["views"]:
                        self._display_segment_in_multi_view_viewer(
                            i, segment, viewer_idx, base_color
                        )
            else:
                # Legacy single-view format - display only in source viewer
                source_viewer = segment.get("_source_viewer")
                if source_viewer is not None:
                    # Display only in the viewer it was loaded from
                    self._display_segment_in_multi_view_viewer(
                        i, segment, source_viewer, base_color
                    )
                else:
                    # Fallback for segments without source info - display in all viewers
                    for viewer_idx in range(len(self.multi_view_viewers)):
                        self._display_segment_in_multi_view_viewer(
                            i, segment, viewer_idx, base_color
                        )

    def _display_segment_in_multi_view_viewer(
        self, segment_index, segment, viewer_index, base_color
    ):
        """Display a specific segment in a specific viewer."""
        if viewer_index >= len(self.multi_view_viewers):
            return

        viewer = self.multi_view_viewers[viewer_index]

        # Initialize segment items for this viewer if needed
        if segment_index not in self.multi_view_segment_items[viewer_index]:
            self.multi_view_segment_items[viewer_index][segment_index] = []

        # Get segment data (either from views or direct)
        if "views" in segment and viewer_index in segment["views"]:
            segment_data = segment["views"][viewer_index]
            segment_type = segment["type"]
        else:
            segment_data = segment
            segment_type = segment["type"]

        # Display based on type
        if segment_type == "Polygon" and segment_data.get("vertices"):
            # Display polygon
            qpoints = [QPointF(p[0], p[1]) for p in segment_data["vertices"]]
            poly_item = HoverablePolygonItem(QPolygonF(qpoints))

            default_brush = QBrush(
                QColor(base_color.red(), base_color.green(), base_color.blue(), 70)
            )
            hover_brush = QBrush(
                QColor(base_color.red(), base_color.green(), base_color.blue(), 170)
            )
            poly_item.set_brushes(default_brush, hover_brush)
            poly_item.set_segment_info(segment_index, self)
            poly_item.setPen(QPen(Qt.GlobalColor.transparent))

            logger.debug(
                f"Created polygon segment {segment_index} in viewer {viewer_index}"
            )

            viewer.scene().addItem(poly_item)
            self.multi_view_segment_items[viewer_index][segment_index].append(poly_item)

        elif segment_type == "AI" and segment_data.get("mask") is not None:
            # Display AI mask
            default_pixmap = mask_to_pixmap(
                segment_data["mask"], base_color.getRgb()[:3], alpha=70
            )
            hover_pixmap = mask_to_pixmap(
                segment_data["mask"], base_color.getRgb()[:3], alpha=170
            )
            pixmap_item = HoverablePixmapItem()
            pixmap_item.set_pixmaps(default_pixmap, hover_pixmap)
            pixmap_item.set_segment_info(segment_index, self)
            logger.debug(f"Created AI segment {segment_index} in viewer {viewer_index}")

            viewer.scene().addItem(pixmap_item)
            pixmap_item.setZValue(segment_index + 1)
            self.multi_view_segment_items[viewer_index][segment_index].append(
                pixmap_item
            )

        elif segment_type == "Loaded":
            # Handle legacy loaded segments - they could be either polygon or mask
            if segment_data.get("vertices"):
                # Display as polygon
                qpoints = [QPointF(p[0], p[1]) for p in segment_data["vertices"]]
                poly_item = HoverablePolygonItem(QPolygonF(qpoints))

                default_brush = QBrush(
                    QColor(base_color.red(), base_color.green(), base_color.blue(), 70)
                )
                hover_brush = QBrush(
                    QColor(base_color.red(), base_color.green(), base_color.blue(), 170)
                )
                poly_item.set_brushes(default_brush, hover_brush)
                poly_item.set_segment_info(segment_index, self)
                poly_item.setPen(QPen(Qt.GlobalColor.transparent))

                viewer.scene().addItem(poly_item)
                self.multi_view_segment_items[viewer_index][segment_index].append(
                    poly_item
                )

            elif segment_data.get("mask") is not None:
                # Display as mask
                default_pixmap = mask_to_pixmap(
                    segment_data["mask"], base_color.getRgb()[:3], alpha=70
                )
                hover_pixmap = mask_to_pixmap(
                    segment_data["mask"], base_color.getRgb()[:3], alpha=170
                )
                pixmap_item = HoverablePixmapItem()
                pixmap_item.set_pixmaps(default_pixmap, hover_pixmap)
                pixmap_item.set_segment_info(segment_index, self)

                viewer.scene().addItem(pixmap_item)
                pixmap_item.setZValue(segment_index + 1)
                self.multi_view_segment_items[viewer_index][segment_index].append(
                    pixmap_item
                )

    # Event handlers
    def _handle_escape_press(self):
        """Handle escape key press."""
        self.right_panel.clear_selections()
        self.clear_all_points()

        # Clear bounding box preview state if active
        if (
            hasattr(self, "ai_bbox_preview_mask")
            and self.ai_bbox_preview_mask is not None
        ):
            self.ai_bbox_preview_mask = None
            self.ai_bbox_preview_rect = None

            # Clear preview
            if hasattr(self, "preview_mask_item") and self.preview_mask_item:
                self.viewer.scene().removeItem(self.preview_mask_item)
                self.preview_mask_item = None

        self.viewer.setFocus()

    def _handle_space_press(self):
        """Handle space key press."""
        logger.debug(f"Space pressed - mode: {self.mode}, view_mode: {self.view_mode}")

        if self.mode == "polygon":
            if self.view_mode == "single" and self.polygon_points:
                self._finalize_polygon()
            elif self.view_mode == "multi" and hasattr(
                self, "multi_view_polygon_points"
            ):
                # Complete polygons for all viewers that have points
                for i, points in enumerate(self.multi_view_polygon_points):
                    if points and len(points) >= 3:
                        # Use the multi-view mode handler for proper pairing logic
                        if hasattr(self, "multi_view_mode_handler"):
                            self.multi_view_mode_handler._finalize_multi_view_polygon(i)
                        else:
                            self._finalize_multi_view_polygon(i)
        else:
            # For AI mode, use accept method, otherwise save current segment
            if self.mode == "ai" and self.view_mode == "single":
                self._accept_ai_segment()
            else:
                self._save_current_segment()

    def _handle_enter_press(self):
        """Handle enter key press."""
        if self.mode == "polygon":
            if self.view_mode == "single" and self.polygon_points:
                self._finalize_polygon()
            elif self.view_mode == "multi" and hasattr(
                self, "multi_view_polygon_points"
            ):
                # Complete polygons for all viewers that have points
                for i, points in enumerate(self.multi_view_polygon_points):
                    if points and len(points) >= 3:
                        # Use the multi-view mode handler for proper pairing logic
                        if hasattr(self, "multi_view_mode_handler"):
                            self.multi_view_mode_handler._finalize_multi_view_polygon(i)
                        else:
                            self._finalize_multi_view_polygon(i)
        else:
            # First accept any AI segments (same as spacebar), then save
            self._accept_ai_segment()
            self._save_output_to_npz()

    def _save_current_segment(self):
        """Save current SAM segment with fragment threshold filtering."""
        logger.debug(
            f"_save_current_segment called - mode: {self.mode}, view_mode: {self.view_mode}"
        )

        if self.mode not in ["sam_points", "ai"]:
            logger.debug(f"Mode {self.mode} not in ['sam_points', 'ai'], returning")
            return

        # Handle multi-view mode separately
        if self.view_mode == "multi":
            if hasattr(self, "multi_view_mode_handler"):
                self.multi_view_mode_handler.save_ai_predictions()
            return

        # Single view mode - check model availability
        if not self.model_manager.is_model_available():
            logger.debug("Model not available, returning")
            return

        # Check if we have a bounding box preview to save
        if (
            hasattr(self, "ai_bbox_preview_mask")
            and self.ai_bbox_preview_mask is not None
        ):
            # Save bounding box preview
            mask = self.ai_bbox_preview_mask

            # Apply fragment threshold filtering if enabled
            filtered_mask = self._apply_fragment_threshold(mask)
            if filtered_mask is not None:
                new_segment = {
                    "mask": filtered_mask,
                    "type": "AI",  # Changed from "SAM" to match other AI segments
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
                self._update_all_lists()
                self._show_success_notification("AI bounding box segmentation saved!")
            else:
                self._show_warning_notification(
                    "All segments filtered out by fragment threshold"
                )

            # Clear bounding box preview state
            self.ai_bbox_preview_mask = None
            self.ai_bbox_preview_rect = None

            # Clear preview
            if hasattr(self, "preview_mask_item") and self.preview_mask_item:
                self.viewer.scene().removeItem(self.preview_mask_item)
                self.preview_mask_item = None
            return

        # Handle point-based predictions
        # First check if we have a preview mask already generated
        has_preview_mask = (
            hasattr(self, "current_preview_mask")
            and self.current_preview_mask is not None
        )
        has_preview_item = hasattr(self, "preview_mask_item") and self.preview_mask_item

        logger.debug(
            f"Point-based save - has_preview_mask: {has_preview_mask}, has_preview_item: {has_preview_item}"
        )

        if has_preview_mask:
            mask = self.current_preview_mask
            logger.debug("Using existing current_preview_mask")
        else:
            # No preview mask - need to generate one
            if not has_preview_item:
                logger.debug("No preview item, cannot save")
                return

            result = self.model_manager.sam_model.predict(
                self.positive_points, self.negative_points
            )
            if result is None:
                return
            mask, scores, logits = result

            # Ensure mask is boolean (SAM models can return float masks)
            if mask.dtype != bool:
                mask = mask > 0.5  # Convert float mask to boolean

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
                    "type": "AI",  # Changed from "SAM" to match other AI segments
                    "vertices": None,
                }
                self.segment_manager.add_segment(new_segment)
                logger.info(
                    f"Added AI segment. Total segments: {len(self.segment_manager.segments)}"
                )
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
                self._show_success_notification("AI segment saved!")
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

    def _get_segments_for_viewer(self, viewer_index):
        """Get segments that apply to a specific viewer."""
        viewer_segments = []

        for segment in self.segment_manager.segments:
            # Check if segment has view-specific data
            if "views" in segment:
                # Multi-view segment with views structure
                if viewer_index in segment["views"]:
                    # Create a segment for this viewer with the view-specific data
                    viewer_segment = {
                        "type": segment["type"],
                        "class_id": segment.get("class_id"),
                    }
                    # Copy view-specific data to the top level
                    viewer_segment.update(segment["views"][viewer_index])
                    # Remove internal metadata before saving
                    viewer_segment.pop("_source_viewer", None)
                    viewer_segments.append(viewer_segment)
            else:
                # Legacy single-view segment - check source viewer
                source_viewer = segment.get("_source_viewer")
                if source_viewer is not None:
                    # Only save if this segment belongs to this viewer
                    if source_viewer == viewer_index:
                        # Create a clean copy without metadata
                        clean_segment = {
                            k: v for k, v in segment.items() if not k.startswith("_")
                        }
                        viewer_segments.append(clean_segment)
                else:
                    # Fallback for segments without source info - include for all viewers
                    clean_segment = {
                        k: v for k, v in segment.items() if not k.startswith("_")
                    }
                    viewer_segments.append(clean_segment)

        return viewer_segments

    def _save_multi_view_output(self):
        """Save output for multi-view mode."""
        if not any(self.multi_view_images):
            self._show_warning_notification("No images loaded in multi-view mode.")
            return

        saved_files = []
        self._saved_file_paths = []  # Track files for highlighting
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]
        for i in range(num_viewers):
            image_path = self.multi_view_images[i]

            if not image_path:
                continue

            # Filter segments for this viewer
            try:
                # Get segments that apply to this viewer
                viewer_segments = self._get_segments_for_viewer(i)

                # Get image dimensions from the specific viewer
                if i < len(self.multi_view_viewers):
                    pixmap = self.multi_view_viewers[i]._pixmap_item.pixmap()
                    if not pixmap.isNull():
                        h, w = pixmap.height(), pixmap.width()
                    else:
                        # Fallback to loading image directly
                        temp_pixmap = QPixmap(image_path)
                        h, w = temp_pixmap.height(), temp_pixmap.width()
                else:
                    continue

                settings = self.control_panel.get_settings()

                # Save NPZ if enabled and we have segments
                if settings.get("save_npz", True) and viewer_segments:
                    # Temporarily replace segments in segment manager for this viewer
                    original_segments = self.segment_manager.segments
                    self.segment_manager.segments = viewer_segments

                    class_order = self.segment_manager.get_unique_class_ids()
                    if class_order:
                        # Get crop coordinates for this image size
                        crop_coords = self.crop_coords_by_size.get((w, h))

                        npz_path = self.file_manager.save_npz(
                            image_path,
                            (h, w),
                            class_order,
                            crop_coords,  # Pass crop coordinates if available
                        )
                        saved_files.append(os.path.basename(npz_path))
                        # Track saved file for highlighting later
                        if not hasattr(self, "_saved_file_paths"):
                            self._saved_file_paths = []
                        self._saved_file_paths.append(npz_path)

                    # Restore original segments
                    self.segment_manager.segments = original_segments

                # Save TXT if enabled and we have segments
                if settings.get("save_txt", True) and viewer_segments:
                    # Temporarily replace segments in segment manager for this viewer
                    original_segments = self.segment_manager.segments
                    self.segment_manager.segments = viewer_segments

                    class_order = self.segment_manager.get_unique_class_ids()
                    if settings.get("yolo_use_alias", True):
                        class_labels = [
                            self.segment_manager.get_class_alias(cid)
                            for cid in class_order
                        ]
                    else:
                        class_labels = [str(cid) for cid in class_order]
                    if class_order:
                        # Get crop coordinates for this image size
                        crop_coords = self.crop_coords_by_size.get((w, h))

                        txt_path = self.file_manager.save_yolo_txt(
                            image_path,
                            (h, w),
                            class_order,
                            class_labels,
                            crop_coords,  # Pass crop coordinates if available
                        )
                        saved_files.append(os.path.basename(txt_path))
                        # Track saved file for highlighting later
                        if not hasattr(self, "_saved_file_paths"):
                            self._saved_file_paths = []
                        self._saved_file_paths.append(txt_path)

                    # Restore original segments
                    self.segment_manager.segments = original_segments

                # If no segments for this viewer, delete associated files
                if not viewer_segments:
                    base, _ = os.path.splitext(image_path)
                    deleted_files = []
                    for ext in [".npz", ".txt", ".json"]:
                        file_path = base + ext
                        if os.path.exists(file_path):
                            try:
                                os.remove(file_path)
                                deleted_files.append(os.path.basename(file_path))
                                self.file_model.update_cache_for_path(file_path)
                            except Exception as e:
                                self._show_error_notification(
                                    f"Error deleting {file_path}: {e}"
                                )
                    if deleted_files:
                        saved_files.extend([f"Deleted: {f}" for f in deleted_files])
                        # Update UI immediately when files are deleted
                        self._update_all_lists()

            except Exception as e:
                self._show_error_notification(
                    f"Error saving {os.path.basename(image_path)}: {str(e)}"
                )

        # Update file list with green flash and tick marks (like single view mode)
        if hasattr(self, "_saved_file_paths") and self._saved_file_paths:
            for path in self._saved_file_paths:
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
            # Clear the tracking list for next save
            self._saved_file_paths = []

        if saved_files:
            self._show_success_notification(
                f"Multi-view saved: {', '.join(saved_files)}"
            )
        else:
            self._show_warning_notification("No segments to save in multi-view mode.")

    def _save_output_to_npz(self):
        """Save output to NPZ and TXT files as enabled, and update file list tickboxes/highlight. If no segments, delete associated files."""
        # Handle multi-view mode differently
        if self.view_mode == "multi":
            self._save_multi_view_output()
            return

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
                # Update UI immediately when files are deleted
                self._update_all_lists()
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
            viewer_mode = last_action.get("viewer_mode", "single")

            if viewer_mode == "multi":
                # Handle multi-view point undo
                viewer_index = last_action.get("viewer_index")
                if viewer_index is not None and hasattr(self, "multi_view_point_items"):
                    # Remove from multi-view point collections
                    if point_type == "positive":
                        if (
                            hasattr(self, "multi_view_positive_points")
                            and viewer_index < len(self.multi_view_positive_points)
                            and self.multi_view_positive_points[viewer_index]
                        ):
                            self.multi_view_positive_points[viewer_index].pop()
                    else:
                        if (
                            hasattr(self, "multi_view_negative_points")
                            and viewer_index < len(self.multi_view_negative_points)
                            and self.multi_view_negative_points[viewer_index]
                        ):
                            self.multi_view_negative_points[viewer_index].pop()

                    # Remove from visual items
                    if (
                        viewer_index < len(self.multi_view_point_items)
                        and point_item in self.multi_view_point_items[viewer_index]
                    ):
                        self.multi_view_point_items[viewer_index].remove(point_item)
                        if point_item.scene():
                            self.multi_view_viewers[viewer_index].scene().removeItem(
                                point_item
                            )

                self._show_notification(f"Undid: Add Point (Viewer {viewer_index + 1})")
            else:
                # Handle single-view point undo (existing logic)
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
            viewer_mode = last_action.get("viewer_mode", "single")
            viewer_index = last_action.get("viewer_index")

            if (
                segment_index is not None
                and vertex_index is not None
                and old_pos is not None
            ):
                if segment_index < len(self.segment_manager.segments):
                    if viewer_mode == "multi" and viewer_index is not None:
                        # Multi-view vertex undo
                        seg = self.segment_manager.segments[segment_index]
                        if "views" in seg and viewer_index in seg["views"]:
                            seg["views"][viewer_index]["vertices"][vertex_index] = (
                                old_pos
                            )
                        else:
                            seg["vertices"][vertex_index] = old_pos

                        self._update_multi_view_polygon_item(
                            segment_index, viewer_index
                        )
                        self._display_multi_view_edit_handles()
                        self._highlight_multi_view_selected_segments()
                    else:
                        # Single-view vertex undo
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
        elif action_type == "multi_view_polygon_point":
            viewer_index = last_action.get("viewer_index")
            if viewer_index is not None and hasattr(self, "multi_view_polygon_points"):
                # Remove the last point from the specific viewer
                if (
                    viewer_index < len(self.multi_view_polygon_points)
                    and self.multi_view_polygon_points[viewer_index]
                ):
                    self.multi_view_polygon_points[viewer_index].pop()

                    # Remove the visual dot from the scene
                    if hasattr(
                        self, "multi_view_polygon_preview_items"
                    ) and viewer_index < len(self.multi_view_polygon_preview_items):
                        preview_items = self.multi_view_polygon_preview_items[
                            viewer_index
                        ]
                        # Find and remove the last dot item
                        for item in reversed(preview_items):
                            if hasattr(item, "rect"):  # It's a dot/ellipse item
                                self.multi_view_viewers[
                                    viewer_index
                                ].scene().removeItem(item)
                                preview_items.remove(item)
                                break

                    # Redraw polygon preview for this viewer
                    self._draw_multi_view_polygon_preview(viewer_index)
                    self._show_notification("Undid: Add Multi-View Polygon Point")
            else:
                self._show_warning_notification(
                    "Cannot undo: Multi-view polygon data missing"
                )
                self.redo_history.pop()

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
            viewer_mode = last_action.get("viewer_mode", "single")

            if point_coords:
                pos = QPointF(point_coords[0], point_coords[1])

                if viewer_mode == "multi":
                    # Handle multi-view point redo
                    viewer_index = last_action.get("viewer_index")
                    if viewer_index is not None and hasattr(
                        self, "multi_view_mode_handler"
                    ):
                        # Use the multi-view handler to re-add the point
                        positive = point_type == "positive"
                        # Create a mock event for the handler
                        from PyQt6.QtCore import Qt

                        # Create mock event with the correct button
                        mock_event = type(
                            "MockEvent",
                            (),
                            {
                                "button": lambda: Qt.MouseButton.LeftButton
                                if positive
                                else Qt.MouseButton.RightButton
                            },
                        )()

                        self.multi_view_mode_handler.handle_ai_click(
                            pos, mock_event, viewer_index
                        )
                        self._show_notification(
                            f"Redid: Add Point (Viewer {viewer_index + 1})"
                        )
                else:
                    # Handle single-view point redo (existing logic)
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
            viewer_mode = last_action.get("viewer_mode", "single")
            viewer_index = last_action.get("viewer_index")

            if (
                segment_index is not None
                and vertex_index is not None
                and new_pos is not None
            ):
                if segment_index < len(self.segment_manager.segments):
                    if viewer_mode == "multi" and viewer_index is not None:
                        # Multi-view vertex redo
                        seg = self.segment_manager.segments[segment_index]
                        if "views" in seg and viewer_index in seg["views"]:
                            seg["views"][viewer_index]["vertices"][vertex_index] = (
                                new_pos
                            )
                        else:
                            seg["vertices"][vertex_index] = new_pos

                        self._update_multi_view_polygon_item(
                            segment_index, viewer_index
                        )
                        self._display_multi_view_edit_handles()
                        self._highlight_multi_view_selected_segments()
                    else:
                        # Single-view vertex redo
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
        elif action_type == "multi_view_polygon_point":
            viewer_index = last_action.get("viewer_index")
            point = last_action.get("point")
            if viewer_index is not None and point is not None:
                # Re-add the polygon point to the specific viewer
                self._handle_multi_view_polygon_click(point, viewer_index)
                self._show_notification("Redid: Add Multi-View Polygon Point")
            else:
                self._show_warning_notification(
                    "Cannot redo: Missing multi-view polygon data"
                )
                self.action_history.pop()
        else:
            self._show_warning_notification(
                f"Redo for action '{action_type}' not implemented."
            )
            # Remove from action history if we couldn't redo it
            self.action_history.pop()

    def clear_all_points(self):
        """Clear all temporary points - works in both single and multi-view mode."""
        if self.view_mode == "single":
            # Clear single view points
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

            # Also clear the stored preview mask
            if hasattr(self, "current_preview_mask"):
                self.current_preview_mask = None

        elif self.view_mode == "multi":
            # Clear multi-view polygon points
            if hasattr(self, "multi_view_polygon_points"):
                for i in range(len(self.multi_view_polygon_points)):
                    self._clear_multi_view_polygon(i)

            # Clear AI prediction previews and points
            if hasattr(self, "multi_view_mode_handler"):
                self.multi_view_mode_handler._clear_ai_previews()

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

    def _clear_notification(self):
        """Clear notification from status bar."""
        self.status_bar.clear_message()

    def _accept_ai_segment(self):
        """Accept the current AI segment preview (spacebar handler)."""
        logger.debug(f"_accept_ai_segment called - view_mode: {self.view_mode}")

        if self.view_mode == "single":
            # Single view mode - check for preview mask (both point-based and bbox)
            has_preview_item = (
                hasattr(self, "preview_mask_item") and self.preview_mask_item
            )
            has_preview_mask = (
                hasattr(self, "current_preview_mask")
                and self.current_preview_mask is not None
            )
            has_bbox_preview = (
                hasattr(self, "ai_bbox_preview_mask")
                and self.ai_bbox_preview_mask is not None
            )

            logger.debug(
                f"Single view - has_preview_item: {has_preview_item}, has_preview_mask: {has_preview_mask}, has_bbox_preview: {has_bbox_preview}"
            )

            # Handle bbox preview first
            if has_bbox_preview:
                filtered_mask = self._apply_fragment_threshold(
                    self.ai_bbox_preview_mask
                )
                if filtered_mask is not None:
                    # Create actual segment
                    new_segment = {
                        "type": "AI",
                        "mask": filtered_mask,
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

                    # Clear the bbox preview
                    self.ai_bbox_preview_mask = None
                    self.ai_bbox_preview_rect = None

                    # Clear preview
                    if has_preview_item:
                        self.viewer.scene().removeItem(self.preview_mask_item)
                        self.preview_mask_item = None

                    # Clear all points
                    self.clear_all_points()
                    self._update_all_lists()
                    self._show_success_notification("AI bounding box segment saved!")
                else:
                    self._show_warning_notification(
                        "All segments filtered out by fragment threshold"
                    )
            elif has_preview_item and has_preview_mask:
                # Apply fragment threshold filtering if enabled
                filtered_mask = self._apply_fragment_threshold(
                    self.current_preview_mask
                )
                if filtered_mask is not None:
                    # Create actual segment
                    new_segment = {
                        "type": "AI",
                        "mask": filtered_mask,
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

                    # Clear all points after accepting
                    self.clear_all_points()
                    self._update_all_lists()
                    self._show_notification("AI segment accepted")
                else:
                    self._show_warning_notification(
                        "All segments filtered out by fragment threshold"
                    )
                    # Only clear preview if we didn't accept
                    if has_preview_item and self.preview_mask_item.scene():
                        self.viewer.scene().removeItem(self.preview_mask_item)
                    self.preview_mask_item = None
                    self.current_preview_mask = None

        elif self.view_mode == "multi":
            # Multi-view mode - use the multi-view mode handler to save AI predictions
            if (
                hasattr(self, "multi_view_mode_handler")
                and self.multi_view_mode_handler
            ):
                self.multi_view_mode_handler.save_ai_predictions()
                self._show_notification("AI segment(s) accepted")
                return

            # Fallback to old logic if mode handler not available
            accepted_any = False

            if hasattr(self, "multi_view_preview_masks"):
                config = self._get_multi_view_config()
                num_viewers = config["num_viewers"]
                for i in range(num_viewers):
                    if (
                        i < len(self.multi_view_preview_masks)
                        and self.multi_view_preview_masks[i] is not None
                    ):
                        # Accept the preview for this viewer
                        mask = self.multi_view_preview_masks[i]

                        # Create actual segment
                        new_segment = {
                            "type": "AI",
                            "mask": mask,
                            # Let SegmentManager assign class_id automatically
                            "points": [],
                            "labels": [],
                        }

                        # Add to the main segment manager (same as single view)
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

                        # Clear the preview
                        if (
                            hasattr(self, "multi_view_preview_mask_items")
                            and i < len(self.multi_view_preview_mask_items)
                            and self.multi_view_preview_mask_items[i]
                        ):
                            viewer = self.multi_view_viewers[i]
                            viewer.scene().removeItem(
                                self.multi_view_preview_mask_items[i]
                            )
                            self.multi_view_preview_mask_items[i] = None

                        # Clear the stored mask
                        self.multi_view_preview_masks[i] = None

                        # Clear AI points for this viewer
                        if hasattr(self, "multi_view_point_items"):
                            for item in self.multi_view_point_items[i]:
                                viewer.scene().removeItem(item)
                            self.multi_view_point_items[i].clear()

                        if hasattr(self, "multi_view_positive_points"):
                            self.multi_view_positive_points[i].clear()
                        if hasattr(self, "multi_view_negative_points"):
                            self.multi_view_negative_points[i].clear()

                        accepted_any = True

            if accepted_any:
                self._show_success_notification("AI segment(s) accepted")
                self._update_all_lists()
            else:
                self._show_notification("No AI segment preview to accept")

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
        """Handle WASD pan keys - works in both single and multi-view mode."""
        if self.view_mode == "single":
            if not hasattr(self, "viewer"):
                return
            self._pan_viewer(self.viewer, direction)
        elif self.view_mode == "multi":
            # Pan all multi-view viewers
            if hasattr(self, "multi_view_viewers"):
                for viewer in self.multi_view_viewers:
                    if viewer:
                        self._pan_viewer(viewer, direction)

    def _pan_viewer(self, viewer, direction):
        """Pan a specific viewer in the given direction."""
        amount = int(viewer.height() * 0.1 * self.pan_multiplier)

        if direction == "up":
            viewer.verticalScrollBar().setValue(
                viewer.verticalScrollBar().value() - amount
            )
        elif direction == "down":
            viewer.verticalScrollBar().setValue(
                viewer.verticalScrollBar().value() + amount
            )
        elif direction == "left":
            amount = int(viewer.width() * 0.1 * self.pan_multiplier)
            viewer.horizontalScrollBar().setValue(
                viewer.horizontalScrollBar().value() - amount
            )
        elif direction == "right":
            amount = int(viewer.width() * 0.1 * self.pan_multiplier)
            viewer.horizontalScrollBar().setValue(
                viewer.horizontalScrollBar().value() + amount
            )

    def _handle_fit_view(self):
        """Handle fit view hotkey - works in both single and multi-view mode."""
        if self.view_mode == "single":
            if hasattr(self, "viewer"):
                self.viewer.fitInView()
        elif self.view_mode == "multi" and hasattr(self, "multi_view_viewers"):
            for viewer in self.multi_view_viewers:
                if viewer:
                    viewer.fitInView()

    def closeEvent(self, event):
        """Handle application close."""
        # Close any popped-out panels first
        if self.left_panel_popout is not None:
            self.left_panel_popout.close()
        if self.right_panel_popout is not None:
            self.right_panel_popout.close()

        # Clean up background workers
        self._cleanup_multi_view_workers()
        if self.image_discovery_worker:
            self.image_discovery_worker.stop()
            self.image_discovery_worker.quit()
            self.image_discovery_worker.wait()
            self.image_discovery_worker.deleteLater()

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

        # Reset AI mode state
        self.ai_click_start_pos = None
        self.ai_click_time = 0
        if hasattr(self, "ai_rubber_band_rect") and self.ai_rubber_band_rect:
            if self.ai_rubber_band_rect.scene():
                self.viewer.scene().removeItem(self.ai_rubber_band_rect)
            self.ai_rubber_band_rect = None

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

        # Add bounding box preview state
        self.ai_bbox_preview_mask = None
        self.ai_bbox_preview_rect = None

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
            elif event.button() == Qt.MouseButton.RightButton:
                self._add_point(pos, positive=False)
        elif self.mode == "ai":
            if event.button() == Qt.MouseButton.LeftButton:
                # AI mode: single click adds point, drag creates bounding box
                self.ai_click_start_pos = pos
                self.ai_click_time = (
                    event.timestamp() if hasattr(event, "timestamp") else 0
                )
                # We'll determine if it's a click or drag in mouse_release
            elif event.button() == Qt.MouseButton.RightButton:
                # Right-click adds negative point in AI mode
                self._add_point(pos, positive=False, update_segmentation=True)
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

        if (
            self.mode == "ai"
            and hasattr(self, "ai_click_start_pos")
            and self.ai_click_start_pos
        ):
            current_pos = event.scenePos()
            # Check if we've moved enough to consider this a drag
            drag_distance = (
                (current_pos.x() - self.ai_click_start_pos.x()) ** 2
                + (current_pos.y() - self.ai_click_start_pos.y()) ** 2
            ) ** 0.5

            if drag_distance > 5:  # Minimum drag distance
                # Create rubber band if not exists
                if (
                    not hasattr(self, "ai_rubber_band_rect")
                    or not self.ai_rubber_band_rect
                ):
                    self.ai_rubber_band_rect = QGraphicsRectItem()
                    self.ai_rubber_band_rect.setPen(
                        QPen(
                            Qt.GlobalColor.cyan,
                            self.line_thickness,
                            Qt.PenStyle.DashLine,
                        )
                    )
                    self.viewer.scene().addItem(self.ai_rubber_band_rect)

                # Update rubber band
                rect = QRectF(self.ai_click_start_pos, current_pos).normalized()
                self.ai_rubber_band_rect.setRect(rect)
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
        elif (
            self.mode == "ai"
            and hasattr(self, "ai_click_start_pos")
            and self.ai_click_start_pos
        ):
            current_pos = event.scenePos()
            # Calculate drag distance
            drag_distance = (
                (current_pos.x() - self.ai_click_start_pos.x()) ** 2
                + (current_pos.y() - self.ai_click_start_pos.y()) ** 2
            ) ** 0.5

            if (
                hasattr(self, "ai_rubber_band_rect")
                and self.ai_rubber_band_rect
                and drag_distance > 5
            ):
                # This was a drag - use SAM bounding box prediction
                rect = self.ai_rubber_band_rect.rect()
                self.viewer.scene().removeItem(self.ai_rubber_band_rect)
                self.ai_rubber_band_rect = None
                self.ai_click_start_pos = None

                if rect.width() > 10 and rect.height() > 10:  # Minimum box size
                    self._handle_ai_bounding_box(rect)
            else:
                # This was a click - add positive point
                self.ai_click_start_pos = None
                if hasattr(self, "ai_rubber_band_rect") and self.ai_rubber_band_rect:
                    self.viewer.scene().removeItem(self.ai_rubber_band_rect)
                    self.ai_rubber_band_rect = None

                self._add_point(current_pos, positive=True, update_segmentation=True)

            event.accept()
            return
        elif self.mode == "bbox" and self.rubber_band_rect:
            self.viewer.scene().removeItem(self.rubber_band_rect)
            rect = self.rubber_band_rect.rect()
            self.rubber_band_rect = None
            self.drag_start_pos = None

            if rect.width() >= 2 and rect.height() >= 2:
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

    def _handle_ai_bounding_box(self, rect):
        """Handle AI mode bounding box by using SAM's predict_from_box to create a preview."""
        # Ensure model is loaded (lazy loading)
        self._ensure_sam_updated()

        if not self.model_manager.is_model_available():
            self._show_warning_notification("AI model not available", 2000)
            return

        # Quick check - if currently updating, skip but don't block future attempts
        if self.sam_is_updating:
            self._show_warning_notification(
                "AI model is updating, please wait...", 2000
            )
            return

        # Convert QRectF to SAM box format [x1, y1, x2, y2]
        # COORDINATE TRANSFORMATION FIX: Use proper coordinate mapping based on operate_on_view setting
        from PyQt6.QtCore import QPointF

        top_left = QPointF(rect.left(), rect.top())
        bottom_right = QPointF(rect.right(), rect.bottom())

        sam_x1, sam_y1 = self._transform_display_coords_to_sam_coords(top_left)
        sam_x2, sam_y2 = self._transform_display_coords_to_sam_coords(bottom_right)

        box = [sam_x1, sam_y1, sam_x2, sam_y2]

        try:
            result = self.model_manager.sam_model.predict_from_box(box)
            if result is not None:
                mask, scores, logits = result

                # Ensure mask is boolean (SAM models can return float masks)
                if mask.dtype != bool:
                    mask = mask > 0.5  # Convert float mask to boolean

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

                # Store the preview mask and rect for later confirmation
                self.ai_bbox_preview_mask = mask
                self.ai_bbox_preview_rect = rect

                # Clear any existing preview
                if hasattr(self, "preview_mask_item") and self.preview_mask_item:
                    self.viewer.scene().removeItem(self.preview_mask_item)

                # Show preview with yellow color
                pixmap = mask_to_pixmap(mask, (255, 255, 0))
                self.preview_mask_item = self.viewer.scene().addPixmap(pixmap)
                self.preview_mask_item.setZValue(50)

                self._show_success_notification(
                    "AI bounding box preview ready - press Space to confirm!"
                )
            else:
                self._show_warning_notification("No prediction result from AI model")
        except Exception as e:
            logger.error(f"Error during AI bounding box prediction: {e}")
            self._show_error_notification("AI prediction failed")

    def _add_point(self, pos, positive, update_segmentation=True):
        """Add a point for SAM segmentation."""
        # Check if model is being initialized
        if self.single_view_model_initializing:
            self._show_notification("AI model is initializing, please wait...", 2000)
            return False

        # RACE CONDITION FIX: Block clicks during SAM updates
        if self.sam_is_updating:
            self._show_warning_notification(
                "AI model is updating, please wait...", 2000
            )
            return False

        # Ensure SAM is updated before using it
        self._ensure_sam_updated()

        # Check again if model initialization started
        if self.single_view_model_initializing:
            self._show_notification("AI model is initializing, please wait...", 2000)
            return False

        # Wait for SAM to finish updating if it started
        if self.sam_is_updating:
            self._show_warning_notification(
                "AI model is updating, please wait...", 2000
            )
            return False

        # COORDINATE TRANSFORMATION FIX: Use proper coordinate mapping based on operate_on_view setting
        sam_x, sam_y = self._transform_display_coords_to_sam_coords(pos)

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

        # Update segmentation if requested and not currently updating
        if update_segmentation and not self.sam_is_updating:
            self._update_segmentation()

        return True

    def _update_segmentation(self):
        """Update SAM segmentation preview."""
        if hasattr(self, "preview_mask_item") and self.preview_mask_item:
            self.viewer.scene().removeItem(self.preview_mask_item)
        if not self.positive_points or not self.model_manager.is_model_available():
            return

        result = self.model_manager.sam_model.predict(
            self.positive_points, self.negative_points
        )
        if result is not None:
            mask, scores, logits = result

            # Ensure mask is boolean (SAM models can return float masks)
            if mask.dtype != bool:
                mask = mask > 0.5  # Convert float mask to boolean

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

            # Store the current mask for potential acceptance via space bar
            self.current_preview_mask = mask

            pixmap = mask_to_pixmap(mask, (255, 255, 0))
            self.preview_mask_item = self.viewer.scene().addPixmap(pixmap)
            self.preview_mask_item.setZValue(50)

            # Show notification to user about spacebar
            self._show_notification("Press spacebar to accept AI segment suggestion")

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

    def update_multi_view_vertex_pos(
        self, segment_index, vertex_index, viewer_index, new_pos, record_undo=True
    ):
        """Update the position of a vertex in a polygon segment for multi-view mode."""
        seg = self.segment_manager.segments[segment_index]
        if seg.get("type") == "Polygon":
            # Get the appropriate vertices array for this viewer
            if "views" in seg and viewer_index in seg["views"]:
                vertices = seg["views"][viewer_index].get("vertices", [])
                old_pos = (
                    vertices[vertex_index] if vertex_index < len(vertices) else [0, 0]
                )

                if record_undo:
                    self.action_history.append(
                        {
                            "type": "move_vertex",
                            "viewer_mode": "multi",
                            "viewer_index": viewer_index,
                            "segment_index": segment_index,
                            "vertex_index": vertex_index,
                            "old_pos": [old_pos[0], old_pos[1]],
                            "new_pos": [new_pos.x(), new_pos.y()],
                        }
                    )
                    # Clear redo history when a new action is performed
                    self.redo_history.clear()

                # Update the vertex position
                seg["views"][viewer_index]["vertices"][vertex_index] = [
                    new_pos.x(),
                    new_pos.y(),
                ]

                # Sync to other viewers if this is a linked segment
                self._sync_multi_view_vertex_edit(
                    segment_index, vertex_index, viewer_index, new_pos
                )

            else:
                # Legacy format - update the main vertices array
                old_pos = seg["vertices"][vertex_index]

                if record_undo:
                    self.action_history.append(
                        {
                            "type": "move_vertex",
                            "viewer_mode": "multi",
                            "viewer_index": viewer_index,
                            "segment_index": segment_index,
                            "vertex_index": vertex_index,
                            "old_pos": [old_pos[0], old_pos[1]],
                            "new_pos": [new_pos.x(), new_pos.y()],
                        }
                    )
                    # Clear redo history when a new action is performed
                    self.redo_history.clear()

                seg["vertices"][vertex_index] = [
                    new_pos.x(),
                    new_pos.y(),
                ]

            # Update visual representation
            self._update_multi_view_polygon_item(segment_index, viewer_index)
            self._highlight_multi_view_selected_segments()

    def _sync_multi_view_vertex_edit(
        self, segment_index, vertex_index, source_viewer_index, new_pos
    ):
        """Sync a vertex edit from one viewer to other linked viewers."""
        seg = self.segment_manager.segments[segment_index]
        if "views" in seg:
            # Sync to other viewers with the same coordinates (for aligned images)
            for other_viewer_index in seg["views"]:
                if other_viewer_index != source_viewer_index and vertex_index < len(
                    seg["views"][other_viewer_index].get("vertices", [])
                ):
                    seg["views"][other_viewer_index]["vertices"][vertex_index] = [
                        new_pos.x(),
                        new_pos.y(),
                    ]

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

    def _handle_channel_threshold_changed(self):
        """Handle changes in channel thresholding - optimized to avoid unnecessary work."""
        # Handle multi-view mode
        if self.view_mode == "multi":
            # Check if any multi-view images are loaded
            if hasattr(self, "multi_view_images") and any(self.multi_view_images):
                self._apply_multi_view_image_processing_fast()

                # Mark multi-view SAM models as dirty if needed
                if self.settings.operate_on_view:
                    for i in range(len(self.multi_view_images)):
                        if self.multi_view_images[i]:
                            self._mark_multi_view_sam_dirty(i)
            return

        # Handle single-view mode
        if not self.current_image_path:
            return

        # Always update visuals immediately for responsive UI
        # Use combined method to handle both channel and FFT thresholding
        self._apply_image_processing_fast()

        # Mark SAM as dirty instead of updating immediately
        # Only update SAM when user actually needs it (enters SAM mode)
        if self.settings.operate_on_view:
            self._mark_sam_dirty()

    def _handle_fft_threshold_changed(self):
        """Handle changes in FFT thresholding."""
        # Handle multi-view mode
        if self.view_mode == "multi":
            # Check if any multi-view images are loaded
            if hasattr(self, "multi_view_images") and any(self.multi_view_images):
                self._apply_multi_view_image_processing_fast()

                # Mark multi-view SAM models as dirty if needed
                if self.settings.operate_on_view:
                    for i in range(len(self.multi_view_images)):
                        if self.multi_view_images[i]:
                            self._mark_multi_view_sam_dirty(i)
            return

        # Handle single-view mode
        if not self.current_image_path:
            return

        # Always update visuals immediately for responsive UI
        self._apply_image_processing_fast()

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

        if not self.current_image_path:
            return

        # Check if we need to load a different model
        model_available = self.model_manager.is_model_available()
        pending_model = getattr(self, "pending_custom_model_path", None)

        # If no model is available OR we have a pending custom model, start async loading
        if not model_available or pending_model:
            self._start_single_view_model_initialization()
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

        # IMPROVED: More robust worker thread cleanup
        if self.sam_worker_thread and self.sam_worker_thread.isRunning():
            self.sam_worker_thread.stop()
            self.sam_worker_thread.terminate()
            # Wait longer for proper cleanup
            self.sam_worker_thread.wait(5000)  # Wait up to 5 seconds
            if self.sam_worker_thread.isRunning():
                # Force kill if still running
                self.sam_worker_thread.quit()
                self.sam_worker_thread.wait(2000)

        # Clean up old worker thread
        if self.sam_worker_thread:
            self.sam_worker_thread.deleteLater()
            self.sam_worker_thread = None

        # Show status message
        if hasattr(self, "status_bar"):
            self.status_bar.show_message("Loading image into AI model...", 0)

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

        # Show completion message consistent with multi-view
        self._show_success_notification("AI model ready for prompting", duration=3000)

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

    def _start_single_view_model_initialization(self):
        """Start async model initialization for single-view mode."""
        if self.single_view_model_initializing:
            return

        # Clean up any existing worker
        if self.single_view_sam_init_worker:
            self.single_view_sam_init_worker.stop()
            self.single_view_sam_init_worker.deleteLater()
            self.single_view_sam_init_worker = None

        # Show status message
        self._show_notification("Initializing AI model...", 0)

        # Mark as initializing
        self.single_view_model_initializing = True

        # Create and start worker (use pending custom model if available)
        self.single_view_sam_init_worker = SingleViewSAMInitWorker(
            self.model_manager,
            self.settings.default_model_type,
            self.pending_custom_model_path,
        )

        # Connect signals
        self.single_view_sam_init_worker.model_initialized.connect(
            self._on_single_view_model_initialized
        )
        self.single_view_sam_init_worker.error.connect(self._on_single_view_model_error)
        self.single_view_sam_init_worker.progress.connect(
            self._on_single_view_model_progress
        )

        # Start the worker
        self.single_view_sam_init_worker.start()

    def _on_single_view_model_initialized(self, sam_model):
        """Handle successful model initialization."""
        self.single_view_model_initializing = False

        # Update status
        device_text = str(sam_model.device).upper()
        self.status_bar.set_permanent_message(f"Device: {device_text}")
        self._enable_sam_functionality(True)

        # Update UI to show which model is loaded
        if self.pending_custom_model_path:
            model_name = os.path.basename(self.pending_custom_model_path)
            self.control_panel.set_current_model(f"Loaded: {model_name}")
            # Clear the pending path since it's now loaded
            self.pending_custom_model_path = None
        else:
            self.control_panel.set_current_model("Current: Default SAM Model")

        # Clean up worker
        if self.single_view_sam_init_worker:
            self.single_view_sam_init_worker.deleteLater()
            self.single_view_sam_init_worker = None

        # Automatically start image loading now that model is ready
        self._ensure_sam_updated()

    def _on_single_view_model_error(self, error_message):
        """Handle model initialization error."""
        self.single_view_model_initializing = False

        # Show error and switch to polygon mode
        self._show_error_notification(f"AI model failed to load: {error_message}")
        self._enable_sam_functionality(False)
        self.set_polygon_mode()

        # Clean up worker
        if self.single_view_sam_init_worker:
            self.single_view_sam_init_worker.deleteLater()
            self.single_view_sam_init_worker = None

    def _on_single_view_model_progress(self, message):
        """Handle model initialization progress updates."""
        self._show_notification(message, 0)

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

        # Apply FFT thresholding if active (after channel thresholding)
        fft_widget = self.control_panel.get_fft_threshold_widget()
        if fft_widget and fft_widget.is_active():
            result_image = fft_widget.apply_fft_thresholding(result_image)

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

        # Include FFT threshold parameters in hash
        fft_widget = self.control_panel.get_fft_threshold_widget()
        if fft_widget and fft_widget.is_active():
            # Add FFT threshold parameters to hash
            params = str(fft_widget.get_settings()).encode()
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

    def _apply_image_processing_fast(self):
        """Apply all image processing (channel thresholding + FFT) using cached image data."""
        if not self.current_image_path:
            return

        # Get both widgets
        threshold_widget = self.control_panel.get_channel_threshold_widget()
        fft_widget = self.control_panel.get_fft_threshold_widget()

        # Check if any processing is active
        has_channel_threshold = (
            threshold_widget and threshold_widget.has_active_thresholding()
        )
        has_fft_threshold = fft_widget and fft_widget.is_active()

        # If no active processing, reload original image
        if not has_channel_threshold and not has_fft_threshold:
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

        # Start with cached original image
        processed_image = self._cached_original_image.copy()

        # Apply channel thresholding first if active
        if has_channel_threshold:
            processed_image = threshold_widget.apply_thresholding(processed_image)

        # Apply FFT thresholding second if active
        if has_fft_threshold:
            processed_image = fft_widget.apply_fft_thresholding(processed_image)

        # Convert back to QPixmap efficiently
        qimage = self._numpy_to_qimage(processed_image)
        processed_pixmap = QPixmap.fromImage(qimage)

        # Apply to viewer
        self.viewer.set_photo(processed_pixmap)
        self.viewer.set_image_adjustments(self.brightness, self.contrast, self.gamma)

        # Reapply crop overlays if they exist
        if self.current_crop_coords:
            self._apply_crop_to_image()

    def _apply_multi_view_image_processing_fast(self):
        """Apply all image processing (channel thresholding + FFT) to both multi-view viewers."""
        if not hasattr(self, "multi_view_images") or not any(self.multi_view_images):
            return

        # Get both widgets
        threshold_widget = self.control_panel.get_channel_threshold_widget()
        fft_widget = self.control_panel.get_fft_threshold_widget()

        # Check if any processing is active
        has_channel_threshold = (
            threshold_widget and threshold_widget.has_active_thresholding()
        )
        has_fft_threshold = fft_widget and fft_widget.is_active()

        # Process each viewer
        for i in range(len(self.multi_view_viewers)):
            if not self.multi_view_images[i]:
                continue

            # If no active processing, reload original image
            if not has_channel_threshold and not has_fft_threshold:
                self._reload_multi_view_original_image(i)
                continue

            # Use cached image array if available, otherwise load and cache
            if (
                not hasattr(self, "_cached_multi_view_original_images")
                or self._cached_multi_view_original_images is None
                or i >= len(self._cached_multi_view_original_images)
                or self._cached_multi_view_original_images[i] is None
            ):
                self._cache_multi_view_original_images()

            if (
                not hasattr(self, "_cached_multi_view_original_images")
                or self._cached_multi_view_original_images is None
                or i >= len(self._cached_multi_view_original_images)
                or self._cached_multi_view_original_images[i] is None
            ):
                continue

            # Start with cached original image
            processed_image = self._cached_multi_view_original_images[i].copy()

            # Apply channel thresholding first if active
            if has_channel_threshold:
                processed_image = threshold_widget.apply_thresholding(processed_image)

            # Apply FFT thresholding second if active
            if has_fft_threshold:
                processed_image = fft_widget.apply_fft_thresholding(processed_image)

            # Convert back to QPixmap efficiently
            qimage = self._numpy_to_qimage(processed_image)
            processed_pixmap = QPixmap.fromImage(qimage)

            # Apply to viewer
            self.multi_view_viewers[i].set_photo(processed_pixmap)
            self.multi_view_viewers[i].set_image_adjustments(
                self.brightness, self.contrast, self.gamma
            )

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

    def _cache_multi_view_original_images(self):
        """Cache the original images for both multi-view viewers as numpy arrays."""
        if not hasattr(self, "multi_view_images") or not self.multi_view_images:
            self._cached_multi_view_original_images = None
            return

        # Initialize cache array
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]
        self._cached_multi_view_original_images = [None] * num_viewers

        # Cache images for each viewer
        for i in range(len(self.multi_view_images)):
            if not self.multi_view_images[i]:
                continue

            # Load original image
            pixmap = QPixmap(self.multi_view_images[i])
            if pixmap.isNull():
                continue

            # Convert pixmap to numpy array
            qimage = pixmap.toImage()
            ptr = qimage.constBits()
            ptr.setsize(qimage.bytesPerLine() * qimage.height())
            image_np = np.array(ptr).reshape(qimage.height(), qimage.width(), 4)
            # Convert from BGRA to RGB
            self._cached_multi_view_original_images[i] = image_np[
                :, :, [2, 1, 0]
            ]  # BGR to RGB, ignore alpha

    def _reload_multi_view_original_image(self, viewer_index):
        """Reload original image for a specific multi-view viewer without processing."""
        if (
            not hasattr(self, "multi_view_images")
            or viewer_index >= len(self.multi_view_images)
            or not self.multi_view_images[viewer_index]
        ):
            return

        # Load and display original image
        pixmap = QPixmap(self.multi_view_images[viewer_index])
        if not pixmap.isNull():
            self.multi_view_viewers[viewer_index].set_photo(pixmap)
            self.multi_view_viewers[viewer_index].set_image_adjustments(
                self.brightness, self.contrast, self.gamma
            )

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

        # Update the FFT threshold widget
        self.control_panel.update_fft_threshold_for_image(image_array)

        # Auto-collapse FFT threshold panel if image is not black and white
        self.control_panel.auto_collapse_fft_threshold_for_image(image_array)

    def _update_multi_view_channel_threshold_for_images(self):
        """Update channel threshold widget for multi-view mode using the first valid image."""
        if not hasattr(self, "multi_view_images") or not any(self.multi_view_images):
            self.control_panel.update_channel_threshold_for_image(None)
            return

        # Find the first valid image
        first_image_path = None
        for image_path in self.multi_view_images:
            if image_path:
                first_image_path = image_path
                break

        if not first_image_path:
            self.control_panel.update_channel_threshold_for_image(None)
            return

        # Load and convert the first image to update the widget
        pixmap = QPixmap(first_image_path)
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

        # Update the FFT threshold widget
        self.control_panel.update_fft_threshold_for_image(image_array)

        # Auto-collapse FFT threshold panel if image is not black and white
        self.control_panel.auto_collapse_fft_threshold_for_image(image_array)

    # Border crop methods
    def _start_crop_drawing(self):
        """Start crop drawing mode."""
        if self.view_mode == "multi" and not any(self.multi_view_images):
            self.control_panel.set_crop_status("No images loaded in multi-view mode")
            self._show_warning_notification("No images loaded in multi-view mode")
            return

        self.crop_mode = True
        self._set_mode("crop")

        if self.view_mode == "multi":
            self.control_panel.set_crop_status(
                "Click and drag to draw crop rectangle (applies to both viewers)"
            )
            self._show_notification(
                "Click and drag to draw crop rectangle (applies to both viewers)"
            )
        else:
            self.control_panel.set_crop_status("Click and drag to draw crop rectangle")
            self._show_notification("Click and drag to draw crop rectangle")

    def _clear_crop(self):
        """Clear current crop."""
        self.current_crop_coords = None
        self.control_panel.clear_crop_coordinates()
        self._remove_crop_visual()

        if self.view_mode == "multi":
            # Clear crop for multi-view mode - check both images
            for _i, image_path in enumerate(self.multi_view_images):
                if image_path:
                    pixmap = QPixmap(image_path)
                    if not pixmap.isNull():
                        image_size = (pixmap.width(), pixmap.height())
                        if image_size in self.crop_coords_by_size:
                            del self.crop_coords_by_size[image_size]
            # Clear multi-view crop visual overlays
            self._remove_multi_view_crop_visual()
        else:
            # Single view mode
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
        if self.view_mode == "multi":
            # Multi-view mode
            if not any(self.multi_view_images):
                self.control_panel.set_crop_status(
                    "No images loaded in multi-view mode"
                )
                return

            # Round to nearest pixel
            x1, y1, x2, y2 = round(x1), round(y1), round(x2), round(y2)

            # Apply crop to all loaded images in multi-view
            applied_count = 0
            for _i, image_path in enumerate(self.multi_view_images):
                if image_path:
                    pixmap = QPixmap(image_path)
                    if not pixmap.isNull():
                        # Validate coordinates are within image bounds
                        img_width, img_height = pixmap.width(), pixmap.height()
                        adj_x1 = max(0, min(x1, img_width - 1))
                        adj_x2 = max(0, min(x2, img_width - 1))
                        adj_y1 = max(0, min(y1, img_height - 1))
                        adj_y2 = max(0, min(y2, img_height - 1))

                        # Ensure proper ordering
                        if adj_x1 > adj_x2:
                            adj_x1, adj_x2 = adj_x2, adj_x1
                        if adj_y1 > adj_y2:
                            adj_y1, adj_y2 = adj_y2, adj_y1

                        # Store crop coordinates for this image size
                        image_size = (img_width, img_height)
                        crop_coords = (adj_x1, adj_y1, adj_x2, adj_y2)
                        self.crop_coords_by_size[image_size] = crop_coords
                        applied_count += 1

            if applied_count > 0:
                # Store the original coordinates for display
                self.current_crop_coords = (x1, y1, x2, y2)

                # Update display coordinates
                self.control_panel.set_crop_coordinates(x1, y1, x2, y2)

                # Apply crop visual overlays to multi-view
                self._apply_multi_view_crop_to_images()
                self._show_notification(
                    f"Crop applied to {applied_count} images: {x1}:{x2}, {y1}:{y2}"
                )
            else:
                self.control_panel.set_crop_status("No valid images to apply crop")
        else:
            # Single view mode
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

    def _apply_multi_view_crop_to_images(self):
        """Apply crop visual overlays to all multi-view images."""
        if not self.current_crop_coords or self.view_mode != "multi":
            return

        for i in range(len(self.multi_view_viewers)):
            if i < len(self.multi_view_images) and self.multi_view_images[i]:
                self._add_multi_view_crop_visual_overlays(i)

    def _add_multi_view_crop_visual_overlays(self, viewer_index):
        """Add crop visual overlays to a specific multi-view viewer."""
        if not self.current_crop_coords or viewer_index >= len(self.multi_view_viewers):
            return

        image_path = self.multi_view_images[viewer_index]
        if not image_path:
            return

        viewer = self.multi_view_viewers[viewer_index]
        x1, y1, x2, y2 = self.current_crop_coords

        # Get image dimensions
        pixmap = QPixmap(image_path)
        if pixmap.isNull():
            return

        img_width, img_height = pixmap.width(), pixmap.height()

        # Validate coordinates are within image bounds
        x1 = max(0, min(x1, img_width - 1))
        x2 = max(0, min(x2, img_width - 1))
        y1 = max(0, min(y1, img_height - 1))
        y2 = max(0, min(y2, img_height - 1))

        # Import needed classes
        from PyQt6.QtCore import QRectF, Qt
        from PyQt6.QtGui import QBrush, QColor, QPen
        from PyQt6.QtWidgets import QGraphicsRectItem

        # Initialize multi-view crop overlays storage
        if not hasattr(self, "multi_view_crop_overlays"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_crop_overlays = {i: [] for i in range(num_viewers)}

        # Remove existing overlays for this viewer
        self._remove_multi_view_crop_visual_overlays(viewer_index)

        # Semi-transparent black color
        overlay_color = QColor(0, 0, 0, 120)

        # Top rectangle
        if y1 > 0:
            top_overlay = QGraphicsRectItem(QRectF(0, 0, img_width, y1))
            top_overlay.setBrush(QBrush(overlay_color))
            top_overlay.setPen(QPen(Qt.GlobalColor.transparent))
            top_overlay.setZValue(60)
            viewer.scene().addItem(top_overlay)
            self.multi_view_crop_overlays[viewer_index].append(top_overlay)

        # Bottom rectangle
        if y2 < img_height:
            bottom_overlay = QGraphicsRectItem(
                QRectF(0, y2, img_width, img_height - y2)
            )
            bottom_overlay.setBrush(QBrush(overlay_color))
            bottom_overlay.setPen(QPen(Qt.GlobalColor.transparent))
            bottom_overlay.setZValue(60)
            viewer.scene().addItem(bottom_overlay)
            self.multi_view_crop_overlays[viewer_index].append(bottom_overlay)

        # Left rectangle
        if x1 > 0:
            left_overlay = QGraphicsRectItem(QRectF(0, y1, x1, y2 - y1))
            left_overlay.setBrush(QBrush(overlay_color))
            left_overlay.setPen(QPen(Qt.GlobalColor.transparent))
            left_overlay.setZValue(60)
            viewer.scene().addItem(left_overlay)
            self.multi_view_crop_overlays[viewer_index].append(left_overlay)

        # Right rectangle
        if x2 < img_width:
            right_overlay = QGraphicsRectItem(QRectF(x2, y1, img_width - x2, y2 - y1))
            right_overlay.setBrush(QBrush(overlay_color))
            right_overlay.setPen(QPen(Qt.GlobalColor.transparent))
            right_overlay.setZValue(60)
            viewer.scene().addItem(right_overlay)
            self.multi_view_crop_overlays[viewer_index].append(right_overlay)

    def _remove_multi_view_crop_visual_overlays(self, viewer_index):
        """Remove crop visual overlays from a specific multi-view viewer."""
        if not hasattr(self, "multi_view_crop_overlays"):
            return

        if viewer_index in self.multi_view_crop_overlays:
            for overlay in self.multi_view_crop_overlays[viewer_index]:
                if overlay and overlay.scene():
                    overlay.scene().removeItem(overlay)
            self.multi_view_crop_overlays[viewer_index] = []

    def _remove_multi_view_crop_visual(self):
        """Remove all multi-view crop visual overlays."""
        if not hasattr(self, "multi_view_crop_overlays"):
            return

        for viewer_index in self.multi_view_crop_overlays:
            self._remove_multi_view_crop_visual_overlays(viewer_index)

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

    def _reset_sam_state_for_model_switch(self):
        """Reset SAM state completely when switching models to prevent worker thread conflicts."""

        # CRITICAL: Force terminate any running SAM worker thread
        if self.sam_worker_thread and self.sam_worker_thread.isRunning():
            self.sam_worker_thread.stop()
            self.sam_worker_thread.terminate()
            self.sam_worker_thread.wait(3000)  # Wait up to 3 seconds
            if self.sam_worker_thread.isRunning():
                # Force kill if still running
                self.sam_worker_thread.quit()
                self.sam_worker_thread.wait(1000)

        # Clean up worker thread reference
        if self.sam_worker_thread:
            self.sam_worker_thread.deleteLater()
            self.sam_worker_thread = None

        # Reset SAM update flags
        self.sam_is_updating = False
        self.sam_is_dirty = True  # Force update with new model
        self.current_sam_hash = None  # Invalidate cache
        self.sam_scale_factor = 1.0

        # Clear all points but preserve segments
        self.clear_all_points()
        # Note: Segments are preserved when switching models
        self._update_all_lists()

        # Clear preview items
        if hasattr(self, "preview_mask_item") and self.preview_mask_item:
            if self.preview_mask_item.scene():
                self.viewer.scene().removeItem(self.preview_mask_item)
            self.preview_mask_item = None

        # Clean up crop visuals
        self._remove_crop_visual()
        self._remove_crop_hover_overlay()
        self._remove_crop_hover_effect()

        # Reset crop state
        self.crop_mode = False
        self.crop_start_pos = None
        self.current_crop_coords = None

        # Reset AI mode state
        self.ai_click_start_pos = None
        self.ai_click_time = 0
        if hasattr(self, "ai_rubber_band_rect") and self.ai_rubber_band_rect:
            if self.ai_rubber_band_rect.scene():
                self.viewer.scene().removeItem(self.ai_rubber_band_rect)
            self.ai_rubber_band_rect = None

        # Clear all graphics items except the main image
        items_to_remove = [
            item
            for item in self.viewer.scene().items()
            if item is not self.viewer._pixmap_item
        ]
        for item in items_to_remove:
            self.viewer.scene().removeItem(item)

        # Reset all collections
        self.segment_items.clear()
        self.highlight_items.clear()
        self.action_history.clear()
        self.redo_history.clear()

        # Reset bounding box preview state
        self.ai_bbox_preview_mask = None
        self.ai_bbox_preview_rect = None

        # Clear status bar messages
        if hasattr(self, "status_bar"):
            self.status_bar.clear_message()

        # Redisplay segments after model switch to restore visual representation
        self._display_all_segments()

    def _transform_display_coords_to_sam_coords(self, pos):
        """Transform display coordinates to SAM model coordinates.

        When 'operate on view' is ON: SAM processes the displayed image
        When 'operate on view' is OFF: SAM processes the original image
        """
        if self.settings.operate_on_view:
            # Simple case: SAM processes the same image the user sees
            sam_x = int(pos.x() * self.sam_scale_factor)
            sam_y = int(pos.y() * self.sam_scale_factor)
        else:
            # Complex case: Map display coordinates to original image coordinates
            # then scale for SAM processing

            # Get displayed image dimensions (may include adjustments)
            if (
                not self.viewer._pixmap_item
                or self.viewer._pixmap_item.pixmap().isNull()
            ):
                # Fallback: use simple scaling
                sam_x = int(pos.x() * self.sam_scale_factor)
                sam_y = int(pos.y() * self.sam_scale_factor)
            else:
                display_width = self.viewer._pixmap_item.pixmap().width()
                display_height = self.viewer._pixmap_item.pixmap().height()

                # Get original image dimensions
                if not self.current_image_path:
                    # Fallback: use simple scaling
                    sam_x = int(pos.x() * self.sam_scale_factor)
                    sam_y = int(pos.y() * self.sam_scale_factor)
                else:
                    # Load original image to get true dimensions
                    original_pixmap = QPixmap(self.current_image_path)
                    if original_pixmap.isNull():
                        # Fallback: use simple scaling
                        sam_x = int(pos.x() * self.sam_scale_factor)
                        sam_y = int(pos.y() * self.sam_scale_factor)
                    else:
                        original_width = original_pixmap.width()
                        original_height = original_pixmap.height()

                        # Map display coordinates to original image coordinates
                        if display_width > 0 and display_height > 0:
                            original_x = pos.x() * (original_width / display_width)
                            original_y = pos.y() * (original_height / display_height)

                            # Apply SAM scale factor to original coordinates
                            sam_x = int(original_x * self.sam_scale_factor)
                            sam_y = int(original_y * self.sam_scale_factor)
                        else:
                            # Fallback: use simple scaling
                            sam_x = int(pos.x() * self.sam_scale_factor)
                            sam_y = int(pos.y() * self.sam_scale_factor)

        return sam_x, sam_y

    def _transform_multi_view_coords_to_sam_coords(self, pos, viewer_index):
        """Transform display coordinates to SAM model coordinates for multi-view mode."""
        if viewer_index >= len(self.multi_view_viewers):
            return pos.x(), pos.y()

        viewer = self.multi_view_viewers[viewer_index]

        if self.settings.operate_on_view:
            # Simple case: SAM processes the displayed image
            sam_x = int(pos.x() * self.sam_scale_factor)
            sam_y = int(pos.y() * self.sam_scale_factor)
        else:
            # Complex case: Map display coordinates to original image coordinates
            # Get displayed image dimensions for this specific viewer
            if not viewer._pixmap_item or viewer._pixmap_item.pixmap().isNull():
                # Fallback: use simple scaling
                sam_x = int(pos.x() * self.sam_scale_factor)
                sam_y = int(pos.y() * self.sam_scale_factor)
            else:
                # Calculate scaling factors for this viewer
                pixmap = viewer._pixmap_item.pixmap()
                scene_rect = viewer.sceneRect()

                # Scale factors (how much the image is scaled in the view)
                scale_x = (
                    pixmap.width() / scene_rect.width()
                    if scene_rect.width() > 0
                    else 1.0
                )
                scale_y = (
                    pixmap.height() / scene_rect.height()
                    if scene_rect.height() > 0
                    else 1.0
                )

                # Transform to original image coordinates
                orig_x = pos.x() * scale_x
                orig_y = pos.y() * scale_y

                # Scale for SAM processing
                sam_x = int(orig_x * self.sam_scale_factor)
                sam_y = int(orig_y * self.sam_scale_factor)

        return sam_x, sam_y

    def _on_view_mode_changed(self, index):
        """Handle switching between single and multi view modes."""
        if index == 0:  # Single view
            self.view_mode = "single"
            self._cleanup_multi_view_models()
            # Restore single view state
            self._restore_single_view_state()
        elif index == 1:  # Multi view
            # Check if we have a folder loaded
            if not hasattr(self, "file_model") or not self.file_model:
                self._show_warning_notification(
                    "Please open a folder with images first before using multi-view mode."
                )
                # Switch back to single view
                self.view_mode = "single"
                self.view_tab_widget.setCurrentIndex(0)
                return

            # Skip image count check during mode switching - let multi-view mode handle empty state
            # Images will be discovered in background if needed

            self.view_mode = "multi"

            # Initialize multi-view mode handler
            self.multi_view_mode_handler = MultiViewModeHandler(self)

            # Clean up single-view model to free memory
            self._cleanup_single_view_model()

            # Don't initialize models immediately - use lazy loading when AI mode is used
            self._setup_multi_view_mouse_events()

            # Load current image pair from file model position
            self._load_current_multi_view_pair_from_file_model()

    def _initialize_multi_view_models(self):
        """Initialize SAM model instances for multi-view mode using threading."""
        # Clear existing models and workers
        self._cleanup_multi_view_models()
        self._cleanup_multi_view_workers()

        # Create and start the initialization worker
        self.multi_view_init_worker = MultiViewSAMInitWorker(self.model_manager, self)

        # Connect signals
        self.multi_view_init_worker.model_initialized.connect(
            self._on_multi_view_model_initialized
        )
        self.multi_view_init_worker.all_models_initialized.connect(
            self._on_all_multi_view_models_initialized
        )
        self.multi_view_init_worker.error.connect(self._on_multi_view_init_error)
        self.multi_view_init_worker.progress.connect(self._on_multi_view_init_progress)

        # Start the worker
        self.multi_view_init_worker.start()

    def _on_multi_view_model_initialized(self, viewer_index, model_instance):
        """Handle individual model initialization completion."""
        # Ensure we have the right size list
        while len(self.multi_view_models) <= viewer_index:
            self.multi_view_models.append(None)

        # Place model at the correct index
        self.multi_view_models[viewer_index] = model_instance

    def _on_all_multi_view_models_initialized(self, total_models):
        """Handle completion of all multi-view model initialization."""
        # Clean up the worker
        if self.multi_view_init_worker:
            self.multi_view_init_worker.quit()
            self.multi_view_init_worker.wait()
            self.multi_view_init_worker.deleteLater()
            self.multi_view_init_worker = None

        # Track loading progress
        self._multi_view_loading_step = 0
        self._multi_view_total_steps = 0

        # Count steps needed
        for i in range(len(self.multi_view_models)):
            if self.multi_view_images[i] and self.multi_view_models[i]:
                self._multi_view_total_steps += 1

        if self._multi_view_total_steps > 0:
            self._show_notification("Loading images into AI models...", duration=0)
            # Mark all models as dirty first
            for i in range(len(self.multi_view_models)):
                if self.multi_view_images[i] and self.multi_view_models[i]:
                    self._mark_multi_view_sam_dirty(i)

            # Start sequential loading with the first model
            self._start_sequential_multi_view_sam_loading()
        else:
            self._show_success_notification(
                "AI models ready for prompting", duration=3000
            )

    def _start_sequential_multi_view_sam_loading(self):
        """Start loading images into SAM models sequentially to avoid resource conflicts."""
        # Check if any loading is already in progress to prevent duplicate workers
        any_updating = any(self.multi_view_models_updating)
        if any_updating:
            # Sequential loading already in progress, don't start another
            updating_indices = [
                i
                for i, updating in enumerate(self.multi_view_models_updating)
                if updating
            ]
            logger.debug(
                f"Sequential loading already in progress for viewers: {updating_indices}"
            )
            return

        # Find the next dirty model that needs updating
        for i in range(len(self.multi_view_models)):
            if (
                self.multi_view_images[i]
                and self.multi_view_models[i]
                and self.multi_view_models_dirty[i]
                and not self.multi_view_models_updating[i]
            ):
                # Start updating this model
                self._ensure_multi_view_sam_updated(i)
                return

        # If no more models to update, we're done
        if self._multi_view_loading_step >= self._multi_view_total_steps:
            self._show_success_notification(
                "AI models ready for prompting", duration=3000
            )

    def _on_multi_view_init_error(self, error_message):
        """Handle multi-view model initialization error."""
        self._show_error_notification(
            f"Failed to initialize AI models: {error_message}. Please check console for details.",
            duration=8000,
        )
        logger.error(f"Multi-view model initialization failed: {error_message}")
        logger.error(
            "Please ensure:\n1. Model files exist in models directory\n2. Sufficient GPU/CPU memory available\n3. PyTorch is properly installed"
        )

        self._cleanup_multi_view_models()

        # Clean up the worker
        if self.multi_view_init_worker:
            self.multi_view_init_worker.quit()
            self.multi_view_init_worker.wait()
            self.multi_view_init_worker.deleteLater()
            self.multi_view_init_worker = None

    def _on_multi_view_init_progress(self, current, total):
        """Handle multi-view model initialization progress."""
        self._show_notification(
            f"Loading AI model {current} of {total}...",
            duration=0,  # Persistent message
        )

    def _cleanup_multi_view_workers(self):
        """Clean up multi-view worker threads."""
        # Clean up init worker
        if self.multi_view_init_worker:
            self.multi_view_init_worker.stop()
            self.multi_view_init_worker.quit()
            self.multi_view_init_worker.wait(5000)  # Wait up to 5 seconds
            if self.multi_view_init_worker.isRunning():
                self.multi_view_init_worker.terminate()
                self.multi_view_init_worker.wait()
            self.multi_view_init_worker.deleteLater()
            self.multi_view_init_worker = None

        # Clean up update workers - use the actual list length to avoid index errors
        if hasattr(self, "multi_view_update_workers"):
            for i in range(len(self.multi_view_update_workers)):
                if (
                    i < len(self.multi_view_update_workers)
                    and self.multi_view_update_workers[i]
                ):
                    self.multi_view_update_workers[i].stop()
                    self.multi_view_update_workers[i].quit()
                    self.multi_view_update_workers[i].wait(5000)
                    if self.multi_view_update_workers[i].isRunning():
                        self.multi_view_update_workers[i].terminate()
                        self.multi_view_update_workers[i].wait()
                    self.multi_view_update_workers[i].deleteLater()
                    self.multi_view_update_workers[i] = None

        # Reset state with dynamic size
        if hasattr(self, "multi_view_models_updating"):
            self.multi_view_models_updating = [False] * len(
                self.multi_view_models_updating
            )

    def _mark_multi_view_sam_dirty(self, viewer_index):
        """Mark multi-view SAM model as dirty (needs image update)."""
        if 0 <= viewer_index < len(self.multi_view_models_dirty):
            self.multi_view_models_dirty[viewer_index] = True

    def _ensure_multi_view_sam_updated(self, viewer_index):
        """Ensure multi-view SAM model is updated for the given viewer."""
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]
        if not (0 <= viewer_index < num_viewers):
            return

        if not self.multi_view_models_dirty[viewer_index]:
            return  # Already up to date

        if self.multi_view_models_updating[viewer_index]:
            return  # Already updating

        if viewer_index >= len(self.multi_view_models):
            return  # No model available for this viewer

        image_path = self.multi_view_images[viewer_index]
        if not image_path:
            return  # No image loaded for this viewer

        # Mark as updating
        self.multi_view_models_updating[viewer_index] = True

        logger.debug(f"Starting SAM image loading worker for viewer {viewer_index + 1}")

        # Show enumerated progress notification
        image_name = Path(image_path).name if image_path else "unknown"
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]
        self._show_notification(
            f"Computing embeddings for image {viewer_index + 1}/{num_viewers}: {image_name}",
            duration=0,  # Persistent until completion
        )

        # Get current modified image if operate_on_view is enabled
        current_image = None
        if self.settings.operate_on_view:
            current_image = self._get_multi_view_modified_image(viewer_index)

        # Create and start update worker with timeout
        self.multi_view_update_workers[viewer_index] = MultiViewSAMUpdateWorker(
            viewer_index,
            self.multi_view_models[viewer_index],
            image_path,
            self.settings.operate_on_view,
            current_image,
            self,
        )

        # Connect signals
        self.multi_view_update_workers[viewer_index].finished.connect(
            self._on_multi_view_sam_update_finished
        )
        self.multi_view_update_workers[viewer_index].error.connect(
            self._on_multi_view_sam_update_error
        )

        # Start the worker
        self.multi_view_update_workers[viewer_index].start()

        # Add timeout mechanism to prevent hanging (30 seconds)
        timeout_timer = QTimer()
        timeout_timer.setSingleShot(True)
        timeout_timer.timeout.connect(
            lambda: self._on_multi_view_sam_timeout(viewer_index, timeout_timer)
        )
        timeout_timer.start(60000)  # 60 seconds timeout (increased for 4-view mode)

        # Store timer reference to clean up later
        if not hasattr(self, "multi_view_update_timers"):
            self.multi_view_update_timers = {}
        self.multi_view_update_timers[viewer_index] = timeout_timer

    def _on_multi_view_sam_timeout(self, viewer_index, timer):
        """Handle SAM model update timeout."""
        logger.warning(f"SAM model update timeout for viewer {viewer_index + 1}")

        # Stop and clean up the worker safely
        if self.multi_view_update_workers[viewer_index]:
            self.multi_view_update_workers[viewer_index].stop()
            self.multi_view_update_workers[viewer_index].quit()

            # Give the worker time to finish gracefully
            if self.multi_view_update_workers[viewer_index].wait(
                3000
            ):  # Wait up to 3 seconds
                # Worker finished gracefully
                self.multi_view_update_workers[viewer_index].deleteLater()
                self.multi_view_update_workers[viewer_index] = None
            else:
                # Worker is stuck - don't force terminate to avoid crashes
                # Just mark it as None and let garbage collection handle it eventually
                logger.warning(
                    f"Worker for viewer {viewer_index + 1} did not respond to stop request"
                )
                self.multi_view_update_workers[viewer_index] = None

        # Clean up timer
        timer.stop()
        timer.deleteLater()
        if (
            hasattr(self, "multi_view_update_timers")
            and viewer_index in self.multi_view_update_timers
        ):
            del self.multi_view_update_timers[viewer_index]

        # Mark as not updating and not dirty to prevent retry loops
        self.multi_view_models_updating[viewer_index] = False
        self.multi_view_models_dirty[viewer_index] = False

        # Show timeout error
        self._show_error_notification(
            f"AI model {viewer_index + 1} loading timed out after 30 seconds",
            duration=8000,
        )

        # Update progress and continue with next model
        if hasattr(self, "_multi_view_loading_step"):
            self._multi_view_loading_step += 1

        # Continue sequential loading
        self._start_sequential_multi_view_sam_loading()

    def _on_multi_view_sam_update_finished(self, viewer_index):
        """Handle completion of multi-view SAM model update."""
        self.multi_view_models_dirty[viewer_index] = False
        self.multi_view_models_updating[viewer_index] = False

        # Show completion notification
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]
        self._show_notification(
            f"Embeddings computed for image {viewer_index + 1}/{num_viewers} ✓",
            duration=1000,
        )

        # Clean up timeout timer
        if (
            hasattr(self, "multi_view_update_timers")
            and viewer_index in self.multi_view_update_timers
        ):
            self.multi_view_update_timers[viewer_index].stop()
            self.multi_view_update_timers[viewer_index].deleteLater()
            del self.multi_view_update_timers[viewer_index]

        # Clean up worker
        if self.multi_view_update_workers[viewer_index]:
            self.multi_view_update_workers[viewer_index].quit()
            self.multi_view_update_workers[viewer_index].wait()
            self.multi_view_update_workers[viewer_index].deleteLater()
            self.multi_view_update_workers[viewer_index] = None

        # Update progress
        if hasattr(self, "_multi_view_loading_step"):
            self._multi_view_loading_step += 1
            if self._multi_view_loading_step < self._multi_view_total_steps:
                self._show_notification(
                    f"Loading image {self._multi_view_loading_step + 1} of {self._multi_view_total_steps}...",
                    duration=0,
                )

        # Continue sequential loading of the next SAM model
        self._start_sequential_multi_view_sam_loading()

    def _on_multi_view_sam_update_error(self, viewer_index, error_message):
        """Handle multi-view SAM model update error."""
        self.multi_view_models_updating[viewer_index] = False
        self.multi_view_models_dirty[viewer_index] = False  # Prevent retry loops

        # Clean up timeout timer
        if (
            hasattr(self, "multi_view_update_timers")
            and viewer_index in self.multi_view_update_timers
        ):
            self.multi_view_update_timers[viewer_index].stop()
            self.multi_view_update_timers[viewer_index].deleteLater()
            del self.multi_view_update_timers[viewer_index]

        # Show error notification
        self._show_error_notification(
            f"Failed to load image into AI model {viewer_index + 1}: {error_message}",
            duration=8000,
        )
        logger.error(
            f"Multi-view SAM update failed for viewer {viewer_index + 1}: {error_message}"
        )

        # Clean up worker
        if self.multi_view_update_workers[viewer_index]:
            self.multi_view_update_workers[viewer_index].quit()
            self.multi_view_update_workers[viewer_index].wait()
            self.multi_view_update_workers[viewer_index].deleteLater()
            self.multi_view_update_workers[viewer_index] = None

        # Update progress even on error
        if hasattr(self, "_multi_view_loading_step"):
            self._multi_view_loading_step += 1

        # Continue sequential loading even if this model failed
        self._start_sequential_multi_view_sam_loading()

    def _cleanup_multi_view_models(self):
        """Clean up multi-view model instances."""
        # Clean up worker threads first
        self._cleanup_multi_view_workers()

        # Clean up model instances
        for model in self.multi_view_models:
            if hasattr(model, "model") and model.model:
                del model.model
            del model
        self.multi_view_models.clear()

        # Clear GPU memory
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass

    def _cleanup_single_view_model(self):
        """Clean up single-view model instance to free memory when switching to multi-view."""
        if hasattr(self.model_manager, "sam_model") and self.model_manager.sam_model:
            # Clear the model
            if (
                hasattr(self.model_manager.sam_model, "model")
                and self.model_manager.sam_model.model
            ):
                del self.model_manager.sam_model.model
            del self.model_manager.sam_model
            self.model_manager.sam_model = None

            # Clear GPU memory
            try:
                import torch

                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass

            self._show_notification("Single-view model cleaned up to free memory")

    def _get_multi_view_modified_image(self, viewer_index):
        """Get the current modified image for a specific viewer in multi-view mode."""
        if not hasattr(self, "multi_view_viewers") or viewer_index >= len(
            self.multi_view_viewers
        ):
            return None

        viewer = self.multi_view_viewers[viewer_index]

        # Use the adjusted pixmap (includes brightness/contrast/gamma) like single-view mode
        if (
            hasattr(viewer, "_adjusted_pixmap")
            and viewer._adjusted_pixmap is not None
            and not viewer._adjusted_pixmap.isNull()
        ):
            # Convert adjusted pixmap to numpy array (same as single-view operate_on_view)
            qimage = viewer._adjusted_pixmap.toImage()
            ptr = qimage.constBits()
            ptr.setsize(qimage.bytesPerLine() * qimage.height())
            image_np = np.array(ptr).reshape(qimage.height(), qimage.width(), 4)
            # Convert from BGRA to BGR for consistency with _original_image_bgr
            result_image = cv2.cvtColor(image_np, cv2.COLOR_BGRA2BGR)
        elif (
            hasattr(viewer, "_original_image_bgr")
            and viewer._original_image_bgr is not None
        ):
            # Fallback to original image if no adjusted pixmap
            result_image = viewer._original_image_bgr.copy()
        else:
            return None

        # Apply channel thresholding if active (same logic as single-view)
        threshold_widget = self.control_panel.get_channel_threshold_widget()
        if threshold_widget and threshold_widget.has_active_thresholding():
            result_image = threshold_widget.apply_thresholding(result_image)

        # Apply FFT processing if active (same logic as single-view)
        fft_widget = self.control_panel.get_fft_threshold_widget()
        if fft_widget and fft_widget.is_active():
            result_image = fft_widget.apply_fft_thresholding(result_image)

        return result_image

    def _restore_single_view_state(self):
        """Restore single view state when switching back from multi-view."""
        # Clear multi-view state
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]
        self.multi_view_images = [None] * num_viewers
        self.multi_view_segments = [[] for _ in range(num_viewers)]
        self.multi_view_linked = [True] * num_viewers
        self._last_multi_view_images = [None] * num_viewers

        # Clear multi-view polygon state
        for i in range(num_viewers):
            self._clear_multi_view_polygon(i)

        # Clear any multi-view specific state
        if hasattr(self, "multi_view_polygon_points"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_polygon_points = [[] for _ in range(num_viewers)]
        if hasattr(self, "multi_view_polygon_lines"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_polygon_lines = [[] for _ in range(num_viewers)]
        if hasattr(self, "multi_view_bbox_starts"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_bbox_starts = [None] * num_viewers
        if hasattr(self, "multi_view_bbox_rects"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_bbox_rects = [None] * num_viewers

        # Clean up mode handler
        if hasattr(self, "multi_view_mode_handler"):
            self.multi_view_mode_handler = None

        # Mark SAM as dirty to trigger lazy loading when needed
        self.sam_is_dirty = True

        # Clear multi-view viewers
        for viewer in self.multi_view_viewers:
            viewer.set_photo(QPixmap())
            viewer.scene().clear()

        # Restore current image to single viewer if available
        if self.current_image_path:
            pixmap = QPixmap(self.current_image_path)
            if not pixmap.isNull():
                self.viewer.set_photo(pixmap)
                self.viewer.set_image_adjustments(
                    self.brightness, self.contrast, self.gamma
                )

                # Load existing segments for the current image
                print(f"Loading segments for single-view: {self.current_image_path}")
                try:
                    # Clear any leftover multi-view segments first
                    self.segment_manager.clear()

                    # Load segments and class aliases for the current image
                    self.file_manager.load_class_aliases(self.current_image_path)
                    self.file_manager.load_existing_mask(self.current_image_path)

                    # Remove any multi-view tags that shouldn't be in single-view
                    for segment in self.segment_manager.segments:
                        segment.pop("_source_viewer", None)

                    # Update UI lists
                    self._update_all_lists()

                except Exception as e:
                    print(f"Error loading segments for single-view: {e}")

                # Redisplay segments for single view
                if hasattr(self, "single_view_mode_handler"):
                    self.single_view_mode_handler.display_all_segments()

        # Clear info labels
        if hasattr(self, "multi_view_info_labels"):
            for label in self.multi_view_info_labels:
                label.setText("Image: No image loaded")

        # Re-enable thresholding if it was disabled
        if hasattr(self.control_panel, "border_crop_widget"):
            self.control_panel.border_crop_widget.enable_thresholding()

    def _toggle_multi_view_link(self, image_index):
        """Toggle the link status for a specific image in multi-view."""
        if 0 <= image_index < 2:
            self.multi_view_linked[image_index] = not self.multi_view_linked[
                image_index
            ]

            # Update button appearance
            button = self.multi_view_unlink_buttons[image_index]
            if self.multi_view_linked[image_index]:
                button.setText("X")
                button.setToolTip("Unlink this image from mirroring")
                button.setStyleSheet("")
            else:
                button.setText("↪")
                button.setToolTip("Link this image to mirroring")
                button.setStyleSheet("background-color: #ffcccc;")

    def _start_background_image_discovery(self):
        """Start background discovery of all image files."""
        if (
            self.images_discovery_in_progress
            or not hasattr(self, "file_model")
            or not self.file_model
        ):
            return

        self.images_discovery_in_progress = True

        # Clean up any existing discovery worker
        if self.image_discovery_worker:
            self.image_discovery_worker.stop()
            self.image_discovery_worker.quit()
            self.image_discovery_worker.wait()
            self.image_discovery_worker.deleteLater()

        # Start new discovery worker
        self.image_discovery_worker = ImageDiscoveryWorker(
            self.file_model, self.file_manager, self
        )
        self.image_discovery_worker.images_discovered.connect(
            self._on_images_discovered
        )
        self.image_discovery_worker.progress.connect(self._on_image_discovery_progress)
        self.image_discovery_worker.error.connect(self._on_image_discovery_error)
        self.image_discovery_worker.start()

    def _on_images_discovered(self, images_list):
        """Handle completion of background image discovery."""
        self.cached_image_paths = images_list
        self.images_discovery_in_progress = False

        # Clean up worker
        if self.image_discovery_worker:
            self.image_discovery_worker.quit()
            self.image_discovery_worker.wait()
            self.image_discovery_worker.deleteLater()
            self.image_discovery_worker = None

        # If we're in multi-view mode and no images are loaded, try loading now
        if self.view_mode == "multi" and not any(self.multi_view_images):
            self._load_current_multi_view_pair_from_file_model()

        # Don't show notification - image discovery happens in background

    def _on_image_discovery_progress(self, message):
        """Handle image discovery progress updates."""
        self._show_notification(message)

    def _on_image_discovery_error(self, error_message):
        """Handle image discovery errors."""
        self.images_discovery_in_progress = False
        self._show_error_notification(f"Image discovery failed: {error_message}")

        # Clean up worker
        if self.image_discovery_worker:
            self.image_discovery_worker.quit()
            self.image_discovery_worker.wait()
            self.image_discovery_worker.deleteLater()
            self.image_discovery_worker = None

    def _load_current_multi_view_pair_from_file_model(self):
        """Load current images from cached list position for multi-view mode."""
        if not self.current_file_index.isValid() or not self.cached_image_paths:
            return

        # Get current image path
        current_path = self.file_model.filePath(self.current_file_index)
        if not (
            os.path.isfile(current_path)
            and self.file_manager.is_image_file(current_path)
        ):
            return

        # Find current image position in cached list
        try:
            current_index = self.cached_image_paths.index(current_path)
        except ValueError:
            # Current image not in cached list, use file model approach as fallback
            next_path = self._get_next_image_from_file_model(self.current_file_index)
            self._load_multi_view_pair(current_path, next_path)
            return

        # Get the number of viewers for multi-view mode
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]

        # Collect consecutive images
        image_paths = []
        for i in range(num_viewers):
            if current_index + i < len(self.cached_image_paths):
                image_paths.append(self.cached_image_paths[current_index + i])
            else:
                image_paths.append(None)

        # Load all images
        self._load_multi_view_images(image_paths)

    def _load_next_multi_batch(self):
        """Load the next batch of images using cached list."""
        if not self.current_file_index.isValid():
            return

        # Auto-save if enabled and we have current images (not the first load)
        if self.multi_view_images[0] and self.control_panel.get_settings().get(
            "auto_save", True
        ):
            self._save_multi_view_output()

        # If cached list isn't ready, fall back to file model navigation
        if not self.cached_image_paths:
            self._load_next_multi_batch_fallback()
            return

        # Get current image path
        current_path = self.file_model.filePath(self.current_file_index)

        # Find current position in cached list
        try:
            current_index = self.cached_image_paths.index(current_path)
        except ValueError:
            # Current image not in cached list, use fallback
            self._load_next_multi_batch_fallback()
            return

        # Get the number of viewers for multi-view mode
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]

        # Skip num_viewers positions ahead in cached list
        target_index = current_index + num_viewers

        if target_index < len(self.cached_image_paths):
            # Collect consecutive images
            image_paths = []
            for i in range(num_viewers):
                if target_index + i < len(self.cached_image_paths):
                    image_paths.append(self.cached_image_paths[target_index + i])
                else:
                    image_paths.append(None)

            # Load all images
            self._load_multi_view_images(image_paths)

            # Update current file index to the first image of the new batch
            # Find the file model index for this path
            if image_paths and image_paths[0]:
                parent_index = self.current_file_index.parent()
                for row in range(self.file_model.rowCount(parent_index)):
                    index = self.file_model.index(row, 0, parent_index)
                    if self.file_model.filePath(index) == image_paths[0]:
                        self.current_file_index = index
                        self.right_panel.file_tree.setCurrentIndex(index)
                        break

    def _load_previous_multi_batch(self):
        """Load the previous batch of images using cached list."""
        if not self.current_file_index.isValid():
            return

        # Auto-save if enabled and we have current images (not the first load)
        if self.multi_view_images[0] and self.control_panel.get_settings().get(
            "auto_save", True
        ):
            self._save_multi_view_output()

        # If cached list isn't ready, fall back to file model navigation
        if not self.cached_image_paths:
            self._load_previous_multi_batch_fallback()
            return

        # Get current image path
        current_path = self.file_model.filePath(self.current_file_index)

        # Find current position in cached list
        try:
            current_index = self.cached_image_paths.index(current_path)
        except ValueError:
            # Current image not in cached list, use fallback
            self._load_previous_multi_batch_fallback()
            return

        # Get the number of viewers for multi-view mode
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]

        # Skip num_viewers positions back in cached list
        target_index = current_index - num_viewers
        if target_index < 0:
            return  # Can't go back further

        # Collect consecutive images
        image_paths = []
        for i in range(num_viewers):
            if target_index + i < len(self.cached_image_paths):
                image_paths.append(self.cached_image_paths[target_index + i])
            else:
                image_paths.append(None)

        # Load all images
        self._load_multi_view_images(image_paths)

        # Update current file index to the first image of the new batch
        # Find the file model index for this path
        if image_paths and image_paths[0]:
            parent_index = self.current_file_index.parent()
            for row in range(self.file_model.rowCount(parent_index)):
                index = self.file_model.index(row, 0, parent_index)
                if self.file_model.filePath(index) == image_paths[0]:
                    self.current_file_index = index
                    self.right_panel.file_tree.setCurrentIndex(index)
                    break

    def _load_next_multi_batch_fallback(self):
        """Fallback navigation using file model when cached list isn't available."""
        # Auto-save if enabled and we have current images (not the first load)
        if self.multi_view_images[0] and self.control_panel.get_settings().get(
            "auto_save", True
        ):
            self._save_multi_view_output()

        parent_index = self.current_file_index.parent()
        current_row = self.current_file_index.row()

        # Get the number of viewers for multi-view mode
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]

        # Skip num_viewers positions ahead and get images from there
        target_row = current_row + num_viewers
        images = []

        for row in range(target_row, self.file_model.rowCount(parent_index)):
            if len(images) >= num_viewers:
                break
            index = self.file_model.index(row, 0, parent_index)
            if index.isValid():
                path = self.file_model.filePath(index)
                if os.path.isfile(path) and self.file_manager.is_image_file(path):
                    images.append(path)

        if images:
            # Pad with None if not enough images
            while len(images) < num_viewers:
                images.append(None)
            # Load the images
            self._load_multi_view_images(images)

            # Update current file index to the first image of the new batch
            for row in range(self.file_model.rowCount(parent_index)):
                index = self.file_model.index(row, 0, parent_index)
                if self.file_model.filePath(index) == images[0]:
                    self.current_file_index = index
                    self.right_panel.file_tree.setCurrentIndex(index)
                    break

    def _load_previous_multi_batch_fallback(self):
        """Fallback navigation using file model when cached list isn't available."""
        # Auto-save if enabled and we have current images (not the first load)
        if self.multi_view_images[0] and self.control_panel.get_settings().get(
            "auto_save", True
        ):
            self._save_multi_view_output()

        parent_index = self.current_file_index.parent()
        current_row = self.current_file_index.row()

        # Get the number of viewers for multi-view mode
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]

        # Skip num_viewers positions back and get consecutive images from there
        target_row = current_row - num_viewers
        if target_row < 0:
            return  # Can't go back further

        images = []

        # Get consecutive images starting from target_row going forward
        for row in range(target_row, self.file_model.rowCount(parent_index)):
            if len(images) >= num_viewers:
                break
            index = self.file_model.index(row, 0, parent_index)
            if index.isValid():
                path = self.file_model.filePath(index)
                if os.path.isfile(path) and self.file_manager.is_image_file(path):
                    images.append(path)

        if images:
            # Pad with None if not enough images
            while len(images) < num_viewers:
                images.append(None)
            # Load the images
            self._load_multi_view_images(images)

            # Update current file index to the first image of the new batch
            for row in range(self.file_model.rowCount(parent_index)):
                index = self.file_model.index(row, 0, parent_index)
                if self.file_model.filePath(index) == images[0]:
                    self.current_file_index = index
                    self.right_panel.file_tree.setCurrentIndex(index)
                    break

    def _update_multi_view_navigation_state(self):
        """Update multi-view navigation button states and batch info without folder scan."""
        if not self.current_file_index.isValid():
            return

    def _update_file_tree_selection_for_multi_view(self):
        """Update file tree selection to reflect the first image in the current multi-view batch."""
        if not hasattr(self, "multi_view_images") or not self.multi_view_images[0]:
            return

        # Get the path of the first image in the current batch
        first_image_path = self.multi_view_images[0]

        # Find the corresponding index in the file model directly without full scan
        if os.path.exists(first_image_path):
            # Find the file model index for this path directly
            parent = self.file_model.index(os.path.dirname(first_image_path))
            for row in range(self.file_model.rowCount(parent)):
                index = self.file_model.index(row, 0, parent)
                if self.file_model.filePath(index) == first_image_path:
                    self.current_file_index = index
                    self.right_panel.file_tree.setCurrentIndex(index)
                    break

    def _get_active_viewer(self):
        """Get the currently active viewer based on view mode."""
        if self.view_mode == "single":
            return self.viewer
        else:
            # In multi-view, return the first linked viewer as primary
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            for i in range(num_viewers):
                if self.multi_view_linked[i] and self.multi_view_images[i]:
                    return self.multi_view_viewers[i]
            return self.multi_view_viewers[0]  # Fallback to first viewer

    def _multi_view_mouse_press(self, event, viewer_index):
        """Handle mouse press event in multi-view mode."""
        if self.view_mode != "multi":
            return

        # Check if clicking on a vertex handle
        viewer = self.multi_view_viewers[viewer_index]
        view_pos = viewer.mapFromScene(event.scenePos())
        items_at_pos = viewer.items(view_pos)
        handle_items = [
            item
            for item in items_at_pos
            if isinstance(item, EditableVertexItem | MultiViewEditableVertexItem)
        ]
        is_handle_click = len(handle_items) > 0

        # Allow vertex handles to process their own mouse events
        if is_handle_click:
            # Track that we're starting a handle drag operation
            if not hasattr(self, "multi_view_handle_dragging"):
                config = self._get_multi_view_config()
                num_viewers = config["num_viewers"]
                self.multi_view_handle_dragging = [False] * num_viewers
            self.multi_view_handle_dragging[viewer_index] = True

            # Call the original scene mouse handler to let items process the event
            original_handler = getattr(
                viewer.scene(), f"_original_mouse_press_{viewer_index}", None
            )
            if original_handler:
                original_handler(event)
            return

        # Handle crop mode drawing
        if self.mode == "crop" and event.button() == Qt.MouseButton.LeftButton:
            self._handle_multi_view_crop_start(event, viewer_index)
            return

        # Handle the event for the source viewer first
        if self.multi_view_linked[viewer_index]:
            self._handle_multi_view_action(event, viewer_index, "press")

        # Don't mirror polygon or selection clicks (allow manual cross-viewer placement/selection)
        # Mirror other modes to both viewers
        if self.mode not in ["polygon", "selection"]:
            # Mirror to other linked viewers
            for i, _viewer in enumerate(self.multi_view_viewers):
                if (
                    i != viewer_index
                    and self.multi_view_linked[i]
                    and self.multi_view_images[i]
                ):
                    self._mirror_mouse_action(event, i, "press")

    def _multi_view_mouse_move(self, event, viewer_index):
        """Handle mouse move event in multi-view mode."""
        if self.view_mode != "multi":
            return

        # If we're currently dragging a handle, pass through to original handler
        if (
            hasattr(self, "multi_view_handle_dragging")
            and self.multi_view_handle_dragging[viewer_index]
        ):
            viewer = self.multi_view_viewers[viewer_index]
            original_handler = getattr(
                viewer.scene(), f"_original_mouse_move_{viewer_index}", None
            )
            if original_handler:
                original_handler(event)
            return

        # Check if mouse has left the current viewer's bounds
        viewer = self.multi_view_viewers[viewer_index]
        scene_pos = event.scenePos()
        view_pos = viewer.mapFromScene(scene_pos)
        viewer_rect = viewer.viewport().rect()

        # Convert QPointF to QPoint for contains check
        view_point = view_pos.toPoint() if hasattr(view_pos, "toPoint") else view_pos

        # Handle crop mode drawing
        if self.mode == "crop":
            self._handle_multi_view_crop_move(event, viewer_index)
            return

        # For all modes (bbox, polygon, AI), cancel if mouse leaves current viewer
        if not viewer_rect.contains(view_point):
            self._cancel_multi_view_operations(viewer_index)
            return

        # Only process if the viewer is linked
        if self.multi_view_linked[viewer_index]:
            self._handle_multi_view_action(event, viewer_index, "move")

        # Don't mirror polygon or selection moves (allow manual cross-viewer placement/selection)
        # Mirror other modes to both viewers
        if self.mode not in ["polygon", "selection"]:
            # Mirror to other linked viewers
            for i, _viewer in enumerate(self.multi_view_viewers):
                if (
                    i != viewer_index
                    and self.multi_view_linked[i]
                    and self.multi_view_images[i]
                ):
                    self._mirror_mouse_action(event, i, "move")

    def _cancel_multi_view_operations(self, viewer_index):
        """Cancel ongoing multi-view operations when mouse leaves viewer bounds."""
        if self.mode == "bbox":
            self._cancel_multi_view_bbox(viewer_index)
        elif self.mode == "polygon":
            self._cancel_multi_view_polygon(viewer_index)
        elif self.mode == "ai":
            self._cancel_multi_view_ai_operation(viewer_index)

    def _cancel_multi_view_bbox(self, viewer_index):
        """Cancel bounding box creation for a specific viewer."""
        # Clear bbox start position
        if hasattr(self, "multi_view_bbox_starts") and viewer_index < len(
            self.multi_view_bbox_starts
        ):
            self.multi_view_bbox_starts[viewer_index] = None

        # Remove visual rectangle
        if hasattr(self, "multi_view_bbox_rects") and viewer_index < len(
            self.multi_view_bbox_rects
        ):
            rect_item = self.multi_view_bbox_rects[viewer_index]
            if rect_item and rect_item.scene():
                self.multi_view_viewers[viewer_index].scene().removeItem(rect_item)
            self.multi_view_bbox_rects[viewer_index] = None

        self._show_notification(
            f"Bounding box creation cancelled (mouse left viewer {viewer_index + 1})"
        )

    def _cancel_multi_view_polygon(self, viewer_index):
        """Cancel polygon creation for a specific viewer."""
        # Clear polygon points
        if hasattr(self, "multi_view_polygon_points") and viewer_index < len(
            self.multi_view_polygon_points
        ):
            self.multi_view_polygon_points[viewer_index].clear()

        # Remove visual polygon lines and points
        if hasattr(self, "multi_view_polygon_lines") and viewer_index < len(
            self.multi_view_polygon_lines
        ):
            for line_item in self.multi_view_polygon_lines[viewer_index]:
                if line_item and line_item.scene():
                    self.multi_view_viewers[viewer_index].scene().removeItem(line_item)
            self.multi_view_polygon_lines[viewer_index].clear()

        if hasattr(self, "multi_view_polygon_point_items") and viewer_index < len(
            self.multi_view_polygon_point_items
        ):
            for point_item in self.multi_view_polygon_point_items[viewer_index]:
                if point_item and point_item.scene():
                    self.multi_view_viewers[viewer_index].scene().removeItem(point_item)
            self.multi_view_polygon_point_items[viewer_index].clear()

        self._show_notification(
            f"Polygon creation cancelled (mouse left viewer {viewer_index + 1})"
        )

    def _cancel_multi_view_ai_operation(self, viewer_index):
        """Cancel AI operation for a specific viewer."""
        # Clear AI drag rectangle if active
        if hasattr(self, "multi_view_ai_drag_rects") and viewer_index < len(
            self.multi_view_ai_drag_rects
        ):
            rect_item = self.multi_view_ai_drag_rects[viewer_index]
            if rect_item and rect_item.scene():
                self.multi_view_viewers[viewer_index].scene().removeItem(rect_item)
            self.multi_view_ai_drag_rects[viewer_index] = None

        # Clear AI click start
        if hasattr(self, "multi_view_ai_click_starts") and viewer_index < len(
            self.multi_view_ai_click_starts
        ):
            self.multi_view_ai_click_starts[viewer_index] = None

    def _is_mouse_in_any_viewer(self, scene_pos):
        """Check if mouse position is within any viewer's bounds."""
        for viewer in self.multi_view_viewers:
            view_pos = viewer.mapFromScene(scene_pos)
            view_point = (
                view_pos.toPoint() if hasattr(view_pos, "toPoint") else view_pos
            )
            viewer_rect = viewer.viewport().rect()
            if viewer_rect.contains(view_point):
                return True
        return False

    def _multi_view_mouse_release(self, event, viewer_index):
        """Handle mouse release event in multi-view mode."""
        if self.view_mode != "multi":
            return

        # If we're currently dragging a handle, pass through to original handler and end drag
        if (
            hasattr(self, "multi_view_handle_dragging")
            and self.multi_view_handle_dragging[viewer_index]
        ):
            viewer = self.multi_view_viewers[viewer_index]
            original_handler = getattr(
                viewer.scene(), f"_original_mouse_release_{viewer_index}", None
            )
            if original_handler:
                original_handler(event)
            # End the handle dragging state
            self.multi_view_handle_dragging[viewer_index] = False
            return

        # Handle crop mode drawing completion
        if self.mode == "crop":
            self._handle_multi_view_crop_complete(event, viewer_index)
            return

        # Handle the event for the source viewer first
        if self.multi_view_linked[viewer_index]:
            self._handle_multi_view_action(event, viewer_index, "release")

        # Don't mirror polygon or selection releases (allow manual cross-viewer placement/selection)
        # Mirror other modes to both viewers
        if self.mode not in ["polygon", "selection"]:
            # Mirror to other linked viewers
            for i, _viewer in enumerate(self.multi_view_viewers):
                if (
                    i != viewer_index
                    and self.multi_view_linked[i]
                    and self.multi_view_images[i]
                ):
                    self._mirror_mouse_action(event, i, "release")

    def _handle_multi_view_action(self, event, viewer_index, action_type):
        """Handle a mouse action for a specific viewer in multi-view mode."""
        if viewer_index >= len(self.multi_view_viewers):
            return

        viewer = self.multi_view_viewers[viewer_index]
        scene_pos = event.scenePos()

        # Map position to image coordinates
        image_pos = viewer.mapToScene(viewer.mapFromScene(scene_pos))

        if action_type == "press":
            if self.mode == "ai":
                # Handle AI mode click
                self._handle_multi_view_ai_click(image_pos, viewer_index, event)
            elif self.mode == "polygon":
                # Handle polygon mode click
                self._handle_multi_view_polygon_click(image_pos, viewer_index)
            elif self.mode == "bbox":
                # Handle bbox mode
                self._handle_multi_view_bbox_start(image_pos, viewer_index)
            elif self.mode == "selection":
                # Handle selection mode
                self._handle_multi_view_selection_click(image_pos, viewer_index)
            elif self.mode == "edit":
                # Handle edit mode click
                self._handle_multi_view_edit_click(image_pos, viewer_index, event)

        elif action_type == "move":
            if self.mode == "bbox" and hasattr(self, "multi_view_bbox_starts"):
                # Handle bbox dragging
                self._handle_multi_view_bbox_drag(image_pos, viewer_index)
            elif self.mode == "ai" and hasattr(self, "multi_view_ai_click_starts"):
                # Handle AI mode dragging for bounding box
                self._handle_multi_view_ai_drag(image_pos, viewer_index)
            elif self.mode == "edit" and hasattr(self, "multi_view_drag_start_pos"):
                # Handle edit mode dragging
                self._handle_multi_view_edit_drag(image_pos, viewer_index)

        elif action_type == "release":
            if self.mode == "bbox" and hasattr(self, "multi_view_bbox_starts"):
                # Handle bbox completion
                self._handle_multi_view_bbox_complete(image_pos, viewer_index)
            elif self.mode == "ai" and hasattr(self, "multi_view_ai_click_starts"):
                # Handle AI mode release
                self._handle_multi_view_ai_release(image_pos, viewer_index)
            elif self.mode == "edit" and hasattr(self, "multi_view_drag_start_pos"):
                # Handle edit mode release
                self._handle_multi_view_edit_release(image_pos, viewer_index)

    def _mirror_mouse_action(self, event, target_viewer_index, action_type):
        """Mirror a mouse action to another viewer."""
        if target_viewer_index >= len(self.multi_view_viewers):
            return

        # target_viewer = self.multi_view_viewers[target_viewer_index]
        scene_pos = event.scenePos()

        # For aligned multi-view images, use the same coordinates directly
        # (no coordinate transformation needed as images should be aligned)
        target_pos = scene_pos

        # Create a mirrored action based on the current mode
        if action_type == "press":
            if self.mode == "ai":
                self._handle_multi_view_ai_click(target_pos, target_viewer_index, event)
            elif self.mode == "polygon":
                self._handle_multi_view_polygon_click(target_pos, target_viewer_index)
            elif self.mode == "bbox":
                self._handle_multi_view_bbox_start(target_pos, target_viewer_index)
            elif self.mode == "selection":
                self._handle_multi_view_selection_click(target_pos, target_viewer_index)
        elif action_type == "move":
            if self.mode == "bbox" and hasattr(self, "multi_view_bbox_starts"):
                self._handle_multi_view_bbox_drag(target_pos, target_viewer_index)
            elif self.mode == "ai" and hasattr(self, "multi_view_ai_click_starts"):
                self._handle_multi_view_ai_drag(target_pos, target_viewer_index)
        elif action_type == "release":
            if self.mode == "bbox" and hasattr(self, "multi_view_bbox_starts"):
                self._handle_multi_view_bbox_complete(target_pos, target_viewer_index)
            elif self.mode == "ai" and hasattr(self, "multi_view_ai_click_starts"):
                self._handle_multi_view_ai_release(target_pos, target_viewer_index)

    def _handle_multi_view_ai_click(self, pos, viewer_index, event):
        """Handle AI mode click for a specific viewer."""
        # Delegate to mode handler if available
        if hasattr(self, "multi_view_mode_handler") and self.multi_view_mode_handler:
            self.multi_view_mode_handler.handle_ai_click(pos, event, viewer_index)
            return

        # Fallback to old logic if handler not available
        # Lazy loading: Initialize models on first AI mode usage
        if not hasattr(self, "multi_view_models") or len(self.multi_view_models) == 0:
            # Check if models are already being initialized
            if (
                hasattr(self, "multi_view_init_worker")
                and self.multi_view_init_worker
                and self.multi_view_init_worker.isRunning()
            ):
                self._show_warning_notification(
                    "AI models are still loading, please wait..."
                )
                return

            self._show_notification("Loading AI models for first use...")
            self._initialize_multi_view_models()
            return  # Exit early, models will load in background

        if viewer_index >= len(self.multi_view_models):
            return

        # Check if model is updating
        if self.multi_view_models_updating[viewer_index]:
            self._show_warning_notification(
                f"AI model is updating for viewer {viewer_index + 1}, please wait..."
            )
            return

        # Ensure SAM model is updated for this viewer (only if not already updating)
        if not self.multi_view_models_updating[viewer_index]:
            self._ensure_multi_view_sam_updated(viewer_index)

        # Check again if model is now updating (started by ensure call)
        if self.multi_view_models_updating[viewer_index]:
            self._show_warning_notification(
                f"AI model is loading for viewer {viewer_index + 1}, please wait..."
            )
            return

        # Initialize tracking if not exists
        if not hasattr(self, "multi_view_point_items"):
            self.multi_view_point_items = [[], []]
        if not hasattr(self, "multi_view_positive_points"):
            self.multi_view_positive_points = [[], []]
        if not hasattr(self, "multi_view_negative_points"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_negative_points = [[] for _ in range(num_viewers)]
        if not hasattr(self, "multi_view_ai_click_starts"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_ai_click_starts = [None] * num_viewers
        if not hasattr(self, "multi_view_ai_drag_rects"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_ai_drag_rects = [None] * num_viewers

        # Store click start position and time for drag detection
        self.multi_view_ai_click_starts[viewer_index] = pos
        self.ai_click_time = event.timestamp() if hasattr(event, "timestamp") else 0

        # Determine if positive or negative click
        positive = event.button() == Qt.MouseButton.LeftButton

        # Don't add point yet - wait to see if it's a drag
        # Store the pending click info
        if not hasattr(self, "multi_view_pending_clicks"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_pending_clicks = [None] * num_viewers
        self.multi_view_pending_clicks[viewer_index] = {
            "pos": pos,
            "positive": positive,
            "event": event,
        }

    def _handle_multi_view_ai_drag(self, pos, viewer_index):
        """Handle AI mode dragging for bounding box preview."""
        # Delegate to mode handler if available
        if hasattr(self, "multi_view_mode_handler") and self.multi_view_mode_handler:
            self.multi_view_mode_handler.handle_ai_drag(pos, viewer_index)
            return

        # Fallback to old logic
        if not hasattr(self, "multi_view_ai_click_starts") or viewer_index >= len(
            self.multi_view_ai_click_starts
        ):
            return

        start_pos = self.multi_view_ai_click_starts[viewer_index]
        if not start_pos:
            return

        # Check if we've moved enough to consider this a drag
        distance = (
            (pos.x() - start_pos.x()) ** 2 + (pos.y() - start_pos.y()) ** 2
        ) ** 0.5
        if distance < 5:  # Minimum drag distance
            return

        # Initialize drag rect if needed
        if not hasattr(self, "multi_view_ai_drag_rects"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_ai_drag_rects = [None] * num_viewers

        viewer = self.multi_view_viewers[viewer_index]

        # Create or update drag rectangle
        if self.multi_view_ai_drag_rects[viewer_index] is None:
            # Create new rectangle
            rect_item = QGraphicsRectItem()
            rect_item.setPen(QPen(QColor(255, 255, 255), 2, Qt.PenStyle.DashLine))
            rect_item.setBrush(QBrush(Qt.GlobalColor.transparent))
            viewer.scene().addItem(rect_item)
            self.multi_view_ai_drag_rects[viewer_index] = rect_item

            # Clear pending click since this is now a drag
            if hasattr(self, "multi_view_pending_clicks"):
                self.multi_view_pending_clicks[viewer_index] = None

        # Update rectangle
        rect_item = self.multi_view_ai_drag_rects[viewer_index]
        x = min(start_pos.x(), pos.x())
        y = min(start_pos.y(), pos.y())
        width = abs(pos.x() - start_pos.x())
        height = abs(pos.y() - start_pos.y())
        rect_item.setRect(x, y, width, height)

    def _handle_multi_view_ai_release(self, pos, viewer_index):
        """Handle AI mode mouse release - either point or bbox."""
        # Delegate to mode handler if available
        if hasattr(self, "multi_view_mode_handler") and self.multi_view_mode_handler:
            self.multi_view_mode_handler.handle_ai_complete(pos, viewer_index)
            return

        # Fallback to old logic
        if not hasattr(self, "multi_view_ai_click_starts") or viewer_index >= len(
            self.multi_view_ai_click_starts
        ):
            return

        start_pos = self.multi_view_ai_click_starts[viewer_index]
        if not start_pos:
            return

        # Check if this was a drag (bbox) or click (point)
        if (
            hasattr(self, "multi_view_ai_drag_rects")
            and self.multi_view_ai_drag_rects[viewer_index]
        ):
            # This was a drag - handle as bounding box
            self._finalize_multi_view_ai_bbox(pos, viewer_index)
        elif (
            hasattr(self, "multi_view_pending_clicks")
            and self.multi_view_pending_clicks[viewer_index]
        ):
            # This was a click - handle as point
            click_info = self.multi_view_pending_clicks[viewer_index]
            self._finalize_multi_view_ai_point(
                click_info["pos"], viewer_index, click_info["positive"]
            )

        # Clean up
        self.multi_view_ai_click_starts[viewer_index] = None
        if hasattr(self, "multi_view_pending_clicks"):
            self.multi_view_pending_clicks[viewer_index] = None

    def _finalize_multi_view_ai_point(self, pos, viewer_index, positive):
        """Finalize AI point click."""
        # Initialize point tracking if not exists
        if not hasattr(self, "multi_view_point_items"):
            self.multi_view_point_items = [[], []]
        if not hasattr(self, "multi_view_positive_points"):
            self.multi_view_positive_points = [[], []]
        if not hasattr(self, "multi_view_negative_points"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_negative_points = [[] for _ in range(num_viewers)]

        model = self.multi_view_models[viewer_index]
        viewer = self.multi_view_viewers[viewer_index]

        # Add visual point to the viewer
        point_color = QColor(0, 255, 0) if positive else QColor(255, 0, 0)
        point_item = QGraphicsEllipseItem(
            pos.x() - self.point_radius,
            pos.y() - self.point_radius,
            self.point_radius * 2,
            self.point_radius * 2,
        )
        point_item.setBrush(QBrush(point_color))
        point_item.setPen(QPen(Qt.PenStyle.NoPen))
        viewer.scene().addItem(point_item)

        # Store point item for later clearing
        self.multi_view_point_items[viewer_index].append(point_item)

        # Store the point coordinates
        if positive:
            self.multi_view_positive_points[viewer_index].append(pos)
        else:
            self.multi_view_negative_points[viewer_index].append(pos)

        # Process with SAM model
        try:
            # Convert all accumulated points to model coordinates
            positive_model_points = []
            negative_model_points = []

            for pt in self.multi_view_positive_points[viewer_index]:
                model_pt = self._transform_multi_view_coords_to_sam_coords(
                    pt, viewer_index
                )
                positive_model_points.append(model_pt)

            for pt in self.multi_view_negative_points[viewer_index]:
                model_pt = self._transform_multi_view_coords_to_sam_coords(
                    pt, viewer_index
                )
                negative_model_points.append(model_pt)

            # Generate mask using the specific model with all accumulated points
            result = model.predict(positive_model_points, negative_model_points)

            if result is not None:
                # Unpack the tuple like single view mode
                mask, scores, logits = result

                # Ensure mask is boolean (SAM models can return float masks)
                if mask.dtype != bool:
                    mask = mask > 0.5

                # Display the mask as preview
                self._display_multi_view_mask(mask, viewer_index)

        except Exception as e:
            logger.error(f"Error processing AI click for viewer {viewer_index}: {e}")
            self._show_error_notification(f"AI prediction failed: {str(e)}")

    def _finalize_multi_view_ai_bbox(self, pos, viewer_index):
        """Finalize AI bounding box."""
        if (
            not hasattr(self, "multi_view_ai_drag_rects")
            or not self.multi_view_ai_drag_rects[viewer_index]
        ):
            return

        viewer = self.multi_view_viewers[viewer_index]
        model = self.multi_view_models[viewer_index]
        start_pos = self.multi_view_ai_click_starts[viewer_index]

        # Calculate bbox
        x1 = min(start_pos.x(), pos.x())
        y1 = min(start_pos.y(), pos.y())
        x2 = max(start_pos.x(), pos.x())
        y2 = max(start_pos.y(), pos.y())

        # Remove drag rectangle
        rect_item = self.multi_view_ai_drag_rects[viewer_index]
        viewer.scene().removeItem(rect_item)
        self.multi_view_ai_drag_rects[viewer_index] = None

        # Process bbox regardless of size

        try:
            # Convert bbox corners to model coordinates
            tl = self._transform_multi_view_coords_to_sam_coords(
                QPointF(x1, y1), viewer_index
            )
            br = self._transform_multi_view_coords_to_sam_coords(
                QPointF(x2, y2), viewer_index
            )

            # Generate mask using bbox
            bbox = [tl[0], tl[1], br[0], br[1]]
            result = model.predict_from_box(bbox)

            if result is not None:
                # Unpack the tuple
                mask, scores, logits = result

                # Ensure mask is boolean
                if mask.dtype != bool:
                    mask = mask > 0.5

                # Display the mask as preview
                self._display_multi_view_mask(mask, viewer_index)

        except Exception as e:
            logger.error(f"Error processing AI bbox for viewer {viewer_index}: {e}")
            self._show_error_notification(f"AI bbox prediction failed: {str(e)}")

    def _handle_multi_view_polygon_click(self, pos, viewer_index):
        """Handle polygon mode click for a specific viewer - matches single view pattern."""
        points = self.multi_view_polygon_points[viewer_index]

        # Check if clicking near first point to close polygon
        if points and len(points) > 2:
            first_point = points[0]
            distance_squared = (pos.x() - first_point.x()) ** 2 + (
                pos.y() - first_point.y()
            ) ** 2
            if distance_squared < self.polygon_join_threshold**2:
                # Use the multi-view mode handler for proper pairing logic
                if hasattr(self, "multi_view_mode_handler"):
                    self.multi_view_mode_handler._finalize_multi_view_polygon(
                        viewer_index
                    )
                else:
                    self._finalize_multi_view_polygon(viewer_index)
                return

        # Add point to polygon (using QPointF like single view)
        points.append(pos)

        # Add visual point (using same style as single view)
        viewer = self.multi_view_viewers[viewer_index]
        point_item = QGraphicsEllipseItem(pos.x() - 3, pos.y() - 3, 6, 6)
        point_item.setBrush(QBrush(QColor(0, 255, 255)))  # Cyan like single view
        point_item.setPen(QPen(Qt.PenStyle.NoPen))
        viewer.scene().addItem(point_item)

        # Store visual item for cleanup
        self.multi_view_polygon_preview_items[viewer_index].append(point_item)

        # Draw polygon preview with fill
        self._draw_multi_view_polygon_preview(viewer_index)

        # Record action for undo
        self.action_history.append(
            {
                "type": "multi_view_polygon_point",
                "viewer_index": viewer_index,
                "point": pos,
            }
        )

    def _draw_multi_view_polygon_preview(self, viewer_index):
        """Draw polygon preview with fill - matches single view pattern."""
        points = self.multi_view_polygon_points[viewer_index]
        if len(points) < 2:
            return

        viewer = self.multi_view_viewers[viewer_index]
        preview_items = self.multi_view_polygon_preview_items[viewer_index]

        # Remove old preview items (keep dots)
        for item in preview_items[:]:
            if not isinstance(item, QGraphicsEllipseItem):
                if item.scene():
                    viewer.scene().removeItem(item)
                preview_items.remove(item)

        # Draw polygon fill preview when 3+ points (like single view)
        if len(points) > 2:
            preview_poly = QGraphicsPolygonItem(QPolygonF(points))
            preview_poly.setBrush(
                QBrush(QColor(0, 255, 255, 100))
            )  # Cyan with transparency
            preview_poly.setPen(QPen(Qt.GlobalColor.transparent))
            viewer.scene().addItem(preview_poly)
            preview_items.append(preview_poly)

        # Draw connecting lines between points
        if len(points) > 1:
            for i in range(len(points) - 1):
                line_item = QGraphicsLineItem(
                    points[i].x(), points[i].y(), points[i + 1].x(), points[i + 1].y()
                )
                line_item.setPen(QPen(QColor(0, 255, 255), 2))  # Cyan lines
                viewer.scene().addItem(line_item)
                preview_items.append(line_item)

        # Draw closing line when 3+ points (dashed)
        if len(points) > 2:
            line_item = QGraphicsLineItem(
                points[-1].x(), points[-1].y(), points[0].x(), points[0].y()
            )
            line_item.setPen(QPen(QColor(0, 255, 255), 2, Qt.PenStyle.DashLine))
            viewer.scene().addItem(line_item)
            preview_items.append(line_item)

    def _add_multi_view_segment(self, segment_type, class_id, viewer_index, view_data):
        """Add a segment for a specific viewer in multi-view mode."""
        # Create segment with view-specific data
        segment = {
            "type": segment_type,
            "views": {viewer_index: view_data},
        }

        # Set class ID if provided
        if class_id is not None:
            segment["class_id"] = class_id

        # Add to main segment manager
        self.segment_manager.add_segment(segment)

        # Record for undo
        self.action_history.append({"type": "add_segment", "data": segment})

        # Clear redo history when a new action is performed
        self.redo_history.clear()

        # Refresh display to show the new segment
        self._update_all_lists()

    def _add_multi_view_paired_segment(
        self, segment_type, class_id, view_data_0, view_data_1
    ):
        """Add a paired segment for multi-view mode with same class ID."""
        # Create paired segment with both view data
        paired_segment = {
            "type": segment_type,
            "views": {0: view_data_0, 1: view_data_1},
        }

        # Set class ID if provided
        if class_id is not None:
            paired_segment["class_id"] = class_id

        # Add to main segment manager (this will assign the same class ID)
        self.segment_manager.add_segment(paired_segment)

        # Record for undo
        self.action_history.append({"type": "add_segment", "data": paired_segment})

        # Clear redo history when a new action is performed
        self.redo_history.clear()

    def _finalize_multi_view_polygon(self, viewer_index):
        """Finalize polygon drawing for a specific viewer with pairing logic."""
        points = self.multi_view_polygon_points[viewer_index]
        if len(points) < 3:
            return

        # Create view-specific polygon data
        view_data = {
            "vertices": [[p.x(), p.y()] for p in points],
            "mask": None,
        }

        # Mirror the polygon to all other viewers automatically
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]

        # Create segment with views structure for all viewers
        paired_segment = {"type": "Polygon", "views": {}}

        # Add the current viewer's data
        paired_segment["views"][viewer_index] = view_data

        # Mirror to all other viewers with same coordinates (they should align between linked images)
        for other_viewer_index in range(num_viewers):
            if other_viewer_index != viewer_index:
                mirrored_view_data = {
                    "vertices": view_data[
                        "vertices"
                    ].copy(),  # Use same coordinates for mirrored polygon
                    "mask": None,
                }
                paired_segment["views"][other_viewer_index] = mirrored_view_data

        # Add to segment manager
        self.segment_manager.add_segment(paired_segment)

        # Record for undo
        self.action_history.append({"type": "add_segment", "data": paired_segment})

        # Clear redo history when a new action is performed
        self.redo_history.clear()

        # Update UI
        self._update_all_lists()
        viewer_count_text = "all viewers" if num_viewers > 2 else "both viewers"
        self._show_notification(f"Polygon created and mirrored to {viewer_count_text}.")

        # Clear polygon state for this viewer
        self._clear_multi_view_polygon(viewer_index)

    def _clear_multi_view_polygon(self, viewer_index):
        """Clear polygon state for a specific viewer."""
        # Clear points
        if hasattr(self, "multi_view_polygon_points") and viewer_index < len(
            self.multi_view_polygon_points
        ):
            self.multi_view_polygon_points[viewer_index].clear()

        # Remove all visual items (only if viewers exist)
        if (
            hasattr(self, "multi_view_viewers")
            and viewer_index < len(self.multi_view_viewers)
            and hasattr(self, "multi_view_polygon_preview_items")
            and viewer_index < len(self.multi_view_polygon_preview_items)
        ):
            viewer = self.multi_view_viewers[viewer_index]
            for item in self.multi_view_polygon_preview_items[viewer_index]:
                if item.scene():
                    viewer.scene().removeItem(item)
            self.multi_view_polygon_preview_items[viewer_index].clear()

    def _handle_multi_view_selection_click(self, pos, viewer_index):
        """Handle selection mode click for a specific viewer."""
        # Find segment at position using main segment manager (same as single view)
        for i, segment in enumerate(self.segment_manager.segments):
            # Get the segment data for this specific viewer if it exists
            if "views" in segment and viewer_index in segment["views"]:
                segment_data = segment["views"][viewer_index]
                # Create a temporary segment object with the view-specific data
                test_segment = {"type": segment["type"], **segment_data}
            else:
                # Use the segment as-is (legacy format or single-view data)
                test_segment = segment

            if self._is_point_in_segment(pos, test_segment):
                # Select/deselect segment using main segment manager index
                self._toggle_multi_view_segment_selection(viewer_index, i)
                return

    def _handle_multi_view_edit_click(self, pos, viewer_index, event):
        """Handle edit mode click for a specific viewer."""
        if event.button() == Qt.MouseButton.LeftButton:
            # Check if clicking on a selected polygon to start dragging
            selected_indices = self.right_panel.get_selected_segment_indices()

            for i in selected_indices:
                segment = self.segment_manager.segments[i]
                if segment.get("type") == "Polygon":
                    # Get the segment data for this specific viewer if it exists
                    if "views" in segment and viewer_index in segment["views"]:
                        test_segment = {
                            "type": segment["type"],
                            **segment["views"][viewer_index],
                        }
                    else:
                        test_segment = segment

                    if self._is_point_in_segment(pos, test_segment):
                        # Start dragging this polygon
                        self._start_multi_view_polygon_drag(
                            pos, viewer_index, selected_indices
                        )
                        return

            # If not clicking on selected polygon, clear selection like single-view mode
            self.right_panel.clear_selections()

    def _start_multi_view_polygon_drag(self, pos, viewer_index, selected_indices):
        """Start dragging polygons in multi-view edit mode."""
        # Initialize multi-view drag attributes
        if not hasattr(self, "multi_view_drag_start_pos"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_drag_start_pos = [None] * num_viewers
        if not hasattr(self, "multi_view_is_dragging_polygon"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_is_dragging_polygon = [False] * num_viewers
        if not hasattr(self, "multi_view_drag_initial_vertices"):
            self.multi_view_drag_initial_vertices = [{}, {}]

        self.multi_view_drag_start_pos[viewer_index] = pos
        self.multi_view_is_dragging_polygon[viewer_index] = True

        # Store initial vertices for the selected polygons
        for i in selected_indices:
            segment = self.segment_manager.segments[i]
            if segment.get("type") == "Polygon":
                if "views" in segment and viewer_index in segment["views"]:
                    vertices = segment["views"][viewer_index].get("vertices", [])
                else:
                    vertices = segment.get("vertices", [])

                # Store a deep copy of the vertices
                self.multi_view_drag_initial_vertices[viewer_index][i] = [
                    [p[0], p[1]] for p in vertices
                ]

    def _handle_multi_view_edit_drag(self, pos, viewer_index):
        """Handle edit mode dragging for a specific viewer."""
        if not hasattr(self, "multi_view_is_dragging_polygon"):
            return

        if self.multi_view_is_dragging_polygon[viewer_index]:
            delta_x = pos.x() - self.multi_view_drag_start_pos[viewer_index].x()
            delta_y = pos.y() - self.multi_view_drag_start_pos[viewer_index].y()

            # Update vertices for all dragged polygons
            for i, initial_verts in self.multi_view_drag_initial_vertices[
                viewer_index
            ].items():
                segment = self.segment_manager.segments[i]
                new_vertices = [[p[0] + delta_x, p[1] + delta_y] for p in initial_verts]

                # Update the appropriate view's vertices
                if "views" in segment and viewer_index in segment["views"]:
                    segment["views"][viewer_index]["vertices"] = new_vertices
                else:
                    segment["vertices"] = new_vertices

                # Update the visual polygon
                self._update_multi_view_polygon_item(i, viewer_index)

            # Update edit handles and highlights
            self._display_multi_view_edit_handles()
            self._highlight_multi_view_selected_segments()

    def _handle_multi_view_edit_release(self, pos, viewer_index):
        """Handle edit mode release for a specific viewer."""
        if not hasattr(self, "multi_view_is_dragging_polygon"):
            return

        if self.multi_view_is_dragging_polygon[viewer_index]:
            # Record the action for undo
            final_vertices = {}
            for i, _initial_verts in self.multi_view_drag_initial_vertices[
                viewer_index
            ].items():
                segment = self.segment_manager.segments[i]
                if "views" in segment and viewer_index in segment["views"]:
                    current_vertices = segment["views"][viewer_index].get(
                        "vertices", []
                    )
                else:
                    current_vertices = segment.get("vertices", [])

                final_vertices[i] = [[p[0], p[1]] for p in current_vertices]

            self.action_history.append(
                {
                    "type": "move_polygon",
                    "viewer_mode": "multi",
                    "viewer_index": viewer_index,
                    "initial_vertices": self.multi_view_drag_initial_vertices[
                        viewer_index
                    ],
                    "final_vertices": final_vertices,
                }
            )

            # Clear redo history
            self.redo_history.clear()

            # Sync changes to other viewers if segments are linked
            self._sync_multi_view_polygon_edits(viewer_index)

            # Clean up drag state
            self.multi_view_is_dragging_polygon[viewer_index] = False
            self.multi_view_drag_start_pos[viewer_index] = None
            self.multi_view_drag_initial_vertices[viewer_index] = {}

    def _display_multi_view_mask(self, mask, viewer_index):
        """Display a mask preview in a specific multi-view viewer."""
        if viewer_index >= len(self.multi_view_viewers):
            return

        viewer = self.multi_view_viewers[viewer_index]

        # Initialize preview tracking if needed
        if not hasattr(self, "multi_view_preview_mask_items"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_preview_mask_items = [None] * num_viewers
        if not hasattr(self, "multi_view_preview_masks"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_preview_masks = [None] * num_viewers
        if not hasattr(self, "multi_view_ai_predictions"):
            self.multi_view_ai_predictions = {}

        # Remove existing preview if any
        if self.multi_view_preview_mask_items[viewer_index]:
            viewer.scene().removeItem(self.multi_view_preview_mask_items[viewer_index])
            self.multi_view_preview_mask_items[viewer_index] = None

        # Convert mask to pixmap with preview styling (yellow for AI previews)
        mask_pixmap = mask_to_pixmap(mask, (255, 255, 0), alpha=128)

        # Create preview item
        preview_item = viewer.scene().addPixmap(mask_pixmap)
        preview_item.setPos(0, 0)
        preview_item.setZValue(100)  # Above other items but below points

        # Store preview for spacebar acceptance
        self.multi_view_preview_mask_items[viewer_index] = preview_item
        self.multi_view_preview_masks[viewer_index] = mask

        # Also store in the format expected by save_ai_predictions
        # Collect current points and labels
        points = []
        labels = []
        if hasattr(self, "multi_view_positive_points") and viewer_index < len(
            self.multi_view_positive_points
        ):
            for pt in self.multi_view_positive_points[viewer_index]:
                points.append((pt.x(), pt.y()))
                labels.append(1)
        if hasattr(self, "multi_view_negative_points") and viewer_index < len(
            self.multi_view_negative_points
        ):
            for pt in self.multi_view_negative_points[viewer_index]:
                points.append((pt.x(), pt.y()))
                labels.append(0)

        self.multi_view_ai_predictions[viewer_index] = {
            "mask": mask,
            "points": points,
            "labels": labels,
        }

        # Show hint to user
        self._show_notification("Press spacebar to accept AI segment suggestion")

    def _is_point_in_segment(self, pos, segment):
        """Check if a point is inside a segment."""
        x, y = int(pos.x()), int(pos.y())

        if segment.get("type") == "AI":
            mask = segment.get("mask")
            if mask is not None and 0 <= x < mask.shape[1] and 0 <= y < mask.shape[0]:
                return mask[y, x] > 0
        elif segment.get("type") == "Polygon":
            vertices = segment.get("vertices")
            if vertices:
                # Convert vertices to QPointF for polygon testing
                qpoints = [QPointF(p[0], p[1]) for p in vertices]
                polygon = QPolygonF(qpoints)
                return polygon.containsPoint(QPointF(x, y), Qt.FillRule.OddEvenFill)

        return False

    def _toggle_multi_view_segment_selection(self, viewer_index, segment_index):
        """Toggle selection of a segment in multi-view mode."""
        # Find the corresponding row in the segment table and toggle selection
        # This matches the behavior of single-view selection
        table = self.right_panel.segment_table

        for j in range(table.rowCount()):
            item = table.item(j, 0)
            if item:
                item_data = item.data(Qt.ItemDataRole.UserRole)
                if item_data == segment_index:
                    # Toggle selection for this row using the same method as single-view
                    is_selected = table.item(j, 0).isSelected()

                    # Block signals temporarily to prevent interference
                    table.blockSignals(True)

                    if is_selected:
                        # Deselect the row
                        table.clearSelection()
                    else:
                        # Select the row
                        table.selectRow(j)

                    # Re-enable signals
                    table.blockSignals(False)

                    # Manually trigger highlighting since we blocked signals
                    self._highlight_selected_segments()

                    return

    def _display_multi_view_segment(self, segment, viewer_index):
        """Display a confirmed segment in multi-view mode."""
        if viewer_index >= len(self.multi_view_viewers):
            return

        viewer = self.multi_view_viewers[viewer_index]

        if segment.get("type") == "AI":
            # Display AI mask segment
            mask = segment.get("mask")
            if mask is not None:
                # Get color for this segment's class
                class_id = segment.get("class_id", 1)
                base_color = self._get_color_for_class(class_id)
                color_rgb = base_color.getRgb()[:3]

                # Create hoverable item with proper class-based colors
                mask_item = HoverablePixmapItem()
                default_pixmap = mask_to_pixmap(
                    mask, color_rgb, alpha=70
                )  # Match single view transparency
                hover_pixmap = mask_to_pixmap(
                    mask, color_rgb, alpha=170
                )  # Match single view hover
                mask_item.set_pixmaps(default_pixmap, hover_pixmap)
                mask_item.setPos(0, 0)
                mask_item.set_segment_info(len(self.segment_manager.segments) - 1, self)

                viewer.scene().addItem(mask_item)

        elif segment.get("type") == "Polygon":
            # Display polygon segment
            vertices = segment.get("vertices", [])
            if vertices:
                polygon = QPolygonF([QPointF(x, y) for x, y in vertices])

                # Create hoverable polygon item
                polygon_item = HoverablePolygonItem(polygon)

                # Get color for this segment's class (same as single view)
                class_id = segment.get("class_id", 1)
                base_color = self._get_color_for_class(class_id)

                # Set fill with transparency (match single view styling)
                default_brush = QBrush(
                    QColor(base_color.red(), base_color.green(), base_color.blue(), 70)
                )
                hover_brush = QBrush(
                    QColor(base_color.red(), base_color.green(), base_color.blue(), 170)
                )
                polygon_item.set_brushes(default_brush, hover_brush)

                # Set transparent border (no outline, same as single view)
                polygon_item.setPen(QPen(Qt.GlobalColor.transparent))
                polygon_item.set_segment_info(
                    len(self.segment_manager.segments) - 1, self
                )

                viewer.scene().addItem(polygon_item)

    def _handle_multi_view_bbox_start(self, pos, viewer_index):
        """Handle bbox start for a specific viewer."""
        # Start bounding box drawing for this viewer
        if not hasattr(self, "multi_view_bbox_starts"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_bbox_starts = [None for _ in range(num_viewers)]

        self.multi_view_bbox_starts[viewer_index] = pos

        # Create visual rectangle
        viewer = self.multi_view_viewers[viewer_index]
        rect_item = QGraphicsRectItem(pos.x(), pos.y(), 0, 0)
        rect_item.setPen(
            QPen(QColor(255, 0, 0), 2, Qt.PenStyle.DashLine)
        )  # Red dashed line for visibility
        viewer.scene().addItem(rect_item)

        # Store for later updates
        if not hasattr(self, "multi_view_bbox_rects"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_bbox_rects = [None for _ in range(num_viewers)]
        self.multi_view_bbox_rects[viewer_index] = rect_item

    def _complete_multi_view_polygon(self, viewer_index):
        """Complete the polygon for a specific viewer."""
        if not hasattr(self, "multi_view_polygon_points"):
            return

        points = self.multi_view_polygon_points[viewer_index]
        if len(points) < 3:
            return  # Need at least 3 points for a polygon

        # Create polygon segment

        segment = {
            "type": "Polygon",
            "points": points,
            # Let SegmentManager assign class_id automatically
        }

        # Add to the main segment manager (same as single view)
        self.segment_manager.add_segment(segment)

        # Display the polygon
        self._display_multi_view_polygon(segment, viewer_index)

        # Clear temporary drawing state
        self.multi_view_polygon_points[viewer_index].clear()
        if hasattr(self, "multi_view_polygon_lines"):
            viewer = self.multi_view_viewers[viewer_index]
            for line_item in self.multi_view_polygon_lines[viewer_index]:
                viewer.scene().removeItem(line_item)
            self.multi_view_polygon_lines[viewer_index].clear()

    def _display_multi_view_polygon(self, segment, viewer_index):
        """Display a polygon in a specific multi-view viewer."""
        if viewer_index >= len(self.multi_view_viewers):
            return

        viewer = self.multi_view_viewers[viewer_index]
        points = segment.get("vertices", segment.get("points", []))

        if len(points) < 3:
            return

        # Create polygon item
        polygon_points = [QPointF(x, y) for x, y in points]
        polygon = QPolygonF(polygon_points)

        polygon_item = HoverablePolygonItem(polygon)

        # Get color for this segment's class (same as single view)
        class_id = segment.get("class_id", 1)
        base_color = self._get_color_for_class(class_id)

        # Set styling to match single view (transparent pen, proper alpha)
        polygon_item.setPen(QPen(Qt.GlobalColor.transparent))
        polygon_item.setBrush(
            QBrush(QColor(base_color.red(), base_color.green(), base_color.blue(), 70))
        )
        viewer.scene().addItem(polygon_item)

    def _handle_multi_view_bbox_drag(self, pos, viewer_index):
        """Handle bbox drag for a specific viewer."""
        if not hasattr(self, "multi_view_bbox_starts") or not hasattr(
            self, "multi_view_bbox_rects"
        ):
            return

        if (
            self.multi_view_bbox_starts[viewer_index] is None
            or self.multi_view_bbox_rects[viewer_index] is None
        ):
            return

        # Update rectangle
        start_pos = self.multi_view_bbox_starts[viewer_index]
        rect_item = self.multi_view_bbox_rects[viewer_index]

        x = min(start_pos.x(), pos.x())
        y = min(start_pos.y(), pos.y())
        width = abs(pos.x() - start_pos.x())
        height = abs(pos.y() - start_pos.y())

        rect_item.setRect(x, y, width, height)

    def _handle_multi_view_bbox_complete(self, pos, viewer_index):
        """Handle bbox completion for a specific viewer."""
        if not hasattr(self, "multi_view_bbox_starts") or not hasattr(
            self, "multi_view_bbox_rects"
        ):
            return

        if (
            self.multi_view_bbox_starts[viewer_index] is None
            or self.multi_view_bbox_rects[viewer_index] is None
        ):
            return

        # Complete the bounding box
        start_pos = self.multi_view_bbox_starts[viewer_index]
        rect_item = self.multi_view_bbox_rects[viewer_index]

        # Calculate final rectangle
        x = min(start_pos.x(), pos.x())
        y = min(start_pos.y(), pos.y())
        width = abs(pos.x() - start_pos.x())
        height = abs(pos.y() - start_pos.y())

        # Remove temporary rectangle
        self.multi_view_viewers[viewer_index].scene().removeItem(rect_item)

        # Also remove any mirrored rectangles from all other viewers
        config = self._get_multi_view_config()
        num_viewers = config["num_viewers"]
        for other_viewer_index in range(num_viewers):
            if (
                other_viewer_index != viewer_index
                and other_viewer_index < len(self.multi_view_bbox_rects)
                and self.multi_view_bbox_rects[other_viewer_index] is not None
            ):
                self.multi_view_viewers[other_viewer_index].scene().removeItem(
                    self.multi_view_bbox_rects[other_viewer_index]
                )
                self.multi_view_bbox_rects[other_viewer_index] = None
                self.multi_view_bbox_starts[other_viewer_index] = None

        # Only create segment if minimum size is met (2x2 pixels) and from first viewer to avoid duplication
        if (
            width >= 2
            and height >= 2
            and (viewer_index == 0 or self.multi_view_bbox_starts[0] is None)
        ):
            # Convert bbox to polygon vertices
            vertices = [
                [x, y],
                [x + width, y],
                [x + width, y + height],
                [x, y + height],
            ]

            # Create segment with views structure for all viewers (like polygon mode)
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]

            paired_segment = {"type": "Polygon", "views": {}}

            # Add view data for all viewers with same coordinates
            for viewer_idx in range(num_viewers):
                paired_segment["views"][viewer_idx] = {
                    "vertices": vertices.copy(),
                    "mask": None,
                }

            # Add to segment manager
            self.segment_manager.add_segment(paired_segment)

            # Record for undo
            self.action_history.append({"type": "add_segment", "data": paired_segment})

            # Clear redo history when a new action is performed
            self.redo_history.clear()

            # Update lists
            self._update_all_lists()

        # Clean up both viewers
        self.multi_view_bbox_starts[viewer_index] = None
        self.multi_view_bbox_rects[viewer_index] = None

    def _sync_multi_view_zoom(self, factor, source_viewer_index):
        """Synchronize zoom across linked multi-view viewers."""
        if self.view_mode != "multi":
            return

        # Only sync if source viewer is linked
        if not self.multi_view_linked[source_viewer_index]:
            return

        # Sync to all other linked viewers
        for i, viewer in enumerate(self.multi_view_viewers):
            if (
                i != source_viewer_index
                and self.multi_view_linked[i]
                and self.multi_view_images[i]
            ):
                viewer.sync_zoom(factor)

    def _display_multi_view_bbox(self, segment, viewer_index):
        """Display a bounding box in a specific multi-view viewer."""
        if viewer_index >= len(self.multi_view_viewers):
            return

        viewer = self.multi_view_viewers[viewer_index]
        bbox = segment.get("bbox", [0, 0, 0, 0])

        # Create rectangle item
        rect_item = QGraphicsRectItem(bbox[0], bbox[1], bbox[2], bbox[3])

        # Get color for this segment's class (same as single view)
        class_id = segment.get("class_id", 1)
        base_color = self._get_color_for_class(class_id)

        # Set styling to match single view (transparent pen, proper alpha)
        rect_item.setPen(QPen(Qt.GlobalColor.transparent))
        rect_item.setBrush(
            QBrush(QColor(base_color.red(), base_color.green(), base_color.blue(), 70))
        )
        viewer.scene().addItem(rect_item)

    def _update_multi_view_polygon_item(self, segment_index, viewer_index):
        """Update a polygon item in a specific viewer after editing."""
        # This would need to update the visual representation
        # For now, refresh all segments to ensure proper display
        if hasattr(self, "multi_view_mode_handler"):
            self.multi_view_mode_handler.display_all_segments()

    def _display_multi_view_edit_handles(self):
        """Display edit handles for selected polygons in multi-view mode."""
        # Clear existing handles first
        self._clear_multi_view_edit_handles()

        if self.mode != "edit":
            return

        selected_indices = self.right_panel.get_selected_segment_indices()
        handle_radius = self.point_radius
        handle_diam = handle_radius * 2

        # Initialize multi-view edit handles tracking
        if not hasattr(self, "multi_view_edit_handles"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_edit_handles = {i: [] for i in range(num_viewers)}

        for seg_idx in selected_indices:
            seg = self.segment_manager.segments[seg_idx]
            if seg.get("type") == "Polygon":
                # Display handles for each viewer
                for viewer_index in range(len(self.multi_view_viewers)):
                    viewer = self.multi_view_viewers[viewer_index]

                    # Get vertices for this viewer
                    if "views" in seg and viewer_index in seg["views"]:
                        vertices = seg["views"][viewer_index].get("vertices", [])
                    else:
                        vertices = seg.get("vertices", [])

                    # Create handles for each vertex
                    for v_idx, pt_list in enumerate(vertices):
                        pt = QPointF(pt_list[0], pt_list[1])
                        handle = MultiViewEditableVertexItem(
                            self,
                            seg_idx,
                            v_idx,
                            viewer_index,
                            -handle_radius,
                            -handle_radius,
                            handle_diam,
                            handle_diam,
                        )
                        handle.setPos(pt)
                        handle.setZValue(200)
                        handle.setAcceptHoverEvents(True)
                        viewer.scene().addItem(handle)
                        self.multi_view_edit_handles[viewer_index].append(handle)

    def _clear_multi_view_edit_handles(self):
        """Remove all multi-view editable vertex handles from the scenes."""
        if hasattr(self, "multi_view_edit_handles"):
            for viewer_index, handles in self.multi_view_edit_handles.items():
                for handle in handles:
                    if handle.scene():
                        self.multi_view_viewers[viewer_index].scene().removeItem(handle)
                handles.clear()

    def _highlight_multi_view_selected_segments(self):
        """Highlight selected segments in multi-view mode."""
        # For now, refresh all segments to ensure proper highlighting
        if hasattr(self, "multi_view_mode_handler"):
            self.multi_view_mode_handler.display_all_segments()

    def _sync_multi_view_polygon_edits(self, source_viewer_index):
        """Sync polygon edits from one viewer to linked segments in other viewers."""
        # This method would handle syncing edits between linked segments
        # For now, we'll implement basic functionality
        selected_indices = self.right_panel.get_selected_segment_indices()

        for i in selected_indices:
            segment = self.segment_manager.segments[i]
            if (
                segment.get("type") == "Polygon"
                and "views" in segment
                and source_viewer_index in segment["views"]
            ):
                source_vertices = segment["views"][source_viewer_index].get(
                    "vertices", []
                )

                # Update other viewers with the same vertices (for aligned images)
                for other_viewer_index in segment["views"]:
                    if other_viewer_index != source_viewer_index:
                        segment["views"][other_viewer_index]["vertices"] = [
                            [p[0], p[1]] for p in source_vertices
                        ]

        # Refresh display to show synchronized changes
        if hasattr(self, "multi_view_mode_handler"):
            self.multi_view_mode_handler.display_all_segments()

    def _handle_multi_view_crop_start(self, event, viewer_index):
        """Handle crop drawing start in multi-view mode."""
        if viewer_index >= len(self.multi_view_viewers):
            return

        viewer = self.multi_view_viewers[viewer_index]
        pos = event.scenePos()

        # Initialize multi-view crop state if needed
        if not hasattr(self, "multi_view_crop_start_pos"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_crop_start_pos = [None] * num_viewers
        if not hasattr(self, "multi_view_crop_rect_items"):
            config = self._get_multi_view_config()
            num_viewers = config["num_viewers"]
            self.multi_view_crop_rect_items = [None] * num_viewers

        # Store start position for this viewer
        self.multi_view_crop_start_pos[viewer_index] = pos

        # Create crop rectangle for this viewer
        from PyQt6.QtCore import Qt
        from PyQt6.QtGui import QPen
        from PyQt6.QtWidgets import QGraphicsRectItem

        self.multi_view_crop_rect_items[viewer_index] = QGraphicsRectItem()
        self.multi_view_crop_rect_items[viewer_index].setPen(
            QPen(Qt.GlobalColor.blue, 2, Qt.PenStyle.DashLine)
        )
        viewer.scene().addItem(self.multi_view_crop_rect_items[viewer_index])

    def _handle_multi_view_crop_move(self, event, viewer_index):
        """Handle crop drawing move in multi-view mode."""
        if (
            not hasattr(self, "multi_view_crop_rect_items")
            or not hasattr(self, "multi_view_crop_start_pos")
            or viewer_index >= len(self.multi_view_crop_rect_items)
            or not self.multi_view_crop_rect_items[viewer_index]
            or not self.multi_view_crop_start_pos[viewer_index]
        ):
            return

        from PyQt6.QtCore import QRectF

        current_pos = event.scenePos()
        start_pos = self.multi_view_crop_start_pos[viewer_index]
        rect = QRectF(start_pos, current_pos).normalized()
        self.multi_view_crop_rect_items[viewer_index].setRect(rect)

    def _handle_multi_view_crop_complete(self, event, viewer_index):
        """Handle crop drawing completion in multi-view mode."""
        if (
            not hasattr(self, "multi_view_crop_rect_items")
            or not hasattr(self, "multi_view_crop_start_pos")
            or viewer_index >= len(self.multi_view_crop_rect_items)
            or not self.multi_view_crop_rect_items[viewer_index]
        ):
            return

        viewer = self.multi_view_viewers[viewer_index]
        rect_item = self.multi_view_crop_rect_items[viewer_index]
        rect = rect_item.rect()

        # Clean up the drawing rectangle
        viewer.scene().removeItem(rect_item)
        self.multi_view_crop_rect_items[viewer_index] = None
        self.multi_view_crop_start_pos[viewer_index] = None

        if rect.width() > 5 and rect.height() > 5:  # Minimum crop size
            # Get actual crop coordinates
            x1, y1 = int(rect.left()), int(rect.top())
            x2, y2 = int(rect.right()), int(rect.bottom())

            # Apply the crop coordinates
            self._apply_crop_coordinates(x1, y1, x2, y2)
            self.crop_mode = False
            self._set_mode("sam_points")  # Return to default mode
