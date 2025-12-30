# LazyLabel Build System

This directory contains build scripts and configurations for creating standalone distributions of LazyLabel.

## Directory Structure

```
build_system/
├── README.md           # This file
└── windows/            # Windows executable build system
    ├── BUILD_WINDOWS.md       # Complete build documentation
    ├── build_windows.py       # Automated build script
    ├── lazylabel.spec         # PyInstaller configuration
    └── installer/
        └── installer.nsi      # NSIS installer script
```

## Quick Start

### Windows Executable

To build a standalone Windows executable with installer:

```powershell
cd build_system/windows
python build_windows.py
```

See [windows/BUILD_WINDOWS.md](windows/BUILD_WINDOWS.md) for detailed instructions.

## What Gets Created

- **Standalone Application**: Everything needed to run LazyLabel (~7-8 GB)
  - Python runtime bundled
  - All dependencies included (PyTorch, PyQt6, etc.)
  - SAM models bundled
  - Works offline - no internet required

- **Professional Installer**: Windows .exe installer (~8-9 GB)
  - One-click installation
  - Start Menu shortcuts
  - Desktop shortcut
  - Uninstaller included

## Requirements

See platform-specific documentation:
- Windows: [windows/BUILD_WINDOWS.md](windows/BUILD_WINDOWS.md)

## Future Platforms

Planned support for:
- Linux (AppImage)
- macOS (DMG/App Bundle)
- Docker containers

## Contributing

When adding new build configurations:
1. Create a subdirectory for the platform (e.g., `linux/`, `macos/`)
2. Include comprehensive documentation
3. Provide automated build scripts
4. Test on clean systems
