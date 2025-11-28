"""
Windows Build Script for LazyLabel
Automates the creation of a standalone Windows executable and installer.

Requirements:
    - Python 3.12+
    - PyInstaller
    - NSIS (for installer creation)

Usage:
    python build_windows.py
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

# Build configuration
APP_NAME = "LazyLabel"
VERSION = "1.4.0"
AUTHOR = "Deniz N. Cakan"
DESCRIPTION = "AI-Assisted Image Segmentation for Machine Learning"

# Paths
SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent.parent  # Go up to project root
DIST_DIR = ROOT_DIR / "dist"
BUILD_DIR = ROOT_DIR / "build"
INSTALLER_DIR = SCRIPT_DIR / "installer"


def print_banner(text):
    """Print a formatted banner."""
    print("\n" + "=" * 80)
    print(f"  {text}")
    print("=" * 80 + "\n")


def check_requirements():
    """Check if all required tools are installed."""
    print_banner("Checking Requirements")

    # Check Python version
    print(
        f"✓ Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    )

    # Check PyInstaller
    try:
        import PyInstaller

        print(f"✓ PyInstaller {PyInstaller.__version__}")
    except ImportError:
        print("❌ Error: PyInstaller not installed")
        print("   Install with: pip install pyinstaller")
        return False

    # Check required packages
    required_packages = [
        "PyQt6",
        "torch",
        "segment_anything",
    ]

    for package in required_packages:
        try:
            __import__(package)
            print(f"✓ {package} installed")
        except ImportError:
            print(f"❌ Error: {package} not installed")
            return False

    # Check NSIS (optional, for installer)
    nsis_paths = [
        r"C:\Program Files (x86)\NSIS\makensis.exe",
        r"C:\Program Files\NSIS\makensis.exe",
    ]

    nsis_found = any(os.path.exists(p) for p in nsis_paths)
    if nsis_found:
        print("✓ NSIS installed (installer will be created)")
    else:
        print("⚠ NSIS not found (installer won't be created)")
        print("  Download from: https://nsis.sourceforge.io/Download")

    return True


def create_version_info():
    """Create Windows version information file."""
    print_banner("Creating Version Information")

    version_info = f"""# UTF-8
