# LazyLabel

[![Python](https://img.shields.io/pypi/pyversions/lazylabel-gui)](https://pypi.org/project/lazylabel-gui/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/dnzckn/LazyLabel/blob/main/LICENSE)

LazyLabel combines Meta's Segment Anything Model (SAM) with comprehensive manual annotation tools to accelerate the creation of pixel-perfect labels for computer vision applications.

<img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/media/sequence_demo.gif"/>

---

## LazyLabel web (this branch)

This branch, `main-web`, is LazyLabel rebuilt as a web app: the same tools, in your browser, served
by a small Node.js program on your own machine. It reads and writes the same annotation files as the
desktop app, so the two can work on one folder. The desktop app is unchanged on `main` and on PyPI;
its instructions are [further down](#desktop-app-pyqt6-branch-main-pypi-208).

**You need** [Git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org/) **22.13 or
later** (the current 22 or 24 LTS). Nothing else: no Python, no compiler, no GPU. Check with
`node --version`; an older Node 22 stops with `No such built-in module: node:sqlite`.

**Windows (PowerShell):**

```powershell
git clone -b main-web https://github.com/dnzckn/LazyLabel.git
cd LazyLabel\modernized
foreach ($p in "lazylabel\core\exporters", "lazylabel-reimagined\settings-schema", "lazylabel-reimagined\contracts", "lazylabel-reimagined\api", "lazylabel-reimagined\web") { npm install --prefix $p }
foreach ($p in "lazylabel\core\exporters", "lazylabel-reimagined\settings-schema", "lazylabel-reimagined\contracts", "lazylabel-reimagined\api") { npm run build --prefix $p }
```

Then, in one window, the API, pointed at your folder of images:

```powershell
cd lazylabel-reimagined\api
$env:LAZYLABEL_DATASET_ROOT = "C:\path\to\your\images"; npm start
```

and in a second window, the web app:

```powershell
cd LazyLabel\modernized\lazylabel-reimagined\web
npm run dev
```

**macOS and Linux (bash or zsh):**

```bash
git clone -b main-web https://github.com/dnzckn/LazyLabel.git
cd LazyLabel/modernized
for p in lazylabel/core/exporters lazylabel-reimagined/{settings-schema,contracts,api,web}; do npm install --prefix "$p" || break; done
for p in lazylabel/core/exporters lazylabel-reimagined/{settings-schema,contracts,api}; do npm run build --prefix "$p" || break; done
cd lazylabel-reimagined/api && LAZYLABEL_DATASET_ROOT="/path/to/your/images" npm start
```

and in a second terminal, `cd LazyLabel/modernized/lazylabel-reimagined/web && npm run dev`.

Then open **<http://localhost:5173>**. (The API on port 8787 does not serve the app yet, so its own
address answers 404.)

- **The AI tools (SAM) are optional.** Without them everything else works and the status bar says
  "No AI". Adding them is a separate Python service:
  [`modernized/lazylabel-reimagined/README.md`](modernized/lazylabel-reimagined/README.md#running-it).
- **In PowerShell, `npm` drops `--`.** `npm` there is `npm.ps1`, which swallows the `--` before a
  script's own options, so they reach npm instead of the script. Type `npm.cmd` instead, as in
  `npm.cmd run acceptance -- <corpus> --oracle <dir>`.
- The API keeps its settings database in `<your folder>\.lazylabel\`.

---

## Desktop app (PyQt6, branch `main`, PyPI 2.0.8)

**Full install (with AI segmentation):**
```bash
pip install lazylabel-gui[include-ai]
lazylabel-gui
```

**Core install (manual annotation only, no PyTorch required):**
```bash
pip install lazylabel-gui
lazylabel-gui
```

**From source:**
```bash
git clone https://github.com/dnzckn/LazyLabel.git
cd LazyLabel
pip install -e ".[include-ai]"   # full install
# or: pip install -e .           # core only
lazylabel-gui
```

**Requirements:** Python 3.10+, 8GB RAM. Full install needs ~2.5GB additional disk space for model weights.

---

## Core Features

### Annotation Tools

<table>
<tr>
<th>Tool</th>
<th>Create</th>
<th>Erase</th>
</tr>
<tr>
<td><strong>AI (SAM)</strong><br>Point-based segmentation<br>SAM 1.0 & 2.1, GPU/CPU</td>
<td><img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/media/AI_add.gif" width="280"/></td>
<td><img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/media/AI_remove.gif" width="280"/></td>
</tr>
<tr>
<td><strong>Box</strong><br>Bounding box annotations<br>Hold Shift to erase</td>
<td><img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/media/box_add.gif" width="280"/></td>
<td><img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/media/box_remove.gif" width="280"/></td>
</tr>
<tr>
<td><strong>Polygon</strong><br>Vertex-level precision<br>Click to place vertices</td>
<td><img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/media/poly_add.gif" width="280"/></td>
<td><img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/media/poly_remove.gif" width="280"/></td>
</tr>
</table>

### Editing Tools

<table>
<tr>
<th>Move Polygon</th>
<th>Move Vertex</th>
</tr>
<tr>
<td><img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/media/move_polygon.gif" width="350"/></td>
<td><img src="https://raw.githubusercontent.com/dnzckn/LazyLabel/main/src/lazylabel/media/move_vertex.gif" width="350"/></td>
</tr>
</table>

- **Select**: Click to select existing masks for editing, reclassing, or deletion. Hold Shift+Space to erase the overlap of a drawn segment from the selected mask.

### Annotation Modes
- **Single View**: Fine-tune individual masks with maximum precision
- **Multi View**: Annotate up to 2 images simultaneously, ideal for objects in similar positions with slight variations
- **Sequence**: Propagate a refined mask across thousands of frames using SAM 2's video predictor

#### Streaming Mode

For large image sets (1,000–10,000+ images), streaming mode processes the sequence in chunks of 250 frames with bounded memory (~3–4 GB) regardless of total size. Every chunk receives the full set of human-labeled reference images prepended to its batch, so SAM2 always has the complete object vocabulary available. Enable or disable via the **Streaming** checkbox in the Propagation controls (on by default for sequences over 250 frames).

### Image Processing
- **FFT filtering**: Remove noise and enhance edges
- **Channel thresholding**: Isolate objects by color
- **Border cropping**: Zero out pixels outside defined regions in saved outputs
- **View adjustments**: Brightness, contrast, gamma correction, color saturation

---

## Export Formats

Select one or more formats from Settings. All formats can be loaded back into LazyLabel.

### NPZ - One-hot encoded mask tensors (`.npz`)
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

### Standard Formats

| Format | Output File | Description |
|--------|------------|-------------|
| YOLO Detection | `image.txt` | Bounding boxes: `class_id cx cy w h` (normalized) |
| YOLO Segmentation | `image_seg.txt` | Polygon vertices: `class_id x1 y1 x2 y2 ...` (normalized) |
| COCO JSON | `image_coco.json` | Per-image COCO format with polygon segmentation, bounding boxes, and area |
| Pascal VOC | `image.xml` | XML bounding box annotations |
| CreateML | `image_createml.json` | Apple CreateML JSON with center-based bounding boxes |

**COCO supercategories:** Set a class alias to `name.supercategory` (e.g. `dog.animal`) to populate the supercategory field in COCO JSON output.

---

## Model Setup (desktop app)

The web app never downloads a model; its inference service's
[README](modernized/lazylabel-reimagined/inference/README.md) covers its checkpoints.

SAM 1.0 models are downloaded automatically on first use.

If the automatic download doesn't work, you can manually download and place the model:

### SAM 1.0

SAM 1.0 only requires the model weights file, no additional package installation needed.

1. Download `sam_vit_h_4b8939.pth` from the [SAM repository](https://github.com/facebookresearch/segment-anything)
2. Place in LazyLabel's models folder:
   - Via pip: `<site-packages>/lazylabel/models/` (run `python -c "import lazylabel; print(lazylabel.__path__[0])"` to find it)
   - From source: `src/lazylabel/models/`

### SAM 2.1 (improved accuracy, required for Sequence mode)

SAM 2.1 requires both the `sam2` package installed and the model weights file, since it relies on config files bundled with the package.

1. Install SAM 2: `pip install git+https://github.com/facebookresearch/sam2.git`
2. Download a model (e.g., `sam2.1_hiera_large.pt`) from the [SAM 2 repository](https://github.com/facebookresearch/sam2)
3. Place in LazyLabel's models folder:
   - Via pip: `<site-packages>/lazylabel/models/` (run `python -c "import lazylabel; print(lazylabel.__path__[0])"` to find it)
   - From source: `src/lazylabel/models/`

Select the model from the dropdown in settings.

### MobileNetV3 (used by Find Archetypes in Sequence mode)

The MobileNetV3 model (~4MB) is downloaded automatically on first use from [torchvision](https://pytorch.org/vision/stable/models/mobilenetv3.html) and cached locally for offline use.

If the automatic download doesn't work:

1. On a machine with internet, generate the weights file:
   ```bash
   python -c "import torch; from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights; m = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1); torch.save(m.state_dict(), 'mobilenetv3_small_tv.pth')"
   ```
2. Copy `mobilenetv3_small_tv.pth` to LazyLabel's models folder:
   - Via pip: `<site-packages>/lazylabel/models/`
   - From source: `src/lazylabel/models/`

---

## Building the Desktop App's Windows Executable

Create a standalone Windows executable with bundled models for offline use:

**Requirements:**
- Windows (native, not WSL)
- Python 3.10+
- PyInstaller: `pip install pyinstaller`

**Build steps:**
```bash
git clone https://github.com/dnzckn/LazyLabel.git
cd LazyLabel
python build_system/windows/build_windows.py
```

The executable will be created in `dist/LazyLabel/`. The entire folder (~7-8GB) can be moved anywhere and runs offline.

---

## Documentation

- [LazyLabel web](modernized/lazylabel-reimagined/README.md) - The web app's packages, and how to work on them
- [Usage Manual](src/lazylabel/USAGE_MANUAL.md) - Comprehensive feature guide
- [Architecture Guide](src/lazylabel/ARCHITECTURE.md) - Technical implementation details
- [Changelog](CHANGELOG.md) - Version history and release notes
- [GitHub Issues](https://github.com/dnzckn/LazyLabel/issues) - Report bugs or request features

---
