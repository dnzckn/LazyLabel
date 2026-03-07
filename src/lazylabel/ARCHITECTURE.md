# LazyLabel Architecture

Modular MVVM architecture with PyQt6 signal-based communication between components.

---

## Project Structure

```
src/lazylabel/
├── config/                  # Configuration and Settings
│   ├── settings.py             # Persistent application settings
│   ├── hotkeys.py              # Customizable keyboard shortcuts (30+)
│   └── paths.py                # Path management utilities
│
├── core/                    # Business Logic Layer
│   ├── app_context.py          # Dependency injection containers
│   ├── segment_manager.py      # Segment operations and mask generation
│   ├── model_manager.py        # SAM model lifecycle management
│   ├── file_manager.py         # File I/O operations
│   ├── undo_redo_manager.py    # Undo/redo state management
│   ├── protocols.py            # Protocol definitions for type hints
│   └── exporters/              # Pluggable export format framework
│       ├── __init__.py            # ExportFormat enum, Exporter protocol, registry
│       ├── npz.py                 # NPZ exporter
│       ├── yolo_detection.py      # YOLO detection exporter
│       ├── yolo_segmentation.py   # YOLO segmentation exporter
│       ├── coco.py                # COCO JSON exporter
│       ├── pascal_voc.py          # Pascal VOC exporter
│       └── createml.py            # CreateML exporter
│
├── models/                  # AI Model Integration
│   ├── sam_model.py            # SAM 1.0 model wrapper
│   └── sam2_model.py           # SAM 2.1 model wrapper
│
├── ui/                      # User Interface Layer
│   ├── main_window.py          # Application orchestrator
│   ├── control_panel.py        # Left panel tool controls
│   ├── right_panel.py          # File navigation and segment table
│   ├── photo_viewer.py         # Image display with adjustments
│   │
│   ├── handlers/               # Mouse Event Handlers
│   │   └── single_view_mouse_handler.py
│   │
│   ├── managers/               # Specialized UI Managers (25+)
│   │   ├── mode_manager.py
│   │   ├── drawing_state_manager.py
│   │   ├── multi_view_coordinator.py
│   │   ├── segment_display_manager.py
│   │   ├── sam_worker_manager.py
│   │   ├── sam_single_view_manager.py
│   │   ├── sam_multi_view_manager.py
│   │   └── ... (see Manager Architecture below)
│   │
│   ├── modes/                  # Mode Handler Implementations
│   │   ├── base_mode.py            # Abstract base handler
│   │   ├── single_view_mode.py     # Single-view operations
│   │   └── sequence_view_mode.py   # Sequence mode state management
│   │
│   ├── widgets/                # Reusable UI Components
│   │   ├── status_bar.py
│   │   ├── settings_widget.py
│   │   ├── adjustments_widget.py
│   │   ├── export_format_widget.py # Multi-select export format dropdown
│   │   ├── sequence_widget.py      # Sequence mode controls
│   │   ├── timeline_widget.py      # Frame navigation timeline
│   │   └── ... (threshold widgets, model selection)
│   │
│   └── workers/                # Background Processing Threads
│       ├── sam_update_worker.py
│       ├── single_view_sam_init_worker.py
│       ├── multi_view_sam_init_worker.py
│       ├── image_preload_worker.py
│       ├── image_discovery_worker.py
│       ├── propagation_worker.py   # SAM 2 propagation, sequence init, reference annotation
│       └── save_worker.py
│
├── viewmodels/              # MVVM ViewModels
│   └── single_view_viewmodel.py    # Single-view state and signals
│
├── utils/                   # Utilities
│   ├── utils.py                # Helper functions
│   ├── logger.py               # Logging configuration
│   └── fast_file_manager.py    # Optimized file listing
│
└── main.py                  # Application entry point
```

---

## Architecture Principles

### Signal-Based Communication
- Components communicate via PyQt6 signals
- Event-driven interaction patterns
- Decoupled component relationships

### MVVM Pattern
- ViewModels own application state
- UI components subscribe to ViewModel signals
- Reactive updates flow from state changes

### Manager Pattern
- Single responsibility per manager
- Clear interfaces between components
- Independent testing of each manager

### Dependency Injection
- AppContext, UIContext, FullContext containers
- Dependencies passed at construction
- Reduces MainWindow coupling