VSVersionInfo(
  ffi=FixedFileInfo(
    filevers=({VERSION.replace(".", ", ")}, 0),
    prodvers=({VERSION.replace(".", ", ")}, 0),
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0)
  ),
  kids=[
    StringFileInfo(
      [
      StringTable(
        u'040904B0',
        [StringStruct(u'CompanyName', u'{AUTHOR}'),
        StringStruct(u'FileDescription', u'{DESCRIPTION}'),
        StringStruct(u'FileVersion', u'{VERSION}'),
        StringStruct(u'InternalName', u'{APP_NAME}'),
        StringStruct(u'LegalCopyright', u'Copyright (c) 2024 {AUTHOR}'),
        StringStruct(u'OriginalFilename', u'{APP_NAME}.exe'),
        StringStruct(u'ProductName', u'{APP_NAME}'),
        StringStruct(u'ProductVersion', u'{VERSION}')])
      ]),
    VarFileInfo([VarStruct(u'Translation', [1033, 1200])])
  ]
)
"""

    version_file = SCRIPT_DIR / "version_info.txt"
    with open(version_file, "w", encoding="utf-8") as f:
        f.write(version_info)

    print(f"✓ Created {version_file}")
    return True


def clean_build_dirs():
    """Clean previous build artifacts."""
    print_banner("Cleaning Build Directories")

    dirs_to_clean = [BUILD_DIR, DIST_DIR]

    for dir_path in dirs_to_clean:
        if dir_path.exists():
            print(f"  Removing {dir_path}")
            try:
                shutil.rmtree(dir_path)
            except PermissionError as e:
                print(f"\n❌ Error: Cannot delete {dir_path}")
                print("   LazyLabel.exe or another file is still running or locked")
                print("   Please close the application and try again\n")
                raise SystemExit(1) from e

    print("✓ Build directories cleaned")


def build_executable():
    """Build the executable using PyInstaller."""
    print_banner("Building Executable with PyInstaller")

    spec_file = SCRIPT_DIR / "lazylabel.spec"
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        str(spec_file),
        "--clean",
        "--noconfirm",
    ]

    print(f"Running: {' '.join(cmd)}")

    try:
        subprocess.run(cmd, check=True, cwd=ROOT_DIR)
        print("\n✓ Executable built successfully")
        print(f"  Location: {DIST_DIR / APP_NAME}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Build failed with error code {e.returncode}")
        return False


def create_installer():
    """Create NSIS installer."""
    print_banner("Creating Windows Installer")

    print("⚠ NOTE: NSIS has limitations with large files (>2GB)")
    print("  For this 7-8GB application, ZIP distribution is recommended")
    print("  Attempting NSIS installer creation anyway...\n")

    # Check if NSIS is available
    nsis_paths = [
        r"C:\Program Files (x86)\NSIS\makensis.exe",
        r"C:\Program Files\NSIS\makensis.exe",
    ]

    makensis = None
    for path in nsis_paths:
        if os.path.exists(path):
            makensis = path
            break

    if not makensis:
        print("⚠ NSIS not found, skipping installer creation")
        print("  You can still distribute the 'dist/LazyLabel' folder")
        return False

    # Create NSIS script
    nsis_script = INSTALLER_DIR / "installer.nsi"
    if not nsis_script.exists():
        print("⚠ NSIS script not found")
        print(f"  Expected: {nsis_script}")
        return False

    # Run NSIS
    cmd = [makensis, str(nsis_script)]

    try:
        subprocess.run(cmd, check=True, cwd=ROOT_DIR)
        print("\n✓ Installer created successfully")
        print(f"  Location: installer/LazyLabel-{VERSION}-Setup.exe")
        return True
    except subprocess.CalledProcessError:
        print("\n❌ Installer creation failed")
        return False


def print_summary():
    """Print build summary."""
    print_banner("Build Complete!")

    print("Distribution files created:")
    print("\n  📁 Application folder:")
    print(f"     {DIST_DIR / APP_NAME}")
    print("     Size: ~7-8 GB (includes models)")

    installer_path = INSTALLER_DIR / f"LazyLabel-{VERSION}-Setup.exe"
    if installer_path.exists():
        print("\n  💾 Windows Installer:")
        print(f"     {installer_path}")
        size_gb = installer_path.stat().st_size / (1024**3)
        print(f"     Size: ~{size_gb:.1f} GB")

    print("\n" + "=" * 80)
    print("  Next Steps:")
    print("=" * 80)
    print("\n  1. Test the executable:")
    print(f"     cd {DIST_DIR / APP_NAME}")
    print(f"     .\\{APP_NAME}.exe")

    if installer_path.exists():
        print("\n  2. Distribute the installer:")
        print(f"     {installer_path}")
    else:
        print("\n  2. Create a ZIP for distribution:")
        print(
            f"     Compress-Archive -Path '{DIST_DIR / APP_NAME}' -DestinationPath 'LazyLabel-{VERSION}-Windows.zip'"
        )
        print("\n     Or use 7-Zip/WinRAR to compress:")
        print(f"     {DIST_DIR / APP_NAME}")
        print("\n     Note: NSIS installer doesn't support files >2GB")
        print("     ZIP distribution is recommended for large applications")

    print("\n  3. Users can run offline - no internet required!")
    print("\n")


def main():
    """Main build process."""
    print_banner(f"LazyLabel Windows Build System v{VERSION}")

    # Check requirements
    if not check_requirements():
        print("\n❌ Build aborted due to missing requirements")
        return 1

    # Create version info
    if not create_version_info():
        return 1

    # Clean previous builds
    clean_build_dirs()

    # Build executable
    if not build_executable():
        print("\n❌ Build failed")
        return 1

    # Create installer (optional)
    create_installer()

    # Print summary
    print_summary()

    return 0


if __name__ == "__main__":
    sys.exit(main())
