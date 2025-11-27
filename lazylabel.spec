# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for LazyLabel Windows Executable
Creates a standalone Windows application with all dependencies bundled.
"""

import sys
import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Collect all necessary data files and submodules
sam_datas = collect_data_files('segment_anything')
sam2_datas = collect_data_files('sam2', include_py_files=True)
pyqt_datas = collect_data_files('PyQt6')

# Collect model files
model_files = [
    ('src/lazylabel/models/sam_vit_h_4b8939.pth', 'models'),
    ('src/lazylabel/models/sam2.1_hiera_large.pt', 'models'),
]

# Collect demo pictures and other resources
demo_datas = [
    ('src/lazylabel/demo_pictures', 'demo_pictures'),
]

# Combine all data files
datas = sam_datas + sam2_datas + pyqt_datas + model_files + demo_datas

# Hidden imports that PyInstaller might miss
hiddenimports = [
    # PyQt6 modules
    'PyQt6.QtCore',
    'PyQt6.QtGui',
    'PyQt6.QtWidgets',
    'PyQt6.sip',

    # PyTorch
    'torch',
    'torch.nn',
    'torch.cuda',
    'torchvision',
    'torchvision.transforms',

    # SAM models
    'segment_anything',
    'segment_anything.modeling',
    'segment_anything.predictor',
    'segment_anything.automatic_mask_generator',

    # SAM2
    'sam2',
    'sam2.build_sam',
    'sam2.sam2_image_predictor',

    # Scientific computing
    'numpy',
    'scipy',
    'scipy.ndimage',
    'cv2',

    # Other dependencies
    'requests',
    'tqdm',
    'huggingface_hub',
    'pyqtdarktheme',
]

# Add all PyQt6 submodules
hiddenimports += collect_submodules('PyQt6')

# Add all torch submodules
hiddenimports += collect_submodules('torch')

# Add SAM2 submodules
hiddenimports += collect_submodules('sam2')

a = Analysis(
    ['src/lazylabel/main.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude unnecessary packages to reduce size
        'matplotlib',
        'pandas',
        'jupyter',
        'notebook',
        'IPython',
        'sphinx',
        'pytest',
        'setuptools',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='LazyLabel',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,  # Compress executable
    console=False,  # GUI application, no console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='src/lazylabel/demo_pictures/logo2.png',  # Application icon
    version='version_info.txt',  # Version information
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='LazyLabel',
)