---

## Core Components

### SegmentManager
- Segment operations (add, remove, merge)
- Polygon to mask conversion
- Class assignment and one-hot tensor generation

### ModelManager
- SAM model loading and switching
- Model file discovery
- SAM 1.0 and SAM 2.1 support

### FileManager
- NPZ format export/import
- Bounding box TXT export
- JSON class alias persistence

### UndoRedoManager
- Action recording and playback
- Point additions, vertex moves, segment operations
- Limited history depth for memory management

### HotkeyManager
Manages customizable keyboard shortcuts with JSON persistence.

**Features:**
- 30+ configurable hotkey actions across categories (Navigation, Modes, Actions, Segments, Classes, View, Movement, Mouse)
- Primary and optional secondary key bindings per action
- Mouse-related actions are read-only (cannot be reassigned)
- Persistent storage in `hotkeys.json` within the config directory
- Conflict detection via `is_key_in_use()`
- Reset-to-defaults support
- QKeySequence conversion utilities

---

## Export Framework

Pluggable export system in `core/exporters/` supporting multiple annotation output formats.

### ExportFormat Enum
Defines the six supported export formats:
- `NPZ` - NumPy compressed archive with masks and metadata
- `YOLO_DETECTION` - YOLO bounding box detection format
- `YOLO_SEGMENTATION` - YOLO polygon segmentation format
- `COCO_JSON` - COCO-style JSON annotations
- `PASCAL_VOC` - Pascal VOC XML format
- `CREATEML` - Apple CreateML JSON format

### ExportContext
Dataclass bundling all data an exporter needs to write output:
- `image_path`, `image_size` (height, width)
- `class_order`, `class_labels`, `class_aliases`
- `mask_tensor` - (H, W, C) uint8 array
- `crop_coords` - optional crop region
- `segments` - list of segment dicts

### Exporter Protocol
Every exporter implements three methods:
- `export(ctx) -> str | None` - Write the output file, return path or None if skipped
- `get_output_path(image_path) -> str` - Return the output path for a given image
- `delete_output(image_path) -> bool` - Delete the output if it exists

### Registry Pattern
Exporters self-register at import time via `_register(fmt, exporter, extensions)`. The `EXPORTERS` dict maps `ExportFormat` to its `Exporter` instance. Submodules (npz, yolo_detection, yolo_segmentation, coco, pascal_voc, createml) are imported at the bottom of `__init__.py` to trigger registration.

### export_all / delete_all_outputs
- `export_all(formats, ctx)` - Runs all enabled exporters and returns a list of paths written
- `delete_all_outputs(image_path)` - Deletes all known format outputs for a given image

### ExportFormatWidget
A `QToolButton` dropdown in `ui/widgets/export_format_widget.py` that presents a checklist of all formats. Users can toggle formats on/off, with at least one required. Emits `formats_changed` when the selection changes. Default selection: NPZ and YOLO Detection.

---

## ViewModel Layer

### SingleViewViewModel
Owns single-view state and emits signals for reactive updates.

**State:**
- Current image path
- Current and previous mode
- Loading state

**Signals:**
- `image_changed(path)`
- `mode_changed(old_mode, new_mode)`
- `loading_started()`, `loading_finished()`

Multi-view state is not managed by a separate ViewModel. Instead, `MultiViewCoordinator` (in `ui/managers/`) handles per-viewer state such as link status, active viewer tracking, point storage, and preview masks directly.

---

## Manager Architecture

### State Managers

**DrawingStateManager**
- SAM points (positive/negative)
- Polygon drawing state (points, preview items)
- Bounding box state (drag start, rubber band)
- AI mode state (click positions, preview masks)
- Edit mode state (vertex dragging)

**MultiViewCoordinator**
- Link state between viewers (linked/unlinked)
- Active viewer tracking
- Per-viewer point storage (positive/negative SAM points)
- Per-viewer preview masks and graphics items
- Coordinated operations (clicks, saves) when linked
- Signals: `link_state_changed`, `active_viewer_changed`

**ModeManager**
- Mode switching (AI, polygon, bbox, selection, pan, edit)
- Cursor management per mode
- Mode transition validation

### Display Managers

