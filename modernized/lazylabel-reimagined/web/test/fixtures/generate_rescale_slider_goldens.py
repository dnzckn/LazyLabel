"""Golden behaviour of legacy's Rescale slider, recorded from the widget itself.

Run with the app venv, from this directory:

    E:/venv/lazylabel/Scripts/python.exe generate_rescale_slider_goldens.py

Nothing below is transcribed. `ui/widgets/rescale_widget.py` is imported from the read-only
snapshot (2a7d5d8) and its `RescaleSlider` is driven with real Qt events on an offscreen platform,
so what lands in `legacy-rescale-slider.json` is what the widget actually does:

  - the two values after each press, move and release, and which handle is being dragged. The
    handles cannot pass each other (lines 155-167), and where they overlap the max handle is the
    one a press takes (lines 143-153)
  - every paint call the slider makes for a given state: track, range, handles and the two value
    labels, with their colours, captured by standing a recording painter in for QPainter

The replay in `workspace/RescaleSlider.test.tsx` sends the same events to the web slider and
expects the same values and the same drawing. Events go through `QApplication.sendEvent`, not
straight to the handlers.

Nothing is written into the legacy tree: bytecode writing is off before the module is loaded.
"""

import importlib.util
import json
import os
import pathlib
import sys

sys.dont_write_bytecode = True
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PyQt6.QtCore import QEvent, QPointF, Qt  # noqa: E402
from PyQt6.QtGui import QBrush, QMouseEvent, QPainter, QPen  # noqa: E402
from PyQt6.QtWidgets import QApplication  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent


def legacy_source() -> pathlib.Path:
    """The snapshot's `src`, found by walking up to the checkout that holds `legacy/`."""
    override = os.environ.get("LAZYLABEL_LEGACY_SRC")
    if override:
        return pathlib.Path(override)
    for parent in HERE.parents:
        candidate = parent / "legacy" / "lazylabel" / "src"
        if (candidate / "lazylabel").is_dir():
            return candidate
    raise SystemExit("legacy/lazylabel/src not found; set LAZYLABEL_LEGACY_SRC")


def load(relative: str, name: str):
    path = legacy_source() / "lazylabel" / relative
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


APP = QApplication.instance() or QApplication([])
rsw = load("ui/widgets/rescale_widget.py", "legacy_rescale_widget")

LEFT = Qt.MouseButton.LeftButton
NO_BUTTON = Qt.MouseButton.NoButton


def mouse(kind, x, y, button, buttons):
    point = QPointF(x, y)
    return QMouseEvent(kind, point, point, button, buttons, Qt.KeyboardModifier.NoModifier)


def send(widget, step):
    kind = step["event"]
    x, y = step.get("x", 0), step.get("y", 0)
    if kind == "press":
        QApplication.sendEvent(widget, mouse(QEvent.Type.MouseButtonPress, x, y, LEFT, LEFT))
    elif kind == "move":
        QApplication.sendEvent(widget, mouse(QEvent.Type.MouseMove, x, y, NO_BUTTON, LEFT))
    elif kind == "release":
        QApplication.sendEvent(widget, mouse(QEvent.Type.MouseButtonRelease, x, y, LEFT, NO_BUTTON))
    else:
        raise ValueError(kind)


def scenario(name, maximum, width, start, steps):
    slider = rsw.RescaleSlider(0, maximum)
    slider.resize(width, 50)
    slider.set_values(*start)
    emitted = []
    slider.valueChanged.connect(lambda lo, hi: emitted.append([lo, hi]))
    recorded = []
    for step in steps:
        emitted.clear()
        send(slider, step)
        recorded.append(
            {
                **step,
                "min": slider.min_val,
                "max": slider.max_val,
                "dragging": slider._dragging,
                # What the widget told its owner on this event: a move always reports, even when
                # the values did not change, which is what clears a preset (rescale_widget.py:305).
                "emitted": [list(pair) for pair in emitted],
            }
        )
    return {"name": name, "maximum": maximum, "width": width, "start": list(start), "steps": recorded}


class RecordingPainter:
    """Stands in for QPainter inside `paintEvent` and writes down what it is asked to draw."""

    RenderHint = QPainter.RenderHint
    calls = []

    def __init__(self, _device):
        self._pen = QPen()
        self._brush = QBrush()
        RecordingPainter.calls = []

    def setRenderHint(self, *_args):
        pass

    def setFont(self, font):
        RecordingPainter.calls.append({"op": "font", "pointSize": font.pointSize()})

    def setPen(self, pen):
        # QPainter takes a QPen, a QColor or a PenStyle; QPen's constructor takes all three.
        self._pen = QPen(pen)

    def setBrush(self, brush):
        self._brush = QBrush(brush)

    def _pen_of(self):
        pen = self._pen
        if pen.style() == Qt.PenStyle.NoPen:
            return None
        return {"rgba": list(pen.color().getRgb()), "width": pen.width()}

    def _brush_of(self):
        brush = self._brush
        if brush.style() == Qt.BrushStyle.NoBrush:
            return None
        return {"rgba": list(brush.color().getRgb())}

    def drawRoundedRect(self, rect, x_radius, y_radius):
        RecordingPainter.calls.append(
            {
                "op": "roundedRect",
                "x": rect.x(),
                "y": rect.y(),
                "width": rect.width(),
                "height": rect.height(),
                "radius": [x_radius, y_radius],
                "pen": self._pen_of(),
                "brush": self._brush_of(),
            }
        )

    def drawText(self, x, y, text):
        RecordingPainter.calls.append({"op": "text", "x": x, "y": y, "text": text, "pen": self._pen_of()})


