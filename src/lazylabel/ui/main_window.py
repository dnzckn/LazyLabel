"""Main application window."""

import contextlib
import hashlib
import os
from pathlib import Path

import cv2
import numpy as np
from PyQt6.QtCore import QPointF, Qt, QTimer
from PyQt6.QtGui import (
    QIcon,
    QKeySequence,
    QPixmap,
    QPolygonF,
    QShortcut,
)
from PyQt6.QtWidgets import (
    QFileDialog,
    QHBoxLayout,
    QMainWindow,
    QSplitter,
    QTableWidgetSelectionRange,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from ..config import HotkeyManager, Paths, Settings
from ..core import FileManager, ModelManager, SegmentManager, UndoRedoManager
from ..utils import CustomFileSystemModel, mask_to_pixmap
from ..utils.logger import logger
from ..viewmodels import SingleViewViewModel
from .control_panel import ControlPanel
from .handlers import SingleViewMouseHandler
from .hotkey_dialog import HotkeyDialog
from .managers import (
    AISegmentManager,
    CoordinateTransformer,
    CropManager,
    DrawingStateManager,
    EmbeddingCacheManager,
    ImageAdjustmentManager,
    ImagePreloadManager,
    KeyboardEventManager,
    ModeManager,
    MultiViewCoordinator,
    NotificationManager,
    PanelPopoutManager,
    PolygonDrawingManager,
    PropagationManager,
    SAMMultiViewManager,
    SAMPreloadScheduler,
    SAMWorkerManager,
    SaveExportManager,
    SegmentDisplayManager,
    SegmentTableManager,
    UILayoutManager,
    ViewportManager,
)
from .managers.propagation_manager import PropagationDirection
from .modes import SequenceViewMode
from .photo_viewer import PhotoViewer
from .right_panel import RightPanel
from .widgets import SequenceWidget, StatusBar, TimelineWidget
from .workers import (
    ImageDiscoveryWorker,
    PropagationWorker,
    SequenceInitWorker,
)


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

        # View mode - single, multi, or sequence
        self.view_mode = "single"

        # Viewer references (initialized in _setup_ui)
        self.viewer = None  # Main single view viewer
        self.sequence_viewer = None  # Sequence mode viewer

        # Sequence mode state (initialized in _setup_sequence_view_tab)
        self.sequence_view_mode: SequenceViewMode | None = None
        self.sequence_widget: SequenceWidget | None = None
        self.timeline_widget: TimelineWidget | None = None
        self.propagation_manager: PropagationManager | None = None
        self._propagation_worker: PropagationWorker | None = None
        self._sequence_init_worker: SequenceInitWorker | None = None

        # Sequence range selection state
        self._sequence_start_path: str | None = None
        self._sequence_end_path: str | None = None
        self._sequence_timeline_built: bool = False

        # Multi-view state
        self.multi_view_viewers: list[
            PhotoViewer
        ] = []  # Two PhotoViewers for multi-view
        self.multi_view_segment_managers: list[
            SegmentManager
        ] = []  # Per-viewer segment managers
        self.multi_view_image_paths: list[str | None] = [
            None,
            None,
        ]  # Per-viewer image paths
        self.multi_view_coordinator: MultiViewCoordinator | None = (
            None  # Coordinator for linked ops
        )
        self.sam_multi_view_manager: SAMMultiViewManager | None = (
            None  # Dual SAM models
        )

        # ========== MVVM: Create ViewModels ==========
        # ViewModels own state; Views react to their signals
        self.single_view_viewmodel = SingleViewViewModel(parent=self)

        # Connect ViewModel signals for reactive UI updates
        self._connect_viewmodel_signals()

        # Background image discovery for global image list
        self.image_discovery_worker = None
        self.cached_image_paths = []  # Cached list of image file paths (not image data)
        self.images_discovery_in_progress = False

        # Image preloading for instant navigation
        self.image_preload_manager = ImagePreloadManager(self, max_cache_size=5)

        # UI state is now in SingleViewViewModel
        # Property accessors provide backward compatibility

        # Panel pop-out state (managed by PanelPopoutManager)
        self.panel_popout_manager: PanelPopoutManager | None = None

        # Annotation state - uses property accessors delegating to self.settings
        # last_ai_filter_value is the only local state (not persisted)
        self.last_ai_filter_value = (
            100
            if self.settings.fragment_threshold == 0
            else self.settings.fragment_threshold
        )

        # polygon_epsilon_factor is computed from UI, stored locally
        self._polygon_epsilon_factor = 0.001

        # Image adjustment manager - initialized later after UI setup
        self.image_adjustment_manager: ImageAdjustmentManager | None = None

        # Drawing state manager - centralizes all drawing state
        self.drawing_state = DrawingStateManager()

        # Segment display state (not drawing state)
        self.segments, self.segment_items, self.highlight_items = [], {}, []
        self.edit_handles = []
        # Undo/redo manager - initialized later after UI setup
        self.undo_redo_manager = None  # Will be set in _setup_ui

        # Update state flags to prevent recursion
        self._updating_lists = False

        # Crop feature state (managed by CropManager)
        self.crop_manager: CropManager | None = None

        # Channel threshold widget cache
        self._cached_original_image = None  # Cache for performance optimization

        # SAM model update debouncing for "operate on view" mode
        self.sam_update_timer = QTimer()
        self.sam_update_timer.setSingleShot(True)  # Only fire once
        self.sam_update_timer.timeout.connect(self._update_sam_model_image_debounced)
        self.sam_update_delay = 500  # 500ms delay for regular value changes
        self.drag_finish_delay = 150  # 150ms delay when drag finishes (more responsive)
        self.any_slider_dragging = False  # Track if any slider is being dragged
        self.any_channel_threshold_dragging = (
            False  # Track if channel threshold slider is being dragged
        )
        # SAM state moved to SAMWorkerManager (initialized in _setup_ui)

        # Throttling timer for smooth slider updates during dragging
        self.slider_throttle_timer = QTimer()
        self.slider_throttle_timer.setSingleShot(True)
        self.slider_throttle_timer.timeout.connect(self._apply_throttled_slider_updates)
        self.slider_throttle_interval = (
            50  # 50ms = 20fps, good balance of smoothness and performance
        )
        self.pending_slider_update = False  # Track if we have pending slider updates
        self.pending_channel_threshold_update = (
            False  # Track if we have pending channel threshold updates
        )

        # Async save worker for background file I/O
        self.save_worker = None
        self.save_pending = False  # Track if a save is in progress

        # Smart caching for SAM embeddings to avoid redundant processing
        self.embedding_cache = EmbeddingCacheManager(max_size=10)

        # SAM preloading for next image (runs during idle time)
        # Initialized later after UI setup when callbacks are available
        self.sam_preload_scheduler: SAMPreloadScheduler | None = None

        self._setup_ui()
        logger.info("Step 5/8: Discovering available models...")
        self._setup_model_manager()  # Just setup manager, don't load model
        self._setup_connections()
        self._fix_fft_connection()  # Workaround for FFT signal connection issue
        self._setup_shortcuts()
        self._load_settings()

    # ========== SAM State Property Accessors (delegation to SAMWorkerManager) ==========

    def _get_sam_property(self, prop_name: str, default=None):
        """Get property from SAM worker manager with null safety."""
        if not hasattr(self, "sam_worker_manager") or self.sam_worker_manager is None:
            return default
        return getattr(self.sam_worker_manager, prop_name, default)

    def _set_sam_property(self, prop_name: str, value) -> None:
        """Set property on SAM worker manager with null safety."""
        if hasattr(self, "sam_worker_manager") and self.sam_worker_manager is not None:
            setattr(self.sam_worker_manager, prop_name, value)

    @property
    def sam_is_dirty(self) -> bool:
        """Check if SAM needs updating (delegates to SAMWorkerManager)."""
        return self._get_sam_property("sam_is_dirty", False)

    @sam_is_dirty.setter
    def sam_is_dirty(self, value: bool) -> None:
        self._set_sam_property("sam_is_dirty", value)

    @property
    def sam_is_updating(self) -> bool:
        """Check if SAM is updating (delegates to SAMWorkerManager)."""
        return self._get_sam_property("sam_is_updating", False)

    @sam_is_updating.setter
    def sam_is_updating(self, value: bool) -> None:
        self._set_sam_property("sam_is_updating", value)

    @property
    def sam_worker_thread(self):
        """Get SAM worker thread (delegates to SAMWorkerManager)."""
        return self._get_sam_property("sam_worker_thread", None)

    @sam_worker_thread.setter
    def sam_worker_thread(self, value) -> None:
        self._set_sam_property("sam_worker_thread", value)

    @property
    def sam_scale_factor(self) -> float:
        """Get SAM scale factor (delegates to SAMWorkerManager)."""
        return self._get_sam_property("sam_scale_factor", 1.0)

    @sam_scale_factor.setter
    def sam_scale_factor(self, value: float) -> None:
        self._set_sam_property("sam_scale_factor", value)

    @property
    def current_sam_hash(self) -> str | None:
        """Get current SAM hash (delegates to SAMWorkerManager)."""
        return self._get_sam_property("current_sam_hash", None)

    @current_sam_hash.setter
    def current_sam_hash(self, value: str | None) -> None:
        self._set_sam_property("current_sam_hash", value)

    @property
    def single_view_sam_init_worker(self):
        """Get single view init worker (delegates to SAMWorkerManager)."""
        return self._get_sam_property("single_view_init_worker", None)

    @single_view_sam_init_worker.setter
    def single_view_sam_init_worker(self, value) -> None:
        self._set_sam_property("single_view_init_worker", value)

    @property
    def single_view_model_initializing(self) -> bool:
        """Check if model is initializing (delegates to SAMWorkerManager)."""
        return self._get_sam_property("single_view_model_initializing", False)

    @single_view_model_initializing.setter
    def single_view_model_initializing(self, value: bool) -> None:
        self._set_sam_property("single_view_model_initializing", value)

    # ========== End SAM State Property Accessors ==========

    # ========== Drawing State Property Accessors (delegation to DrawingStateManager) ==========

    @property
    def point_items(self) -> list:
        """Get point items (delegates to DrawingStateManager)."""
        return self.drawing_state.point_items

    @property
    def positive_points(self) -> list:
        """Get positive points (delegates to DrawingStateManager)."""
        return self.drawing_state.positive_points

    @property
    def negative_points(self) -> list:
        """Get negative points (delegates to DrawingStateManager)."""
        return self.drawing_state.negative_points

    @property
    def polygon_points(self) -> list:
        """Get polygon points (delegates to DrawingStateManager)."""
        return self.drawing_state.polygon_points

    @property
    def polygon_preview_items(self) -> list:
        """Get polygon preview items (delegates to DrawingStateManager)."""
        return self.drawing_state.polygon_preview_items

    @property
    def rubber_band_line(self):
        """Get rubber band line (delegates to DrawingStateManager)."""
        return self.drawing_state.rubber_band_line

    @rubber_band_line.setter
    def rubber_band_line(self, value) -> None:
        """Set rubber band line (delegates to DrawingStateManager)."""
        self.drawing_state.rubber_band_line = value

    @property
    def rubber_band_rect(self):
        """Get rubber band rect (delegates to DrawingStateManager)."""
        return self.drawing_state.rubber_band_rect

    @rubber_band_rect.setter
    def rubber_band_rect(self, value) -> None:
        """Set rubber band rect (delegates to DrawingStateManager)."""
        self.drawing_state.rubber_band_rect = value

    @property
    def preview_mask_item(self):
        """Get preview mask item (delegates to DrawingStateManager)."""
        return self.drawing_state.preview_mask_item

    @preview_mask_item.setter
    def preview_mask_item(self, value) -> None:
        """Set preview mask item (delegates to DrawingStateManager)."""
        self.drawing_state.preview_mask_item = value

    @property
    def ai_click_start_pos(self):
        """Get AI click start position (delegates to DrawingStateManager)."""
        return self.drawing_state.ai_click_start_pos

    @ai_click_start_pos.setter
    def ai_click_start_pos(self, value) -> None:
        """Set AI click start position (delegates to DrawingStateManager)."""
        self.drawing_state.ai_click_start_pos = value

    @property
    def ai_click_time(self) -> int:
        """Get AI click time (delegates to DrawingStateManager)."""
        return self.drawing_state.ai_click_time

    @ai_click_time.setter
    def ai_click_time(self, value: int) -> None:
        """Set AI click time (delegates to DrawingStateManager)."""
        self.drawing_state.ai_click_time = value

    @property
    def ai_rubber_band_rect(self):
        """Get AI rubber band rect (delegates to DrawingStateManager)."""
        return self.drawing_state.ai_rubber_band_rect

    @ai_rubber_band_rect.setter
    def ai_rubber_band_rect(self, value) -> None:
        """Set AI rubber band rect (delegates to DrawingStateManager)."""
        self.drawing_state.ai_rubber_band_rect = value

    @property
    def is_dragging_polygon(self) -> bool:
        """Check if dragging polygon (delegates to DrawingStateManager)."""
        return self.drawing_state.is_dragging_polygon

    @is_dragging_polygon.setter
    def is_dragging_polygon(self, value: bool) -> None:
        """Set dragging polygon state (delegates to DrawingStateManager)."""
        self.drawing_state.is_dragging_polygon = value

    @property
    def drag_start_pos(self):
        """Get drag start position (delegates to DrawingStateManager)."""
        return self.drawing_state.drag_start_pos

    @drag_start_pos.setter
    def drag_start_pos(self, value) -> None:
        """Set drag start position (delegates to DrawingStateManager)."""
        self.drawing_state.drag_start_pos = value

    @property
    def drag_initial_vertices(self) -> dict:
        """Get drag initial vertices (delegates to DrawingStateManager)."""
        return self.drawing_state.drag_initial_vertices

    @drag_initial_vertices.setter
    def drag_initial_vertices(self, value: dict) -> None:
        """Set drag initial vertices (delegates to DrawingStateManager)."""
        self.drawing_state._drag_initial_vertices = value

    @property
    def ai_bbox_preview_mask(self):
        """Get AI bbox preview mask (delegates to DrawingStateManager)."""
        return self.drawing_state.ai_bbox_preview_mask

    @ai_bbox_preview_mask.setter
    def ai_bbox_preview_mask(self, value) -> None:
        """Set AI bbox preview mask (delegates to DrawingStateManager)."""
        self.drawing_state.ai_bbox_preview_mask = value

    @property
    def ai_bbox_preview_rect(self):
        """Get AI bbox preview rect (delegates to DrawingStateManager)."""
        return self.drawing_state.ai_bbox_preview_rect

    @ai_bbox_preview_rect.setter
    def ai_bbox_preview_rect(self, value) -> None:
        """Set AI bbox preview rect (delegates to DrawingStateManager)."""
        self.drawing_state.ai_bbox_preview_rect = value

    # ========== End Drawing State Property Accessors ==========

    # ========== SingleViewViewModel Property Accessors ==========

    @property
    def mode(self) -> str:
        """Get current mode (delegates to SingleViewViewModel)."""
        return self.single_view_viewmodel.current_mode

    @mode.setter
    def mode(self, value: str) -> None:
        """Set current mode (delegates to SingleViewViewModel)."""
        self.single_view_viewmodel.set_mode(value)

    @property
    def previous_mode(self) -> str:
        """Get previous mode (delegates to SingleViewViewModel)."""
        return self.single_view_viewmodel.previous_mode

    @previous_mode.setter
    def previous_mode(self, value: str) -> None:
        """Set previous mode (delegates to SingleViewViewModel)."""
        self.single_view_viewmodel._previous_mode = value

    @property
    def current_image_path(self) -> str | None:
        """Get current image path (delegates to SingleViewViewModel)."""
        return self.single_view_viewmodel.current_image_path

    @current_image_path.setter
    def current_image_path(self, value: str | None) -> None:
        """Set current image path (delegates to SingleViewViewModel)."""
        self.single_view_viewmodel.set_image(value)

    @property
    def current_file_index(self):
        """Get current file index (delegates to SingleViewViewModel)."""
        return self.single_view_viewmodel.current_file_index

    @current_file_index.setter
    def current_file_index(self, value) -> None:
        """Set current file index (delegates to SingleViewViewModel)."""
        self.single_view_viewmodel.set_file_index(value)

    # ========== End SingleViewViewModel Property Accessors ==========

    # ========== Settings Property Accessors ==========
    # These delegate to self.settings for single source of truth

    @property
    def point_radius(self) -> float:
        """Get point radius (computed from settings * multiplier, or override if set)."""
        if (
            hasattr(self, "_point_radius_override")
            and self._point_radius_override is not None
        ):
            return self._point_radius_override
        return self.settings.point_radius * self.settings.annotation_size_multiplier

    @point_radius.setter
    def point_radius(self, value: float) -> None:
        """Set point radius override (for testing)."""
        self._point_radius_override = value

    @property
    def line_thickness(self) -> float:
        """Get line thickness (computed from settings * multiplier, or override if set)."""
        if (
            hasattr(self, "_line_thickness_override")
            and self._line_thickness_override is not None
        ):
            return self._line_thickness_override
        return self.settings.line_thickness * self.settings.annotation_size_multiplier

    @line_thickness.setter
    def line_thickness(self, value: float) -> None:
        """Set line thickness override (for testing)."""
        self._line_thickness_override = value

    @property
    def pan_multiplier(self) -> float:
        """Get pan multiplier (delegates to settings)."""
        return self.settings.pan_multiplier

    @pan_multiplier.setter
    def pan_multiplier(self, value: float) -> None:
        """Set pan multiplier (delegates to settings)."""
        self.settings.pan_multiplier = value

    @property
    def polygon_join_threshold(self) -> int:
        """Get polygon join threshold (delegates to settings)."""
        return self.settings.polygon_join_threshold

    @polygon_join_threshold.setter
    def polygon_join_threshold(self, value: int) -> None:
        """Set polygon join threshold (delegates to settings)."""
        self.settings.polygon_join_threshold = value

    @property
    def fragment_threshold(self) -> int:
        """Get fragment threshold (delegates to settings)."""
        return self.settings.fragment_threshold

    @fragment_threshold.setter
    def fragment_threshold(self, value: int) -> None:
        """Set fragment threshold (delegates to settings)."""
        self.settings.fragment_threshold = value

    @property
    def auto_polygon_enabled(self) -> bool:
        """Get auto polygon enabled (delegates to settings)."""
        return self.settings.auto_polygon_enabled

    @auto_polygon_enabled.setter
    def auto_polygon_enabled(self, value: bool) -> None:
        """Set auto polygon enabled (delegates to settings)."""
        self.settings.auto_polygon_enabled = value

    @property
    def polygon_epsilon_factor(self) -> float:
        """Get polygon epsilon factor (local state)."""
        return self._polygon_epsilon_factor

    @polygon_epsilon_factor.setter
    def polygon_epsilon_factor(self, value: float) -> None:
        """Set polygon epsilon factor (local state)."""
        self._polygon_epsilon_factor = value

    # ========== End Settings Property Accessors ==========

    def _connect_viewmodel_signals(self) -> None:
        """Connect ViewModel signals for reactive UI updates."""
        # Single-view mode only - no signals to connect
        pass

    # ========== End ViewModel Signal Handlers ==========

    def _get_version(self) -> str:
        """Get version from the lazylabel package.

        Uses the centralized version detection in lazylabel/__init__.py
        which handles pip-installed, development, and PyInstaller bundle cases.
        """
        try:
            import lazylabel

            return lazylabel.__version__
        except Exception:
            pass
        return "unknown"

    @property
    def active_viewer(self):
        """Get the currently active viewer based on view mode.

        Returns the appropriate PhotoViewer for the current mode:
        - single mode: self.viewer
        - sequence mode: self.sequence_viewer
        - multi mode: first multi-view viewer (or self.viewer as fallback)
        """
        if self.view_mode == "sequence" and self.sequence_viewer is not None:
            return self.sequence_viewer
        if self.view_mode == "multi" and self.multi_view_viewers:
            return self.multi_view_viewers[0]
        return self.viewer

    def _setup_ui(self):
        """Setup the main user interface."""
        # Initialize undo/redo manager
        self.undo_redo_manager = UndoRedoManager(self)

        # Initialize crop manager
        self.crop_manager = CropManager(self)

        # Initialize panel popout manager
        self.panel_popout_manager = PanelPopoutManager(self)

        # Initialize image adjustment manager
        self.image_adjustment_manager = ImageAdjustmentManager(self)

        version = self._get_version()
        self.setWindowTitle(f"LazyLabel by DNC (version {version})")
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

        # Multi-view tab
        self._setup_multi_view_tab()

        # Sequence view tab
        self._setup_sequence_view_tab()

        # Initialize UI layout manager
        self.ui_layout_manager = UILayoutManager(self)

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

        # Initialize notification manager (after status_bar is created)
        self.notification_manager = NotificationManager(self)

        # Initialize viewport manager
        self.viewport_manager = ViewportManager(self)

        # Initialize segment display manager (handles caching and rendering)
        self.segment_display_manager = SegmentDisplayManager(self)

        # Initialize segment table manager (handles table and list operations)
        self.segment_table_manager = SegmentTableManager(self)

        # Initialize mode manager (handles mode switching and cursors)
        self.mode_manager = ModeManager(self)

        # Initialize keyboard event manager (handles keyboard shortcuts)
        self.keyboard_event_manager = KeyboardEventManager(self)

        # Initialize coordinate transformer (handles SAM coordinate transformations)
        self.coordinate_transformer = CoordinateTransformer(self)

        # Initialize SAM worker manager (handles all SAM worker lifecycles)
        self.sam_worker_manager = SAMWorkerManager(self)

        # Initialize save/export manager (handles all file output operations)
        self.save_export_manager = SaveExportManager(self)

        # Initialize mouse event handlers
        self.single_view_mouse_handler = SingleViewMouseHandler(self)

        # Initialize AI segment manager (handles SAM-based segmentation)
        self.ai_segment_manager = AISegmentManager(self)

        # Initialize polygon drawing manager
        self.polygon_drawing_manager = PolygonDrawingManager(self)

        # Initialize file navigation manager
        from .managers import EditModeManager, FileNavigationManager

        self.file_navigation_manager = FileNavigationManager(self)

        # Initialize edit mode manager
        self.edit_mode_manager = EditModeManager(self)

        # Setup file model
        self.file_model = CustomFileSystemModel()
        self.right_panel.setup_file_model(self.file_model)

        # Initialize SAM preload scheduler (after file_model is set up)
        self.sam_preload_scheduler = SAMPreloadScheduler(
            embedding_cache=self.embedding_cache,
            preload_callback=self._execute_sam_preload,
            get_next_path_callback=self._get_next_preload_path,
            should_preload_callback=self._can_preload_sam,
        )

        # Set minimum sizes for panels to prevent shrinking below preferred width
        self.control_panel.setMinimumWidth(self.control_panel.preferred_width)
        self.right_panel.setMinimumWidth(self.right_panel.preferred_width)

        # Set splitter properties
        self.main_splitter.setStretchFactor(0, 0)  # Control panel doesn't stretch
        self.main_splitter.setStretchFactor(1, 1)  # Viewer stretches
        self.main_splitter.setStretchFactor(2, 0)  # Right panel doesn't stretch
        self.main_splitter.setChildrenCollapsible(True)

        # Connect splitter signals for intelligent expand/collapse
        self.main_splitter.splitterMoved.connect(
            self.panel_popout_manager.handle_splitter_moved
        )

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

    def _fix_fft_connection(self):
        """Fix FFT signal connection issue - workaround for connection timing problem."""
        try:
            # Get the FFT widget directly and connect to its signal
            fft_widget = self.control_panel.get_fft_threshold_widget()
            if fft_widget:
                # Direct connection bypass - connect FFT widget directly to main window handler
                # This bypasses the control panel signal forwarding which has timing issues
                # Use a wrapper to ensure the connection works reliably
                def fft_signal_wrapper():
                    self._handle_fft_threshold_changed()

                fft_widget.fft_threshold_changed.connect(fft_signal_wrapper)

                logger.info("FFT signal connection bypass established successfully")
            else:
                logger.warning("FFT widget not found during connection fix")
        except Exception as e:
            logger.warning(f"Failed to establish FFT connection bypass: {e}")

        # Also fix channel threshold connection for RGB images
        try:
            channel_widget = self.control_panel.get_channel_threshold_widget()
            if channel_widget:
                # Direct connection bypass for channel threshold widget too
                def channel_signal_wrapper():
                    self._handle_channel_threshold_changed()

                channel_widget.thresholdChanged.connect(channel_signal_wrapper)

                logger.info(
                    "Channel threshold signal connection bypass established successfully"
                )
            else:
                logger.warning(
                    "Channel threshold widget not found during connection fix"
                )
        except Exception as e:
            logger.warning(
                f"Failed to establish channel threshold connection bypass: {e}"
            )

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
        self.control_panel.saturation_changed.connect(self._set_saturation)
        self.control_panel.reset_adjustments_requested.connect(
            self._reset_image_adjustments
        )
        self.control_panel.image_adjustment_changed.connect(
            self._handle_image_adjustment_changed
        )
        # Connect slider drag tracking signals
        self.control_panel.slider_drag_started.connect(self._on_slider_drag_started)
        self.control_panel.slider_drag_finished.connect(self._on_slider_drag_finished)

        # Border crop connections
        self.control_panel.crop_draw_requested.connect(
            self.crop_manager.start_crop_drawing
        )
        self.control_panel.crop_clear_requested.connect(self.crop_manager.clear_crop)
        self.control_panel.crop_applied.connect(
            self.crop_manager.apply_crop_coordinates
        )

        # Channel threshold connections
        self.control_panel.channel_threshold_changed.connect(
            self._handle_channel_threshold_changed
        )
        self.control_panel.channel_threshold_drag_started.connect(
            self._on_channel_threshold_drag_started
        )
        self.control_panel.channel_threshold_drag_finished.connect(
            self._on_channel_threshold_drag_finished
        )

        # FFT threshold connections
        try:
            self.control_panel.fft_threshold_changed.connect(
                self._handle_fft_threshold_changed
            )
            logger.debug("FFT threshold connection established in _setup_connections")
        except Exception as e:
            logger.error(f"Failed to establish FFT threshold connection: {e}")

        # AI segment auto-conversion
        self.control_panel.auto_polygon_toggled.connect(self._on_auto_polygon_toggled)
        self.control_panel.polygon_resolution_changed.connect(
            self._on_polygon_resolution_changed
        )
        self.control_panel.auto_polygon_reset.connect(self._on_auto_polygon_reset)

        # Sequence settings
        self.control_panel.sequence_max_requested.connect(
            self._on_sequence_max_requested
        )
        self.control_panel.sequence_load_memory_requested.connect(
            self._on_sequence_load_memory_requested
        )
        self.control_panel.sequence_clear_cache_requested.connect(
            self._on_sequence_clear_cache_requested
        )

        # Right panel connections
        self.right_panel.open_folder_requested.connect(self._open_folder_dialog)
        self.right_panel.image_selected.connect(self._load_selected_image)
        # Connect new path-based signal from FastFileManager
        self.right_panel.image_path_selected.connect(self._load_image_from_path)
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
        # File manager display settings
        self.right_panel.file_manager.displaySettingsChanged.connect(
            self._on_file_manager_settings_changed
        )

        # Panel pop-out functionality
        self.control_panel.pop_out_requested.connect(
            self.panel_popout_manager.pop_out_left_panel
        )
        self.right_panel.pop_out_requested.connect(
            self.panel_popout_manager.pop_out_right_panel
        )

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
            "convert_to_polygons": self._toggle_auto_polygon,
            "undo": self.undo_redo_manager.undo,
            "redo": self.undo_redo_manager.redo,
            "select_all": self._select_all_segments,
            "toggle_recent_class": self._toggle_recent_class,
            "save_segment": self._handle_space_press,
            "erase_segment": self._handle_shift_space_press,
            "save_output": self._handle_enter_press,
            "save_output_alt": self._handle_enter_press,
            "fit_view": self._handle_fit_view,
            "zoom_in": self._handle_zoom_in,
            "zoom_out": self._handle_zoom_out,
            "pan_up": lambda: self._handle_pan_key("up"),
            "pan_down": lambda: self._handle_pan_key("down"),
            "pan_left": lambda: self._handle_pan_key("left"),
            "pan_right": lambda: self._handle_pan_key("right"),
            "toggle_ai_filter": self._toggle_ai_filter,
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
        logger.debug(
            f"Loading settings: pixel_priority_enabled={self.settings.pixel_priority_enabled}, "
            f"pixel_priority_ascending={self.settings.pixel_priority_ascending}"
        )
        self.control_panel.set_settings(self.settings.__dict__)
        self.control_panel.set_annotation_size(
            int(self.settings.annotation_size_multiplier * 10)
        )
        self.control_panel.set_pan_speed(int(self.settings.pan_multiplier * 10))
        self.control_panel.set_join_threshold(self.settings.polygon_join_threshold)
        self.control_panel.set_fragment_threshold(self.settings.fragment_threshold)
        # Restore auto-polygon settings
        self.control_panel.set_auto_polygon_enabled(self.settings.auto_polygon_enabled)
        self.control_panel.polygon_resolution_slider.setValue(
            self.settings.polygon_resolution
        )
        self.auto_polygon_enabled = self.settings.auto_polygon_enabled
        self.polygon_epsilon_factor = self.control_panel.get_polygon_epsilon()
        # Restore file manager display settings
        self.right_panel.file_manager.setDisplaySettings(
            {
                "show_name": self.settings.file_manager_show_name,
                "show_npz": self.settings.file_manager_show_npz,
                "show_txt": self.settings.file_manager_show_txt,
                "show_modified": self.settings.file_manager_show_modified,
                "show_size": self.settings.file_manager_show_size,
                "sort_order": self.settings.file_manager_sort_order,
            }
        )
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

        # Spacebar is now handled by the hotkey manager (calls _handle_space_press)

    def _setup_sequence_viewer_mouse_handlers(self):
        """Setup mouse handlers for sequence viewer (same as single view)."""
        if not hasattr(self, "sequence_viewer") or self.sequence_viewer is None:
            return

        # Store original handlers
        self._seq_original_mouse_press = self.sequence_viewer.scene().mousePressEvent
        self._seq_original_mouse_move = self.sequence_viewer.scene().mouseMoveEvent
        self._seq_original_mouse_release = (
            self.sequence_viewer.scene().mouseReleaseEvent
        )

        # Override with our handlers (same as single view)
        self.sequence_viewer.scene().mousePressEvent = self._scene_mouse_press
        self.sequence_viewer.scene().mouseMoveEvent = self._scene_mouse_move
        self.sequence_viewer.scene().mouseReleaseEvent = self._scene_mouse_release

    # Mode management methods
    def set_sam_mode(self):
        """Set mode to AI (combines SAM points and bounding box)."""
        self.mode_manager.set_sam_mode()

    def set_polygon_mode(self):
        """Set polygon drawing mode."""
        self.mode_manager.set_polygon_mode()

    def set_bbox_mode(self):
        """Set bounding box drawing mode."""
        self.mode_manager.set_bbox_mode()

    def toggle_selection_mode(self):
        """Toggle selection mode."""
        self.mode_manager.toggle_selection_mode()

    def toggle_pan_mode(self):
        """Toggle pan mode."""
        self.mode_manager.toggle_pan_mode()

    def toggle_edit_mode(self):
        """Toggle edit mode."""
        self.mode_manager.toggle_edit_mode()

    def _handle_edit_mode_request(self):
        """Handle edit mode request with validation."""
        self.mode_manager.handle_edit_mode_request()

    def _set_mode(self, mode_name, is_toggle=False):
        """Set the current mode."""
        self.mode_manager.set_mode(mode_name, is_toggle)

    def _toggle_mode(self, new_mode):
        """Toggle between modes."""
        self.mode_manager.toggle_mode(new_mode)

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
            self.control_panel.set_current_model("Selected: Default SAM Model")
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
        """Set annotation size multiplier. point_radius/line_thickness are computed."""
        self.settings.annotation_size_multiplier = value / 10.0

    def _set_pan_speed(self, value):
        """Set pan speed."""
        self.pan_multiplier = value / 10.0  # Property setter updates settings

    def _set_join_threshold(self, value):
        """Set polygon join threshold."""
        self.polygon_join_threshold = value  # Property setter updates settings

    def _set_fragment_threshold(self, value):
        """Set fragment threshold for AI segment filtering."""
        if value > 0:
            self.last_ai_filter_value = value
        self.fragment_threshold = value  # Property setter updates settings

    def _on_slider_drag_started(self):
        """Handle slider drag start."""
        self.any_slider_dragging = True

    def _on_slider_drag_finished(self):
        """Handle slider drag finish."""
        self.any_slider_dragging = False
        # Apply any pending updates immediately when drag finishes
        if self.pending_slider_update:
            self.slider_throttle_timer.stop()
            self.pending_slider_update = False
            self._apply_image_adjustments_to_all_viewers()

    def _set_brightness(self, value):
        """Set image brightness."""
        self.image_adjustment_manager.set_brightness(value)

    def _set_contrast(self, value):
        """Set image contrast."""
        self.image_adjustment_manager.set_contrast(value)

    def _set_gamma(self, value):
        """Set image gamma."""
        self.image_adjustment_manager.set_gamma(value)

    def _set_saturation(self, value):
        """Set image saturation."""
        self.image_adjustment_manager.set_saturation(value)

    def _apply_throttled_slider_updates(self):
        """Apply pending slider updates (called by throttle timer)."""
        if self.pending_slider_update:
            self.pending_slider_update = False
            self.image_adjustment_manager.apply_to_all_viewers()

        if self.pending_channel_threshold_update:
            self.pending_channel_threshold_update = False
            self._apply_channel_threshold_now()

    def _apply_image_adjustments_to_all_viewers(self):
        """Apply current image adjustments to all active viewers."""
        self.image_adjustment_manager.apply_to_all_viewers()

    def _reset_image_adjustments(self):
        """Reset all image adjustment settings to their default values."""
        self.image_adjustment_manager.reset_to_defaults()

    def _handle_settings_changed(self):
        """Handle changes in settings."""
        # Get old operate_on_view setting
        old_operate_on_view = self.settings.operate_on_view

        # Update the main window's settings object with the latest from the widget
        widget_settings = self.control_panel.settings_widget.get_settings()
        logger.debug(
            f"Settings changed: pixel_priority_enabled={widget_settings.get('pixel_priority_enabled')}, "
            f"pixel_priority_ascending={widget_settings.get('pixel_priority_ascending')}"
        )
        self.settings.update(**widget_settings)
        logger.debug(
            f"Settings object updated: pixel_priority_enabled={self.settings.pixel_priority_enabled}, "
            f"pixel_priority_ascending={self.settings.pixel_priority_ascending}"
        )

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
        # Always apply brightness/contrast/gamma to display regardless of operate_on_view setting
        # This ensures changes are applied when slider is released (especially important in operate_on_view mode)

        # First, always apply the image adjustments to ensure the display is updated
        self._apply_image_adjustments_to_all_viewers()

        # Handle multi-view mode
        if not self.current_image_path:
            return

        # Update SAM model if in operate_on_view mode
        if self.settings.operate_on_view:
            self._apply_image_processing_fast()

        # Additionally mark SAM as dirty if operate_on_view is enabled
        if self.settings.operate_on_view:
            self._mark_sam_dirty()

    # File management methods
    def _open_folder_dialog(self):
        """Open folder dialog for images."""
        folder_path = QFileDialog.getExistingDirectory(self, "Select Image Folder")
        if folder_path:
            self.right_panel.set_folder(folder_path, self.file_model)
            # Start fast background image discovery using os.scandir()
            self._start_background_image_discovery()
        self.viewer.setFocus()

    def _load_image_from_path(self, file_path: Path):
        """Load image from a Path object (used by FastFileManager)."""
        if not file_path.is_file() or not self.file_manager.is_image_file(
            str(file_path)
        ):
            return

        # In sequence mode, check if the file is part of the loaded sequence
        if self.view_mode == "sequence" and self.sequence_view_mode:
            file_str = str(file_path)
            frame_idx = self.sequence_view_mode.get_frame_idx_for_path(file_str)
            if frame_idx is not None:
                # File is in sequence - navigate to that frame instead of breaking
                self._on_sequence_frame_selected(frame_idx)
                return
            # File is outside sequence - continue with normal loading
            # which will switch to single view mode

        # Normal loading for single view or files outside sequence
        self._load_image_by_path(str(file_path))

    def _load_selected_image(self, index):
        """Load the selected image (delegates to FileNavigationManager)."""
        self.file_navigation_manager.load_selected_image(index)

    def _load_image_by_path(self, path: str):
        """Load image by path (delegates to FileNavigationManager)."""
        self.file_navigation_manager.load_image_by_path(path)

    def _get_index_for_path(self, path):
        """Get QModelIndex for path (delegates to FileNavigationManager)."""
        return self.file_navigation_manager.get_index_for_path(path)

    def _get_next_image_from_file_model(self, current_index):
        """Get next image from file model (delegates to FileNavigationManager)."""
        return self.file_navigation_manager.get_next_image_from_file_model(
            current_index
        )

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
        """Updates the SAM model's image based on the 'Operate On View' setting.

        Uses LRU cache for embeddings to avoid expensive recomputation when
        returning to previously viewed images.
        """
        if not self.model_manager.is_model_available() or not self.current_image_path:
            return

        if self.settings.operate_on_view:
            # Pass the adjusted image (QImage) to SAM model
            # Convert QImage to numpy array
            # Use active_viewer to support all view modes (single, sequence, multi)
            viewer = self.active_viewer
            qimage = viewer._adjusted_pixmap.toImage()
            ptr = qimage.constBits()
            ptr.setsize(qimage.bytesPerLine() * qimage.height())
            image_np = np.array(ptr).reshape(qimage.height(), qimage.width(), 4)
            # Convert from BGRA to RGB for SAM
            image_rgb = cv2.cvtColor(image_np, cv2.COLOR_BGRA2RGB)
            image_hash = self._get_image_hash(image_rgb)

            # Check cache first - get() updates LRU ordering automatically
            embeddings = self.embedding_cache.get(image_hash)
            if embeddings is not None and self.model_manager.sam_model.set_embeddings(
                embeddings
            ):
                self.current_sam_hash = image_hash
                self.sam_is_dirty = False
                return

            # Not cached - compute embeddings
            self.model_manager.sam_model.set_image_from_array(image_rgb)
            self.current_sam_hash = image_hash

            # Cache the new embeddings
            self._cache_sam_embeddings(image_hash)
        else:
            # Pass the original image path to SAM model
            image_hash = hashlib.md5(self.current_image_path.encode()).hexdigest()

            # Check cache first - get() updates LRU ordering automatically
            embeddings = self.embedding_cache.get(image_hash)
            if embeddings is not None and self.model_manager.sam_model.set_embeddings(
                embeddings
            ):
                self.current_sam_hash = image_hash
                self.sam_is_dirty = False
                return

            # Not cached - load and compute embeddings
            self.model_manager.sam_model.set_image_from_path(self.current_image_path)
            self.current_sam_hash = image_hash

            # Cache the new embeddings
            self._cache_sam_embeddings(image_hash)

        # Mark SAM as clean since we just updated it
        self.sam_is_dirty = False

    def _cache_sam_embeddings(self, image_hash):
        """Cache SAM embeddings with LRU eviction."""
        embeddings = self.model_manager.sam_model.get_embeddings()
        if embeddings is not None:
            # put() handles LRU eviction automatically
            self.embedding_cache.put(image_hash, embeddings)

            # Schedule preloading of next image after a short delay
            # This runs during "idle" time after the current image is ready
            self._schedule_sam_preload()

    def _load_next_image(self):
        """Load next image (delegates to FileNavigationManager)."""
        self.file_navigation_manager.load_next_image()

    def _load_previous_image(self):
        """Load previous image (delegates to FileNavigationManager)."""
        self.file_navigation_manager.load_previous_image()

    # Segment management methods
    def _assign_selected_to_class(self):
        """Assign selected segments to class."""
        if self.view_mode == "multi":
            # Merge from all viewers that have selections
            for viewer_idx in range(len(self.multi_view_segment_tables)):
                table = self.multi_view_segment_tables[viewer_idx]
                if table.selectedItems():
                    self._merge_multi_view_selected_segments(viewer_idx)
        else:
            self.segment_table_manager.assign_selected_to_class()

    def _select_all_segments(self):
        """Select all segments in current view mode."""
        if self.view_mode == "multi":
            # When linked, select all in both viewers; otherwise just active viewer
            if self.multi_view_coordinator and self.multi_view_coordinator.is_linked:
                # Block signals to avoid cascading sync calls
                for table in self.multi_view_segment_tables:
                    table.blockSignals(True)

                # Select all in both tables
                for table in self.multi_view_segment_tables:
                    table.selectAll()

                # Re-enable signals
                for table in self.multi_view_segment_tables:
                    table.blockSignals(False)

                # Manually trigger highlight update for both viewers
                for viewer_idx in range(len(self.multi_view_segment_tables)):
                    self._highlight_multi_view_selected_segments(viewer_idx)

                # Update edit handles if in edit mode
                if self.mode == "edit":
                    self._display_multi_view_edit_handles()
            else:
                # Unlinked - only select in active viewer
                active_idx = (
                    self.multi_view_coordinator.active_viewer_idx
                    if self.multi_view_coordinator
                    else 0
                )
                self.multi_view_segment_tables[active_idx].selectAll()
        else:
            self.right_panel.select_all_segments()

    def _delete_selected_segments(self):
        """Delete selected segments and remove any highlight overlays."""
        if self.view_mode == "multi":
            # Block signals during deletion to prevent selection sync issues
            for table in self.multi_view_segment_tables:
                table.blockSignals(True)

            try:
                # Collect selections from ALL viewers FIRST before deleting anything
                viewer_selections = {}
                for viewer_idx in range(len(self.multi_view_segment_tables)):
                    table = self.multi_view_segment_tables[viewer_idx]
                    selected_rows = sorted(
                        {item.row() for item in table.selectedItems()}, reverse=True
                    )
                    selected_indices = []
                    for row in selected_rows:
                        item = table.item(row, 0)
                        if item:
                            with contextlib.suppress(ValueError):
                                selected_indices.append(int(item.text()))
                    if selected_indices:
                        viewer_selections[viewer_idx] = selected_indices

                # Now delete from each viewer
                for viewer_idx, indices in viewer_selections.items():
                    segment_manager = self.multi_view_segment_managers[viewer_idx]

                    # Clear highlights
                    if hasattr(self, "multi_view_highlight_items"):
                        for item in self.multi_view_highlight_items.get(viewer_idx, []):
                            if item.scene():
                                item.scene().removeItem(item)
                        self.multi_view_highlight_items[viewer_idx] = []

                    # Delete segments
                    segment_manager.delete_segments(sorted(indices, reverse=True))

                    # Update displays
                    self._update_multi_view_segment_table(viewer_idx)
                    self._update_multi_view_class_table(viewer_idx)
                    self._display_multi_view_segments(viewer_idx)

                if viewer_selections:
                    total_deleted = sum(len(v) for v in viewer_selections.values())
                    self._show_notification(f"Deleted {total_deleted} segment(s)")
            finally:
                # Restore signals
                for table in self.multi_view_segment_tables:
                    table.blockSignals(False)
        else:
            self.segment_table_manager.delete_selected_segments()

    def _on_auto_polygon_toggled(self, enabled: bool):
        """Handle auto-polygon toggle state change."""
        self.auto_polygon_enabled = enabled
        self.settings.auto_polygon_enabled = enabled
        self._save_settings()
        status = "ON" if enabled else "OFF"
        self._show_notification(f"Auto-Convert AI to Polygon: {status}")
        logger.debug(f"Auto-polygon conversion: {status}")

    def _on_polygon_resolution_changed(self, epsilon: float):
        """Handle polygon resolution slider change."""
        self.polygon_epsilon_factor = epsilon
        self.settings.polygon_resolution = (
            self.control_panel.polygon_resolution_slider.value()
        )
        self._save_settings()

    def _toggle_auto_polygon(self):
        """Toggle auto-polygon conversion feature (hotkey handler)."""
        self.control_panel.toggle_auto_polygon()

    def _on_auto_polygon_reset(self):
        """Handle auto-polygon settings reset to defaults."""
        self._show_notification("Auto-polygon settings reset to defaults")

    def _on_file_manager_settings_changed(self):
        """Handle file manager display settings change."""
        settings = self.right_panel.file_manager.getDisplaySettings()
        self.settings.file_manager_show_name = settings["show_name"]
        self.settings.file_manager_show_npz = settings["show_npz"]
        self.settings.file_manager_show_txt = settings["show_txt"]
        self.settings.file_manager_show_modified = settings["show_modified"]
        self.settings.file_manager_show_size = settings["show_size"]
        self.settings.file_manager_sort_order = settings["sort_order"]
        self._save_settings()

    def _create_segment_from_mask(self, mask):
        """Create a segment from a mask, optionally converting to polygon.

        If auto_polygon_enabled is True, creates a Polygon segment.
        Otherwise, creates an AI (mask-based) segment.

        Args:
            mask: Binary mask (numpy array)

        Returns:
            Segment dictionary ready to be added to segment_manager
        """
        from ..utils.logger import logger

        logger.debug(
            f"_create_segment_from_mask: auto_polygon_enabled={self.auto_polygon_enabled}, "
            f"mask shape={mask.shape if mask is not None else None}, "
            f"mask dtype={mask.dtype if mask is not None else None}"
        )

        if self.auto_polygon_enabled:
            # Convert mask to polygon vertices
            vertices = self.segment_manager._mask_to_polygon_vertices(
                mask, self.polygon_epsilon_factor
            )
            logger.debug(
                f"_mask_to_polygon_vertices returned: "
                f"{len(vertices) if vertices else 0} vertices"
            )
            if vertices and len(vertices) >= 3:
                return {
                    "type": "Polygon",
                    "vertices": vertices,
                    "mask": None,
                }

        # Fallback to AI segment (or if polygon conversion failed)
        return {
            "type": "AI",
            "mask": mask,
            "vertices": None,
        }

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

        selected_indices = self.right_panel.get_selected_segment_indices()
        if not selected_indices:
            return

        # Handle single view mode
        self.segment_display_manager.highlight_segments_single_view(selected_indices)

    def _handle_alias_change(self, class_id: int, alias: str) -> None:
        """Handle class alias change."""
        self.segment_table_manager.handle_alias_change(class_id, alias)

    def _reassign_class_ids(self):
        """Reassign class IDs."""
        self.segment_table_manager.reassign_class_ids()

    def _update_segment_table(self):
        """Update segment table."""
        self.segment_table_manager.update_segment_table()

    def _get_current_table_filter(self):
        """Get the current table filter settings."""
        return self.segment_table_manager.get_current_table_filter()

    def _segment_passes_filter(self, segment, show_all, filter_class_id):
        """Check if a segment passes the current filter."""
        return self.segment_table_manager.segment_passes_filter(
            segment, show_all, filter_class_id
        )

    def _add_row_to_segment_table(self, segment_index):
        """Add a single row to the segment table for a new segment."""
        self.segment_table_manager.add_row_to_segment_table(segment_index)

    def _remove_row_from_segment_table(self, segment_index):
        """Remove a row from segment table and shift remaining indices."""
        self.segment_table_manager.remove_row_from_segment_table(segment_index)

    def _update_all_lists(self, invalidate_cache=True):
        """Update all UI lists."""
        self.segment_table_manager.update_all_lists(invalidate_cache)

    def _update_class_list(self):
        """Update the class list in the right panel."""
        self.segment_table_manager.update_class_list()

    def _update_class_filter(self):
        """Update the class filter combo box."""
        self.segment_table_manager.update_class_filter()

    def _display_all_segments(self):
        """Display all segments on the viewer."""
        if self.view_mode == "sequence":
            # Sequence mode has its own segment tracking
            self._display_sequence_segments()
        else:
            self.segment_display_manager.display_all_segments_single_view()

    def _add_segment_to_display(self, segment_index):
        """Add a single segment to the display without clearing existing segments.

        This is an O(1) operation compared to _display_all_segments which is O(n).

        Args:
            segment_index: Index of the segment to display
        """
        self.segment_display_manager.add_segment_to_display_single_view(segment_index)

    def _remove_segment_from_display(self, segment_index):
        """Remove a single segment from display.

        Args:
            segment_index: Index of the segment to remove
        """
        self.segment_display_manager.remove_segment_from_display_single_view(
            segment_index
        )

    def _update_lists_incremental(self, added_segment_index=None, removed_indices=None):
        """Update UI lists with incremental segment display updates."""
        self.segment_table_manager.update_lists_incremental(
            added_segment_index, removed_indices
        )

    def _shift_segment_items_after_deletion(self, deleted_index):
        """Shift segment_items dict keys after a segment deletion."""
        self.segment_table_manager.shift_segment_items_after_deletion(deleted_index)

    def _handle_escape_press(self):
        """Handle escape key press.

        Delegates to KeyboardEventManager for the actual implementation.
        """
        self.keyboard_event_manager.handle_escape_press()

    def _handle_space_press(self):
        """Handle space key press.

        Delegates to KeyboardEventManager for the actual implementation.
        """
        self.keyboard_event_manager.handle_space_press()

    def _handle_shift_space_press(self):
        """Handle Shift+Space key press for erase functionality.

        Delegates to KeyboardEventManager for the actual implementation.
        """
        self.keyboard_event_manager.handle_shift_space_press()

    def _handle_enter_press(self):
        """Handle enter key press.

        Delegates to KeyboardEventManager for the actual implementation.
        """
        self.keyboard_event_manager.handle_enter_press()

    def _save_current_segment(self):
        """Save current SAM segment with fragment threshold filtering.

        Delegates to SaveExportManager for the actual implementation.
        """
        self.save_export_manager.save_current_ai_segment()

    def _toggle_ai_filter(self):
        """Toggle AI filter between 0 and last set value.

        Delegates to SaveExportManager for the actual implementation.
        """
        self.save_export_manager.toggle_ai_filter()

    def _apply_fragment_threshold(self, mask):
        """Apply fragment threshold filtering to remove small segments.

        Delegates to SaveExportManager for the actual implementation.
        """
        return self.save_export_manager.apply_fragment_threshold(mask)

    def _finalize_polygon(self, erase_mode=False):
        """Finalize polygon drawing.

        Delegates to PolygonDrawingManager for the actual implementation.
        """
        self.polygon_drawing_manager.finalize_polygon(erase_mode)

    def _get_segments_for_viewer(self, viewer_index):
        """Get segments that apply to a specific viewer.

        Delegates to SaveExportManager for the actual implementation.
        """
        return self.save_export_manager.get_segments_for_viewer(viewer_index)

    def _save_output_to_npz(self):
        """Save output to NPZ and TXT files.

        Delegates to SaveExportManager for the actual implementation.
        """
        self.save_export_manager.save_output()

    def _handle_merge_press(self):
        """Handle merge key press.

        Delegates to KeyboardEventManager for the actual implementation.
        """
        self.keyboard_event_manager.handle_merge_press()

    def clear_all_points(self):
        """Clear all temporary points - works in both single and multi-view mode.

        Delegates to KeyboardEventManager for the actual implementation.
        """
        self.keyboard_event_manager.clear_all_points()

    def _show_notification(self, message, duration=3000):
        """Show notification message."""
        self.notification_manager.show(message, duration)

    def _show_error_notification(self, message, duration=8000):
        """Show error notification message."""
        self.notification_manager.show_error(message, duration)

    def _show_success_notification(self, message, duration=3000):
        """Show success notification message."""
        self.notification_manager.show_success(message, duration)

    def _show_warning_notification(self, message, duration=5000):
        """Show warning notification message."""
        self.notification_manager.show_warning(message, duration)

    def _clear_notification(self):
        """Clear notification from status bar."""
        self.notification_manager.clear()

    def _accept_ai_segment(self, erase_mode=False):
        """Accept the current AI segment preview (spacebar handler).

        Delegates to AISegmentManager for the actual implementation.
        """
        self.ai_segment_manager.accept_ai_segment(erase_mode)

    def _show_hotkey_dialog(self):
        """Show the hotkey configuration dialog."""
        dialog = HotkeyDialog(self.hotkey_manager, self)
        dialog.exec()
        # Update shortcuts after dialog closes
        self._update_shortcuts()

    def _handle_zoom_in(self):
        """Handle zoom in."""
        self.viewport_manager.zoom_in()

    def _handle_zoom_out(self):
        """Handle zoom out."""
        self.viewport_manager.zoom_out()

    def _handle_pan_key(self, direction):
        """Handle WASD pan keys - works in both single and multi-view mode."""
        self.viewport_manager.pan(direction)

    def _handle_fit_view(self):
        """Handle fit view hotkey - works in both single and multi-view mode."""
        self.viewport_manager.fit_view()

    def closeEvent(self, event):
        """Handle application close."""
        # Close any popped-out panels first
        if self.panel_popout_manager is not None:
            if self.panel_popout_manager.left_panel_popout is not None:
                self.panel_popout_manager.left_panel_popout.close()
            if self.panel_popout_manager.right_panel_popout is not None:
                self.panel_popout_manager.right_panel_popout.close()

        # Clean up background workers
        if self.image_discovery_worker:
            self.image_discovery_worker.stop()
            self.image_discovery_worker.quit()
            self.image_discovery_worker.wait()
            self.image_discovery_worker.deleteLater()

        # Clean up propagation workers
        self._cleanup_propagation_worker()
        if self._sequence_init_worker is not None:
            if self._sequence_init_worker.isRunning():
                self._sequence_init_worker.stop()
                self._sequence_init_worker.wait(2000)
            self._sequence_init_worker.deleteLater()
            self._sequence_init_worker = None

        # Clean up video predictor
        if self.propagation_manager is not None:
            self.propagation_manager.cleanup()

        # Save settings
        logger.debug(
            f"Saving settings: pixel_priority_enabled={self.settings.pixel_priority_enabled}, "
            f"pixel_priority_ascending={self.settings.pixel_priority_ascending}"
        )
        self.settings.save_to_file(str(self.paths.settings_file))
        super().closeEvent(event)

    def _save_settings(self):
        """Save settings to file immediately."""
        self.settings.save_to_file(str(self.paths.settings_file))

    def _reset_state(self):
        """Reset application state."""
        self.clear_all_points()
        self.segment_manager.clear()

        # Clear all performance caches when resetting state
        self.segment_display_manager.clear_all_caches()

        self._update_all_lists()

        # Clean up crop visuals
        self.crop_manager.remove_crop_visual()
        self.crop_manager.remove_crop_hover_overlay()
        self.crop_manager.remove_crop_hover_effect()

        # Reset crop state
        self.crop_manager.crop_mode = False
        self.crop_manager.crop_start_pos = None
        self.crop_manager.current_crop_coords = None

        # Reset SAM model state - force reload for new image
        self.current_sam_hash = None  # Invalidate SAM cache
        self.sam_is_dirty = True  # Mark SAM as needing update
        self.sam_scale_factor = 1.0  # Reset scale factor to prevent coordinate mismatch

        # Clear cached image data to prevent using previous image
        self._cached_original_image = None

        # Note: SAM embedding cache is intentionally NOT cleared here
        # The cache persists across image navigations for performance

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
        if self.undo_redo_manager is not None:
            self.undo_redo_manager.clear_history()

        # Add bounding box preview state
        self.ai_bbox_preview_mask = None
        self.ai_bbox_preview_rect = None

    def _scene_mouse_press(self, event):
        """Handle mouse press events in the scene.

        Delegates to SingleViewMouseHandler for the actual implementation.
        """
        self.single_view_mouse_handler.handle_mouse_press(event)

    def _scene_mouse_move(self, event):
        """Handle mouse move events in the scene.

        Delegates to SingleViewMouseHandler for the actual implementation.
        """
        self.single_view_mouse_handler.handle_mouse_move(event)

    def _scene_mouse_release(self, event):
        """Handle mouse release events in the scene.

        Delegates to SingleViewMouseHandler for the actual implementation.
        """
        self.single_view_mouse_handler.handle_mouse_release(event)

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

                # Scale mask back up to display size if needed
                mask = self.coordinate_transformer.scale_mask_to_display(mask)

                # Store the preview mask and rect for later confirmation
                self.ai_bbox_preview_mask = mask
                self.ai_bbox_preview_rect = rect

                # Clear any existing preview
                if hasattr(self, "preview_mask_item") and self.preview_mask_item:
                    self.active_viewer.scene().removeItem(self.preview_mask_item)

                # Show preview with yellow color
                pixmap = mask_to_pixmap(mask, (255, 255, 0))
                self.preview_mask_item = self.active_viewer.scene().addPixmap(pixmap)
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
        """Add a point for SAM segmentation.

        Delegates to AISegmentManager for the actual implementation.
        """
        return self.ai_segment_manager.add_point(pos, positive, update_segmentation)

    def _update_segmentation(self):
        """Update SAM segmentation preview.

        Delegates to AISegmentManager for the actual implementation.
        """
        self.ai_segment_manager.update_segmentation()

    def _handle_polygon_click(self, pos):
        """Handle polygon drawing clicks.

        Delegates to PolygonDrawingManager for the actual implementation.
        """
        self.polygon_drawing_manager.handle_polygon_click(pos)

    def _draw_polygon_preview(self):
        """Draw polygon preview lines and fill.

        Delegates to PolygonDrawingManager for the actual implementation.
        """
        self.polygon_drawing_manager.draw_polygon_preview()

    def _handle_segment_selection_click(self, pos):
        """Handle segment selection clicks (toggle behavior)."""
        x, y = int(pos.x()), int(pos.y())
        for i in range(len(self.segment_manager.segments) - 1, -1, -1):
            seg = self.segment_manager.segments[i]
            # Determine mask for hit-testing
            if seg.get("type") == "Polygon" and seg.get("vertices"):
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

    def _handle_multi_view_segment_selection_click(self, viewer_idx: int, pos):
        """Handle segment selection clicks in multi-view mode.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
            pos: Click position in scene coordinates
        """
        import cv2

        x, y = int(pos.x()), int(pos.y())
        segment_manager = self.multi_view_segment_managers[viewer_idx]
        viewer = self.multi_view_viewers[viewer_idx]
        table = self.multi_view_segment_tables[viewer_idx]

        # Iterate segments from top (most recent) to bottom
        for i in range(len(segment_manager.segments) - 1, -1, -1):
            seg = segment_manager.segments[i]

            # Determine mask for hit-testing
            if seg.get("type") == "Polygon" and seg.get("vertices"):
                # Rasterize polygon
                if viewer._pixmap_item.pixmap().isNull():
                    continue
                h = viewer._pixmap_item.pixmap().height()
                w = viewer._pixmap_item.pixmap().width()
                points_np = np.array(seg["vertices"], dtype=np.int32)
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
                # Find the row in the table and toggle selection
                for j in range(table.rowCount()):
                    item = table.item(j, 0)
                    if item:
                        try:
                            seg_idx = int(item.text())
                            if seg_idx == i:
                                # Toggle selection for this row
                                is_selected = item.isSelected()
                                range_to_select = QTableWidgetSelectionRange(
                                    j, 0, j, table.columnCount() - 1
                                )
                                table.setRangeSelected(range_to_select, not is_selected)

                                # Sync to other viewer if linked
                                if (
                                    self.multi_view_coordinator
                                    and self.multi_view_coordinator.is_linked
                                ):
                                    other_idx = 1 - viewer_idx
                                    self._sync_multi_view_selection(
                                        viewer_idx, other_idx
                                    )

                                # Update highlights
                                self._highlight_multi_view_selected_segments(viewer_idx)
                                return
                        except ValueError:
                            continue
        viewer.setFocus()

    def _display_edit_handles(self):
        """Display edit handles (delegates to EditModeManager)."""
        self.edit_mode_manager.display_edit_handles()

    def _clear_edit_handles(self):
        """Clear edit handles (delegates to EditModeManager)."""
        self.edit_mode_manager.clear_edit_handles()

    def _display_multi_view_edit_handles(self):
        """Display draggable vertex handles for selected polygons in multi-view edit mode."""
        from PyQt6.QtCore import QPointF

        from .editable_vertex import MultiViewEditableVertexItem

        # Clear existing handles first
        self._clear_multi_view_edit_handles()

        if self.mode != "edit":
            return

        handle_radius = self.point_radius
        handle_diam = handle_radius * 2
        max_editable_vertices = 200

        # Initialize storage if needed
        if not hasattr(self, "multi_view_edit_handles"):
            self.multi_view_edit_handles = {0: [], 1: []}

        for viewer_idx in range(2):
            if viewer_idx >= len(self.multi_view_viewers):
                continue

            viewer = self.multi_view_viewers[viewer_idx]
            table = self.multi_view_segment_tables[viewer_idx]
            segment_manager = self.multi_view_segment_managers[viewer_idx]

            if not viewer or not table:
                continue

            # Get selected indices from table
            selected_rows = {item.row() for item in table.selectedItems()}
            selected_indices = []
            for row in selected_rows:
                item = table.item(row, 0)
                if item:
                    with contextlib.suppress(ValueError):
                        selected_indices.append(int(item.text()))

            for seg_idx in selected_indices:
                if seg_idx >= len(segment_manager.segments):
                    continue
                seg = segment_manager.segments[seg_idx]
                if seg.get("type") != "Polygon" or not seg.get("vertices"):
                    continue

                vertices = seg["vertices"]
                if len(vertices) > max_editable_vertices:
                    self._show_warning_notification(
                        f"Polygon has {len(vertices)} vertices (max {max_editable_vertices})"
                    )
                    continue

                for v_idx, pt_list in enumerate(vertices):
                    handle = MultiViewEditableVertexItem(
                        self,
                        seg_idx,
                        v_idx,
                        viewer_idx,
                        -handle_radius,
                        -handle_radius,
                        handle_diam,
                        handle_diam,
                    )
                    handle.setPos(QPointF(pt_list[0], pt_list[1]))
                    handle.setZValue(200)
                    handle.setAcceptHoverEvents(True)
                    viewer.scene().addItem(handle)
                    self.multi_view_edit_handles[viewer_idx].append(handle)

    def _clear_multi_view_edit_handles(self):
        """Clear all edit handles from multi-view viewers."""
        from .editable_vertex import MultiViewEditableVertexItem

        if hasattr(self, "multi_view_edit_handles"):
            for _viewer_idx, handles in self.multi_view_edit_handles.items():
                for h in handles:
                    if h.scene():
                        h.scene().removeItem(h)
            self.multi_view_edit_handles = {0: [], 1: []}

        # Also clear any stray handles
        for viewer in self.multi_view_viewers:
            if viewer and hasattr(viewer, "scene"):
                for item in list(viewer.scene().items()):
                    if isinstance(item, MultiViewEditableVertexItem):
                        viewer.scene().removeItem(item)

    def update_vertex_pos(self, segment_index, vertex_index, new_pos, record_undo=True):
        """Update vertex position (delegates to EditModeManager)."""
        self.edit_mode_manager.update_vertex_pos(
            segment_index, vertex_index, new_pos, record_undo
        )

    def _update_polygon_item(self, segment_index):
        """Update polygon visual item (delegates to EditModeManager)."""
        self.edit_mode_manager.update_polygon_item(segment_index)

    def update_multi_view_vertex_pos(
        self,
        segment_index: int,
        vertex_index: int,
        viewer_index: int,
        new_pos,
        record_undo: bool = True,
    ):
        """Update vertex position in multi-view mode.

        Args:
            segment_index: Index of the segment
            vertex_index: Index of the vertex
            viewer_index: Index of the viewer (0 or 1)
            new_pos: New position as QPointF
            record_undo: Whether to record for undo
        """

        if viewer_index not in (0, 1):
            return

        segment_manager = self.multi_view_segment_managers[viewer_index]
        if segment_index >= len(segment_manager.segments):
            return

        seg = segment_manager.segments[segment_index]
        if seg.get("type") != "Polygon":
            return

        old_pos = seg["vertices"][vertex_index]

        if record_undo:
            self.undo_redo_manager.record_action(
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

        seg["vertices"][vertex_index] = [new_pos.x(), new_pos.y()]

        # Update the polygon item visual (only for this viewer, not synced)
        self._update_multi_view_polygon_item(viewer_index, segment_index)

    def _update_multi_view_polygon_item(self, viewer_idx: int, segment_index: int):
        """Update the visual polygon item for a segment in multi-view.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
            segment_index: Index of the segment to update
        """
        from PyQt6.QtCore import QPointF
        from PyQt6.QtGui import QPolygonF

        from .hoverable_polygon_item import HoverablePolygonItem

        if not hasattr(self, "multi_view_segment_items"):
            return

        items = self.multi_view_segment_items.get(viewer_idx, {}).get(segment_index, [])
        segment_manager = self.multi_view_segment_managers[viewer_idx]

        if segment_index >= len(segment_manager.segments):
            return

        seg = segment_manager.segments[segment_index]
        if not seg.get("vertices"):
            return

        for item in items:
            if isinstance(item, HoverablePolygonItem):
                qpoints = [QPointF(p[0], p[1]) for p in seg["vertices"]]
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

    def _toggle_recent_class(self):
        """Toggle the most recent class used/toggled, or the last class in the list."""
        class_id = self.segment_manager.get_class_to_toggle_with_hotkey()
        if class_id is not None:
            self._handle_class_toggle(class_id)
        else:
            self._show_notification("No classes available to toggle")

    # Additional methods for new features

    def _on_channel_threshold_drag_started(self):
        """Handle channel threshold drag start."""
        self.any_channel_threshold_dragging = True

    def _on_channel_threshold_drag_finished(self):
        """Handle channel threshold drag finish."""
        self.any_channel_threshold_dragging = False
        # Apply any pending updates immediately when drag finishes
        if self.pending_channel_threshold_update:
            self.slider_throttle_timer.stop()
            self.pending_channel_threshold_update = False
        # Always apply changes when drag finishes
        self._apply_channel_threshold_now()

    def _handle_channel_threshold_changed(self):
        """Handle changes in channel thresholding (delegates to ImageAdjustmentManager)."""
        self.image_adjustment_manager.handle_channel_threshold_changed()

    def _apply_channel_threshold_now(self):
        """Apply channel threshold changes immediately (delegates to ImageAdjustmentManager)."""
        self.image_adjustment_manager.apply_channel_threshold_now()

    def _handle_fft_threshold_changed(self):
        """Handle changes in FFT thresholding (delegates to ImageAdjustmentManager)."""
        self.image_adjustment_manager.handle_fft_threshold_changed()

    def _mark_sam_dirty(self):
        """Mark SAM model as needing update, but don't update immediately."""
        self.sam_worker_manager.mark_dirty()

    def _ensure_sam_updated(self):
        """Ensure SAM model is up-to-date when user needs it (delegates to SAMWorkerManager)."""
        self.sam_worker_manager.ensure_sam_updated()

    def _start_single_view_model_initialization(self):
        """Start async model initialization for single-view mode (delegates to SAMWorkerManager)."""
        self.sam_worker_manager.start_single_view_initialization()

    def _get_current_modified_image(self):
        """Get the current image with modifications (delegates to ImageAdjustmentManager)."""
        return self.image_adjustment_manager.get_current_modified_image()

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
        """Reload original image without SAM update (delegates to ImageAdjustmentManager)."""
        self.image_adjustment_manager.reload_original_image_without_sam()

    def _apply_channel_thresholding_fast(self):
        """Apply channel thresholding (delegates to ImageAdjustmentManager)."""
        self.image_adjustment_manager.apply_channel_thresholding_fast()

    def _apply_image_processing_fast(self):
        """Apply all image processing (delegates to ImageAdjustmentManager)."""
        self.image_adjustment_manager.apply_image_processing_fast()

    def _cache_original_image(self):
        """Cache original image (delegates to ImageAdjustmentManager)."""
        self.image_adjustment_manager.cache_original_image()

    def _numpy_to_qimage(self, image_array):
        """Convert numpy array to QImage (delegates to ImageAdjustmentManager)."""
        return self.image_adjustment_manager._numpy_to_qimage(image_array)

    def _apply_channel_thresholding(self):
        """Apply channel thresholding - legacy method (delegates to ImageAdjustmentManager)."""
        self._apply_channel_thresholding_fast()

    def _update_channel_threshold_for_image(self, pixmap):
        """Update channel threshold widget (delegates to ImageAdjustmentManager)."""
        self.image_adjustment_manager.update_channel_threshold_for_image(pixmap)

    def _reload_current_image(self):
        """Reload current image without crop."""
        if not self.current_image_path:
            return

        pixmap = QPixmap(self.current_image_path)
        if not pixmap.isNull():
            self.viewer.set_photo(pixmap)
            self.viewer.set_image_adjustments(
                self.image_adjustment_manager.brightness,
                self.image_adjustment_manager.contrast,
                self.image_adjustment_manager.gamma,
                self.image_adjustment_manager.saturation,
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

        # Clean up multi-view SAM manager (unload its models too)
        if self.sam_multi_view_manager:
            self.sam_multi_view_manager.cleanup()

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
        self.crop_manager.remove_crop_visual()
        self.crop_manager.remove_crop_hover_overlay()
        self.crop_manager.remove_crop_hover_effect()

        # Reset crop state
        self.crop_manager.crop_mode = False
        self.crop_manager.crop_start_pos = None
        self.crop_manager.current_crop_coords = None

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
        if self.undo_redo_manager is not None:
            self.undo_redo_manager.clear_history()

        # Reset bounding box preview state
        self.ai_bbox_preview_mask = None
        self.ai_bbox_preview_rect = None

        # Clear status bar messages
        if hasattr(self, "status_bar"):
            self.status_bar.clear_message()

        # Redisplay segments after model switch to restore visual representation
        self._display_all_segments()

    def _transform_display_coords_to_sam_coords(self, pos):
        """Transform display coordinates to SAM model coordinates."""
        return self.coordinate_transformer.transform_display_to_sam_coords(pos)

    def _on_view_mode_changed(self, index):
        """Handle switching between view modes."""
        if index == 0:
            # Single view mode
            self.view_mode = "single"
            self._restore_single_view_state()
        elif index == 1:
            # Multi-view mode
            self.view_mode = "multi"
            self._enter_multi_view_mode()
        elif index == 2:
            # Sequence view mode
            self.view_mode = "sequence"
            self._enter_sequence_mode()

    def _setup_multi_view_tab(self):
        """Setup the multi-view tab with two PhotoViewers side by side."""
        from PyQt6.QtWidgets import QHeaderView, QLabel, QPushButton, QTableWidget

        from .reorderable_class_table import ReorderableClassTable

        # Main multi-view widget - just viewers and link button
        self.multi_view_widget = QWidget()
        multi_layout = QHBoxLayout(self.multi_view_widget)
        multi_layout.setContentsMargins(0, 0, 0, 0)
        multi_layout.setSpacing(4)

        # Create two viewer panels (viewers only, no tables)
        self.multi_view_viewers = []
        self.multi_view_info_labels = []

        for i in range(2):
            # Create panel for this viewer
            panel = QWidget()
            panel_layout = QVBoxLayout(panel)
            panel_layout.setContentsMargins(2, 2, 2, 2)
            panel_layout.setSpacing(2)

            # Header with image info
            info_label = QLabel(f"Viewer {i + 1}: No image loaded")
            info_label.setStyleSheet("font-weight: bold; padding: 2px;")
            panel_layout.addWidget(info_label)
            self.multi_view_info_labels.append(info_label)

            # PhotoViewer
            viewer = PhotoViewer(self)
            viewer.setMouseTracking(True)
            viewer.viewer_index = i  # Tag viewer with its index
            panel_layout.addWidget(viewer)
            self.multi_view_viewers.append(viewer)

            multi_layout.addWidget(panel)

        # Add link toggle button in the center
        self.multi_view_link_button = QPushButton("Linked")
        self.multi_view_link_button.setCheckable(True)
        self.multi_view_link_button.setChecked(True)
        self.multi_view_link_button.setFixedWidth(80)
        self.multi_view_link_button.setToolTip(
            "When linked, operations are mirrored to both viewers"
        )
        self.multi_view_link_button.clicked.connect(self._toggle_multi_view_link)

        # Create a center widget for the link button
        center_widget = QWidget()
        center_layout = QVBoxLayout(center_widget)
        center_layout.addStretch()
        center_layout.addWidget(self.multi_view_link_button)
        center_layout.addStretch()
        center_widget.setFixedWidth(90)

        # Insert link button between the two panels
        multi_layout.insertWidget(1, center_widget)

        # Initialize multi-view coordinator
        self.multi_view_coordinator = MultiViewCoordinator(self)

        # Initialize per-viewer segment managers
        self.multi_view_segment_managers = [SegmentManager(), SegmentManager()]

        # Initialize multi-view SAM manager (dual SAM models with lazy loading)
        self.sam_multi_view_manager = SAMMultiViewManager(self)

        # Create multi-view segment/class tables for the right panel
        # These will be shown/hidden when switching view modes
        self.multi_view_segment_tables = []
        self.multi_view_class_tables = []

        # Create horizontally split segment section (V1 | V2)
        self.multi_view_segment_section = QWidget()
        seg_section_layout = QVBoxLayout(self.multi_view_segment_section)
        seg_section_layout.setContentsMargins(0, 0, 0, 0)
        seg_section_layout.setSpacing(2)

        seg_header_layout = QHBoxLayout()
        seg_header_layout.addWidget(QLabel("V1 Segments"))
        seg_header_layout.addWidget(QLabel("V2 Segments"))
        seg_section_layout.addLayout(seg_header_layout)

        seg_split = QSplitter(Qt.Orientation.Horizontal)
        from functools import partial

        for viewer_idx in range(2):
            segment_table = QTableWidget()
            segment_table.setColumnCount(3)
            segment_table.setHorizontalHeaderLabels(["ID", "Class", "Alias"])
            segment_table.horizontalHeader().setSectionResizeMode(
                QHeaderView.ResizeMode.Stretch
            )
            segment_table.setSelectionBehavior(
                QTableWidget.SelectionBehavior.SelectRows
            )
            segment_table.setSortingEnabled(True)
            segment_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)

            # Connect selection signal
            segment_table.itemSelectionChanged.connect(
                partial(self._on_multi_view_segment_selection_changed, viewer_idx)
            )

            seg_split.addWidget(segment_table)
            self.multi_view_segment_tables.append(segment_table)
        seg_section_layout.addWidget(seg_split)

        # Add merge and delete buttons for each viewer (like single-view)
        seg_button_layout = QHBoxLayout()
        self.multi_view_merge_buttons = []
        self.multi_view_delete_buttons = []
        for viewer_idx in range(2):
            btn_merge = QPushButton(f"Merge V{viewer_idx + 1}")
            btn_merge.setToolTip(
                f"Merge selected V{viewer_idx + 1} segments into active class (M)"
            )
            btn_merge.clicked.connect(
                partial(self._merge_multi_view_selected_segments, viewer_idx)
            )
            seg_button_layout.addWidget(btn_merge)
            self.multi_view_merge_buttons.append(btn_merge)

            btn_delete = QPushButton(f"Delete V{viewer_idx + 1}")
            btn_delete.setToolTip(
                f"Delete selected V{viewer_idx + 1} segments (Delete/Backspace)"
            )
            btn_delete.clicked.connect(
                partial(self._delete_multi_view_selected_segments, viewer_idx)
            )
            seg_button_layout.addWidget(btn_delete)
            self.multi_view_delete_buttons.append(btn_delete)
        seg_section_layout.addLayout(seg_button_layout)

        self.multi_view_segment_section.hide()

        # Create horizontally split class section (V1 | V2)
        self.multi_view_class_section = QWidget()
        cls_section_layout = QVBoxLayout(self.multi_view_class_section)
        cls_section_layout.setContentsMargins(0, 0, 0, 0)
        cls_section_layout.setSpacing(2)

        cls_header_layout = QHBoxLayout()
        cls_header_layout.addWidget(QLabel("V1 Classes"))
        cls_header_layout.addWidget(QLabel("V2 Classes"))
        cls_section_layout.addLayout(cls_header_layout)

        cls_split = QSplitter(Qt.Orientation.Horizontal)
        for viewer_idx in range(2):
            class_table = ReorderableClassTable()
            class_table.setColumnCount(2)
            class_table.setHorizontalHeaderLabels(["Alias", "Class"])
            class_table.horizontalHeader().setSectionResizeMode(
                0, QHeaderView.ResizeMode.Stretch
            )
            class_table.horizontalHeader().setSectionResizeMode(
                1, QHeaderView.ResizeMode.ResizeToContents
            )
            class_table.setEditTriggers(QTableWidget.EditTrigger.DoubleClicked)

            # Connect signals for class table
            class_table.itemChanged.connect(
                partial(self._on_multi_view_class_alias_changed, viewer_idx)
            )
            class_table.cellClicked.connect(
                partial(self._on_multi_view_class_toggled, viewer_idx)
            )

            cls_split.addWidget(class_table)
            self.multi_view_class_tables.append(class_table)
        cls_section_layout.addWidget(cls_split)

        # Add reassign buttons for each viewer
        cls_button_layout = QHBoxLayout()
        self.multi_view_reassign_buttons = []
        for viewer_idx in range(2):
            btn = QPushButton(f"Reassign V{viewer_idx + 1} Classes")
            btn.setToolTip(
                "Reassign class IDs based on table order (drag rows to reorder)"
            )
            btn.clicked.connect(
                partial(self._reassign_multi_view_class_ids, viewer_idx)
            )
            cls_button_layout.addWidget(btn)
            self.multi_view_reassign_buttons.append(btn)
        cls_section_layout.addLayout(cls_button_layout)

        self.multi_view_class_section.hide()

        self.view_tab_widget.addTab(self.multi_view_widget, "Multi")

        # Connect mouse events for multi-view viewers
        self._setup_multi_view_mouse_events()

    def _setup_multi_view_mouse_events(self):
        """Setup mouse event handling for multi-view viewers."""
        for viewer in self.multi_view_viewers:
            # Install event filter for mouse events
            viewer.viewport().installEventFilter(self)

    def _setup_sequence_view_tab(self):
        """Setup the sequence view tab with a viewer and timeline."""
        from PyQt6.QtWidgets import QLabel

        # Main sequence view widget
        self.sequence_view_widget = QWidget()
        sequence_layout = QVBoxLayout(self.sequence_view_widget)
        sequence_layout.setContentsMargins(0, 0, 0, 0)
        sequence_layout.setSpacing(2)

        # Header label
        self.sequence_info_label = QLabel("Sequence Mode: No sequence loaded")
        self.sequence_info_label.setStyleSheet(
            "font-weight: bold; padding: 4px; background-color: #2d2d2d;"
        )
        sequence_layout.addWidget(self.sequence_info_label)

        # Sequence viewer - reuse the same viewer architecture as single view
        self.sequence_viewer = PhotoViewer(self)
        self.sequence_viewer.setMouseTracking(True)
        sequence_layout.addWidget(self.sequence_viewer, stretch=1)

        # Timeline widget at the bottom with Save All button
        from PyQt6.QtWidgets import QPushButton

        timeline_layout = QHBoxLayout()
        timeline_layout.setContentsMargins(0, 0, 0, 0)
        timeline_layout.setSpacing(5)

        self.timeline_widget = TimelineWidget()
        self.timeline_widget.frame_selected.connect(self._on_sequence_frame_selected)
        timeline_layout.addWidget(self.timeline_widget, stretch=1)

        self.save_all_timeline_btn = QPushButton("Save All")
        self.save_all_timeline_btn.setToolTip(
            "Save all propagated masks to NPZ files (or scrub timeline to save)"
        )
        self.save_all_timeline_btn.setMinimumWidth(80)
        self.save_all_timeline_btn.setMaximumWidth(100)
        self.save_all_timeline_btn.setStyleSheet(
            "QPushButton { background-color: #4CAF50; color: black; font-weight: bold; }"
        )
        self.save_all_timeline_btn.clicked.connect(self._on_save_all_propagated)
        timeline_layout.addWidget(self.save_all_timeline_btn)

        sequence_layout.addLayout(timeline_layout)

        # Sequence controls widget (below timeline) - in scroll area for visibility
        self.sequence_widget = SequenceWidget()
        from PyQt6.QtWidgets import QScrollArea

        sequence_scroll = QScrollArea()
        sequence_scroll.setWidget(self.sequence_widget)
        sequence_scroll.setWidgetResizable(True)
        sequence_scroll.setMinimumHeight(200)
        sequence_scroll.setMaximumHeight(350)
        sequence_layout.addWidget(sequence_scroll)

        # Add tab
        self.view_tab_widget.addTab(self.sequence_view_widget, "Sequence")

        # Initialize sequence view mode
        self.sequence_view_mode = SequenceViewMode(self)

        # Initialize propagation manager for SAM 2 video propagation
        self.propagation_manager = PropagationManager(self)

        # Connect sequence view mode signals
        self.sequence_view_mode.frame_status_changed.connect(
            self._on_sequence_frame_status_changed
        )
        self.sequence_view_mode.reference_changed.connect(
            self._on_sequence_reference_changed
        )

        # Connect sequence widget signals
        self._connect_sequence_widget_signals()

        # Connect mouse handlers to sequence viewer (same as single view)
        self._setup_sequence_viewer_mouse_handlers()

    def _connect_sequence_widget_signals(self):
        """Connect sequence widget signals to handlers."""
        if self.sequence_widget is None:
            return

        # Timeline setup signals
        self.sequence_widget.set_start_requested.connect(self._on_set_sequence_start)
        self.sequence_widget.set_end_requested.connect(self._on_set_sequence_end)
        self.sequence_widget.clear_range_requested.connect(
            self._on_clear_sequence_range
        )
        self.sequence_widget.build_timeline_requested.connect(
            self._on_build_sequence_timeline
        )
        self.sequence_widget.exit_timeline_requested.connect(
            self._on_exit_sequence_timeline
        )

        # Propagation signals
        self.sequence_widget.add_reference_requested.connect(
            self._on_add_sequence_reference
        )
        self.sequence_widget.add_all_before_requested.connect(
            self._on_add_all_before_reference
        )
        self.sequence_widget.clear_references_requested.connect(
            self._on_clear_sequence_references
        )
        self.sequence_widget.propagate_requested.connect(self._on_propagate_requested)
        self.sequence_widget.cancel_propagation_requested.connect(
            self._on_cancel_propagation
        )
        self.sequence_widget.next_flagged_requested.connect(self._on_next_flagged_frame)
        self.sequence_widget.prev_flagged_requested.connect(self._on_prev_flagged_frame)
        self.sequence_widget.jump_to_frame_requested.connect(
            self._on_sequence_frame_selected
        )
        self.sequence_widget.confidence_threshold_changed.connect(
            self._on_confidence_threshold_changed
        )

    def _on_sequence_frame_selected(self, frame_idx: int):
        """Handle frame selection in sequence mode."""
        if self.sequence_view_mode is None:
            return

        # Auto-save current frame's segments before navigating
        current_idx = self.sequence_view_mode.current_frame_idx
        if current_idx != frame_idx:
            self._auto_save_sequence_frame(current_idx)

        if self.sequence_view_mode.set_current_frame(frame_idx):
            image_path = self.sequence_view_mode.get_image_path(frame_idx)
            if image_path:
                self._load_sequence_frame(image_path, frame_idx)

    def _auto_save_sequence_frame(self, frame_idx: int):
        """Auto-save segments for a sequence frame (or delete NPZ if empty)."""
        if not self.sequence_view_mode:
            return

        # Check if auto-save is enabled
        if not self.control_panel.get_settings().get("auto_save", True):
            return

        # Get the image path for this frame
        image_path = self.sequence_view_mode.get_image_path(frame_idx)
        if not image_path:
            return

        # Temporarily set current_image_path for the save function
        original_path = self.current_image_path
        self.current_image_path = image_path

        try:
            # Call save even if no segments - it will delete the NPZ file
            has_segments = bool(self.segment_manager.segments)
            self._save_output_to_npz()

            # Update the mask cache with current segment data
            # This ensures changes are preserved when navigating back
            self._update_sequence_mask_cache(image_path)

            if has_segments:
                logger.debug(f"Auto-saved segments for sequence frame {frame_idx}")
                # Mark frame as saved (no longer just propagated)
                self.sequence_view_mode.mark_frame_saved(frame_idx)
            else:
                logger.debug(f"Deleted NPZ for empty sequence frame {frame_idx}")
        except Exception as e:
            logger.error(f"Failed to auto-save sequence frame {frame_idx}: {e}")
        finally:
            self.current_image_path = original_path

    def _update_sequence_mask_cache(self, image_path: str):
        """Update the sequence mask cache with current segment data.

        This ensures that when navigating between frames, any changes
        made to masks are preserved in the cache.

        Args:
            image_path: Path to the image file
        """
        if not hasattr(self, "_sequence_mask_cache"):
            self._sequence_mask_cache = {}

        # Copy current segments to avoid reference issues
        import copy

        segments_copy = []
        for segment in self.segment_manager.segments:
            segment_copy = {
                "mask": segment["mask"].copy()
                if segment.get("mask") is not None
                else None,
                "class_id": segment.get("class_id", 0),
                "type": segment.get("type", "Loaded"),
                "vertices": segment.get("vertices"),
            }
            segments_copy.append(segment_copy)

        class_aliases_copy = copy.deepcopy(self.segment_manager.class_aliases)

        if segments_copy:
            self._sequence_mask_cache[image_path] = {
                "segments": segments_copy,
                "class_aliases": class_aliases_copy,
            }
        elif image_path in self._sequence_mask_cache:
            # Remove from cache if no segments
            del self._sequence_mask_cache[image_path]

    def _load_sequence_frame(self, image_path: str, frame_idx: int):
        """Load an image into the sequence viewer."""
        pixmap = QPixmap(image_path)
        if not pixmap.isNull():
            self.sequence_viewer.set_photo(pixmap)
            self.sequence_viewer.set_image_adjustments(
                self.image_adjustment_manager.brightness,
                self.image_adjustment_manager.contrast,
                self.image_adjustment_manager.gamma,
                self.image_adjustment_manager.saturation,
            )

            # Update current image path so AI tools work on this frame
            self.current_image_path = image_path

            # Update info label
            from pathlib import Path

            name = Path(image_path).name
            total = self.sequence_view_mode.total_frames
            confidence = self.sequence_view_mode.get_confidence_score(frame_idx)
            if confidence > 0:
                self.sequence_info_label.setText(
                    f"Sequence Mode: {name} ({frame_idx + 1}/{total}) -- Conf: {confidence:.4f}"
                )
            else:
                self.sequence_info_label.setText(
                    f"Sequence Mode: {name} ({frame_idx + 1}/{total})"
                )

            # Update timeline
            self.timeline_widget.set_current_frame(frame_idx)

            # Update sequence widget
            if self.sequence_widget:
                self.sequence_widget.set_current_frame(frame_idx)

            # Load existing segments for this frame
            self._load_sequence_frame_segments(image_path)

            # Update SAM model for this frame so AI tools work correctly
            # Mark as dirty so next AI click computes embedding for this frame
            self.sam_is_dirty = True

    def _load_sequence_frame_segments(self, image_path: str):
        """Load segments for the current sequence frame."""
        # Clear current segments
        self.segment_manager.clear()
        self.segment_display_manager.clear_all_caches()

        # Check for propagated masks FIRST - they take precedence over cache/file
        # BUT: Reference frames should NEVER load propagated masks - they keep their
        # hand-labeled ground truth data
        if self.sequence_view_mode:
            frame_idx = self.sequence_view_mode.current_frame_idx
            is_reference = frame_idx in self.sequence_view_mode.reference_frame_indices

            if not is_reference:
                propagated_masks = self.sequence_view_mode.get_propagated_masks(
                    frame_idx
                )
                if propagated_masks:
                    # Clear any stale cache entry for this frame since we have fresh propagated data
                    if (
                        hasattr(self, "_sequence_mask_cache")
                        and image_path in self._sequence_mask_cache
                    ):
                        del self._sequence_mask_cache[image_path]

                    self._load_propagated_masks_for_frame(frame_idx)
                    # Merge propagated masks by class to consolidate same-class segments
                    self.segment_manager.merge_segments_by_class()
                    self._update_all_lists()
                    self._display_sequence_segments()
                    return

        # No propagated masks - check cache
        cached_mask_data = self._get_cached_mask_data(image_path)
        if cached_mask_data is not None:
            # Use cached data - much faster than loading from disk
            self._apply_cached_mask_data(cached_mask_data)
            # Merge segments by class to consolidate same-class segments
            self.segment_manager.merge_segments_by_class()
            self._update_all_lists()
        else:
            # Load from file if exists
            try:
                self.file_manager.load_class_aliases(image_path)
                self.file_manager.load_existing_mask(image_path)
                self._update_all_lists()
            except Exception as e:
                logger.error(f"Error loading segments for sequence frame: {e}")

        # Display segments on sequence viewer
        self._display_sequence_segments()

    def _get_cached_mask_data(self, image_path: str) -> dict | None:
        """Get cached mask data for an image path.

        Args:
            image_path: Path to the image file

        Returns:
            Cached mask data dict or None if not cached
        """
        if not hasattr(self, "_sequence_mask_cache"):
            return None
        return self._sequence_mask_cache.get(image_path)

    def _load_segments_for_reference_frame(self, image_path: str) -> list[dict]:
        """Load segments for a reference frame from cache, NPZ file, or current segment manager.

        Args:
            image_path: Path to the image file

        Returns:
            List of segment dictionaries with 'mask' and 'class_id'
        """
        # If this is the currently loaded image, use segment_manager directly
        # This handles the case where user created segments but hasn't navigated away
        if (
            self.current_image_path
            and Path(self.current_image_path) == Path(image_path)
            and self.segment_manager.segments
        ):
            return self.segment_manager.segments

        # Check cache
        cached_data = self._get_cached_mask_data(image_path)
        if cached_data is not None:
            return cached_data.get("segments", [])

        # Fall back to loading from NPZ file
        mask_data = self._load_mask_data_for_path(image_path)
        if mask_data is not None:
            return mask_data.get("segments", [])

        return []

    def _apply_cached_mask_data(self, mask_data: dict) -> None:
        """Apply cached mask data to the segment manager.

        Args:
            mask_data: Dictionary with 'segments' and 'class_aliases'
        """
        # Apply class aliases
        if "class_aliases" in mask_data:
            for class_id, alias in mask_data["class_aliases"].items():
                self.segment_manager.class_aliases[class_id] = alias

        # Add segments
        for segment in mask_data.get("segments", []):
            self.segment_manager.add_segment(segment)

    def _load_propagated_masks_for_frame(self, frame_idx: int):
        """Load propagated masks for a frame into the segment manager."""
        if not self.sequence_view_mode or not self.propagation_manager:
            return

        propagated_masks = self.sequence_view_mode.get_propagated_masks(frame_idx)
        if not propagated_masks:
            return

        logger.debug(
            f"Loading {len(propagated_masks)} propagated masks for frame {frame_idx}"
        )

        import numpy as np

        for obj_id, mask in propagated_masks.items():
            # Ensure mask is 2D boolean array (SAM2 may return 3D or 4D tensors)
            mask = np.asarray(mask)
            while mask.ndim > 2:
                mask = mask.squeeze()
            if mask.ndim != 2:
                logger.warning(f"Invalid mask shape for obj_id {obj_id}: {mask.shape}")
                continue
            mask = mask.astype(bool)

            # Get class info from the reference annotation
            ref_ann = self.propagation_manager.get_reference_annotation_for_obj(obj_id)
            if ref_ann:
                class_id = ref_ann.class_id
                class_name = ref_ann.class_name
            else:
                class_id = 0
                class_name = "Class 0"

            # Ensure class alias exists
            if class_id not in self.segment_manager.class_aliases:
                self.segment_manager.class_aliases[class_id] = class_name

            # Add segment
            self.segment_manager.add_segment(
                {
                    "mask": mask,
                    "class_id": class_id,
                    "type": "ai",  # Mark as AI-generated
                }
            )

        self._update_all_lists()

    def _display_sequence_segments(self):
        """Display segments on the sequence viewer.

        Uses similar logic to single view but targets sequence_viewer.
        Simplified version without edit handles for now.
        """
        from PyQt6.QtCore import QPointF
        from PyQt6.QtGui import QBrush, QColor, QPen, QPolygonF

        from .hoverable_pixelmap_item import HoverablePixmapItem
        from .hoverable_polygon_item import HoverablePolygonItem

        scene = self.sequence_viewer.scene()
        if scene is None:
            return

        # Track sequence segment items separately
        if not hasattr(self, "_sequence_segment_items"):
            self._sequence_segment_items: dict = {}

        # Clear existing sequence segment items
        for items in self._sequence_segment_items.values():
            for item in items:
                if item.scene():
                    scene.removeItem(item)
        self._sequence_segment_items.clear()

        # Also clear any items that might have been added via segment_items
        # (from code paths that use display_all_segments_single_view)
        for items in self.segment_items.values():
            for item in items:
                if item.scene() == scene:
                    scene.removeItem(item)
        self.segment_items.clear()

        # Display segments from segment manager
        for i, segment in enumerate(self.segment_manager.segments):
            self._sequence_segment_items[i] = []
            class_id = segment.get("class_id")
            base_color = self.segment_display_manager.get_color_for_class(class_id)

            if segment.get("type") == "Polygon" and segment.get("vertices"):
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
                scene.addItem(poly_item)
                self._sequence_segment_items[i].append(poly_item)
            elif segment.get("mask") is not None:
                default_pixmap, hover_pixmap = (
                    self.segment_display_manager.get_cached_pixmaps(
                        i, segment["mask"], base_color.getRgb()[:3]
                    )
                )
                pixmap_item = HoverablePixmapItem()
                pixmap_item.set_pixmaps(default_pixmap, hover_pixmap)
                pixmap_item.set_segment_info(i, self)
                scene.addItem(pixmap_item)
                pixmap_item.setZValue(i + 1)
                self._sequence_segment_items[i].append(pixmap_item)

    def _on_sequence_frame_status_changed(self, frame_idx: int, status: str):
        """Handle frame status change in sequence mode."""
        if self.timeline_widget:
            self.timeline_widget.set_frame_status(frame_idx, status)

    def _on_sequence_reference_changed(self, frame_idx: int):
        """Handle reference frame change (from sequence view mode signal)."""
        if self.sequence_widget and self.sequence_view_mode:
            # Update widget with all current reference frames
            ref_indices = self.sequence_view_mode.reference_frame_indices
            self.sequence_widget.set_reference_frames(list(ref_indices))

    def _on_add_sequence_reference(self):
        """Add current frame as reference for propagation."""
        if self.sequence_view_mode is None:
            return

        current_idx = self.sequence_view_mode.current_frame_idx
        if self.sequence_view_mode.set_reference_frame(current_idx):
            # Update the sequence widget with all reference frames
            ref_indices = self.sequence_view_mode.reference_frame_indices
            self.sequence_widget.set_reference_frames(ref_indices)
            # Update timeline
            self.timeline_widget.set_frame_status(current_idx, "reference")
            self._show_notification(f"Added frame {current_idx + 1} as reference")

    def _on_add_all_before_reference(self):
        """Add all frames before current position as references."""
        if self.sequence_view_mode is None:
            return

        current_idx = self.sequence_view_mode.current_frame_idx
        if current_idx <= 0:
            self._show_notification("No frames before current position")
            return

        # Add all frames from 0 to current_idx - 1
        count = 0
        for idx in range(current_idx):
            if self.sequence_view_mode.set_reference_frame(idx):
                self.timeline_widget.set_frame_status(idx, "reference")
                count += 1

        # Update the sequence widget with all reference frames
        ref_indices = self.sequence_view_mode.reference_frame_indices
        self.sequence_widget.set_reference_frames(ref_indices)
        self._show_notification(f"Added {count} frames as references")

    def _on_clear_sequence_references(self):
        """Clear all reference frames."""
        if self.sequence_view_mode is None:
            return

        # Get current reference frames to update timeline
        ref_indices = list(self.sequence_view_mode.reference_frame_indices)

        # Clear in sequence view mode
        for idx in ref_indices:
            self.sequence_view_mode.clear_reference_frame(idx)
            self.timeline_widget.set_frame_status(idx, "pending")

        # Clear in propagation manager
        if self.propagation_manager is not None:
            self.propagation_manager.clear_reference_frames()

        # Update widget
        self.sequence_widget.set_reference_frames([])
        self._show_notification("Cleared all reference frames")

    def _on_propagate_requested(
        self, direction: str, start: int, end: int, skip_flagged: bool = True
    ):
        """Handle propagation request from sequence widget."""
        if self.sequence_view_mode is None:
            self._show_notification("Please enter sequence mode first")
            return

        if not self.sequence_view_mode.has_reference():
            self._show_notification("Please set a reference frame first")
            return

        if self.propagation_manager is None:
            self._show_notification("Propagation manager not available")
            return

        # Check if SAM 2 video predictor is available
        if not self.model_manager.is_model_available():
            self._show_notification("SAM model not loaded")
            return

        sam_model = self.model_manager.sam_model
        if sam_model is None or not hasattr(sam_model, "init_video_state"):
            self._show_notification("SAM 2 video predictor not available")
            return

        # Initialize video state if needed
        if not self.propagation_manager.is_initialized:
            if not self.current_image_path:
                self._show_notification("No image loaded")
                return

            image_dir = str(Path(self.current_image_path).parent)

            # Update button to show loading status
            if self.sequence_widget:
                self.sequence_widget.start_propagation()
                self.sequence_widget.set_propagation_status("Loading images...")

            self._show_notification("Loading images into model...")

            # Pass cached images if available (optimization: saves disk I/O)
            image_cache = getattr(self, "_sequence_memory_cache", None)
            if image_cache:
                logger.info(
                    f"Using {len(image_cache)} cached images for propagation init"
                )

            if not self.propagation_manager.init_sequence(
                image_dir, image_cache=image_cache
            ):
                self._show_notification("Failed to initialize propagation")
                if self.sequence_widget:
                    self.sequence_widget.end_propagation()
                return

            # Re-apply confidence threshold from UI after init_sequence
            # (init_sequence resets threshold to default 0.99)
            if self.sequence_widget:
                ui_threshold = self.sequence_widget.confidence_spin.value()
                self.propagation_manager.set_confidence_threshold(ui_threshold)
                if self.sequence_view_mode:
                    self.sequence_view_mode.set_confidence_threshold(ui_threshold)

        # Clear previous propagation results before starting new propagation
        # This ensures old masks don't persist when labels are changed
        self.sequence_view_mode.clear_propagation_results()

        # Clear propagation manager's old state and reset SAM 2 video predictor
        self.propagation_manager.clear_reference_frames()
        self.propagation_manager.clear_propagation_results()

        if self.timeline_widget:
            # Reset timeline to show reference frames
            self.timeline_widget.clear_statuses()
            # Show all reference frames on timeline
            for ref_idx in self.sequence_view_mode.reference_frame_indices:
                self.timeline_widget.set_frame_status(ref_idx, "reference")

        # Add reference annotations from ALL reference frames
        # Use consistent object IDs based on class_id so SAM 2 can track
        # the same object across multiple reference frames
        if self.sequence_widget:
            # Ensure propagation UI state is active (may not be if already initialized)
            if not self.sequence_widget._is_propagating:
                self.sequence_widget.start_propagation()
            self.sequence_widget.set_propagation_status("Adding references...")

        total_count = 0
        class_to_obj_id: dict[int, int] = {}  # Map class_id -> obj_id for consistency

        for ref_idx in self.sequence_view_mode.reference_frame_indices:
            ref_image_path = self.sequence_view_mode.get_image_path(ref_idx)
            if not ref_image_path:
                continue

            # Load segments for this reference frame from cache or NPZ
            ref_segments = self._load_segments_for_reference_frame(ref_image_path)
            if not ref_segments:
                continue

            self.propagation_manager.add_reference_frame(ref_idx)

            for seg in ref_segments:
                mask = seg.get("mask")
                if mask is not None and mask.any():
                    class_id = seg.get("class_id", 0)
                    class_name = self.segment_manager.class_aliases.get(
                        class_id, f"Class {class_id}"
                    )

                    # Use consistent obj_id for the same class across all reference frames
                    # obj_id must be positive (SAM 2 requirement)
                    if class_id not in class_to_obj_id:
                        class_to_obj_id[class_id] = class_id + 1
                    obj_id = class_to_obj_id[class_id]

                    result_id = self.propagation_manager.add_reference_annotation(
                        ref_idx, mask, class_id, class_name, obj_id=obj_id
                    )
                    if result_id > 0:
                        total_count += 1

        if total_count == 0:
            self._show_notification("No valid segments in reference frames")
            return

        # Map direction string to enum
        direction_map = {
            "forward": PropagationDirection.FORWARD,
            "backward": PropagationDirection.BACKWARD,
            "both": PropagationDirection.BIDIRECTIONAL,
        }
        prop_direction = direction_map.get(direction, PropagationDirection.FORWARD)

        # Store skip_flagged for use in _on_propagation_finished
        self._propagation_skip_flagged = skip_flagged

        # Start propagation worker
        self._propagation_worker = PropagationWorker(
            propagation_manager=self.propagation_manager,
            direction=prop_direction,
            range_start=start if start != 0 else None,
            range_end=end if end != self.propagation_manager.total_frames - 1 else None,
            skip_flagged=skip_flagged,
        )

        # Connect worker signals
        self._propagation_worker.progress.connect(self._on_propagation_progress)
        self._propagation_worker.frame_done.connect(self._on_propagation_frame_done)
        self._propagation_worker.finished_propagation.connect(
            self._on_propagation_finished
        )
        self._propagation_worker.error.connect(self._on_propagation_error)

        # Ensure UI is in propagation state (may already be from init phase)
        if self.sequence_widget and not self.sequence_widget._is_propagating:
            self.sequence_widget.start_propagation()

        self._show_notification(f"Starting propagation ({direction})...")
        self._propagation_worker.start()

    def _on_cancel_propagation(self):
        """Cancel ongoing propagation."""
        if (
            self._propagation_worker is not None
            and self._propagation_worker.isRunning()
        ):
            self._propagation_worker.stop()
            self._propagation_worker.wait(1000)  # Wait up to 1 second
            self._propagation_worker = None

        if self.sequence_widget:
            self.sequence_widget.end_propagation()

        self._show_notification("Propagation cancelled")

    def _on_propagation_progress(self, current: int, total: int):
        """Handle propagation progress update."""
        if self.sequence_widget:
            self.sequence_widget.set_propagation_progress(current, total)
            # Update button with frame count
            self.sequence_widget.set_propagation_status(f"Frame {current}/{total}")

    def _on_propagation_frame_done(self, frame_idx: int, result):
        """Handle completion of propagation for a single frame."""
        from PyQt6.QtWidgets import QApplication

        # Update timeline to show this frame has been propagated (immediate for animation)
        if self.timeline_widget:
            self.timeline_widget.set_frame_status(
                frame_idx, "propagated", immediate=True
            )

        # Update sequence view mode state
        # Skip reference frames - they should keep their ground truth data
        if self.sequence_view_mode and result is not None:
            is_reference = frame_idx in self.sequence_view_mode.reference_frame_indices
            if is_reference:
                # Don't store propagated masks for reference frames
                return

            # Convert PropagationResult to the format expected by mark_frame_propagated
            # result has: obj_id, mask, confidence
            masks = {result.obj_id: result.mask}
            confidence = result.confidence
            self.sequence_view_mode.mark_frame_propagated(frame_idx, masks, confidence)

            # If this frame has low confidence, mark it as flagged
            if (
                self.propagation_manager
                and frame_idx in self.propagation_manager.flagged_frames
            ):
                self.sequence_view_mode.flag_frame(frame_idx)
                if self.timeline_widget:
                    self.timeline_widget.set_frame_status(
                        frame_idx, "flagged", immediate=True
                    )

        # Process events to keep UI responsive during propagation
        QApplication.processEvents()

    def _on_propagation_finished(self):
        """Handle propagation completion."""
        if self.sequence_widget:
            self.sequence_widget.end_propagation()

        # If skip_flagged was enabled, remove all masks for flagged frames
        # This handles the case where a frame has multiple objects and some
        # were stored before the low-confidence one was detected
        if (
            getattr(self, "_propagation_skip_flagged", True)
            and self.propagation_manager
            and self.sequence_view_mode
        ):
            flagged_frames = list(self.propagation_manager.flagged_frames)
            for frame_idx in flagged_frames:
                # Remove from propagated_frames
                self.propagation_manager.propagated_frames.discard(frame_idx)
                # Remove stored results
                if frame_idx in self.propagation_manager.state.frame_results:
                    del self.propagation_manager.state.frame_results[frame_idx]
                # Remove from sequence view mode's propagated masks
                self.sequence_view_mode.clear_propagated_mask(frame_idx)
                # Update timeline to show as flagged (not propagated)
                if self.timeline_widget:
                    self.timeline_widget.set_frame_status(
                        frame_idx, "flagged", immediate=True
                    )

        # Update flagged and propagated counts
        if self.propagation_manager and self.sequence_widget:
            flagged_count = len(self.propagation_manager.flagged_frames)
            propagated_count = len(self.propagation_manager.propagated_frames)
            self.sequence_widget.set_flagged_count(flagged_count)
            self.sequence_widget.set_propagated_count(propagated_count)

        # Get stats
        if self.propagation_manager:
            stats = self.propagation_manager.get_propagation_stats()
            self._show_notification(
                f"Propagation complete: {stats['num_propagated']} frames, "
                f"{stats['num_flagged']} flagged. Scrub timeline or click 'Save All' to save."
            )
        else:
            self._show_notification("Propagation complete")

        # Refresh current frame's display if it received propagated masks
        # This ensures the user sees the results for the frame they're currently on
        if self.sequence_view_mode:
            current_idx = self.sequence_view_mode.current_frame_idx
            current_path = self.sequence_view_mode.get_image_path(current_idx)
            if current_path:
                # Reload segments for current frame (will load propagated masks if present)
                self._load_sequence_frame_segments(current_path)

        self._cleanup_propagation_worker()

    def _on_propagation_error(self, error_msg: str):
        """Handle propagation error."""
        if self.sequence_widget:
            self.sequence_widget.end_propagation()

        self._show_notification(f"Propagation error: {error_msg}")
        logger.error(f"Propagation error: {error_msg}")
        self._cleanup_propagation_worker()

    def _cleanup_propagation_worker(self):
        """Safely clean up the propagation worker thread."""
        if self._propagation_worker is not None:
            if self._propagation_worker.isRunning():
                self._propagation_worker.stop()
                self._propagation_worker.wait(2000)  # Wait up to 2 seconds
            self._propagation_worker.deleteLater()
            self._propagation_worker = None

    def _on_next_flagged_frame(self):
        """Navigate to next flagged frame."""
        if self.sequence_view_mode is None:
            return

        next_frame = self.sequence_view_mode.next_flagged_frame()
        if next_frame is not None:
            self._on_sequence_frame_selected(next_frame)
        else:
            self._show_notification("No more flagged frames")

    def _on_prev_flagged_frame(self):
        """Navigate to previous flagged frame."""
        if self.sequence_view_mode is None:
            return

        prev_frame = self.sequence_view_mode.prev_flagged_frame()
        if prev_frame is not None:
            self._on_sequence_frame_selected(prev_frame)
        else:
            self._show_notification("No more flagged frames")

    def _on_confidence_threshold_changed(self, threshold: float):
        """Handle confidence threshold change from UI."""
        if self.propagation_manager:
            self.propagation_manager.set_confidence_threshold(threshold)
        if self.sequence_view_mode:
            self.sequence_view_mode.set_confidence_threshold(threshold)

    def _on_save_all_propagated(self):
        """Save all propagated frames to NPZ files."""
        import numpy as np
        from PyQt6.QtWidgets import QApplication

        if not self.sequence_view_mode or not self.propagation_manager:
            return

        # Get propagated frames, explicitly excluding flagged frames
        # (flagged frames should not be saved even if they have masks)
        flagged_frames = self.propagation_manager.flagged_frames
        propagated_frames = [
            idx
            for idx in self.propagation_manager.propagated_frames
            if idx not in flagged_frames
        ]
        if not propagated_frames:
            self._show_notification("No propagated frames to save")
            return

        self._show_notification(f"Saving {len(propagated_frames)} frames...")

        saved = 0
        for frame_idx in sorted(propagated_frames):
            # Get propagated masks for this frame
            propagated_masks = self.sequence_view_mode.get_propagated_masks(frame_idx)
            if not propagated_masks:
                continue

            # Get image path for this frame
            image_path = self.sequence_view_mode.get_image_path(frame_idx)
            if not image_path:
                continue

            # Clear and populate segment manager for this frame
            self.segment_manager.clear()

            for obj_id, mask in propagated_masks.items():
                # Ensure mask is 2D boolean
                mask = np.asarray(mask)
                while mask.ndim > 2:
                    mask = mask.squeeze()
                if mask.ndim != 2:
                    continue
                mask = mask.astype(bool)

                # Get class info
                ref_ann = self.propagation_manager.get_reference_annotation_for_obj(
                    obj_id
                )
                if ref_ann:
                    class_id = ref_ann.class_id
                    class_name = ref_ann.class_name
                else:
                    class_id = 0
                    class_name = "Class 0"

                if class_id not in self.segment_manager.class_aliases:
                    self.segment_manager.class_aliases[class_id] = class_name

                self.segment_manager.add_segment(
                    {
                        "mask": mask,
                        "class_id": class_id,
                        "type": "ai",
                    }
                )

            # Save to NPZ
            original_path = self.current_image_path
            self.current_image_path = image_path
            try:
                self._save_output_to_npz()
                self.sequence_view_mode.mark_frame_saved(frame_idx)
                if self.timeline_widget:
                    self.timeline_widget.set_frame_status(
                        frame_idx, "saved", immediate=True
                    )
                saved += 1
                # Process events to show animation during save
                QApplication.processEvents()
            except Exception as e:
                logger.error(f"Failed to save frame {frame_idx}: {e}")
            finally:
                self.current_image_path = original_path

        # Clear segment manager and reload current frame
        self.segment_manager.clear()
        current_idx = self.sequence_view_mode.current_frame_idx
        image_path = self.sequence_view_mode.get_image_path(current_idx)
        if image_path:
            self._load_sequence_frame_segments(image_path)

        # Update propagated count
        if self.sequence_widget:
            remaining = len(self.propagation_manager.propagated_frames)
            self.sequence_widget.set_propagated_count(remaining)

        self._show_notification(f"Saved {saved} frames to NPZ")

    def _on_sequence_max_requested(self):
        """Set sequence range to maximum (full folder)."""
        if self.sequence_view_mode is None:
            return

        total = self.sequence_view_mode.total_frames
        if total > 0:
            self.control_panel.set_sequence_range(total)
            self._show_notification(f"Range set to max: {total} frames")
        else:
            # No sequence loaded yet, try to get from current folder
            if self.current_image_path:
                current_path = Path(self.current_image_path)
                image_paths = self._get_sequence_image_paths(current_path.parent)
                total = len(image_paths)
                if total > 0:
                    self.control_panel.set_sequence_range_max(total)
                    self.control_panel.set_sequence_range(total)
                    self._show_notification(f"Range set to max: {total} frames")

    def _on_sequence_load_memory_requested(self):
        """Preload images within the current range into memory."""
        if not self.current_image_path:
            self._show_notification("Please load an image first")
            return

        # Initialize sequence memory caches if needed
        if not hasattr(self, "_sequence_memory_cache"):
            self._sequence_memory_cache: dict[str, np.ndarray] = {}
        if not hasattr(self, "_sequence_mask_cache"):
            self._sequence_mask_cache: dict[str, dict] = {}

        current_path = Path(self.current_image_path)
        image_paths = self._get_sequence_image_paths(current_path.parent)

        if not image_paths:
            self._show_notification("No images found in folder")
            return

        # Get the range and mask setting
        prop_range = self.control_panel.get_sequence_range()
        include_masks = self.control_panel.should_include_masks()

        # Find current image index and calculate range
        try:
            current_idx = image_paths.index(str(current_path))
        except ValueError:
            current_idx = 0

        # Calculate range centered on current (or from start if no image loaded)
        start_idx = max(0, current_idx)
        end_idx = min(len(image_paths), start_idx + prop_range)

        # Update max range in control panel
        self.control_panel.set_sequence_range_max(len(image_paths))

        # Start loading with visual feedback
        self.control_panel.set_load_memory_button_loading(True)
        loading_msg = f"Loading {end_idx - start_idx} images"
        if include_masks:
            loading_msg += " and masks"
        self._show_notification(f"{loading_msg} to memory...")

        # Load images (could be made async with QThread for large sequences)
        loaded_count = 0
        masks_loaded = 0
        total_bytes = 0

        for idx in range(start_idx, end_idx):
            path = image_paths[idx]
            if path not in self._sequence_memory_cache:
                try:
                    img = cv2.imread(path)
                    if img is not None:
                        # Convert BGR to RGB
                        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                        self._sequence_memory_cache[path] = img
                        total_bytes += img.nbytes
                        loaded_count += 1
                except Exception as e:
                    logger.error(f"Failed to load image {path}: {e}")
            else:
                loaded_count += 1

            # Also load masks if requested
            if include_masks and path not in self._sequence_mask_cache:
                try:
                    mask_data = self._load_mask_data_for_path(path)
                    if mask_data is not None:
                        self._sequence_mask_cache[path] = mask_data
                        # Estimate mask memory usage
                        for seg in mask_data.get("segments", []):
                            if "mask" in seg and seg["mask"] is not None:
                                total_bytes += seg["mask"].nbytes
                        masks_loaded += 1
                except Exception as e:
                    logger.debug(f"No mask found for {path}: {e}")

        # Update status - calculate total memory used
        total_size_mb = sum(
            img.nbytes for img in self._sequence_memory_cache.values()
        ) / (1024 * 1024)

        # Add mask cache size
        for mask_data in self._sequence_mask_cache.values():
            for seg in mask_data.get("segments", []):
                if "mask" in seg and seg["mask"] is not None:
                    total_size_mb += seg["mask"].nbytes / (1024 * 1024)

        self.control_panel.set_load_memory_button_loading(False)
        self.control_panel.update_sequence_memory_status(
            loaded_count, end_idx - start_idx, total_size_mb
        )

        result_msg = f"Loaded {loaded_count} images"
        if include_masks:
            result_msg += f" + {masks_loaded} masks"
        result_msg += f" ({total_size_mb:.1f} MB)"
        self._show_notification(result_msg)

    def _load_mask_data_for_path(self, image_path: str) -> dict | None:
        """Load mask data from NPZ file for an image path.

        Args:
            image_path: Path to the image file

        Returns:
            Dictionary with segments and class_aliases, or None if no mask file
        """
        # Construct NPZ path
        npz_path = Path(image_path).with_suffix(".npz")
        if not npz_path.exists():
            return None

        try:
            data = np.load(str(npz_path), allow_pickle=True)
            result = {
                "segments": [],
                "class_aliases": {},
            }

            # Load class aliases if present
            if "class_aliases" in data:
                try:
                    result["class_aliases"] = data["class_aliases"].item()
                except (AttributeError, ValueError):
                    # Handle case where class_aliases is already a dict or other type
                    result["class_aliases"] = dict(data["class_aliases"])

            # Load from "mask" key (standard format - 3D tensor H,W,C where C = num classes)
            if "mask" in data:
                mask_tensor = data["mask"]
                if mask_tensor.ndim == 3:
                    # Each channel is a class
                    for class_id in range(mask_tensor.shape[2]):
                        channel_mask = mask_tensor[:, :, class_id]
                        if channel_mask.any():
                            result["segments"].append(
                                {
                                    "mask": channel_mask.astype(bool),
                                    "class_id": class_id,
                                    "type": "Loaded",
                                    "vertices": None,
                                }
                            )
                elif mask_tensor.ndim == 2 and mask_tensor.any():
                    # Single mask
                    result["segments"].append(
                        {
                            "mask": mask_tensor.astype(bool),
                            "class_id": 0,
                            "type": "Loaded",
                            "vertices": None,
                        }
                    )

            # Also support alternative format with "masks" and "class_ids" arrays
            elif "masks" in data and "class_ids" in data:
                masks = data["masks"]
                class_ids = data["class_ids"]
                for i in range(len(masks)):
                    if masks[i].any():
                        result["segments"].append(
                            {
                                "mask": masks[i].astype(bool),
                                "class_id": int(class_ids[i])
                                if i < len(class_ids)
                                else 0,
                                "type": "Loaded",
                                "vertices": None,
                            }
                        )

            return result if result["segments"] else None
        except Exception as e:
            logger.debug(f"Failed to load mask from {npz_path}: {e}")
            return None

    def get_cached_sequence_image(self, path: str) -> np.ndarray | None:
        """Get a cached image from sequence memory.

        Args:
            path: Path to the image

        Returns:
            Cached numpy array (RGB format) or None if not cached
        """
        if hasattr(self, "_sequence_memory_cache"):
            return self._sequence_memory_cache.get(path)
        return None

    def clear_sequence_memory_cache(self) -> None:
        """Clear the sequence memory cache to free memory."""
        if hasattr(self, "_sequence_memory_cache"):
            self._sequence_memory_cache.clear()
        if hasattr(self, "_sequence_mask_cache"):
            self._sequence_mask_cache.clear()
        self.control_panel.update_sequence_memory_status(0, 0)

    def _on_sequence_clear_cache_requested(self):
        """Handle clear cache button click."""
        self.clear_sequence_memory_cache()
        self._show_notification("Memory cache cleared")

    def _on_set_sequence_start(self):
        """Handle set start frame for sequence range."""
        if not self.current_image_path:
            self._show_notification("Please load an image first")
            return

        self._sequence_start_path = self.current_image_path
        name = Path(self.current_image_path).name
        if self.sequence_widget:
            self.sequence_widget.set_start_frame(name)

        # Update highlighting if both start and end are set
        self._update_sequence_range_highlight()
        self._show_notification(f"Start frame set: {name}")

    def _on_set_sequence_end(self):
        """Handle set end frame for sequence range."""
        if not self.current_image_path:
            self._show_notification("Please load an image first")
            return

        self._sequence_end_path = self.current_image_path
        name = Path(self.current_image_path).name
        if self.sequence_widget:
            self.sequence_widget.set_end_frame(name)

        # Update highlighting if both start and end are set
        self._update_sequence_range_highlight()
        self._show_notification(f"End frame set: {name}")

    def _on_clear_sequence_range(self):
        """Handle clear sequence range selection."""
        self._sequence_start_path = None
        self._sequence_end_path = None

        # Clear highlighting in file manager
        if hasattr(self.right_panel, "file_manager"):
            self.right_panel.file_manager.clearHighlightedRange()

        self._show_notification("Sequence range cleared")

    def _update_sequence_range_highlight(self):
        """Update file navigator highlighting for sequence range."""
        if (
            self._sequence_start_path
            and self._sequence_end_path
            and hasattr(self.right_panel, "file_manager")
        ):
            self.right_panel.file_manager.setHighlightedRange(
                Path(self._sequence_start_path), Path(self._sequence_end_path)
            )

    def _on_build_sequence_timeline(self):
        """Handle build timeline button - creates timeline from selected range."""
        if not self._sequence_start_path or not self._sequence_end_path:
            self._show_notification("Please set both start and end frames")
            return

        if not hasattr(self.right_panel, "file_manager"):
            self._show_notification("File manager not available")
            return

        # Get files in the selected range
        files_in_range = self.right_panel.file_manager.getFilesInRange(
            Path(self._sequence_start_path), Path(self._sequence_end_path)
        )

        if not files_in_range:
            self._show_notification("No files in selected range")
            return

        # Convert to string paths
        image_paths = [str(p) for p in files_in_range]

        # Initialize sequence mode with the selected range
        if self.sequence_view_mode is None:
            self._show_notification("Sequence mode not initialized")
            return

        self.sequence_view_mode.set_image_paths(image_paths)

        # Update widgets
        total = len(image_paths)
        self.timeline_widget.set_frame_count(total)
        if self.sequence_widget:
            self.sequence_widget.set_total_frames(total)
            self.sequence_widget.set_timeline_built(True)

        self._sequence_timeline_built = True

        # Load the first frame
        self._on_sequence_frame_selected(0)

        self._show_notification(f"Timeline built: {total} frames")

    def _on_exit_sequence_timeline(self):
        """Handle exit timeline request - reset to setup UI for new range selection."""
        # Clear propagation state
        if self.propagation_manager:
            self.propagation_manager.cleanup()

        # Clear sequence view mode state
        if self.sequence_view_mode:
            # Reset by setting empty image paths (clears all state including references)
            self.sequence_view_mode.set_image_paths([])

        # Clear file navigator highlighting
        if hasattr(self.right_panel, "file_manager"):
            self.right_panel.file_manager.clearHighlightedRange()

        # Reset state variables
        self._sequence_start_path = None
        self._sequence_end_path = None
        self._sequence_timeline_built = False

        # Reset UI to show setup screen
        if self.sequence_widget:
            self.sequence_widget.reset()

        # Clear timeline
        self.timeline_widget.set_frame_count(0)
        self.timeline_widget.clear_statuses()

        self._show_notification("Timeline cleared. Set new start/end frames.")

    def _enter_sequence_mode(self):
        """Enter sequence mode - shows setup UI for timeline range selection.

        The timeline is NOT auto-loaded. User must:
        1. Navigate to start frame and click 'Set Start'
        2. Navigate to end frame and click 'Set End'
        3. Click 'Build Timeline' to create the timeline
        """
        if self.sequence_view_mode is None:
            return

        # Check if timeline was already built (user switching back to sequence tab)
        if self._sequence_timeline_built:
            # Just restore the sequence view
            self._restore_sequence_mode_state()
            return

        # Reset sequence widget to show setup UI
        if self.sequence_widget:
            self.sequence_widget.reset()
            # Restore any previously set start/end
            if self._sequence_start_path:
                self.sequence_widget.set_start_frame(
                    Path(self._sequence_start_path).name
                )
            if self._sequence_end_path:
                self.sequence_widget.set_end_frame(Path(self._sequence_end_path).name)

        # Clear timeline
        self.timeline_widget.set_frame_count(0)

        self._show_notification(
            "Sequence Mode: Set start/end frames, then Build Timeline"
        )

    def _get_sequence_image_paths(self, folder: Path) -> list[str]:
        """Get sorted list of image paths from a folder."""
        image_extensions = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif"}
        paths = []

        for f in sorted(folder.iterdir()):
            if f.is_file() and f.suffix.lower() in image_extensions:
                paths.append(str(f))

        return paths

    def _restore_sequence_mode_state(self):
        """Restore sequence mode state when switching back from another mode."""
        if self.sequence_view_mode is None:
            return

        # Reload current frame
        current_idx = self.sequence_view_mode.current_frame_idx
        image_path = self.sequence_view_mode.get_image_path(current_idx)
        if image_path:
            self._load_sequence_frame(image_path, current_idx)

    def eventFilter(self, obj, event):
        """Filter events to handle multi-view mouse clicks."""
        from PyQt6.QtCore import QEvent

        # Only handle events in multi-view mode
        if self.view_mode != "multi":
            return super().eventFilter(obj, event)

        # Check if this is a viewport from one of our multi-view viewers
        for i, viewer in enumerate(self.multi_view_viewers):
            if obj == viewer.viewport():
                if event.type() == QEvent.Type.MouseButtonPress:
                    return self._handle_multi_view_mouse_press(i, viewer, event)
                elif event.type() == QEvent.Type.MouseButtonRelease:
                    return self._handle_multi_view_mouse_release(i, viewer, event)
                elif event.type() == QEvent.Type.MouseMove:
                    return self._handle_multi_view_mouse_move(i, viewer, event)

        return super().eventFilter(obj, event)

    def _handle_multi_view_mouse_move(self, viewer_idx, viewer, event):
        """Handle mouse move in a multi-view viewer."""
        from PyQt6.QtCore import QRectF
        from PyQt6.QtGui import QColor, QPen
        from PyQt6.QtWidgets import QGraphicsRectItem

        scene_pos = viewer.mapToScene(event.pos())

        # Handle AI mode drag preview
        if self.mode in ("sam_points", "ai") and hasattr(self, "_multi_view_ai_start"):
            start_viewer, start_pos, _is_positive = self._multi_view_ai_start
            if start_viewer == viewer_idx:
                drag_distance = (
                    (scene_pos.x() - start_pos.x()) ** 2
                    + (scene_pos.y() - start_pos.y()) ** 2
                ) ** 0.5

                # Only show rubber band if dragging
                if drag_distance > 5:
                    if (
                        not hasattr(self, "_multi_view_ai_rect")
                        or not self._multi_view_ai_rect
                    ):
                        self._multi_view_ai_rect = QGraphicsRectItem()
                        self._multi_view_ai_rect.setPen(
                            QPen(QColor(255, 255, 0), 2, Qt.PenStyle.DashLine)
                        )
                        self._multi_view_ai_rect.setZValue(1000)
                        viewer.scene().addItem(self._multi_view_ai_rect)

                    rect = QRectF(start_pos, scene_pos).normalized()
                    self._multi_view_ai_rect.setRect(rect)
                return False

        # Handle bbox drag preview
        if self.mode == "bbox" and hasattr(self, "_multi_view_bbox_start"):
            start_viewer, start_x, start_y = self._multi_view_bbox_start
            if start_viewer == viewer_idx:
                if (
                    hasattr(self, "_multi_view_bbox_rect")
                    and self._multi_view_bbox_rect
                ):
                    # Update rectangle
                    x1, x2 = min(start_x, scene_pos.x()), max(start_x, scene_pos.x())
                    y1, y2 = min(start_y, scene_pos.y()), max(start_y, scene_pos.y())
                    self._multi_view_bbox_rect.setRect(x1, y1, x2 - x1, y2 - y1)
                return True
        return False

    def _handle_multi_view_mouse_press(self, viewer_idx, viewer, event):
        """Handle mouse press in a multi-view viewer."""
        from PyQt6.QtCore import Qt

        # Get scene position
        scene_pos = viewer.mapToScene(event.pos())

        # Check bounds
        if viewer._pixmap_item.pixmap().isNull():
            return False
        if not viewer._pixmap_item.pixmap().rect().contains(scene_pos.toPoint()):
            return False

        # Set active viewer
        if self.multi_view_coordinator:
            self.multi_view_coordinator.set_active_viewer(viewer_idx)

        # Handle based on current mode
        if self.mode in ("sam_points", "ai"):
            # Store start position for potential bbox drag
            self._multi_view_ai_start = (
                viewer_idx,
                scene_pos,
                event.button() == Qt.MouseButton.LeftButton,
            )
            return True
        elif self.mode == "polygon":
            self._handle_multi_view_polygon_click(viewer_idx, scene_pos)
            return True
        elif self.mode == "bbox":
            self._handle_multi_view_bbox_press(viewer_idx, viewer, scene_pos)
            return True
        elif self.mode == "selection":
            self._handle_multi_view_segment_selection_click(viewer_idx, scene_pos)
            return True

        return False

    def _handle_multi_view_mouse_release(self, viewer_idx, viewer, event):
        """Handle mouse release in a multi-view viewer."""
        scene_pos = viewer.mapToScene(event.pos())

        # Handle AI mode release (click or drag)
        if self.mode in ("sam_points", "ai") and hasattr(self, "_multi_view_ai_start"):
            start_viewer, start_pos, is_positive = self._multi_view_ai_start
            del self._multi_view_ai_start

            # Only handle if same viewer
            if start_viewer != viewer_idx:
                return False

            # Calculate drag distance
            drag_distance = (
                (scene_pos.x() - start_pos.x()) ** 2
                + (scene_pos.y() - start_pos.y()) ** 2
            ) ** 0.5

            # Remove rubber band if it exists
            if hasattr(self, "_multi_view_ai_rect") and self._multi_view_ai_rect:
                if self._multi_view_ai_rect.scene():
                    viewer.scene().removeItem(self._multi_view_ai_rect)
                rect = self._multi_view_ai_rect.rect()
                self._multi_view_ai_rect = None

                # If significant drag, use box prediction
                if drag_distance > 5 and rect.width() > 10 and rect.height() > 10:
                    self._handle_multi_view_ai_bbox(viewer_idx, rect)
                    return True

            # Otherwise treat as a click
            self._handle_multi_view_ai_click(viewer_idx, start_pos, is_positive)
            return True

        # Handle bbox mode release
        if self.mode == "bbox" and hasattr(self, "_multi_view_bbox_start"):
            self._handle_multi_view_bbox_release(viewer_idx, viewer, scene_pos)
            return True
        return False

    def _handle_multi_view_polygon_click(self, viewer_idx: int, pos):
        """Handle polygon click in multi-view mode.

        Args:
            viewer_idx: Index of the clicked viewer (0 or 1)
            pos: Click position in scene coordinates
        """
        from PyQt6.QtGui import QBrush, QColor, QPen
        from PyQt6.QtWidgets import (
            QApplication,
            QGraphicsEllipseItem,
            QGraphicsLineItem,
        )

        # Initialize polygon points storage if needed
        if not hasattr(self, "multi_view_polygon_points"):
            self.multi_view_polygon_points = [[], []]
        if not hasattr(self, "multi_view_polygon_preview_items"):
            self.multi_view_polygon_preview_items = {0: [], 1: []}

        viewer = self.multi_view_viewers[viewer_idx]
        points = self.multi_view_polygon_points[viewer_idx]

        # Check if clicking near first point to close polygon (matches single-view)
        if points and len(points) > 2:
            first_point = points[0]
            distance_squared = (pos.x() - first_point[0]) ** 2 + (
                pos.y() - first_point[1]
            ) ** 2
            if distance_squared < self.polygon_join_threshold**2:
                # Check for shift modifier (erase mode)
                modifiers = QApplication.keyboardModifiers()
                shift_pressed = bool(modifiers & Qt.KeyboardModifier.ShiftModifier)

                # Determine shared class_id for linked mode (before finalizing)
                shared_class_id = None
                if (
                    not shift_pressed
                    and self.multi_view_coordinator
                    and self.multi_view_coordinator.is_linked
                ):
                    # Get class_id from primary viewer's segment manager
                    segment_manager = self.multi_view_segment_managers[viewer_idx]
                    shared_class_id = segment_manager.active_class_id
                    if shared_class_id is None:
                        shared_class_id = segment_manager.next_class_id

                # Finalize current viewer's polygon
                self._finalize_multi_view_polygon(
                    viewer_idx,
                    erase_mode=shift_pressed,
                    shared_class_id=shared_class_id,
                )

                # If linked, also finalize the other viewer's polygon with SAME class_id
                if (
                    self.multi_view_coordinator
                    and self.multi_view_coordinator.is_linked
                ):
                    other_idx = 1 - viewer_idx
                    other_points = self.multi_view_polygon_points[other_idx]
                    if other_points and len(other_points) >= 3:
                        self._finalize_multi_view_polygon(
                            other_idx,
                            erase_mode=shift_pressed,
                            shared_class_id=shared_class_id,
                        )
                return

        point = [int(pos.x()), int(pos.y())]

        # Add point to the viewer's polygon
        self.multi_view_polygon_points[viewer_idx].append(point)

        # Draw point marker
        radius = self.point_radius
        point_item = QGraphicsEllipseItem(
            pos.x() - radius, pos.y() - radius, radius * 2, radius * 2
        )
        point_item.setBrush(QBrush(QColor(0, 255, 255)))  # Cyan for polygon
        point_item.setPen(QPen(Qt.GlobalColor.black, 1))
        point_item.setZValue(1000)
        viewer.scene().addItem(point_item)
        self.multi_view_polygon_preview_items[viewer_idx].append(point_item)

        # Draw line to previous point
        points = self.multi_view_polygon_points[viewer_idx]
        if len(points) > 1:
            prev = points[-2]
            line = QGraphicsLineItem(prev[0], prev[1], point[0], point[1])
            line.setPen(QPen(QColor(0, 255, 255), 2))
            line.setZValue(999)
            viewer.scene().addItem(line)
            self.multi_view_polygon_preview_items[viewer_idx].append(line)

        # If linked, also add to the other viewer
        if self.multi_view_coordinator and self.multi_view_coordinator.is_linked:
            other_idx = 1 - viewer_idx
            other_viewer = self.multi_view_viewers[other_idx]

            # Add point to other viewer's polygon
            self.multi_view_polygon_points[other_idx].append(point.copy())

            # Draw point marker on other viewer
            other_point_item = QGraphicsEllipseItem(
                pos.x() - radius, pos.y() - radius, radius * 2, radius * 2
            )
            other_point_item.setBrush(QBrush(QColor(0, 255, 255)))
            other_point_item.setPen(QPen(Qt.GlobalColor.black, 1))
            other_point_item.setZValue(1000)
            other_viewer.scene().addItem(other_point_item)
            self.multi_view_polygon_preview_items[other_idx].append(other_point_item)

            # Draw line on other viewer
            other_points = self.multi_view_polygon_points[other_idx]
            if len(other_points) > 1:
                prev = other_points[-2]
                other_line = QGraphicsLineItem(prev[0], prev[1], point[0], point[1])
                other_line.setPen(QPen(QColor(0, 255, 255), 2))
                other_line.setZValue(999)
                other_viewer.scene().addItem(other_line)
                self.multi_view_polygon_preview_items[other_idx].append(other_line)

    def _handle_multi_view_bbox_press(self, viewer_idx: int, viewer, pos):
        """Handle bbox press in multi-view mode.

        Args:
            viewer_idx: Index of the clicked viewer (0 or 1)
            viewer: The PhotoViewer instance
            pos: Click position in scene coordinates
        """
        from PyQt6.QtGui import QColor, QPen
        from PyQt6.QtWidgets import QGraphicsRectItem

        # Store starting point
        self._multi_view_bbox_start = (viewer_idx, pos.x(), pos.y())

        # Create rectangle preview
        rect_item = QGraphicsRectItem(pos.x(), pos.y(), 0, 0)
        rect_item.setPen(QPen(QColor(255, 255, 0), 2))  # Yellow
        rect_item.setZValue(1000)
        viewer.scene().addItem(rect_item)
        self._multi_view_bbox_rect = rect_item

    def _handle_multi_view_bbox_release(self, viewer_idx: int, viewer, pos):
        """Handle bbox release in multi-view mode.

        Creates a rectangular polygon segment (NOT AI prediction).

        Args:
            viewer_idx: Index of the clicked viewer (0 or 1)
            viewer: The PhotoViewer instance
            pos: Release position in scene coordinates
        """
        from PyQt6.QtCore import QPointF
        from PyQt6.QtWidgets import QApplication

        if not hasattr(self, "_multi_view_bbox_start"):
            return

        start_viewer, start_x, start_y = self._multi_view_bbox_start
        end_x, end_y = pos.x(), pos.y()

        # Clean up preview
        if hasattr(self, "_multi_view_bbox_rect") and self._multi_view_bbox_rect:
            if self._multi_view_bbox_rect.scene():
                viewer.scene().removeItem(self._multi_view_bbox_rect)
            self._multi_view_bbox_rect = None

        del self._multi_view_bbox_start

        # Normalize coordinates
        x1, x2 = min(start_x, end_x), max(start_x, end_x)
        y1, y2 = min(start_y, end_y), max(start_y, end_y)

        # Minimum size check
        if abs(x2 - x1) < 2 or abs(y2 - y1) < 2:
            return

        # Check for shift modifier (erase mode)
        modifiers = QApplication.keyboardModifiers()
        shift_pressed = bool(modifiers & Qt.KeyboardModifier.ShiftModifier)

        # Create rectangular polygon vertices
        vertices = [
            [x1, y1],  # top-left
            [x2, y1],  # top-right
            [x2, y2],  # bottom-right
            [x1, y2],  # bottom-left
        ]

        # Get target viewers
        target_viewers = [viewer_idx]
        if self.multi_view_coordinator and self.multi_view_coordinator.is_linked:
            target_viewers = [0, 1]

        for target_idx in target_viewers:
            if target_idx >= len(self.multi_view_segment_managers):
                continue

            segment_manager = self.multi_view_segment_managers[target_idx]
            target_viewer = self.multi_view_viewers[target_idx]

            if shift_pressed:
                # Erase overlapping segments
                pixmap = target_viewer._pixmap_item.pixmap()
                if not pixmap.isNull():
                    image_size = (pixmap.height(), pixmap.width())
                    polygon_vertices = [QPointF(v[0], v[1]) for v in vertices]
                    removed_indices, _ = segment_manager.erase_segments_with_shape(
                        polygon_vertices, image_size
                    )
                    if removed_indices:
                        self._show_notification(
                            f"Erased {len(removed_indices)} segment(s) from viewer {target_idx + 1}"
                        )
            else:
                # Create new bbox segment (class_id auto-assigned by add_segment)
                # IMPORTANT: Create a COPY of vertices for each viewer to avoid
                # shared reference issues when editing segments independently
                new_segment = {
                    "vertices": [[v[0], v[1]] for v in vertices],
                    "type": "Polygon",
                    "mask": None,
                }
                segment_manager.add_segment(new_segment)

            # Update display
            self._display_multi_view_segments(target_idx)
            self._update_multi_view_segment_table(target_idx)

    def _toggle_multi_view_link(self, viewer_idx: int | None = None):
        """Toggle the link state between viewers.

        Args:
            viewer_idx: Optional viewer index (unused, for compatibility with per-viewer buttons)
        """
        if self.multi_view_coordinator:
            is_linked = self.multi_view_coordinator.toggle_link()
            self.multi_view_link_button.setText("Linked" if is_linked else "Unlinked")
            self.multi_view_link_button.setChecked(is_linked)
            status = "linked" if is_linked else "unlinked"
            self._show_notification(f"Viewers are now {status}")

    def _enter_multi_view_mode(self):
        """Enter multi-view mode and load consecutive images.

        Uses file manager's sort order for determining image pairs.
        """
        from pathlib import Path

        # Swap right panel content to show multi-view tables
        self._swap_right_panel_to_multi_view()

        # Load current image into viewer 0 and next image into viewer 1
        if not self.current_image_path:
            self._show_notification("Please load an image first")
            return

        # Load current image to viewer 0
        self._load_multi_view_image(0, self.current_image_path)

        # Get next file from file manager (respects sort order)
        current_path = Path(self.current_image_path)
        surrounding = self.right_panel.file_manager.getSurroundingFiles(current_path, 2)

        if len(surrounding) > 1 and surrounding[1]:
            # Load next file to viewer 1
            self._load_multi_view_image(1, str(surrounding[1]))
        else:
            self._load_multi_view_image(1, None)

        # Select first file in file manager to show current position
        self.right_panel.select_file(current_path)

        # Preload adjacent image pairs for instant navigation
        self.image_preload_manager.preload_multi_view_adjacent()

    def _swap_right_panel_to_multi_view(self):
        """Swap the right panel content to show multi-view segment/class tables."""
        if not hasattr(self, "multi_view_segment_section"):
            return

        # Get the vertical splitter from right panel
        # Structure: right_panel -> main_controls_widget -> v_splitter
        v_splitter = None
        for child in self.right_panel.main_controls_widget.findChildren(QSplitter):
            if child.orientation() == Qt.Orientation.Vertical:
                v_splitter = child
                break

        if not v_splitter:
            return

        # Find and hide single-view segment/class widgets (indices 1 and 2 in splitter)
        # Index 0 = file explorer, 1 = segment management, 2 = class management
        if v_splitter.count() > 1:
            v_splitter.widget(1).hide()  # Hide single-view segment section
        if v_splitter.count() > 2:
            v_splitter.widget(2).hide()  # Hide single-view class section

        # Insert multi-view sections after file explorer
        v_splitter.insertWidget(1, self.multi_view_segment_section)
        v_splitter.insertWidget(2, self.multi_view_class_section)

        self.multi_view_segment_section.show()
        self.multi_view_class_section.show()

        # Store references to hidden widgets for restoration
        self._single_view_segment_widget = (
            v_splitter.widget(3) if v_splitter.count() > 3 else None
        )
        self._single_view_class_widget = (
            v_splitter.widget(4) if v_splitter.count() > 4 else None
        )

    def _swap_right_panel_to_single_view(self):
        """Swap the right panel content back to single-view mode."""
        if not hasattr(self, "multi_view_segment_section"):
            return

        # Hide multi-view sections
        self.multi_view_segment_section.hide()
        self.multi_view_class_section.hide()

        # Get the vertical splitter from right panel
        v_splitter = None
        for child in self.right_panel.main_controls_widget.findChildren(QSplitter):
            if child.orientation() == Qt.Orientation.Vertical:
                v_splitter = child
                break

        if not v_splitter:
            return

        # Show single-view segment/class widgets
        for i in range(v_splitter.count()):
            widget = v_splitter.widget(i)
            if widget and widget not in (
                self.multi_view_segment_section,
                self.multi_view_class_section,
            ):
                widget.show()

    def _load_multi_view_image(self, viewer_idx: int, image_path: str | None):
        """Load an image into a specific multi-view viewer.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
            image_path: Path to the image, or None to clear
        """
        if viewer_idx < 0 or viewer_idx >= len(self.multi_view_viewers):
            return

        viewer = self.multi_view_viewers[viewer_idx]
        self.multi_view_image_paths[viewer_idx] = image_path

        # Mark SAM model as dirty so it reloads with new image
        if hasattr(self, "sam_multi_view_manager") and self.sam_multi_view_manager:
            self.sam_multi_view_manager.mark_viewer_dirty(viewer_idx)

        # Clear AI points and previews for this viewer
        if hasattr(self, "multi_view_coordinator") and self.multi_view_coordinator:
            self.multi_view_coordinator.clear_points(viewer_idx)
            self.multi_view_coordinator.clear_point_items(viewer_idx)
            # Clear preview mask/item
            self.multi_view_coordinator.set_preview_mask(viewer_idx, None)
            old_preview = self.multi_view_coordinator.get_preview_item(viewer_idx)
            if old_preview and viewer.scene():
                viewer.scene().removeItem(old_preview)
            self.multi_view_coordinator.set_preview_item(viewer_idx, None)

        # Clear segment pixmap cache to avoid stale visuals when returning to images
        if hasattr(self, "segment_display_manager"):
            self.segment_display_manager.invalidate_cache()

        if image_path:
            # Try to use preloaded pixmap first (instant navigation)
            pixmap = self.image_preload_manager.get_preloaded_pixmap(image_path)
            if pixmap is None:
                # Fall back to loading from disk
                pixmap = QPixmap(image_path)

            if not pixmap.isNull():
                viewer.set_photo(pixmap)
                # Update info label
                filename = os.path.basename(image_path)
                self.multi_view_info_labels[viewer_idx].setText(
                    f"Viewer {viewer_idx + 1}: {filename}"
                )

                # Load existing annotations for this image
                self._load_multi_view_annotations(viewer_idx, image_path)
            else:
                viewer.set_photo(QPixmap())
                self.multi_view_info_labels[viewer_idx].setText(
                    f"Viewer {viewer_idx + 1}: Failed to load"
                )
        else:
            viewer.set_photo(QPixmap())
            self.multi_view_info_labels[viewer_idx].setText(
                f"Viewer {viewer_idx + 1}: No image"
            )

    def _load_multi_view_annotations(self, viewer_idx: int, image_path: str):
        """Load annotations for an image into its viewer's segment manager.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
            image_path: Path to the image
        """
        if viewer_idx < 0 or viewer_idx >= len(self.multi_view_segment_managers):
            return

        segment_manager = self.multi_view_segment_managers[viewer_idx]
        segment_manager.clear()

        # Try to load existing annotations
        try:
            # Use file_manager to load, but store in per-viewer segment manager
            npz_path = os.path.splitext(image_path)[0] + ".npz"
            if os.path.exists(npz_path):
                data = np.load(npz_path, allow_pickle=True)

                # Load masks - check both keys for compatibility
                # Single-view uses "mask", multi-view previously used "masks"
                mask_key = (
                    "mask" if "mask" in data else "masks" if "masks" in data else None
                )
                if mask_key:
                    masks = data[mask_key]
                    # Handle both 2D and 3D mask arrays
                    if masks.ndim == 2:
                        masks = np.expand_dims(masks, axis=-1)
                    for i in range(masks.shape[2]):
                        mask = masks[:, :, i].astype(bool)
                        if np.any(mask):  # Only add non-empty masks
                            segment_manager.add_segment(
                                {"type": "Loaded", "mask": mask, "class_id": i}
                            )

                # Load class aliases
                if "class_aliases" in data:
                    try:
                        aliases = data["class_aliases"].item()
                        if isinstance(aliases, dict):
                            for class_id, alias in aliases.items():
                                segment_manager.set_class_alias(class_id, alias)
                    except (AttributeError, ValueError):
                        pass

        except Exception as e:
            logger.debug(f"No existing annotations for {image_path}: {e}")

        # Update the viewer's segment table
        self._update_multi_view_segment_table(viewer_idx)

        # Clear and redisplay segments (clears old visual items, shows new ones)
        self._display_multi_view_segments(viewer_idx)

    def _update_multi_view_segment_table(self, viewer_idx: int):
        """Update the segment table for a specific viewer.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
        """
        from PyQt6.QtGui import QBrush
        from PyQt6.QtWidgets import QTableWidgetItem

        if viewer_idx < 0 or viewer_idx >= len(self.multi_view_segment_tables):
            return

        table = self.multi_view_segment_tables[viewer_idx]
        segment_manager = self.multi_view_segment_managers[viewer_idx]

        table.setRowCount(0)
        for i, segment in enumerate(segment_manager.segments):
            row = table.rowCount()
            table.insertRow(row)

            table.setItem(row, 0, QTableWidgetItem(str(i)))
            class_id = segment.get("class_id", 0)
            table.setItem(row, 1, QTableWidgetItem(str(class_id)))
            alias = segment_manager.get_class_alias(class_id)
            table.setItem(row, 2, QTableWidgetItem(alias))

            # Set background color based on class (matches single-view pattern)
            color = self.segment_display_manager.get_color_for_class(class_id)
            for col in range(table.columnCount()):
                if table.item(row, col):
                    table.item(row, col).setBackground(QBrush(color))

        # Also update class table
        self._update_multi_view_class_table(viewer_idx)

    def _update_multi_view_class_table(self, viewer_idx: int):
        """Update the class table for a specific viewer.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
        """
        from PyQt6.QtGui import QBrush
        from PyQt6.QtWidgets import QTableWidgetItem

        if viewer_idx < 0 or viewer_idx >= len(self.multi_view_class_tables):
            return

        table = self.multi_view_class_tables[viewer_idx]
        segment_manager = self.multi_view_segment_managers[viewer_idx]

        table.setRowCount(0)
        unique_class_ids = segment_manager.get_unique_class_ids()

        for class_id in unique_class_ids:
            row = table.rowCount()
            table.insertRow(row)
            alias = segment_manager.get_class_alias(class_id)
            alias_item = QTableWidgetItem(alias)
            id_item = QTableWidgetItem(str(class_id))

            # Set background color (matches single-view pattern)
            color = self.segment_display_manager.get_color_for_class(class_id)
            alias_item.setBackground(QBrush(color))
            id_item.setBackground(QBrush(color))

            table.setItem(row, 0, alias_item)
            table.setItem(row, 1, id_item)

    # ========== Multi-View Table Signal Handlers ==========

    def _on_multi_view_segment_selection_changed(self, viewer_idx: int):
        """Handle segment selection change in multi-view table.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
        """
        self._highlight_multi_view_selected_segments(viewer_idx)

        # If linked, also select in other viewer
        if self.multi_view_coordinator and self.multi_view_coordinator.is_linked:
            other_idx = 1 - viewer_idx
            self._sync_multi_view_selection(viewer_idx, other_idx)

        # If in edit mode, update handles
        if self.mode == "edit":
            self._display_multi_view_edit_handles()

    def _highlight_multi_view_selected_segments(self, viewer_idx: int):
        """Highlight selected segments in a multi-view viewer.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
        """
        from PyQt6.QtCore import QPointF
        from PyQt6.QtGui import QBrush, QColor, QPen, QPolygonF
        from PyQt6.QtWidgets import QGraphicsPolygonItem

        if viewer_idx >= len(self.multi_view_viewers):
            return

        table = self.multi_view_segment_tables[viewer_idx]
        viewer = self.multi_view_viewers[viewer_idx]
        segment_manager = self.multi_view_segment_managers[viewer_idx]

        # Get selected indices from table
        selected_rows = {item.row() for item in table.selectedItems()}
        selected_indices = []
        for row in selected_rows:
            item = table.item(row, 0)
            if item:
                with contextlib.suppress(ValueError):
                    selected_indices.append(int(item.text()))

        # Clear previous highlights for this viewer
        if not hasattr(self, "multi_view_highlight_items"):
            self.multi_view_highlight_items = {0: [], 1: []}
        for item in self.multi_view_highlight_items.get(viewer_idx, []):
            if item.scene():
                item.scene().removeItem(item)
        self.multi_view_highlight_items[viewer_idx] = []

        # Create highlight overlays (yellow)
        highlight_color = QColor(255, 255, 0, 180)

        for seg_idx in selected_indices:
            if seg_idx >= len(segment_manager.segments):
                continue
            seg = segment_manager.segments[seg_idx]

            if seg.get("type") == "Polygon" and seg.get("vertices"):
                vertices = seg["vertices"]
                qpoints = [QPointF(p[0], p[1]) for p in vertices]
                poly_item = QGraphicsPolygonItem(QPolygonF(qpoints))
                poly_item.setBrush(QBrush(highlight_color))
                poly_item.setPen(QPen(Qt.GlobalColor.transparent))
                poly_item.setZValue(999)
                viewer.scene().addItem(poly_item)
                self.multi_view_highlight_items[viewer_idx].append(poly_item)
            elif seg.get("mask") is not None:
                # For mask-based (AI) segments, create yellow pixmap overlay
                mask = seg["mask"]
                pixmap = self.segment_display_manager.get_cached_highlight_pixmap(
                    seg_idx, mask, (255, 255, 0), alpha=180, viewer_index=viewer_idx
                )
                highlight_item = viewer.scene().addPixmap(pixmap)
                highlight_item.setZValue(1000)
                self.multi_view_highlight_items[viewer_idx].append(highlight_item)

    def _sync_multi_view_selection(self, source_idx: int, target_idx: int):
        """Sync selection from source viewer to target viewer.

        Args:
            source_idx: Index of the source viewer
            target_idx: Index of the target viewer
        """
        from PyQt6.QtCore import QItemSelectionModel

        source_table = self.multi_view_segment_tables[source_idx]
        target_table = self.multi_view_segment_tables[target_idx]

        # Block signals to prevent recursion
        target_table.blockSignals(True)

        # Get selected rows from source
        selected_rows = {item.row() for item in source_table.selectedItems()}

        # Clear and select rows in target using selection model
        # This properly handles multi-row selection
        target_table.clearSelection()
        selection_model = target_table.selectionModel()
        for row in selected_rows:
            if row < target_table.rowCount():
                # Use Select flag with Rows to add to selection instead of replacing
                index = target_table.model().index(row, 0)
                selection_model.select(
                    index,
                    QItemSelectionModel.SelectionFlag.Select
                    | QItemSelectionModel.SelectionFlag.Rows,
                )

        target_table.blockSignals(False)

        # Highlight in target viewer
        self._highlight_multi_view_selected_segments(target_idx)

    def _delete_multi_view_selected_segments(self, viewer_idx: int):
        """Delete selected segments from a multi-view viewer.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
        """
        table = self.multi_view_segment_tables[viewer_idx]
        segment_manager = self.multi_view_segment_managers[viewer_idx]

        # Get selected indices (sorted descending for safe deletion)
        selected_rows = sorted(
            {item.row() for item in table.selectedItems()}, reverse=True
        )
        selected_indices = []
        for row in selected_rows:
            item = table.item(row, 0)
            if item:
                with contextlib.suppress(ValueError):
                    selected_indices.append(int(item.text()))

        if not selected_indices:
            return

        # Clear highlights first
        if hasattr(self, "multi_view_highlight_items"):
            for item in self.multi_view_highlight_items.get(viewer_idx, []):
                if item.scene():
                    item.scene().removeItem(item)
            self.multi_view_highlight_items[viewer_idx] = []

        # Delete from segment manager
        segment_manager.delete_segments(sorted(selected_indices, reverse=True))

        # Update displays
        self._update_multi_view_segment_table(viewer_idx)
        self._update_multi_view_class_table(viewer_idx)
        self._display_multi_view_segments(viewer_idx)

        self._show_notification(f"Deleted {len(selected_indices)} segment(s)")

    def _merge_multi_view_selected_segments(self, viewer_idx: int):
        """Merge selected segments to active class in multi-view.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
        """
        table = self.multi_view_segment_tables[viewer_idx]
        segment_manager = self.multi_view_segment_managers[viewer_idx]

        # Get selected indices
        selected_rows = {item.row() for item in table.selectedItems()}
        selected_indices = []
        for row in selected_rows:
            item = table.item(row, 0)
            if item:
                with contextlib.suppress(ValueError):
                    selected_indices.append(int(item.text()))

        if not selected_indices:
            return

        # Assign to class
        segment_manager.assign_segments_to_class(selected_indices)

        # Update displays
        self._update_multi_view_segment_table(viewer_idx)
        self._update_multi_view_class_table(viewer_idx)
        self._display_multi_view_segments(viewer_idx)

        self._show_notification(f"Merged {len(selected_indices)} segment(s)")

    def _on_multi_view_class_alias_changed(self, viewer_idx: int, item):
        """Handle class alias change in multi-view mode.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
            item: The changed table item
        """
        if item.column() != 0:  # Only handle alias column
            return

        table = self.multi_view_class_tables[viewer_idx]
        id_item = table.item(item.row(), 1)
        if not id_item:
            return

        try:
            class_id = int(id_item.text())
            alias = item.text()
        except (ValueError, AttributeError):
            return

        segment_manager = self.multi_view_segment_managers[viewer_idx]
        segment_manager.set_class_alias(class_id, alias)

        # Update segment table to reflect new alias
        self._update_multi_view_segment_table(viewer_idx)

        # If linked, mirror to other viewer
        if self.multi_view_coordinator and self.multi_view_coordinator.is_linked:
            other_idx = 1 - viewer_idx
            other_segment_manager = self.multi_view_segment_managers[other_idx]
            other_segment_manager.set_class_alias(class_id, alias)
            self._update_multi_view_class_table(other_idx)
            self._update_multi_view_segment_table(other_idx)

    def _on_multi_view_class_toggled(self, viewer_idx: int, row: int, column: int):
        """Handle class toggle (set as active) in multi-view mode.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
            row: Row index in the table
            column: Column index in the table
        """
        table = self.multi_view_class_tables[viewer_idx]
        id_item = table.item(row, 1)
        if not id_item:
            return

        try:
            class_id = int(id_item.text())
        except (ValueError, AttributeError):
            return

        segment_manager = self.multi_view_segment_managers[viewer_idx]
        segment_manager.set_active_class(class_id)

        self._show_notification(
            f"Active class set to {class_id} for viewer {viewer_idx + 1}"
        )

        # If linked, mirror to other viewer
        if self.multi_view_coordinator and self.multi_view_coordinator.is_linked:
            other_idx = 1 - viewer_idx
            other_segment_manager = self.multi_view_segment_managers[other_idx]
            other_segment_manager.set_active_class(class_id)

    def _reassign_multi_view_class_ids(self, viewer_idx: int):
        """Reassign class IDs based on current table order in multi-view.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
        """
        if viewer_idx >= len(self.multi_view_class_tables):
            return

        table = self.multi_view_class_tables[viewer_idx]
        segment_manager = self.multi_view_segment_managers[viewer_idx]

        # Get current class order from table
        new_order = []
        for row in range(table.rowCount()):
            id_item = table.item(row, 1)
            if id_item:
                with contextlib.suppress(ValueError):
                    new_order.append(int(id_item.text()))

        if not new_order:
            return

        # Reassign class IDs
        segment_manager.reassign_class_ids(new_order)

        # Update displays
        self._update_multi_view_segment_table(viewer_idx)
        self._update_multi_view_class_table(viewer_idx)
        self._display_multi_view_segments(viewer_idx)

        self._show_notification(f"Reassigned class IDs for viewer {viewer_idx + 1}")

    def _load_next_multi_batch(self):
        """Load next batch of consecutive images in multi-view mode.

        Uses file manager's sort order for navigation.
        """
        # Auto-save current annotations before navigating
        self._save_multi_view_annotations()

        # Get current viewer 0's image path
        current_path = self.multi_view_image_paths[0]
        if not current_path:
            self._show_notification("No current image")
            return

        # Get next pair from file manager (respects sort order)
        from pathlib import Path

        next_file1, next_file2 = self.right_panel.get_next_file_pair(Path(current_path))

        if next_file1 is None:
            self._show_notification("Reached end of image list")
            return

        # Load next consecutive pair
        self._load_multi_view_image(0, str(next_file1))
        self._load_multi_view_image(1, str(next_file2) if next_file2 else None)

        # Select first file in file manager to show current position
        self.right_panel.select_file(next_file1)

        # Preload adjacent image pairs for instant navigation
        self.image_preload_manager.preload_multi_view_adjacent()

    def _load_previous_multi_batch(self):
        """Load previous batch of consecutive images in multi-view mode.

        Uses file manager's sort order for navigation.
        """
        # Auto-save current annotations before navigating
        self._save_multi_view_annotations()

        # Get current viewer 0's image path
        current_path = self.multi_view_image_paths[0]
        if not current_path:
            self._show_notification("No current image")
            return

        # Get previous pair from file manager (respects sort order)
        from pathlib import Path

        prev_file1, prev_file2 = self.right_panel.get_previous_file_pair(
            Path(current_path)
        )

        if prev_file1 is None:
            self._show_notification("Reached beginning of image list")
            return

        # Load previous consecutive pair
        self._load_multi_view_image(0, str(prev_file1))
        self._load_multi_view_image(1, str(prev_file2) if prev_file2 else None)

        # Select first file in file manager to show current position
        self.right_panel.select_file(prev_file1)

        # Preload adjacent image pairs for instant navigation
        self.image_preload_manager.preload_multi_view_adjacent()

    def _save_multi_view_annotations(self):
        """Save annotations for both viewers to their respective image files.

        If all segments are deleted, the NPZ file is also deleted.
        """
        from pathlib import Path

        for viewer_idx in range(2):
            image_path = self.multi_view_image_paths[viewer_idx]
            if not image_path:
                continue

            segment_manager = self.multi_view_segment_managers[viewer_idx]
            npz_path = os.path.splitext(image_path)[0] + ".npz"

            # If no segments, delete the NPZ file if it exists
            if not segment_manager.segments:
                if os.path.exists(npz_path):
                    try:
                        os.remove(npz_path)
                        logger.debug(f"Deleted empty annotation file: {npz_path}")
                        # Update file manager to reflect the change
                        if hasattr(self, "right_panel") and hasattr(
                            self.right_panel, "file_manager"
                        ):
                            self.right_panel.file_manager.updateFileStatus(
                                Path(image_path)
                            )
                    except Exception as e:
                        logger.error(f"Error deleting {npz_path}: {e}")
                continue

            # Use the save_export_manager to save annotations
            try:
                viewer = self.multi_view_viewers[viewer_idx]
                pixmap = viewer._pixmap_item.pixmap()
                if pixmap.isNull():
                    continue

                image_size = (pixmap.height(), pixmap.width())
                class_order = segment_manager.get_unique_class_ids()

                if class_order:
                    # Create mask tensor and save
                    final_mask = segment_manager.create_final_mask_tensor(
                        image_size, class_order
                    )

                    # Save NPZ file - use "mask" key for single-view compatibility
                    if npz_path:
                        np.savez_compressed(
                            npz_path,
                            mask=final_mask,  # Use "mask" for consistency with single-view
                        )
                        logger.debug(f"Saved multi-view annotations to {npz_path}")
                        # Update file manager to reflect the change
                        if hasattr(self, "right_panel") and hasattr(
                            self.right_panel, "file_manager"
                        ):
                            self.right_panel.file_manager.updateFileStatus(
                                Path(image_path)
                            )
            except Exception as e:
                logger.error(f"Error saving multi-view annotations: {e}")

    # ========== Multi-View Linked Operations ==========

    def _handle_multi_view_ai_click(
        self, viewer_idx: int, pos: QPointF, positive: bool = True
    ):
        """Handle AI click in multi-view mode with linked predictions.

        Args:
            viewer_idx: Index of the clicked viewer (0 or 1)
            pos: Click position in scene coordinates
            positive: True for positive point, False for negative
        """
        if not self.multi_view_coordinator:
            return

        # Set active viewer
        self.multi_view_coordinator.set_active_viewer(viewer_idx)

        # Transform to SAM coordinates for the clicked viewer
        sam_x, sam_y = self._transform_multi_view_coords(viewer_idx, pos)

        # Get target viewers (both if linked, just active if unlinked)
        target_viewers = self.multi_view_coordinator.get_target_viewers()

        for target_idx in target_viewers:
            # Add point to coordinator state
            self.multi_view_coordinator.add_point(target_idx, [sam_x, sam_y], positive)

            # Add visual point marker
            self._add_multi_view_point_marker(target_idx, sam_x, sam_y, positive)

            # Trigger SAM prediction for this viewer
            self._update_multi_view_prediction(target_idx)

    def _handle_multi_view_ai_bbox(self, viewer_idx: int, rect):
        """Handle AI bounding box in multi-view mode.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
            rect: QRectF of the bounding box
        """
        if not self.multi_view_coordinator:
            logger.debug("No multi_view_coordinator")
            return

        # Get the SAM multi-view manager
        if not hasattr(self, "sam_multi_view_manager"):
            logger.warning("SAM multi-view manager not initialized")
            return

        # Convert rect to box format [x1, y1, x2, y2]
        box = (int(rect.left()), int(rect.top()), int(rect.right()), int(rect.bottom()))

        # Get target viewers (both if linked, just active if unlinked)
        target_viewers = self.multi_view_coordinator.get_target_viewers()
        logger.debug(f"AI bbox: target_viewers={target_viewers}, box={box}")

        preview_count = 0
        for target_idx in target_viewers:
            # Call SAM prediction
            logger.debug(f"Calling predict_from_box for viewer {target_idx}")
            result = self.sam_multi_view_manager.predict_from_box(target_idx, box)
            if result:
                mask, score, _logits = result
                logger.debug(
                    f"Viewer {target_idx}: Got mask with {mask.sum()} pixels, score={score}"
                )

                # Ensure mask is boolean
                if mask.dtype != bool:
                    mask = mask > 0.5

                # Show preview
                self._show_multi_view_preview(target_idx, mask)
                preview_count += 1
            else:
                logger.warning(f"Viewer {target_idx}: No result from predict_from_box")

        if preview_count > 0:
            self._show_notification("Press spacebar to accept AI segment suggestion")
        else:
            self._show_warning_notification("AI prediction failed")

    def _transform_multi_view_coords(
        self, viewer_idx: int, pos: QPointF
    ) -> tuple[int, int]:
        """Transform scene coordinates to SAM coordinates for a viewer.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
            pos: Position in scene coordinates

        Returns:
            Tuple of (sam_x, sam_y) coordinates
        """
        # SAM uses scale_factor=1.0, so coordinates are direct
        return int(pos.x()), int(pos.y())

    def _add_multi_view_point_marker(
        self, viewer_idx: int, sam_x: int, sam_y: int, positive: bool
    ):
        """Add a visual point marker to a multi-view viewer.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
            sam_x: SAM x coordinate
            sam_y: SAM y coordinate
            positive: True for positive point (green), False for negative (red)
        """
        from PyQt6.QtGui import QBrush, QColor, QPen
        from PyQt6.QtWidgets import QGraphicsEllipseItem

        if viewer_idx < 0 or viewer_idx >= len(self.multi_view_viewers):
            return

        viewer = self.multi_view_viewers[viewer_idx]

        # SAM uses scale_factor=1.0, coordinates are direct
        display_x = sam_x
        display_y = sam_y

        # Create point marker
        color = QColor(0, 255, 0) if positive else QColor(255, 0, 0)
        radius = self.point_radius

        point_item = QGraphicsEllipseItem(
            display_x - radius, display_y - radius, radius * 2, radius * 2
        )
        point_item.setBrush(QBrush(color))
        point_item.setPen(QPen(Qt.GlobalColor.black, 1))
        point_item.setZValue(1000)  # On top

        viewer.scene().addItem(point_item)
        self.multi_view_coordinator.add_point_item(viewer_idx, point_item)

    def _update_multi_view_prediction(self, viewer_idx: int):
        """Update SAM prediction for a specific multi-view viewer.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
        """
        if not self.sam_multi_view_manager or not self.multi_view_coordinator:
            return

        # Get points for this viewer
        positive_points = self.multi_view_coordinator.get_positive_points(viewer_idx)
        negative_points = self.multi_view_coordinator.get_negative_points(viewer_idx)

        if not positive_points and not negative_points:
            return

        # Run prediction (this lazily initializes model and loads image if needed)
        result = self.sam_multi_view_manager.predict(
            viewer_idx, positive_points, negative_points
        )

        if result:
            mask, score, _logits = result
            # Ensure mask is boolean (SAM can return float32)
            if mask.dtype != bool:
                mask = mask > 0.5
            self._show_multi_view_preview(viewer_idx, mask)

    def _show_multi_view_preview(self, viewer_idx: int, mask):
        """Show preview mask on a multi-view viewer.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
            mask: Binary boolean mask to display
        """
        if viewer_idx < 0 or viewer_idx >= len(self.multi_view_viewers):
            return

        viewer = self.multi_view_viewers[viewer_idx]

        # Remove existing preview
        old_preview = self.multi_view_coordinator.get_preview_item(viewer_idx)
        if old_preview and old_preview.scene():
            viewer.scene().removeItem(old_preview)

        # Create new preview pixmap (RGB tuple, not QColor)
        preview_color = (255, 255, 0)  # Yellow
        preview_pixmap = mask_to_pixmap(mask, preview_color, alpha=128)

        # Scale to display size
        scale_factor = self.sam_multi_view_manager.get_sam_scale_factor(viewer_idx)
        if scale_factor != 1.0:
            from PyQt6.QtCore import Qt as QtCore_Qt

            pixmap_item_pixmap = viewer._pixmap_item.pixmap()
            display_width = pixmap_item_pixmap.width()
            display_height = pixmap_item_pixmap.height()
            preview_pixmap = preview_pixmap.scaled(
                display_width,
                display_height,
                QtCore_Qt.AspectRatioMode.IgnoreAspectRatio,
                QtCore_Qt.TransformationMode.FastTransformation,
            )

        # Add to scene
        from PyQt6.QtWidgets import QGraphicsPixmapItem

        preview_item = QGraphicsPixmapItem(preview_pixmap)
        preview_item.setZValue(500)  # Above image, below points
        viewer.scene().addItem(preview_item)

        # Store references
        self.multi_view_coordinator.set_preview_item(viewer_idx, preview_item)
        self.multi_view_coordinator.set_preview_mask(viewer_idx, mask)

    def _save_multi_view_ai_predictions(self):
        """Save current AI predictions from multi-view to segment managers."""
        if not self.multi_view_coordinator:
            return

        # Get target viewers (both if linked, just active if unlinked)
        target_viewers = self.multi_view_coordinator.get_target_viewers()
        saved_count = 0

        for viewer_idx in target_viewers:
            mask = self.multi_view_coordinator.get_preview_mask(viewer_idx)
            if mask is None:
                continue

            # Get the segment manager for this viewer
            segment_manager = self.multi_view_segment_managers[viewer_idx]

            # Apply fragment threshold
            filtered_mask = self._apply_fragment_threshold(mask)
            if filtered_mask is None or not np.any(filtered_mask):
                continue

            # Use _create_segment_from_mask for auto-polygon conversion
            new_segment = self._create_segment_from_mask(filtered_mask)

            # Override class_id for this viewer's segment manager
            class_id = segment_manager.active_class_id
            if class_id is None:
                class_id = segment_manager.next_class_id
            new_segment["class_id"] = class_id

            # Add segment
            segment_manager.add_segment(new_segment)

            # Update display
            self._update_multi_view_segment_table(viewer_idx)
            self._display_multi_view_segments(viewer_idx)

            saved_count += 1

        # Clear previews and points
        self._clear_multi_view_previews()

        if saved_count > 0:
            self._show_success_notification(
                f"Saved predictions to {saved_count} viewer(s)"
            )

    def _clear_multi_view_previews(self):
        """Clear all preview items and points from multi-view viewers."""
        if not self.multi_view_coordinator:
            return

        for viewer_idx in range(2):
            viewer = self.multi_view_viewers[viewer_idx]

            # Remove preview item
            preview_item = self.multi_view_coordinator.get_preview_item(viewer_idx)
            if preview_item and preview_item.scene():
                viewer.scene().removeItem(preview_item)

            # Remove point items
            for point_item in self.multi_view_coordinator.get_point_items(viewer_idx):
                if point_item.scene():
                    viewer.scene().removeItem(point_item)

        # Clear coordinator state
        self.multi_view_coordinator.clear_all_preview_state()

    def _get_multi_view_config(self) -> dict:
        """Get multi-view configuration.

        Returns:
            Dictionary with multi-view configuration settings.
        """
        return {
            "num_viewers": 2,
            "is_linked": self.multi_view_coordinator.is_linked
            if self.multi_view_coordinator
            else True,
            "active_viewer": self.multi_view_coordinator.active_viewer_idx
            if self.multi_view_coordinator
            else 0,
        }

    def _finalize_multi_view_polygon(
        self,
        viewer_idx: int,
        erase_mode: bool = False,
        shared_class_id: int | None = None,
    ):
        """Finalize a polygon in multi-view mode.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
            erase_mode: Whether to use erase mode
            shared_class_id: Optional class_id to use (for linked mode consistency)
        """
        from PyQt6.QtCore import QPointF

        if not hasattr(self, "multi_view_polygon_points"):
            return

        if viewer_idx >= len(self.multi_view_polygon_points):
            return

        points = self.multi_view_polygon_points[viewer_idx]
        if not points or len(points) < 3:
            return

        # Get the segment manager for this viewer
        if viewer_idx >= len(self.multi_view_segment_managers):
            return
        segment_manager = self.multi_view_segment_managers[viewer_idx]

        # Get image dimensions from the viewer
        viewer = self.multi_view_viewers[viewer_idx]
        if not viewer or not viewer._pixmap_item:
            return

        pixmap = viewer._pixmap_item.pixmap()
        if pixmap.isNull():
            return

        if erase_mode:
            # Erase overlapping segments using polygon vertices
            image_size = (pixmap.height(), pixmap.width())
            # Convert points to QPointF for erase_segments_with_shape
            polygon_vertices = [QPointF(p[0], p[1]) for p in points]
            removed_indices, _ = segment_manager.erase_segments_with_shape(
                polygon_vertices, image_size
            )
            if removed_indices:
                self._show_notification(
                    f"Erased {len(removed_indices)} segment(s) from viewer {viewer_idx + 1}"
                )
        else:
            # Determine class_id: use shared if provided, else auto-assign
            if shared_class_id is not None:
                class_id = shared_class_id
            else:
                # Auto-assign: use active class or next available
                class_id = segment_manager.active_class_id
                if class_id is None:
                    class_id = segment_manager.next_class_id

            # Create new polygon segment with explicit class_id
            new_segment = {
                "vertices": [[p[0], p[1]] for p in points],
                "type": "Polygon",
                "mask": None,
                "class_id": class_id,
            }
            segment_manager.add_segment(new_segment)

        # Clear the polygon points for this viewer
        self.multi_view_polygon_points[viewer_idx] = []

        # Clear preview items
        if hasattr(self, "multi_view_polygon_preview_items"):
            for item in self.multi_view_polygon_preview_items.get(viewer_idx, []):
                if item.scene():
                    viewer.scene().removeItem(item)
            self.multi_view_polygon_preview_items[viewer_idx] = []

        # Update display
        self._display_multi_view_segments(viewer_idx)
        self._update_multi_view_segment_table(viewer_idx)

    def _fast_update_multi_view_images(self, changed_indices: list):
        """Fast update multi-view images with adjustments.

        Args:
            changed_indices: List of viewer indices that need updating
        """
        for viewer_idx in changed_indices:
            if viewer_idx >= len(self.multi_view_viewers):
                continue

            viewer = self.multi_view_viewers[viewer_idx]
            if not viewer:
                continue

            # Apply image adjustments to the viewer
            viewer.set_image_adjustments(
                self.image_adjustment_manager.brightness,
                self.image_adjustment_manager.contrast,
                self.image_adjustment_manager.gamma,
                self.image_adjustment_manager.saturation,
            )

    def _display_multi_view_segments(self, viewer_idx: int):
        """Display all segments for a specific multi-view viewer.

        Handles both polygon segments (with vertices) and mask-based segments (AI).
        Matches single-view display pattern.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
        """
        from PyQt6.QtCore import QPointF
        from PyQt6.QtGui import QBrush, QColor, QPen, QPolygonF

        from .hoverable_pixelmap_item import HoverablePixmapItem
        from .hoverable_polygon_item import HoverablePolygonItem

        if viewer_idx < 0 or viewer_idx >= len(self.multi_view_viewers):
            return

        viewer = self.multi_view_viewers[viewer_idx]
        segment_manager = self.multi_view_segment_managers[viewer_idx]
        scene = viewer.scene()

        # Clear existing segment items (keep main pixmap)
        items_to_remove = []
        for item in scene.items():
            if hasattr(item, "segment_index") or isinstance(
                item, HoverablePixmapItem | HoverablePolygonItem
            ):
                items_to_remove.append(item)
        for item in items_to_remove:
            scene.removeItem(item)

        # Initialize segment_items storage for this viewer if needed
        if not hasattr(self, "multi_view_segment_items"):
            self.multi_view_segment_items = {0: {}, 1: {}}
        self.multi_view_segment_items[viewer_idx] = {}

        # Display each segment
        for seg_idx, segment in enumerate(segment_manager.segments):
            class_id = segment.get("class_id", 0)
            base_color = self.segment_display_manager.get_color_for_class(class_id)
            self.multi_view_segment_items[viewer_idx][seg_idx] = []

            if segment.get("type") == "Polygon" and segment.get("vertices"):
                # Polygon segments: use colored overlay with alpha
                vertices = segment["vertices"]
                qpoints = [QPointF(p[0], p[1]) for p in vertices]
                poly_item = HoverablePolygonItem(QPolygonF(qpoints))

                default_brush = QBrush(
                    QColor(base_color.red(), base_color.green(), base_color.blue(), 70)
                )
                hover_brush = QBrush(
                    QColor(base_color.red(), base_color.green(), base_color.blue(), 170)
                )
                poly_item.set_brushes(default_brush, hover_brush)
                poly_item.set_segment_info(seg_idx, self)
                poly_item.setPen(QPen(Qt.GlobalColor.transparent))
                poly_item.setZValue(seg_idx + 1)
                scene.addItem(poly_item)
                self.multi_view_segment_items[viewer_idx][seg_idx].append(poly_item)

            elif segment.get("mask") is not None:
                # Mask-based segments (AI): use cached pixmap overlays
                mask = segment["mask"]
                default_pixmap, hover_pixmap = (
                    self.segment_display_manager.get_cached_pixmaps(
                        seg_idx, mask, base_color.getRgb()[:3], viewer_idx
                    )
                )
                pixmap_item = HoverablePixmapItem()
                pixmap_item.set_pixmaps(default_pixmap, hover_pixmap)
                pixmap_item.set_segment_info(seg_idx, self)
                pixmap_item.setZValue(seg_idx + 1)
                scene.addItem(pixmap_item)
                self.multi_view_segment_items[viewer_idx][seg_idx].append(pixmap_item)

    def _trigger_segment_hover(self, segment_id: int, hover_state: bool, source_item):
        """Trigger hover state on mirror segments in multi-view mode.

        When hovering over a segment in one viewer, this highlights the
        corresponding segment in the other viewer (if linked).

        Args:
            segment_id: Index of the segment being hovered
            hover_state: True for hover enter, False for hover leave
            source_item: The item that triggered the hover (to avoid recursion)
        """
        if not hasattr(self, "multi_view_segment_items"):
            return

        # Find which viewer the source item belongs to
        source_viewer_idx = None
        for viewer_idx, items_dict in self.multi_view_segment_items.items():
            if segment_id in items_dict:
                for item in items_dict[segment_id]:
                    if item is source_item:
                        source_viewer_idx = viewer_idx
                        break
            if source_viewer_idx is not None:
                break

        if source_viewer_idx is None:
            return

        # Only mirror hover if viewers are linked
        if self.multi_view_coordinator and not self.multi_view_coordinator.is_linked:
            return

        # Get the other viewer index
        other_viewer_idx = 1 - source_viewer_idx

        # Set hover state on mirror segment items
        if (
            other_viewer_idx in self.multi_view_segment_items
            and segment_id in self.multi_view_segment_items[other_viewer_idx]
        ):
            for item in self.multi_view_segment_items[other_viewer_idx][segment_id]:
                if item is not source_item and hasattr(item, "set_hover_state"):
                    item.set_hover_state(hover_state)

    def _create_multi_view_class(self, class_name: str = ""):
        """Create a new class in multi-view mode (mirrors to both if linked).

        Args:
            class_name: Optional name for the class
        """
        if not self.multi_view_coordinator:
            return

        # Get target viewers (both if linked, just active if unlinked)
        target_viewers = self.multi_view_coordinator.get_target_viewers()

        for viewer_idx in target_viewers:
            segment_manager = self.multi_view_segment_managers[viewer_idx]
            new_class_id = segment_manager.next_class_id

            if class_name:
                segment_manager.set_class_alias(new_class_id, class_name)

            # Set as active class
            segment_manager.set_active_class(new_class_id)

            # Update class table
            self._update_multi_view_class_table(viewer_idx)

        status = "both viewers" if len(target_viewers) == 2 else "active viewer"
        self._show_notification(f"Created class in {status}")

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

    def _restore_single_view_state(self):
        """Restore single view state."""
        # Swap right panel back to single-view mode
        self._swap_right_panel_to_single_view()

        # Mark SAM as dirty to trigger lazy loading when needed
        self.sam_is_dirty = True

        # Restore current image to single viewer if available
        if self.current_image_path:
            pixmap = QPixmap(self.current_image_path)
            if not pixmap.isNull():
                self.viewer.set_photo(pixmap)
                self.viewer.set_image_adjustments(
                    self.image_adjustment_manager.brightness,
                    self.image_adjustment_manager.contrast,
                    self.image_adjustment_manager.gamma,
                    self.image_adjustment_manager.saturation,
                )

                # Load existing segments for the current image
                try:
                    self.segment_manager.clear()
                    self.segment_display_manager.clear_all_caches()
                    self.file_manager.load_class_aliases(self.current_image_path)
                    self.file_manager.load_existing_mask(self.current_image_path)
                    self._update_all_lists()
                except Exception as e:
                    logger.error(f"Error loading segments for single-view: {e}")

        # Re-enable thresholding if it was disabled
        if hasattr(self.control_panel, "border_crop_widget"):
            self.control_panel.border_crop_widget.enable_thresholding()

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

    def _on_image_discovery_error(self, error_message: str) -> None:
        """Handle error during background image discovery."""
        logger.error(f"Image discovery error: {error_message}")
        self.images_discovery_in_progress = False

        # Clean up worker
        if self.image_discovery_worker:
            self.image_discovery_worker.quit()
            self.image_discovery_worker.wait()
            self.image_discovery_worker.deleteLater()
            self.image_discovery_worker = None

        self._show_warning_notification(f"Error discovering images: {error_message}")

    def _get_active_viewer(self):
        """Get the currently active viewer."""
        return self.viewer

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

    def _schedule_sam_preload(self):
        """Schedule preloading of next image's SAM embeddings."""
        if self.sam_preload_scheduler:
            self.sam_preload_scheduler.schedule_preload()

    def _get_next_preload_path(self) -> str | None:
        """Get the next image path for preloading (callback for scheduler)."""
        if not self.current_image_path:
            return None

        next_files = self.right_panel.file_manager.getSurroundingFiles(
            self.current_image_path, 2
        )
        if len(next_files) >= 2 and next_files[1]:
            return str(next_files[1])
        return None

    def _can_preload_sam(self) -> bool:
        """Check if SAM preload should proceed (callback for scheduler)."""
        if not self.model_manager.is_model_available():
            return False
        return not (self.sam_is_dirty or self.sam_is_updating)

    def _execute_sam_preload(self, path: str) -> None:
        """Execute actual SAM preload for a path (callback for scheduler)."""
        # Store current state so we can restore after preloading
        current_hash = self.current_sam_hash
        image_hash = hashlib.md5(path.encode()).hexdigest()

        try:
            # Load and compute embeddings for next image
            self.model_manager.sam_model.set_image_from_path(path)

            # Cache the embeddings (put() handles LRU eviction)
            embeddings = self.model_manager.sam_model.get_embeddings()
            if embeddings is not None:
                self.embedding_cache.put(image_hash, embeddings)

            # Restore current image's embeddings if we had them cached
            cached_embeddings = self.embedding_cache.get(current_hash, update_lru=False)
            if current_hash and cached_embeddings is not None:
                self.model_manager.sam_model.set_embeddings(cached_embeddings)
                self.current_sam_hash = current_hash

        except Exception:
            # Silently fail - preloading is optional optimization
            pass
