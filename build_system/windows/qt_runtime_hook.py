"""Runtime hook for PyInstaller to set Qt plugin paths on Windows."""

import os
import sys

if sys.platform == "win32":
    # Set Qt plugin path to the bundled PyQt6 plugins directory
    base = sys._MEIPASS if getattr(sys, "frozen", False) else os.path.dirname(__file__)
    qt_plugins = os.path.join(base, "PyQt6", "Qt6", "plugins")
    if os.path.isdir(qt_plugins):
        os.environ["QT_PLUGIN_PATH"] = qt_plugins

    # Also ensure the base directory is in PATH for DLL resolution
    os.environ["PATH"] = base + os.pathsep + os.environ.get("PATH", "")
