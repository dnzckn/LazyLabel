# LazyLabel

<div align="center">
  <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/logo2.png" alt="LazyLabel Logo" style="height:60px; vertical-align:middle;" />
  <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/logo_black.png" alt="LazyLabel Cursive" style="height:60px; vertical-align:middle;" />
</div>

**AI-Assisted Image Segmentation for Machine Learning**

LazyLabel combines Meta's Segment Anything Model (SAM) with manual editing tools to create pixel-perfect segmentation masks for computer vision datasets.

<div align="center">
  <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/gui.PNG" alt="LazyLabel Screenshot" width="800"/>
</div>

---

## Quick Start

```bash
pip install lazylabel-gui
lazylabel-gui
```

**From source:**
```bash
git clone https://github.com/dnzckn/LazyLabel.git
cd LazyLabel
pip install -e .
lazylabel-gui
```

**Requirements:** Python 3.10+, 8GB RAM, ~2.5GB disk space (for model weights)

---

## Key Features

### AI-Powered Segmentation
- Click objects to generate masks using SAM
- Refine with positive/negative points
- Supports SAM 1.0 and 2.1 models
- GPU acceleration with CPU fallback

### Manual Tools
- Polygon drawing with vertex editing
- Bounding box annotations
- Segment merging and editing
- Multi-segment selection

### Export Formats

**NPZ (Semantic Segmentation):**
```python
import numpy as np

data = np.load('image.npz')
mask = data['mask']  # Shape: (height, width, num_classes)
class_names = data['class_names']

# One-hot encoded masks
background = mask[:, :, 0]
object_class_1 = mask[:, :, 1]
object_class_2 = mask[:, :, 2]
```

**YOLO Format:**
```
0 0.234 0.456 0.289 0.478 0.301 0.523 ...  # Class 0 polygon
1 0.567 0.123 0.598 0.145 0.612 0.189 ...  # Class 1 polygon
```

**JSON Format:**
```json
{
  "version": "1.3.6",
  "image": "example.png",
  "annotations": [
    {
      "class_id": 1,
      "class_name": "object",
      "polygon": [[x1, y1], [x2, y2], ...],
      "bbox": [x_min, y_min, width, height]
    }
  ]
}
```

### Additional Features
- Real-time brightness/contrast adjustment
- FFT and channel-based filtering
- Multi-view mode (up to 4 images)
- Customizable hotkeys
- Undo/redo support
- Auto-save on navigation

---

## Hotkeys

| Action | Key | Description |
|--------|-----|-------------|
| AI Mode | `1` | Point-click segmentation |
| Draw Mode | `2` | Manual polygon drawing |
| Edit Mode | `E` | Select and modify shapes |
| Save | `Space` | Confirm current segment |
| Merge | `M` | Combine selected segments |
| Pan | `Q` | Navigate image |
| Undo/Redo | `Ctrl+Z/Y` | History navigation |
| Delete | `V` or `Delete` | Remove segments |

---

## Workflow Example

1. **Open folder** containing images
2. **Click on objects** to generate AI masks (mode 1)
3. **Refine boundaries** with manual tools (mode 2 or E)
4. **Assign classes** and reorder as needed
5. **Export** as NPZ for training

---

## Advanced Usage

### Multi-View Mode
- Press `G` to enable
- Process multiple images simultaneously
- Synchronized navigation with Shift-drag

### SAM 2.1 Support
```bash
pip install git+https://github.com/facebookresearch/sam2.git
```

### Image Preprocessing
- Adjust brightness/contrast for better segmentation
- Use FFT filtering for noisy images
- Apply channel thresholding for color-based selection

---

## Development

```bash
# Run tests
pytest --tb=short

# Code quality
ruff check --fix src/
```

See [ARCHITECTURE.md](src/lazylabel/ARCHITECTURE.md) for technical details.

---

## Troubleshooting

**GPU not detected:**
```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
```

**Poor segmentation quality:**
- Try different SAM model variants
- Add more positive/negative points
- Adjust image brightness/contrast
- Use manual refinement

---

## Citation

```bibtex
@software{lazylabel,
  author = {Cakan, Deniz N.},
  title = {LazyLabel: AI-Assisted Image Segmentation},
  url = {https://github.com/dnzckn/LazyLabel},
  year = {2024}
}
```

---

## License

MIT License - see [LICENSE](LICENSE) for details.