**SegmentDisplayManager**
- LRU cache for segment pixmaps (500 items)
- Color caching for class IDs
- Highlight pixmap caching (200 items)
- Handles segment display for both single-view and multi-view modes

**CoordinateTransformer**
- Display to SAM coordinate transformation
- Handles "operate on view" mode
- Mask scaling from SAM output

### SAM/AI Managers

**SAMWorkerManager**
- Facade coordinating SAM operations
- Delegates to single-view and multi-view managers
- Unified state access

**SAMSingleViewManager**
- Single-view model initialization
- Embedding caching
- Scale factor management

**SAMMultiViewManager**
- Parallel model initialization
- Per-viewer update management
- Model cleanup

**AISegmentManager**
- AI segment acceptance
- Point tracking
- Segmentation preview updates

### Navigation Managers

**FileNavigationManager**
- File browser operations
- Directory scanning

**ViewportManager**
- Zoom and pan operations
- Synchronized panning in multi-view

### UI Operation Managers

**KeyboardEventManager**
- Keyboard event dispatch
- Mode-specific key handling

**SaveExportManager**
- Save/export operations
- Multi-view segment coordination

**SegmentTableManager**
- Segment table UI management
- Class assignment and filtering

**Propagation Manager (Sequence Mode):**

**PropagationManager**
- SAM 2 video predictor integration
- Multi-reference frame propagation
- Bidirectional mask propagation
- Confidence-based frame flagging
- Progress tracking and cancellation

**Additional Managers:**
- ImageAdjustmentManager - brightness, contrast, gamma
- ImagePreloadManager - background image preloading
- EmbeddingCacheManager - SAM embedding LRU cache
- NotificationManager - user notifications
- PanelPopoutManager - panel pop-out functionality
- CropManager - image cropping operations
- PolygonDrawingManager - polygon creation and editing
- EditModeManager - vertex editing operations
- UILayoutManager - multi-view layout creation
- SAMPreloadScheduler - embedding preloading

---

## Handler Architecture

### SingleViewMouseHandler
Routes mouse events across all view modes, including single-view, multi-view, and sequence mode. In multi-view mode, it delegates release events to the appropriate viewer via MainWindow.

**Responsibilities:**
- Point-based SAM interactions (left click positive, right click negative)
- Polygon drawing (click to add points)
- Bounding box creation (drag to create)
- AI mode with click-vs-drag detection for point or box input
- Edit mode vertex and polygon dragging
- Crop mode operations
- Multi-view release delegation to per-viewer handlers

---

## Mode Architecture

### BaseModeHandler
Abstract interface defining mode responsibilities.

**Interface:**
- `handle_ai_click(pos, event)` - Process SAM clicks
- `handle_polygon_click(pos)` - Process polygon points
- `handle_bbox_start/drag/complete(pos)` - Bounding box operations
- `display_all_segments()` - Render all segments
- `clear_all_points()` - Clear temporary state

### SingleViewModeHandler
Implements single-view mode operations.

**Operations:**
- AI click with coordinate transformation
- Polygon closure detection
- Segment rendering with hover effects

Multi-view coordination is handled by `MultiViewCoordinator` (in `ui/managers/`) rather than a separate mode handler. `SingleViewMouseHandler` delegates multi-view release events to per-viewer handlers on MainWindow.

---

## Sequence Mode Architecture

Complete infrastructure for propagating masks across image sequences.

### SequenceViewMode
State manager for sequence mode operations.

**State:**
- Image paths for the sequence
- Current frame index
- Reference frame annotations (multi-reference support)
- Frame statuses (pending, reference, propagated, flagged, saved)
- Propagated masks and confidence scores
- Confidence threshold for auto-flagging

**Signals:**
- `reference_changed(frame_idx)` - Reference frame updated
- `frame_status_changed(frame_idx, status)` - Frame status updated
- `propagation_started()`, `propagation_finished()` - Propagation lifecycle
- `propagation_progress(current, total)` - Progress updates

### PropagationManager
Coordinates SAM 2 video predictor for mask propagation.

**Responsibilities:**
- Initialize SAM 2 video predictor with sequence images
- Collect reference annotations from multiple frames
- Execute bidirectional propagation from all reference points
- Handle confidence scoring and frame flagging
- Manage background worker for non-blocking operations

