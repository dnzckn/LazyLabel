# LazyLabel

<div align="center">
  <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/logo2.png" alt="LazyLabel Logo" style="height:60px; vertical-align:middle;" />
  <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/logo_black.png" alt="LazyLabel Cursive" style="height:60px; vertical-align:middle;" />
</div>

**AI-Assisted Image Segmentation for Machine Learning Applications**

LazyLabel integrates Meta's Segment Anything Model (SAM) with advanced editing capabilities to enable efficient, high-precision image annotation. Designed for computer vision research and machine learning dataset preparation.

<div align="center">
  <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/gui.PNG" alt="LazyLabel Screenshot" width="800"/>
</div>

---

## Quick Start

### Installation
```bash
pip install lazylabel-gui
lazylabel-gui
```

### Optional: SAM 2.1 Support
For enhanced performance with SAM 2.1 models:
```bash
pip install git+https://github.com/facebookresearch/sam2.git
```
**Note:** SAM 2.1 is optional - LazyLabel downloads SAM 1.0 models by default.

### Usage
1. **Open Folder** - Select your image directory
2. **AI Segmentation** - Click on objects for automatic mask generation
3. **Manual Refinement** - Edit polygons, merge segments, adjust classifications
4. **Export** - Generate `.npz` files with one-hot encoded masks for ML training

---

## Key Features

- **One-click AI segmentation** with Meta's SAM and SAM 2.1 models
- **Manual polygon drawing** with full vertex control
- **Smart editing tools** - merge segments, adjust class names, and class order
- **ML-ready exports** - One-hot encoded `.npz` format and `.json` for YOLO format
- **Image enhancement** - brightness, contrast, gamma adjustment
- **Advanced image viewer** - zoom, pan, and real-time adjustments
- **Edge cropping** - define custom crop areas to focus on specific regions
- **Undo/Redo system** - full history of all actions
- **Auto-saving** - automatic saving of labels when navigating between images
- **Advanced filtering** - FFT thresholding and color channel thresholding
- **Customizable hotkeys** for all functions

---

## Essential Hotkeys

| Action | Key | Description |
|--------|-----|-------------|
| **AI Mode** | `1` | Point-click segmentation |
| **Draw Mode** | `2` | Manual polygon drawing |
| **Edit Mode** | `E` | Select and modify shapes |
| **Save Segment** | `Space` | Confirm current mask |
| **Merge** | `M` | Combine selected segments |
| **Pan** | `Q` + drag | Navigate large images |
| **Positive Point** | `Left Click` | Add to segment |
| **Negative Point** | `Right Click` | Remove from segment |

**Note:** All hotkeys are fully customizable - Click "Hotkeys" button to personalize your workflow.

---

## Output Format

LazyLabel exports data in standardized formats optimized for machine learning workflows:

```python
import numpy as np

# Load your labeled data
data = np.load('your_image.npz')
mask = data['mask']  # Shape: (height, width, num_classes)

# Each channel is a binary mask for one class
class_0_mask = mask[:, :, 0]  # Background
class_1_mask = mask[:, :, 1]  # Object type 1
class_2_mask = mask[:, :, 2]  # Object type 2
```


**Ideal for:**
- Semantic segmentation datasets
- Instance segmentation training
- Computer vision research
- Automated annotation pipelines

---

## Development

**Requirements:** Python 3.10+, ~2.5GB disk space for SAM models (auto-downloaded)

### Installation from Source
```bash
git clone https://github.com/dnzckn/LazyLabel.git
cd LazyLabel
pip install -e .
lazylabel-gui
```

### Testing & Quality
```bash
# Run test suite (272 tests)
pytest --tb=short

# Code quality checks
ruff check --fix src/
```

### Architecture
- **Modular design** with clean component separation
- **Signal-based communication** between UI elements  
- **Extensible model system** for SAM 1.0 and SAM 2.1 variants
- **Comprehensive test suite** (272 tests with extensive coverage)
- **Multi-view support** for simultaneous image processing

---

## Contributing

LazyLabel welcomes contributions! Please review:
- [Usage Manual](src/lazylabel/USAGE_MANUAL.md) for comprehensive user documentation
- [Architecture Guide](src/lazylabel/ARCHITECTURE.md) for technical implementation details
- [Issues page](https://github.com/dnzckn/LazyLabel/issues) for feature requests and bug reports

---

## Acknowledgments

- [LabelMe](https://github.com/wkentaro/labelme)
- [Segment-Anything-UI](https://github.com/branislavhesko/segment-anything-ui)
