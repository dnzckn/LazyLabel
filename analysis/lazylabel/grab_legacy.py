"""Render the legacy PyQt6 window to a PNG, for comparing the React app against it.

    python analysis/lazylabel/grab_legacy.py OUT.png [dark|light] [FOLDER [IMAGE [TAB]]]

Run it with the legacy app's interpreter (E:/venv/lazylabel/Scripts/python.exe on the owner's
machine). The window is 1600x900, legacy's default size. It is laid out and painted as if shown,
but never put on the screen. The offscreen Qt platform is not used because it has no font database
on Windows and draws every glyph as a box. FOLDER is opened as if chosen in the folder dialog,
IMAGE is loaded from it, and TAB selects a centre tab (0 Single, 1 Multi, 2 Sequence).

The legacy source comes from the read-only worktree `legacy/lazylabel` (main, 2a7d5d8), which
this never modifies. Home is redirected to a temporary folder, so the user's real
~/.config/lazylabel is neither read nor written. No model is loaded.
"""

import os
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]

home = pathlib.Path(tempfile.mkdtemp(prefix="lazylabel-grab-"))
os.environ["USERPROFILE"] = str(home)
os.environ["HOME"] = str(home)
sys.path.insert(0, str(ROOT / "legacy" / "lazylabel" / "src"))

try:
    import torch  # noqa: F401  -- before Qt: PyQt6 loaded first makes torch's c10.dll fail
except ImportError:
    pass

from PyQt6.QtCore import Qt, QTimer  # noqa: E402
from PyQt6.QtWidgets import QApplication, QFileDialog  # noqa: E402

out = sys.argv[1]
theme = sys.argv[2] if len(sys.argv) > 2 else "dark"
folder = sys.argv[3] if len(sys.argv) > 3 else None
image = sys.argv[4] if len(sys.argv) > 4 else None
tab = int(sys.argv[5]) if len(sys.argv) > 5 else None

app = QApplication(sys.argv[:1])

import lazylabel  # noqa: E402

if "legacy" not in pathlib.Path(lazylabel.__file__).parts:
    sys.exit(f"imported {lazylabel.__file__}, not the legacy worktree")

from lazylabel.ui.main_window import MainWindow  # noqa: E402
from lazylabel.ui.theme import apply_theme  # noqa: E402

apply_theme(theme)

window = MainWindow()
window.setAttribute(Qt.WidgetAttribute.WA_DontShowOnScreen, True)
window.resize(1600, 900)
window.show()


def open_folder() -> None:
    if folder is not None:
        QFileDialog.getExistingDirectory = staticmethod(lambda *_a, **_k: folder)
        window._open_folder_dialog()
    QTimer.singleShot(2500, open_image)


def open_image() -> None:
    if folder is not None and image is not None:
        window._load_image_from_path(pathlib.Path(folder) / image)
    if tab is not None:
        window.view_tab_widget.setCurrentIndex(tab)
    QTimer.singleShot(2500, grab)


def grab() -> None:
    window.grab().save(out)
    print(f"saved {out} ({window.width()}x{window.height()})")
    app.quit()


QTimer.singleShot(2500, open_folder)
app.exec()
