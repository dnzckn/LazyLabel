# <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/logo2.png" alt="LazyLabel Logo" style="height:60px; vertical-align:middle;" /> <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/logo_black.png" alt="LazyLabel Cursive" style="height:60px; vertical-align:middle;" />

LazyLabel is an intuitive, AI-assisted image segmentation tool built with a modern, modular architecture. It uses Meta's Segment Anything Model (SAM) for quick, precise mask generation, alongside advanced polygon editing for fine-tuned control. Features comprehensive model management, customizable hotkeys, and outputs in clean, one-hot encoded `.npz` format for easy machine learning integration.

Inspired by [LabelMe](https://github.com/wkentaro/labelme?tab=readme-ov-file#installation) and [Segment-Anything-UI](https://github.com/branislavhesko/segment-anything-ui/tree/main).

![LazyLabel Screenshot](https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/gui.PNG)

---

## ✨ Core Features

### **AI-Powered Segmentation**
* Generate masks with simple left-click (positive) and right-click (negative) interactions
* Multiple SAM model support with easy switching
* Custom model loading from any directory

### **Advanced Editing Tools**
* **Vector Polygon Tool**: Full control to draw, edit, and reshape polygons
* **Vertex Editing**: Drag vertices or move entire shapes with precision
* **Selection & Merging**: Select, merge, and re-order segments intuitively

### **Professional Workflow**
* **Customizable Hotkeys**: Personalize keyboard shortcuts for all functions
* **Advanced Class Management**: Assign multiple segments to single class IDs
* **Smart I/O**: Load existing `.npz` masks; save as clean, one-hot encoded outputs
* **Interactive UI**: Color-coded segments, sortable lists, and hover highlighting

### **Modern Architecture**
* **Modular Design**: Clean, maintainable codebase with separated concerns
* **Model Management**: Dedicated model storage and switching system
* **Persistent Settings**: User preferences saved between sessions

---

## 🚀 Getting Started

### Prerequisites
**Python 3.10+**

### Installation

#### For Users [via PyPI](https://pypi.org/project/lazylabel-gui/)
1.  Install LazyLabel directly:
    ```bash
    pip install lazylabel-gui
    ```
2.  Run the application:
    ```bash
    lazylabel-gui
    ```

#### For Developers (from Source)
1.  Clone the repository:
    ```bash
    git clone https://github.com/dnzckn/LazyLabel.git
    cd LazyLabel
    ```
2.  Install in editable mode:
    ```bash
    pip install -e .
    ```
3.  Run the application:
    ```bash
    lazylabel-gui
    ```

### Model Management
* **Default Storage**: Models are stored in `src/lazylabel/models/` directory
* **Custom Models**: Click "Browse Models" to select custom model folders  
* **Model Switching**: Use the dropdown to switch between available models
* **Auto-Detection**: Application automatically detects all `.pth` files in selected directories

**Note**: On the first run, the application will automatically download the SAM model checkpoint (~2.5 GB) from Meta's repository to the models directory. This is a one-time download.

---

## ⌨️ Controls & Keybinds

> **💡 Tip**: All hotkeys are fully customizable! Click the "Hotkeys" button in the control panel to personalize your shortcuts.

### Modes
| Key | Action |
|---|---|
| `1` | Enter **Point Mode** (for AI segmentation). |
| `2` | Enter **Polygon Drawing Mode**. |
| `E` | Toggle **Selection Mode** to select existing segments. |
| `R` | Enter **Edit Mode** for selected polygons (drag shape or vertices). |
| `Q` | Toggle **Pan Mode** (click and drag the image). |

### Actions
| Key(s) | Action |
|---|---|
| `L-Click` | Add positive point (Point Mode) or polygon vertex. |
| `R-Click` | Add negative point (Point Mode). |
| `Ctrl + Z` | Undo last point. |
| `Spacebar` | Finalize and save current AI segment. |
| `Enter` | **Save final mask for the current image to a `.npz` file.** |
| `M` | **Merge** selected segments into a single class. |
| `V` / `Delete` / `Backspace`| **Delete** selected segments. |
| `C` | Clear temporary points/vertices. |
| `W/A/S/D` | Pan image. |
| `Scroll Wheel` | Zoom-in or -out. |

---

## 📦 Output Format

LazyLabel saves your work as a compressed NumPy array (`.npz`) with the same name as your image file.

The file contains a single data key, `'mask'`, holding a **one-hot encoded tensor** with the shape `(H, W, C)`:
* `H`: Image height.
* `W`: Image width.
* `C`: Total unique classes.

Each channel is a binary mask for a class, combining all assigned segments into a clean, ML-ready output.

---

## 🏗️ Architecture

LazyLabel features a modern, modular architecture designed for maintainability and extensibility:

* **Modular Design**: Clean separation between UI, business logic, and configuration
* **Signal-Based Communication**: Loose coupling between components using PyQt signals
* **Persistent Configuration**: User settings and preferences saved between sessions
* **Extensible Model System**: Easy integration of new SAM models and types

For detailed technical documentation, see [ARCHITECTURE.md](src/lazylabel/ARCHITECTURE.md).

---

## ⌨️ Hotkey Customization

LazyLabel includes a comprehensive hotkey management system:

* **Full Customization**: Personalize keyboard shortcuts for all 27+ functions
* **Category Organization**: Hotkeys organized by function (Modes, Actions, Navigation, etc.)
* **Primary & Secondary Keys**: Set multiple shortcuts for the same action
* **Persistent Settings**: Custom hotkeys saved between sessions
* **Conflict Prevention**: System prevents duplicate key assignments

For complete hotkey documentation, see [HOTKEY_FEATURE.md](src/lazylabel/HOTKEY_FEATURE.md).

---

## ☕ Support LazyLabel
[If you found LazyLabel helpful, consider supporting the project!](https://buymeacoffee.com/dnzckn)