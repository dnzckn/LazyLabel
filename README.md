# LazyLabel

<div align="center">
  <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/logo2.png" alt="LazyLabel Logo" style="height:60px; vertical-align:middle;" />
  <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/logo_black.png" alt="LazyLabel Cursive" style="height:60px; vertical-align:middle;" />
</div>

**AI-Assisted Image Segmentation for Machine Learning Dataset Preparation**

LazyLabel combines Meta's Segment Anything Model (SAM) with comprehensive manual annotation tools to accelerate the creation of pixel-perfect segmentation masks for computer vision applications.

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

## Core Features

### AI-Powered Segmentation
LazyLabel leverages Meta's SAM for intelligent object detection:
- Single-click object segmentation
- Interactive refinement with positive/negative points  
- Support for both SAM 1.0 and SAM 2.1 models
- GPU acceleration with automatic CPU fallback

### Manual Annotation Tools
When precision matters:
- Polygon drawing with vertex-level editing
- Bounding box annotations for object detection
- Edit mode for adjusting existing segments
- Merge tool for combining related segments

### Image Processing & Filtering
Advanced preprocessing capabilities:
- **FFT filtering**: Remove noise and enhance edges
- **Channel thresholding**: Isolate objects by color
- **Border cropping**: Define crop regions that set pixels outside the area to zero in saved outputs
- **View adjustments**: Brightness, contrast, gamma correction

### Multi-View Mode
Process multiple images efficiently:
- Annotate up to 4 images simultaneously
- Synchronized zoom and pan across views
- Mirror annotations to all linked images

---

## Export Formats

### NPZ Format (Semantic Segmentation)
One-hot encoded masks optimized for deep learning:

```python
import numpy as np

data = np.load('image.npz')
mask = data['mask']  # Shape: (height, width, num_classes)

# Each channel represents one class
sky = mask[:, :, 0]
boats = mask[:, :, 1]
cats = mask[:, :, 2]
dogs = mask[:, :, 3]
```

### YOLO Format (Object Detection)
Normalized polygon coordinates for YOLO training:
```
0 0.234 0.456 0.289 0.478 0.301 0.523 ...
1 0.567 0.123 0.598 0.145 0.612 0.189 ...
```

### Class Aliases (JSON)
Maintains consistent class naming across datasets:
```json
{
  "0": "background",
  "1": "person",
  "2": "vehicle"
}
```

---

## Typical Workflow

1. **Open folder** containing your images
2. **Click objects** to generate AI masks (mode 1)
3. **Refine** with additional points or manual tools
4. **Assign classes** and organize in the class table
5. **Export** as NPZ or YOLO format

### Advanced Preprocessing Workflow

For challenging images:
1. Apply **FFT filtering** to reduce noise
2. Use **channel thresholding** to isolate color ranges
3. Enable **"Operate on View"** to pass filtered images to SAM
4. Fine-tune with manual tools

---

## Advanced Features

### Multi-View Mode
Access via the "Multi" tab to process multiple images:
- 2-view (side-by-side) or 4-view (grid) layouts
- Annotations mirror across linked views automatically
- Synchronized zoom maintains alignment

### SAM 2.1 Support
LazyLabel supports both SAM 1.0 (default) and SAM 2.1 models. SAM 2.1 offers improved segmentation accuracy and better handling of complex boundaries.

To use SAM 2.1 models:
1. Install the SAM 2 package:
   ```bash
   pip install git+https://github.com/facebookresearch/sam2.git
   ```
2. Download a SAM 2.1 model (e.g., `sam2.1_hiera_large.pt`) from the [SAM 2 repository](https://github.com/facebookresearch/sam2)
3. Place the model file in LazyLabel's models folder:
   - If installed via pip: `~/.local/share/lazylabel/models/` (or equivalent on your system)
   - If running from source: `src/lazylabel/models/`
4. Select the SAM 2.1 model from the dropdown in LazyLabel's settings

Note: SAM 1.0 models are automatically downloaded on first use.

---

## Key Shortcuts

| Action | Key | Description |
|--------|-----|-------------|
| AI Mode | `1` | SAM point-click segmentation |
| Draw Mode | `2` | Manual polygon creation |
| Edit Mode | `E` | Modify existing segments |
| Accept AI Segment | `Space` | Confirm AI segment suggestion |
| Save | `Enter` | Save annotations |
| Merge | `M` | Combine selected segments |
| Pan Mode | `Q` | Enter pan mode |
| Pan | `WASD` | Navigate image |
| Delete | `V`/`Delete` | Remove segments |
| Undo/Redo | `Ctrl+Z/Y` | Action history |

---

## Documentation

- [Usage Manual](src/lazylabel/USAGE_MANUAL.md) - Comprehensive feature guide
- [Architecture Guide](src/lazylabel/ARCHITECTURE.md) - Technical implementation details
- [GitHub Issues](https://github.com/dnzckn/LazyLabel/issues) - Report bugs or request features

---