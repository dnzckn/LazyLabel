# 🏗️ LazyLabel Architecture

**Modern, modular design for maintainability and extensibility**

LazyLabel features a clean separation of concerns with signal-based communication, making it easy to maintain, test, and extend.

---

## 📁 Project Structure

```
src/lazylabel/
├── 🔧 config/              # Configuration & Settings
│   ├── settings.py         # Persistent app settings
│   ├── hotkeys.py         # 27+ customizable hotkeys
│   └── paths.py           # Path management
├── ⚡ core/                # Business Logic
│   ├── segment_manager.py  # Segment operations & masks
│   ├── model_manager.py    # SAM model handling
│   └── file_manager.py     # File I/O operations
├── 🧠 models/              # AI Model Layer
│   ├── sam_model.py        # SAM model wrapper
│   └── *.pth              # Model checkpoints
├── 🎨 ui/                  # User Interface
│   ├── main_window.py      # Main application
│   ├── control_panel.py    # Left panel controls
│   ├── right_panel.py      # File explorer
│   ├── photo_viewer.py     # Image viewer with adjustments
│   └── widgets/           # Reusable components
├── 🛠️ utils/               # Utilities
│   └── utils.py           # Helper functions
└── 📋 main.py             # Entry point
```

---

## 🎯 Architecture Principles

### **🔄 Signal-Based Communication**
- **Loose coupling** between components
- **Event-driven** architecture with PyQt signals
- **Easy to extend** without breaking existing code

### **🧩 Modular Design**
- **Single responsibility** per component
- **Clear interfaces** between modules
- **Independent testing** of components

### **⚙️ Configuration Management**
- **Persistent settings** with JSON serialization
- **User customization** support
- **Cross-session** preference storage

### **🛡️ Robust Error Handling**
- **Graceful degradation** on failures
- **User-friendly** error messages
- **Safe file operations** with validation

---

## 🔧 Core Components

### **SegmentManager** - Shape & Mask Logic
```python
# Handles all segmentation operations
- Add/remove/merge segments
- Polygon → mask conversion
- Class assignment
- One-hot tensor creation
```

### **ModelManager** - AI Model Handling
```python  
# Manages SAM models efficiently
- Model loading & switching
- Auto-discovery of .pth files
- Memory optimization
- Multi-model support
```

### **FileManager** - I/O Operations  
```python
# Clean file handling
- .npz export (one-hot encoded)
- Existing mask loading
- Class alias persistence
- Image validation
```

### **PhotoViewer** - Image Processing
```python
# Enhanced image viewer
- Brightness/contrast/gamma adjustment
- Live preview of changes
- SAM integration with adjusted images
- Zoom & pan controls
```

### **HotkeyManager** - Customization System
```python
# Professional hotkey system
- 27+ configurable actions
- Primary & secondary keys
- Conflict prevention
- Category organization
```

---

## ✅ Benefits

| Benefit | Description |
|---------|-------------|
| **🔧 Maintainable** | Small, focused files easy to understand |
| **🧪 Testable** | 88+ unit tests with 60% coverage |
| **🚀 Extensible** | Add features without breaking existing code |
| **⚡ Performant** | Efficient resource management & caching |
| **🛡️ Robust** | Comprehensive error handling |
| **📚 Self-Documenting** | Clear structure reveals intent |

---

## 🚀 Performance Optimizations

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

## 🧪 Testing Architecture

```bash
# 95% speed improvement in test suite
tests/
├── unit/                   # Component testing
│   ├── ui/                # UI component tests  
│   ├── core/              # Business logic tests
│   └── config/            # Configuration tests
├── integration/           # End-to-end tests
└── conftest.py           # Test fixtures
```

**Key Testing Features:**
- **Mock SAM models** for fast testing (8s vs 82s)
- **PyQt6 compatibility** with proper event mocking
- **Comprehensive coverage** of all major components
- **Automated CI/CD** with GitHub Actions

---

## 🛠️ Development Workflow

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

## 🔮 Future Extensibility

The modular architecture makes it easy to add:

- **New model types** (beyond SAM)
- **Additional export formats** (COCO, YOLO, etc.)
- **Plugin system** for custom tools
- **Cloud integration** for model storage
- **Batch processing** capabilities

---

**Built for the computer vision community** 🚀