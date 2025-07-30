# LazyLabel Architecture

**Modular Design for Maintainability and Extensibility**

LazyLabel uses a modular architecture with PyQt6 signal-based communication between components.

---

## Project Structure

```
src/lazylabel/
├── config/              # Configuration & Settings
│   ├── settings.py         # Persistent application settings
│   ├── hotkeys.py         # Customizable keyboard shortcuts (27+)
│   └── paths.py           # Path management utilities
├── core/                # Business Logic Layer
│   ├── segment_manager.py  # Segment operations & mask generation
│   ├── model_manager.py    # SAM model lifecycle management
│   └── file_manager.py     # File I/O operations
├── models/              # AI Model Integration
│   ├── sam_model.py        # SAM model wrapper implementation
│   ├── sam2_model.py       # SAM 2.1 model wrapper
│   └── *.pth, *.pt        # Model checkpoints and weights
├── ui/                  # User Interface Layer
│   ├── main_window.py      # Primary application window
│   ├── control_panel.py    # Left panel tool controls
│   ├── right_panel.py      # File navigation panel
│   ├── photo_viewer.py     # Image display with adjustments
│   ├── modes/             # Interaction mode implementations
│   ├── widgets/           # Reusable UI components
│   └── workers/           # Background processing threads
├── utils/               # Core Utilities
│   └── utils.py           # Helper functions and utilities
└── main.py             # Application entry point
```

---

## Architecture Principles

### Signal-Based Communication
- Components communicate via PyQt6 signals
- Event-driven interaction patterns
- Decoupled component relationships

### Modular Design
- Single responsibility per module
- Clear interfaces between components
- Independent component testing

### Configuration Management
- JSON-based settings storage
- User customizable preferences
- Persistent across sessions

### Error Handling
- Graceful degradation on failures
- User-friendly error messages
- Safe file operations with validation

---

## Core Components

### SegmentManager
- Segment operations (add/remove/merge)
- Polygon to mask conversion
- Class assignment
- One-hot tensor generation

### ModelManager
- SAM model loading and switching
- Model file discovery
- Memory management
- SAM 1.0 and SAM 2.1 support

### FileManager
- NPZ format export/import
- Mask file loading
- Class alias persistence
- Image file validation

### PhotoViewer
- Image display and manipulation
- Brightness/contrast/gamma adjustment
- Zoom and pan functionality
- Overlay rendering for segments

### HotkeyManager
- 27+ configurable keyboard shortcuts
- Primary and secondary key assignments
- Conflict detection
- Category-based organization

---

## Benefits

| Benefit | Description |
|---------|-------------|
| **Maintainable** | Small, focused modules with clear responsibilities |
| **Testable** | 272 comprehensive tests with extensive coverage |
| **Extensible** | Add features without breaking existing code |
| **Performant** | Efficient resource management and caching |
| **Robust** | Comprehensive error handling and recovery |
| **Self-Documenting** | Clear structure reveals architectural intent |

---

## Performance Optimizations

### **Model Loading**
- **One-time download** of SAM checkpoints (~2.5GB)
- **Smart caching** prevents re-loading
- **Background processing** during initialization

### **Image Processing** 
- **OpenCV integration** for fast operations
- **Numpy arrays** for efficient computation
- **Live preview** without re-processing

### **UI Responsiveness**
- **Signal-based updates** prevent blocking
- **Lazy loading** of components
- **Efficient graphics rendering**

---

## Testing Architecture

```
tests/
├── unit/                   # Component testing
│   ├── ui/                # UI component tests  
│   ├── core/              # Business logic tests
│   └── config/            # Configuration tests
├── integration/           # End-to-end tests
└── conftest.py           # Test fixtures
```

**Testing Features:**
- 272 total tests
- Mock SAM models for performance
- PyQt6 event testing
- GitHub Actions CI/CD

---

## Development Workflow

```bash
# Setup development environment
git clone https://github.com/dnzckn/LazyLabel.git
cd LazyLabel
pip install -e .

# Code quality & testing
ruff check . && ruff format .
python -m pytest --cov=lazylabel

# Run application
lazylabel-gui
```

---

## Future Extensibility

The modular architecture makes it easy to add:

- **New model types** (beyond SAM)
- **Additional export formats** (COCO, YOLO, etc.)
- **Plugin system** for custom tools
- **Cloud integration** for model storage
- **Batch processing** capabilities

---

**Robust architecture supporting computer vision research applications**