**Propagation Flow:**
```
Reference Frames (user annotated)
    |
    v
SequenceInitWorker (background thread)
    +--> PropagationManager.init_sequence(image_paths)
    +--> progress callbacks -> UI updates
    |
    v
ReferenceAnnotationWorker (background thread)
    +--> add_points_to_frame() for each reference
    +--> progress callbacks -> UI updates
    |
    v
PropagationWorker (background thread)
    +--> propagate_in_video() bidirectional
    |
    v
frame_done signal -> store masks, update status
    |
    v
SequenceViewMode updates -> Timeline refreshes
```

### TimelineWidget
Visual frame navigation with status indicators.

**Features:**
- Clickable frame cells for navigation
- Color-coded status (green=reference, blue=propagated, red=flagged, gray=pending)
- Current frame highlight
- Scroll support for long sequences

### SequenceWidget
Control panel for sequence operations.

**Controls:**
- Reference frame management (add, clear)
- Propagation range selection (start/end frames)
- Confidence threshold adjustment (0.0-1.0)
- Skip low confidence option
- Flagged frame navigation (next/prev)

### PropagationWorker
Background thread for non-blocking propagation.

**Signals:**
- `frame_done(frame_idx, masks, confidence)` - Single frame completed
- `progress(current, total)` - Progress update
- `finished()` - All frames processed
- `error(message)` - Error occurred

---

## Worker Architecture

Background threads for expensive operations.

**SAM Workers:**
- `SAMUpdateWorker` - single-view model updates
- `SingleViewSAMInitWorker` - single-view initialization
- `MultiViewSAMInitWorker` - multi-view parallel initialization

**Sequence/Propagation Workers** (all in `propagation_worker.py`):
- `SequenceInitWorker` - background sequence initialization with progress callbacks
- `ReferenceAnnotationWorker` - background reference annotation processing for SAM 2
- `PropagationWorker` - SAM 2 video propagation across sequences
- `PropagationSaveWorker` - async saving of propagated results

**Image Workers:**
- `ImagePreloadWorker` - background image caching
- `ImageDiscoveryWorker` - file enumeration

**File Workers:**
- `SaveWorker` - async file saving

---

## Caching Strategy

### Segment Pixmap Cache
- LRU cache with 500 item limit
- Caches rendered segment overlays
- Invalidation on segment modification

### Embedding Cache
- LRU cache for SAM embeddings
- Avoids redundant image processing
- 10 item default limit

### Highlight Cache
- LRU cache with 200 item limit
- Caches selected segment highlights

### PhotoViewer Caches
- Gamma LUT cache for performance
- Adjusted pixmap caching

---

## Performance Optimizations

### Model Loading
- One-time download of SAM checkpoints (2.5GB)
- Smart caching prevents re-loading
- Background processing during initialization

### Image Processing
- OpenCV integration for fast operations
- NumPy arrays for efficient computation
- Live preview without re-processing

### UI Responsiveness
- Signal-based updates prevent blocking
- Lazy loading of components
- Efficient graphics rendering

---

## Testing Architecture

```
tests/
├── unit/                   # Component testing
│   ├── ui/                     # UI component tests
│   ├── core/                   # Business logic tests
│   └── config/                 # Configuration tests
├── integration/            # End-to-end tests
└── conftest.py             # Test fixtures
```

**Testing Features:**
- Mock SAM models for fast testing
- PyQt6 event testing with pytest-qt
- GitHub Actions CI/CD

---

## Development Workflow

```bash
# Setup development environment
git clone https://github.com/dnzckn/LazyLabel.git
cd LazyLabel
pip install -e .

# Code quality and testing
ruff check --fix src/
pytest --tb=short

# Run application
lazylabel-gui
```

---

## Component Interaction Flow

**Example: User clicks to add SAM point**

```
PhotoViewer (mouse event)
    |
    v
SingleViewMouseHandler.handle_mouse_press()
    |
    v
SingleViewModeHandler.handle_ai_click()
    |
    +--> DrawingStateManager (store point)
    |
    +--> CoordinateTransformer (display to SAM coords)
    |
    v
SAMWorkerManager (trigger segmentation)
    |
    v
SAMUpdateWorker (background thread)
    |
    v
SegmentDisplayManager (cache and render result)
    |
    v
PhotoViewer scene update
```

---

**Robust architecture supporting computer vision research applications**
