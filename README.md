# <img src="demo_pictures/logo2.png" alt="LazyLabel Logo" style="height:60px; vertical-align:middle;" /> <img src="demo_pictures/logo_black.png" alt="LazyLabel Cursive" style="height:60px; vertical-align:middle;" />
LazyLabel is a user-friendly, AI-assisted image segmentation tool designed to streamline the process of creating high-quality masks for machine learning datasets. It leverages the power of the Segment Anything Model (SAM) to provide quick and accurate segmentation, while also offering advanced polygon editing capabilities for precise control. Outputs are saved in a clean, one-hot encoded format, making it easy to integrate with your machine learning workflows.

Heavy inspiration from [LabelMe](https://github.com/wkentaro/labelme?tab=readme-ov-file#installation) and [Segment-Anything-UI](https://github.com/branislavhesko/segment-anything-ui/tree/main)

![LazyLabel Screenshot](demo_pictures/gui.PNG)

## ✨ Core Features

* **AI-Powered Segmentation**: Simply left-click (positive) and right-click (negative) on an object, and let SAM generate a precise mask for you.
* **Vector Polygon Tool**: Draw, edit, and reshape polygon segments with full control. Drag vertices or move the entire shape in Edit Mode.
* **Advanced Class Management**: Don't just create masks, create *classes*. Assign multiple, distinct segments to a single class ID for organized labeling.
* **Intuitive Editing & Refinement**:
    * **Selection Mode**: Click on any segment to select it for an action.
    * **Class Merging**: Select multiple segments and merge them into a single class with one keystroke.
    * **Drag-and-Drop Reordering**: Easily re-order your class channels before saving just by dragging them in the class list.
* **Interactive UI**: All segments are color-coded by class. The segment list provides at-a-glance information and is sortable. Polygon segments even highlight on hover!
* **Smart I/O**: Automatically detects existing `.npz` masks and loads them. Saves your work in a clean, one-hot encoded format.

## 🚀 Getting Started

1.  **Dependencies**: Install all required Python libraries using the provided `requirements.txt` file in the root directory:
    ```bash
    pip install -r requirements.txt
    ```
2.  **SAM Checkpoint**: Download a SAM model checkpoint file (e.g., `sam_vit_h_4b8939.pth`) and place it in the same directory as the script. Here's a link to the checkpoint:
    - [From META Segment Anything Repo](https://github.com/facebookresearch/segment-anything) [SAM Checkpoint](https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth)

    Alternatively, you can use the `sam_checkpoint` parameter in the `main.py` script to specify a different path.

    If you want to use a different SAM model, just replace the checkpoint file with your desired model.
3.  **Run**: Launch the application with:
    ```bash
    python main.py
    ```

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
| `Ctrl + Z` | Undo the last point placed (in Point or Polygon mode). |
| `Spacebar` | Finalize and save the current in-progress AI segment. |
| `Enter` | **Save final mask for the current image to a `.npz` file.** |
| `M` | **Merge** selected segments into a single class. |
| `V` / `Delete` | **Delete** the currently selected segments. |
| `C` | Clear all temporary points or polygon vertices from the screen. |

## 📦 Output Format

LazyLabel saves your work as a compressed NumPy array (`.npz`) with the same name as your image file.

The file contains a single data key, `'mask'`, which holds a **one-hot encoded tensor** with the shape `(H, W, C)`:
* `H`: The height of the image.
* `W`: The width of the image.
* `C`: The total number of unique classes you created.

Each channel in the tensor is a binary mask where a `1` indicates a pixel belonging to that class. All segments you assigned to the same class ID are automatically combined into that single channel, giving you a clean, ML-ready output.

## ☕[If you found LazyLabel helpful, consider supporting the project!](https://buymeacoffee.com/dnzckn)☕
