# <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/logo2.png" alt="LazyLabel Logo" style="height:60px; vertical-align:middle;" /> <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/logo_black.png" alt="LazyLabel Cursive" style="height:60px; vertical-align:middle;" />
LazyLabel is an intuitive, AI-assisted image segmentation tool. It uses Meta's Segment Anything Model (SAM) for quick, precise mask generation, alongside advanced polygon editing for fine-tuned control. Outputs are saved in a clean, one-hot encoded format for easy machine learning integration.

Inspired by [LabelMe](https://github.com/wkentaro/labelme?tab=readme-ov-file#installation) and [Segment-Anything-UI](https://github.com/branislavhesko/segment-anything-ui/tree/main).

![LazyLabel Screenshot](https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/gui.PNG)

---

## ✨ Core Features

* **AI-Powered Segmentation**: Generate masks with simple left-click (positive) and right-click (negative) interactions.
* **Vector Polygon Tool**: Full control to draw, edit, and reshape polygons. Drag vertices or move entire shapes.
* **Advanced Class Management**: Assign multiple segments to a single class ID for organized labeling.
* **Intuitive Editing & Refinement**: Select, merge, and re-order segments.
* **Interactive UI**: Color-coded segments, sortable lists, and hover highlighting.
* **Smart I/O**: Loads existing `.npz` masks; saves work as clean, one-hot encoded outputs.

---

## 🚀 Getting Started

### Prerequisites
Ensure you have **Python 3.10** or newer.

### Installation

#### For Users (via PyPI)
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
    git clone [https://github.com/dnzckn/LazyLabel.git](https://github.com/dnzckn/LazyLabel.git)
    cd LazyLabel
    ```
2.  Install in editable mode, which links the installed package to your source directory:
    ```bash
    pip install -e .
    ```
3.  Run the application:
    ```bash
    lazylabel-gui
    ```

**Note**: On the first run, the application will automatically download the SAM model checkpoint (~2.5 GB) from Meta's repository to a local cache. This is a one-time download.

---

## ⌨️ Controls & Keybinds

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

## ☕ Support LazyLabel
[If you found LazyLabel helpful, consider supporting the project!](https://buymeacoffee.com/dnzckn)