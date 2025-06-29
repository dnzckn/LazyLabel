# <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/logo2.png" alt="LazyLabel Logo" style="height:60px; vertical-align:middle;" /> <img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/logo_black.png" alt="LazyLabel Cursive" style="height:60px; vertical-align:middle;" />

**AI-Assisted Image Segmentation Made Simple**

LazyLabel combines Meta's Segment Anything Model (SAM) with intuitive editing tools for fast, precise image labeling. Perfect for machine learning datasets, computer vision research, and annotation workflows.

![LazyLabel Screenshot](https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/demo_pictures/gui.PNG)

---

## 🚀 Quick Start

### Installation
```bash
pip install lazylabel-gui
lazylabel-gui
```

### Usage
1. **Open Folder** → Select your image directory
2. **Click on image** → AI generates instant masks  
3. **Fine-tune** → Edit polygons, merge segments, adjust classes
4. **Export** → Clean `.npz` files ready for ML training

---

## ✨ Key Features

### **🧠 AI-Powered Segmentation**
- **One-click masking** with Meta's SAM model
- **Smart prompting** via positive/negative points
- **Fragment filtering** to remove small artifacts
- **Multiple model support** (VIT-H, VIT-L, VIT-B)

### **🎨 Advanced Editing**
- **Polygon drawing** with full vertex control
- **Bounding box** annotation mode
- **Shape merging** and class assignment
- **Edit mode** for precision adjustments

### **⚡ Productivity Tools**
- **Image adjustments** (brightness, contrast, gamma) 
- **Customizable hotkeys** for all functions
- **Undo/redo** with full history
- **Auto-save** and session persistence

### **📊 ML-Ready Outputs**
- **One-hot encoded** `.npz` format
- **Clean class separation** with shape `(H, W, Classes)`
- **Batch processing** support
- **Existing mask loading** for iterative work

---

## ⌨️ Essential Controls

| Mode | Key | Action |
|------|-----|--------|
| **AI Segmentation** | `1` | Point mode for SAM |
| | `Left Click` | Add positive point |
| | `Right Click` | Add negative point |
| | `Space` | Save segment |
| **Manual Drawing** | `2` | Polygon mode |
| | `Left Click` | Add vertex |
| | `Enter` | Close polygon |
| **Editing** | `E` | Selection mode |
| | `R` | Edit selected shapes |
| | `M` | Merge selected segments |
| **Navigation** | `Q` | Pan mode |
| | `W/A/S/D` | Pan image |
| | `Scroll` | Zoom in/out |

**💡 All hotkeys are customizable** - Click "Hotkeys" button to personalize shortcuts

---

## 📦 Output Format

LazyLabel exports clean, ML-ready data:

```python
import numpy as np

# Load your labeled data
data = np.load('your_image.npz')
mask = data['mask']  # Shape: (height, width, num_classes)

# Each channel is a binary mask for one class
class_0_mask = mask[:, :, 0]  # Binary mask for class 0
class_1_mask = mask[:, :, 1]  # Binary mask for class 1
# ... and so on
```

**Perfect for:**
- Semantic segmentation training
- Instance segmentation datasets  
- Computer vision research
- Automated annotation pipelines

---

## 🛠️ Advanced Features

### **Image Enhancement**
- **Brightness/Contrast** adjustment sliders
- **Gamma correction** for better visibility
- **Live preview** of adjustments
- **SAM integration** with adjusted images

### **Smart Filtering**
- **Fragment threshold** removes small segments
- **Size-based filtering** (0-100% of largest segment)
- **Quality control** for clean annotations

### **Professional Workflow**
- **Class management** with custom aliases
- **Segment organization** with sortable tables
- **Batch export** for large datasets
- **Model switching** without restart

---

## 🏗️ Development

### Installation from Source
```bash
git clone https://github.com/dnzckn/LazyLabel.git
cd LazyLabel
pip install -e .
lazylabel-gui
```

### Code Quality & Testing
```bash
# Linting & formatting
ruff check . && ruff format .

# Run tests with coverage
python -m pytest --cov=lazylabel --cov-report=html

# All tests pass with 60%+ coverage
```

### Architecture
- **Modular design** with clean separation of concerns
- **Signal-based communication** between components  
- **Extensible model system** for new SAM variants
- **Comprehensive test suite** with 95% speed optimization

---

## 📋 Requirements

- **Python 3.10+**
- **OpenCV** for image processing
- **PyQt6** for GUI
- **NumPy** for data handling
- **2.5GB** disk space for SAM model (auto-downloaded)

---

## 🤝 Contributing

LazyLabel welcomes contributions! Check out our:
- [Architecture Guide](src/lazylabel/ARCHITECTURE.md) for technical details
- [Hotkey System](src/lazylabel/HOTKEY_FEATURE.md) for customization
- Issues page for feature requests and bug reports

---

## 🙏 Acknowledgments

LazyLabel was inspired by and builds upon the excellent work of:
- [LabelMe](https://github.com/wkentaro/labelme) - The pioneering open-source image annotation tool
- [Segment-Anything-UI](https://github.com/branislavhesko/segment-anything-ui) - Early SAM integration concepts

---

## ☕ Support

If LazyLabel saves you time on annotation tasks, [consider supporting the project!](https://buymeacoffee.com/dnzckn)

---

**Made with ❤️ for the computer vision community**
