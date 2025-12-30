# LazyLabel Architecture

Modular MVVM architecture with PyQt6 signal-based communication between components.

---

## Project Structure

```
src/lazylabel/
├── config/                  # Configuration and Settings
│   ├── settings.py             # Persistent application settings
│   ├── hotkeys.py              # Customizable keyboard shortcuts (27+)
│   └── paths.py                # Path management utilities
│
├── core/                    # Business Logic Layer
│   ├── app_context.py          # Dependency injection containers
│   ├── segment_manager.py      # Segment operations and mask generation
│   ├── model_manager.py        # SAM model lifecycle management
│   ├── file_manager.py         # File I/O operations
│   ├── undo_redo_manager.py    # Undo/redo state management
│   └── protocols.py            # Protocol definitions for type hints
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
│   │   ├── single_view_mouse_handler.py
│   │   └── multi_view_mouse_handler.py
│   │
│   ├── managers/               # Specialized UI Managers (25+)
│   │   ├── mode_manager.py
│   │   ├── drawing_state_manager.py
│   │   ├── multi_view_state_manager.py
│   │   ├── segment_display_manager.py
│   │   ├── multi_view_display_manager.py
│   │   ├── sam_worker_manager.py
│   │   ├── sam_single_view_manager.py
│   │   ├── sam_multi_view_manager.py
│   │   └── ... (see Manager Architecture below)
│   │
│   ├── modes/                  # Mode Handler Implementations
│   │   ├── base_mode.py            # Abstract base handler
│   │   ├── single_view_mode.py     # Single-view operations
│   │   └── multi_view_mode.py      # Multi-view operations
│   │
│   ├── widgets/                # Reusable UI Components
│   │   ├── status_bar.py
│   │   ├── settings_widget.py
│   │   ├── adjustments_widget.py
│   │   └── ... (threshold widgets, model selection)
│   │
│   └── workers/                # Background Processing Threads
│       ├── sam_update_worker.py
│       ├── single_view_sam_init_worker.py
│       ├── multi_view_sam_init_worker.py
│       ├── image_preload_worker.py
│       └── save_worker.py
│
├── viewmodels/              # MVVM ViewModels
│   ├── single_view_viewmodel.py    # Single-view state and signals
│   └── multi_view_viewmodel.py     # Multi-view state and signals
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
- YOLO format export
- JSON class alias persistence

### UndoRedoManager
- Action recording and playback
- Point additions, vertex moves, segment operations
- Limited history depth for memory management

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

### MultiViewViewModel
Owns multi-view state for all viewers.

**State:**
- Images per viewer
- Linked status per viewer
- SAM models per viewer (with dirty, updating, ready flags)
- Number of active viewers

**Signals:**
- `image_changed(viewer_index, path)`
- `linked_changed(viewer_index, is_linked)`
- `model_ready(viewer_index)`, `all_models_ready()`
- `segment_added(viewer_index, segment_index)`

---

## Manager Architecture

### State Managers

**DrawingStateManager**
- SAM points (positive/negative)
- Polygon drawing state (points, preview items)
- Bounding box state (drag start, rubber band)
- AI mode state (click positions, preview masks)
- Edit mode state (vertex dragging)

**MultiViewStateManager**
- Per-viewer segment storage
- Per-viewer points and drawing state
- Resizable for dynamic viewer counts

**ModeManager**
- Mode switching (AI, polygon, bbox, selection, pan, edit)
- Cursor management per mode
- Mode transition validation

### Display Managers

**SegmentDisplayManager**
- LRU cache for segment pixmaps (500 items)
- Color caching for class IDs
- Highlight pixmap caching (200 items)

**MultiViewDisplayManager**
- Displays segments across multiple viewers
- Manages selected segment highlights
- Displays edit handles for polygon editing

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

**MultiViewNavigationManager**
- Batch navigation across viewers
- Previous/next image in directory

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
Routes mouse events in single-view mode.

**Responsibilities:**
- Point-based SAM interactions (left click positive, right click negative)
- Polygon drawing (click to add points)
- Bounding box creation (drag to create)
- Edit mode vertex dragging
- Crop mode operations

### MultiViewMouseHandler
Routes mouse events in multi-view mode with linking support.

**Responsibilities:**
- Per-viewer event handling
- Coordinate mirroring to linked viewers
- AI operations with synchronization
- Polygon and bbox creation with cancellation

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

### MultiViewModeHandler
Implements multi-view mode with viewer coordination.

**Operations:**
- Lazy SAM model initialization
- Click-vs-drag detection for rect input
- Mirroring to linked viewers
- Segment pairing logic across views

---

## Worker Architecture

Background threads for expensive operations.

**SAM Workers:**
- `SAMUpdateWorker` - single-view model updates
- `SingleViewSAMInitWorker` - single-view initialization
- `MultiViewSAMInitWorker` - multi-view parallel initialization
- `MultiViewSAMUpdateWorker` - multi-view model updates

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
