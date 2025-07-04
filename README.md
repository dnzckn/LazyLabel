# <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/logo2.png" alt="LazyLabel Logo" style="height:60px; vertical-align:middle;" /> <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/logo_black.png" alt="LazyLabel Cursive" style="height:60px; vertical-align:middle;" />

**AI-Assisted Image Segmentation Made Simple**

LazyLabel combines Meta's Segment Anything Model (SAM) with intuitive editing tools for fast, precise image labeling. Perfect for machine learning datasets and computer vision research.

![LazyLabel Screenshot](https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/gui.PNG)

---

## 🚀 Quick Start

### Installation
```bash
pip install lazylabel-gui
lazylabel-gui
```

### Optional: SAM-2 Support
For advanced SAM-2 models, install manually:
```bash
pip install git+https://github.com/facebookresearch/sam2.git
```
*Note: SAM-2 is optional - LazyLabel works with SAM 1.0 models by default*

### Usage
1. **Open Folder** → Select your image directory
2. **Click on image** → AI generates instant masks  
3. **Fine-tune** → Edit polygons, merge segments
4. **Export** → Clean `.npz` files ready for ML training

---

## ✨ Key Features

- **🧠 One-click AI segmentation** with Meta's SAM and SAM2 models
- **🎨 Manual polygon drawing** with full vertex control
- **⚡ Smart editing tools** - merge segments, adjust class names, and class order
- **📊 ML-ready exports** - One-hot encoded `.npz` format and `.json` for YOLO format
- **🔧 Image enhancement** - brightness, contrast, gamma adjustment
- **🔍 Image viewer** - zoom, pan, brightness, contrast, and gamma adjustment
- **✂️ Edge cropping** - define custom crop areas to focus on specific regions
- **🔄 Undo/Redo** - full history of all actions
- **💾 Auto-saving** - Automatic saving of your labels when navigating between images
- **🎛️ Advanced filtering** - FFT thresholding and color channel thresholding
- **⌨️ Customizable hotkeys** for all functions

---

## ⌨️ Essential Hotkeys

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

💡 **All hotkeys customizable** - Click "Hotkeys" button to personalize

---

## 📦 Output Format

Perfect for ML training - clean, structured data:

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

## 🛠️ Development

**Requirements:** Python 3.10+
**2.5GB** disk space for SAM model (auto-downloaded)

### Installation from Source
```bash
git clone https://github.com/dnzckn/LazyLabel.git
cd LazyLabel
pip install -e .
lazylabel-gui
```

### Testing & Quality
```bash
# Run full test suite
python -m pytest --cov=lazylabel --cov-report=html

# Code formatting & linting
ruff check . && ruff format .
```

### Architecture
- **Modular design** with clean component separation
- **Signal-based communication** between UI elements
- **Extensible model system** for new SAM variants
- **Comprehensive test suite** (150+ tests, 60%+ coverage)

---

## 🤝 Contributing

LazyLabel welcomes contributions! Check out:
- [Architecture Guide](src/lazylabel/ARCHITECTURE.md) for technical details
- [Hotkey System](src/lazylabel/HOTKEY_FEATURE.md) for customization
- Issues page for feature requests and bug reports

---

## 🙏 Acknowledgments

- [LabelMe](https://github.com/wkentaro/labelme)
- [Segment-Anything-UI](https://github.com/branislavhesko/segment-anything-ui)

---

## ☕ Support

If LazyLabel saves you time on annotation tasks, [consider supporting the project!](https://buymeacoffee.com/dnzckn)

---

**Made with ❤️ for the computer vision community**
