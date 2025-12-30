# Building LazyLabel for Windows

This guide explains how to create a standalone Windows executable and installer for LazyLabel that works completely offline.

## What Gets Created

- **Standalone Application**: A folder containing everything needed to run LazyLabel (~7-8 GB)
- **Windows Installer**: A professional `.exe` installer (~8-9 GB) that:
  - Installs to `C:\Program Files\LazyLabel`
  - Creates Start Menu shortcuts
  - Creates Desktop shortcut
  - Adds to Windows Add/Remove Programs
  - Works completely offline (no internet required)

## Requirements

### On Windows Build Machine

1. **Python 3.10+** (3.10, 3.11, or 3.12)
   - Download from: https://www.python.org/downloads/
   - During installation, check "Add Python to PATH"

2. **Git** (to clone the repository)
   - Download from: https://git-scm.com/download/win

3. **Visual C++ Redistributable** (for PyTorch)
   - Download from: https://aka.ms/vs/17/release/vc_redist.x64.exe

4. **NVIDIA CUDA Toolkit 12.8** (for GPU support)
   - Download from: https://developer.nvidia.com/cuda-downloads
   - Required only if you want GPU acceleration
   - Skip if building CPU-only version

5. **NSIS** (for creating the installer)
   - Download from: https://nsis.sourceforge.io/Download
   - Install to default location

## Build Steps

### Step 1: Clone the Repository

```powershell
cd C:\
git clone https://github.com/dnzckn/LazyLabel.git
cd LazyLabel
git checkout feature/containerize
```

### Step 2: Create Virtual Environment

```powershell
python -m venv venv_build
.\venv_build\Scripts\activate
```

### Step 3: Install Dependencies

```powershell
# Upgrade pip
python -m pip install --upgrade pip

# Install build dependencies
pip install pyinstaller

# Install LazyLabel with all dependencies
pip install -e .

# For SAM2 support (optional)
pip install git+https://github.com/facebookresearch/sam2.git
```

### Step 4: Download Model Files

Place your SAM model files in `src/lazylabel/models/`:

```
src/lazylabel/models/
├── sam_vit_h_4b8939.pth      (2.4 GB)
└── sam2.1_hiera_large.pt     (857 MB)
```

**Download SAM1 model:**
```powershell
# The model will auto-download on first run, or manually:
mkdir src\lazylabel\models -Force
Invoke-WebRequest -Uri "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth" `
                  -OutFile "src\lazylabel\models\sam_vit_h_4b8939.pth"
```

**Download SAM2 model:**
- Download from: https://github.com/facebookresearch/sam2
- Or use: https://dl.fbaipublicfiles.com/segment_anything_2.1/sam2.1_hiera_large.pt

### Step 5: Build the Executable

```powershell
python build_windows.py
```

**What happens:**
1. Checks all requirements
2. Creates version information
3. Cleans previous builds
4. Runs PyInstaller (this takes 10-30 minutes)
5. Creates NSIS installer
6. Shows build summary

### Step 6: Test the Build

```powershell
cd dist\LazyLabel
.\LazyLabel.exe
```

The application should launch without errors.

### Step 7: Distribute

You'll have two options:

**Option 1: Distribute the folder** (dist/LazyLabel/)
- Zip the folder
- Users unzip and run LazyLabel.exe

**Option 2: Distribute the installer** (installer/LazyLabel-1.3.11-Setup.exe)
- Users double-click to install
- More professional
- Creates shortcuts automatically

## Build Output

After a successful build:

```
dist/
└── LazyLabel/                    (Standalone application)
    ├── LazyLabel.exe             (Main executable)
    ├── models/                   (SAM models)
    │   ├── sam_vit_h_4b8939.pth
    │   └── sam2.1_hiera_large.pt
    └── _internal/                (All dependencies)
        ├── torch/
        ├── PyQt6/
        └── (CUDA DLLs, etc.)

installer/
└── LazyLabel-1.3.11-Setup.exe    (Windows installer ~8-9 GB)
```

## Troubleshooting

### PyInstaller Fails to Import PyTorch

**Error:** `ModuleNotFoundError: No module named 'torch'`

**Solution:**
```powershell
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

### CUDA DLLs Not Found

**Error:** Application runs but GPU not detected

**Solution:**
- Ensure CUDA Toolkit is installed
- Add to `lazylabel.spec` binaries section:
```python
binaries=[
    ('C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v12.8/bin/*.dll', '.'),
]
```

### NSIS Installer Not Created

**Error:** `NSIS not found`

**Solution:**
- Install NSIS from: https://nsis.sourceforge.io/Download
- Add to PATH or install to default location

### Executable Too Large

**Current size:** ~8 GB (with models)

**To reduce:**
1. **Exclude SAM2**: Remove SAM2 model and dependencies (~1 GB saved)
2. **CPU-only build**: Remove CUDA libraries (~2-3 GB saved)
3. **Exclude demo pictures**: Remove from spec file (~50 MB saved)

Edit `lazylabel.spec`:
```python
excludes=[
    'sam2',           # Remove SAM2 support
    'matplotlib',
    'pytest',
]
```

### Application Won't Start on Other PCs

**Issue:** Missing Visual C++ Runtime

**Solution:**
- Users need to install: https://aka.ms/vs/17/release/vc_redist.x64.exe
- Or bundle it with your installer

## Advanced: CPU-Only Build

For smaller build without GPU support:

1. Install CPU-only PyTorch:
```powershell
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

2. Build:
```powershell
python build_windows.py
```

**Result:** ~4-5 GB (instead of 8 GB)

## Advanced: Custom Icon

Replace `src/lazylabel/demo_pictures/logo2.png` with a `.ico` file:

1. Convert PNG to ICO: https://convertio.co/png-ico/
2. Update `lazylabel.spec`:
```python
icon='path/to/your/icon.ico'
```

## Distribution Checklist

Before distributing to users:

- [ ] Test on clean Windows machine (no Python installed)
- [ ] Test with GPU (NVIDIA graphics card)
- [ ] Test without GPU (CPU-only)
- [ ] Verify models are included and working
- [ ] Check file size is reasonable
- [ ] Test installation and uninstallation
- [ ] Create README for end users
- [ ] Scan with antivirus (some AVs flag PyInstaller executables)

## User Requirements

Your users need:
- **OS:** Windows 10/11 (64-bit)
- **RAM:** 8 GB minimum, 16 GB recommended
- **Disk:** 10 GB free space
- **GPU:** NVIDIA GPU with CUDA support (optional, for faster performance)
- **NO Python required**
- **NO internet required**

## Support

For build issues:
- PyInstaller docs: https://pyinstaller.org/
- NSIS docs: https://nsis.sourceforge.io/Docs/
- LazyLabel issues: https://github.com/dnzckn/LazyLabel/issues