def paint(name, maximum, width, values, dragging, dark):
    slider = rsw.RescaleSlider(0, maximum)
    slider.resize(width, 50)
    slider.set_values(*values)
    slider._dragging = dragging
    slider._is_dark = lambda: dark
    real = rsw.QPainter
    rsw.QPainter = RecordingPainter
    try:
        slider.paintEvent(None)
    finally:
        rsw.QPainter = real
    return {
        "name": name,
        "maximum": maximum,
        "width": width,
        "values": list(values),
        "dragging": dragging,
        "dark": dark,
        "calls": RecordingPainter.calls,
    }


def main():
    # At 296 px the track is 256 px from x=20: value v sits at 20 + int(v / 255 * 256).
    scenarios = [
        scenario(
            "drag: the max handle stops at the min handle",
            255,
            296,
            (50, 200),
            [
                {"event": "press", "x": 221, "y": 23},
                {"event": "move", "x": 100, "y": 23},
                {"event": "move", "x": 30, "y": 23},
                {"event": "move", "x": 0, "y": 60},
                {"event": "release", "x": 0, "y": 60},
                {"event": "move", "x": 200, "y": 23},
            ],
        ),
        scenario(
            "drag: the min handle stops at the max handle",
            255,
            296,
            (50, 200),
            [
                {"event": "press", "x": 68, "y": 20},
                {"event": "move", "x": 150, "y": 20},
                {"event": "move", "x": 260, "y": 20},
                {"event": "move", "x": 400, "y": 0},
                {"event": "release", "x": 400, "y": 0},
            ],
        ),
        scenario(
            "drag: a handle follows the pointer from where it was grabbed, to the ends of the track",
            255,
            296,
            (100, 150),
            [
                {"event": "press", "x": 124, "y": 29},
                {"event": "move", "x": 118, "y": 29},
                {"event": "move", "x": -50, "y": 29},
                {"event": "release", "x": -50, "y": 29},
                {"event": "press", "x": 175, "y": 16},
                {"event": "move", "x": 181, "y": 16},
                {"event": "move", "x": 900, "y": 16},
                {"event": "release", "x": 900, "y": 16},
            ],
        ),
        scenario(
            "overlap: the max handle takes the press, so it can only move up",
            255,
            296,
            (128, 128),
            [
                {"event": "press", "x": 148, "y": 23},
                {"event": "move", "x": 100, "y": 23},
                {"event": "move", "x": 180, "y": 23},
                {"event": "release", "x": 180, "y": 23},
                {"event": "press", "x": 148, "y": 23},
                {"event": "move", "x": 90, "y": 23},
                {"event": "release", "x": 90, "y": 23},
            ],
        ),
        scenario(
            "press: off the handles, above and below them, and on their edges",
            255,
            296,
            (0, 255),
            [
                {"event": "press", "x": 148, "y": 23},
                {"event": "move", "x": 100, "y": 23},
                {"event": "release", "x": 100, "y": 23},
                {"event": "press", "x": 20, "y": 14},
                {"event": "release", "x": 20, "y": 14},
                {"event": "press", "x": 20, "y": 31},
                {"event": "release", "x": 20, "y": 31},
                {"event": "press", "x": 14, "y": 15},
                {"event": "move", "x": 40, "y": 15},
                {"event": "release", "x": 40, "y": 15},
                {"event": "press", "x": 281, "y": 30},
                {"event": "move", "x": 250, "y": 30},
                {"event": "release", "x": 250, "y": 30},
                {"event": "press", "x": 282, "y": 30},
                {"event": "move", "x": 200, "y": 30},
                {"event": "release", "x": 200, "y": 30},
            ],
        ),
        scenario(
            "16-bit: 0 to 65535 over the same track",
            65535,
            296,
            (0, 65535),
            [
                {"event": "press", "x": 276, "y": 23},
                {"event": "move", "x": 148, "y": 23},
                {"event": "move", "x": 149, "y": 23},
                {"event": "release", "x": 149, "y": 23},
                {"event": "press", "x": 20, "y": 23},
                {"event": "move", "x": 77, "y": 23},
                {"event": "release", "x": 77, "y": 23},
            ],
        ),
        scenario(
            "narrow: at 200 px a pixel is more than a level",
            255,
            200,
            (0, 255),
            [
                {"event": "press", "x": 180, "y": 23},
                {"event": "move", "x": 101, "y": 23},
                {"event": "move", "x": 102, "y": 23},
                {"event": "release", "x": 102, "y": 23},
                {"event": "press", "x": 21, "y": 23},
                {"event": "move", "x": 57, "y": 23},
                {"event": "release", "x": 57, "y": 23},
            ],
        ),
        scenario(
            "a press and release with no move reports nothing",
            255,
            296,
            (60, 180),
            [
                {"event": "press", "x": 80, "y": 23},
                {"event": "release", "x": 80, "y": 23},
                {"event": "press", "x": 80, "y": 23},
                {"event": "move", "x": 80, "y": 23},
                {"event": "release", "x": 80, "y": 23},
            ],
        ),
    ]

    paints = [
        paint("full range, light", 255, 296, (0, 255), None, False),
        paint("full range, dark", 255, 296, (0, 255), None, True),
        paint("a window, light", 255, 296, (50, 200), None, False),
        paint("the min handle dragged, dark", 255, 296, (50, 200), "min", True),
        paint("the max handle dragged, light", 255, 296, (50, 200), "max", False),
        paint("16-bit, dark", 65535, 296, (1000, 60000), None, True),
        paint("handles together, light", 255, 296, (128, 128), None, False),
        paint("narrow, light", 255, 200, (64, 192), None, False),
    ]

    out = HERE / "legacy-rescale-slider.json"
    out.write_text(json.dumps({"scenarios": scenarios, "paints": paints}, indent=1) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
