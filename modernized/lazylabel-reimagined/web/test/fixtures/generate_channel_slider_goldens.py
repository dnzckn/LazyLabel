"""Golden behaviour of legacy's channel-threshold bar, recorded from the widget itself.

Run with the app venv, from this directory:

    E:/venv/lazylabel/Scripts/python.exe generate_channel_slider_goldens.py

Unlike the other generators here, nothing below is transcribed. The legacy module is imported from
the read-only snapshot and driven with real Qt events on an offscreen platform, so what lands in
`legacy-channel-slider.json` is what `ui/widgets/channel_threshold_widget.py` (snapshot 2a7d5d8)
actually does:

  - the markers after each double-click, press, move, release and right-click
  - which marker is being dragged
  - every paint call the bar makes for a given state: track, bands, handles and labels, with
    their colours, captured by standing a recording painter in for QPainter

The replay in `workspace/thresholdBar.test.tsx` sends the same events to the web bar and expects the
same markers and the same drawing. Events go through `QCoreApplication.sendEvent`, not straight to
the handlers, so a disabled slider refuses them the way the application's does.

Nothing is written into the legacy tree: bytecode writing is off before the module is loaded.
"""

import importlib.util
import json
import os
import pathlib
import sys

sys.dont_write_bytecode = True
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PyQt6.QtCore import QEvent, QPoint, QPointF, Qt  # noqa: E402
from PyQt6.QtGui import QContextMenuEvent, QMouseEvent, QPainter  # noqa: E402
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
ctw = load("ui/widgets/channel_threshold_widget.py", "legacy_channel_threshold_widget")

LEFT = Qt.MouseButton.LeftButton
NO_BUTTON = Qt.MouseButton.NoButton


def mouse(kind, x, y, button, buttons):
    point = QPointF(x, y)
    return QMouseEvent(kind, point, point, button, buttons, Qt.KeyboardModifier.NoModifier)


def send(widget, step):
    kind = step["event"]
    x, y = step.get("x", 0), step.get("y", 0)
    if kind == "dblclick":
        # Qt's own order for a double-click: press, release, double-click, release.
        QApplication.sendEvent(widget, mouse(QEvent.Type.MouseButtonPress, x, y, LEFT, LEFT))
        QApplication.sendEvent(widget, mouse(QEvent.Type.MouseButtonRelease, x, y, LEFT, NO_BUTTON))
        QApplication.sendEvent(widget, mouse(QEvent.Type.MouseButtonDblClick, x, y, LEFT, LEFT))
        QApplication.sendEvent(widget, mouse(QEvent.Type.MouseButtonRelease, x, y, LEFT, NO_BUTTON))
    elif kind == "press":
        QApplication.sendEvent(widget, mouse(QEvent.Type.MouseButtonPress, x, y, LEFT, LEFT))
    elif kind == "move":
        QApplication.sendEvent(widget, mouse(QEvent.Type.MouseMove, x, y, NO_BUTTON, LEFT))
    elif kind == "release":
        QApplication.sendEvent(widget, mouse(QEvent.Type.MouseButtonRelease, x, y, LEFT, NO_BUTTON))
    elif kind == "context":
        QApplication.sendEvent(
            widget, QContextMenuEvent(QContextMenuEvent.Reason.Mouse, QPoint(x, y))
        )
    else:
        raise ValueError(kind)


def slider_scenario(name, channel, maximum, width, start, steps):
    slider = ctw.MultiIndicatorSlider(channel, 0, maximum)
    slider.resize(width, 60)
    if start:
        slider.set_indicators(start)
    recorded = []
    for step in steps:
        send(slider, step)
        recorded.append({**step, "markers": slider.get_indicators(), "dragging": slider.dragging_index})
    return {
        "name": name,
        "channel": channel,
        "maximum": maximum,
        "width": width,
        "start": start,
        "steps": recorded,
    }


def enable_scenario():
    """The checkbox: a disabled bar refuses input, and unchecking clears the markers."""
    row = ctw.ChannelSliderWidget("Red", maximum=256)
    row.slider.resize(296, 60)
    recorded = []

    def note(step):
        recorded.append(
            {
                **step,
                "markers": row.slider.get_indicators(),
                "enabled": row.is_enabled(),
                "applied": row.get_indicators(),
            }
        )

    for step in [
        {"event": "dblclick", "x": 148, "y": 30},
        {"event": "check"},
        {"event": "dblclick", "x": 148, "y": 30},
        {"event": "dblclick", "x": 60, "y": 30},
        {"event": "uncheck"},
        {"event": "check"},
    ]:
        if step["event"] == "check":
            row.checkbox.setChecked(True)
        elif step["event"] == "uncheck":
            row.checkbox.setChecked(False)
        else:
            send(row.slider, step)
        note(step)

    return {"name": "enable", "channel": "Red", "maximum": 256, "width": 296, "steps": recorded}


class RecordingPainter:
    """Stands in for QPainter inside `paintEvent` and writes down what it is asked to draw."""

    RenderHint = QPainter.RenderHint
    calls = []

    def __init__(self, _device):
        self._pen = None
        self._brush = None
        RecordingPainter.calls = []

    def setRenderHint(self, *_args):
        pass

    def setFont(self, font):
        RecordingPainter.calls.append({"op": "font", "pointSize": font.pointSize()})

    def setPen(self, pen):
        self._pen = pen

    def setBrush(self, brush):
        self._brush = brush

    def _pen_of(self):
        pen = self._pen
        if pen is None:
            return None
        colour = pen.color()
        return {"rgba": list(colour.getRgb()), "width": pen.width()}

    def _brush_of(self):
        brush = self._brush
        if brush is None:
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
        RecordingPainter.calls.append(
            {"op": "text", "x": x, "y": y, "text": text, "pen": self._pen_of()}
        )


def paint_scenario(name, channel, maximum, width, markers, dragging, dark):
    slider = ctw.MultiIndicatorSlider(channel, 0, maximum)
    slider.resize(width, 60)
    slider.set_indicators(markers)
    slider.dragging_index = dragging
    slider._is_dark = lambda: dark
    real = ctw.QPainter
    ctw.QPainter = RecordingPainter
    try:
        slider.paintEvent(None)
    finally:
        ctw.QPainter = real
    return {
        "name": name,
        "channel": channel,
        "maximum": maximum,
        "width": width,
        "markers": markers,
        "dragging": dragging,
        "dark": dark,
        "calls": RecordingPainter.calls,
    }


def main():
    scenarios = [
        slider_scenario(
            "add: double-click on the track, 1 px per level",
            "Red",
            256,
            296,
            [],
            [
                {"event": "dblclick", "x": 148, "y": 30},
                # 5 levels from 128: inside the 10-level spacing, ignored rather than snapped.
                {"event": "dblclick", "x": 143, "y": 30},
                # 9 away, the last level still refused; then exactly 10 away, allowed.
                {"event": "dblclick", "x": 139, "y": 30},
                {"event": "dblclick", "x": 138, "y": 30},
                {"event": "dblclick", "x": 40, "y": 30},
                # Above and below the 10 px track: ignored.
                {"event": "dblclick", "x": 200, "y": 24},
                {"event": "dblclick", "x": 200, "y": 35},
                # The track's own edges are inside it.
                {"event": "dblclick", "x": 200, "y": 25},
                {"event": "dblclick", "x": 230, "y": 34},
                # Left of the track, and its last pixel column, and one past it.
                {"event": "dblclick", "x": 19, "y": 30},
                {"event": "dblclick", "x": 275, "y": 30},
                {"event": "dblclick", "x": 276, "y": 30},
                {"event": "dblclick", "x": 20, "y": 30},
            ],
        ),
        slider_scenario(
            "add: a narrow bar, where levels and pixels differ",
            "Green",
            256,
            200,
            [],
            [
                {"event": "dblclick", "x": 100, "y": 30},
                {"event": "dblclick", "x": 101, "y": 30},
                {"event": "dblclick", "x": 107, "y": 30},
                {"event": "dblclick", "x": 33, "y": 30},
                {"event": "dblclick", "x": 179, "y": 30},
            ],
        ),
        slider_scenario(
            "add: 16-bit, where ten levels is less than a pixel",
            "Gray",
            65536,
            296,
            [],
            [
                {"event": "dblclick", "x": 148, "y": 30},
                {"event": "dblclick", "x": 149, "y": 30},
                {"event": "dblclick", "x": 153, "y": 30},
                {"event": "dblclick", "x": 275, "y": 30},
            ],
        ),
        slider_scenario(
            "drag: a handle follows the pointer, keeping where it was grabbed",
            "Blue",
            256,
            296,
            [50, 150],
            [
                {"event": "press", "x": 172, "y": 30},
                {"event": "move", "x": 100, "y": 30},
                {"event": "move", "x": 101, "y": 52},
                {"event": "move", "x": 0, "y": 30},
                {"event": "move", "x": 400, "y": 90},
                {"event": "release", "x": 400, "y": 90},
                {"event": "move", "x": 120, "y": 30},
            ],
        ),
        slider_scenario(
            "drag: past another marker, which leaves the list out of order",
            "Red",
            256,
            296,
            [50, 150],
            [
                {"event": "press", "x": 70, "y": 30},
                {"event": "move", "x": 220, "y": 30},
                {"event": "release", "x": 220, "y": 30},
                {"event": "dblclick", "x": 120, "y": 30},
            ],
        ),
        slider_scenario(
            "drag: a press off every handle drags nothing",
            "Red",
            256,
            296,
            [128],
            [
                {"event": "press", "x": 100, "y": 30},
                {"event": "move", "x": 60, "y": 30},
                {"event": "release", "x": 60, "y": 30},
                {"event": "press", "x": 154, "y": 30},
                {"event": "move", "x": 60, "y": 30},
                {"event": "release", "x": 60, "y": 30},
                {"event": "press", "x": 148, "y": 21},
                {"event": "release", "x": 148, "y": 21},
                {"event": "press", "x": 148, "y": 38},
                {"event": "release", "x": 148, "y": 38},
            ],
        ),
        slider_scenario(
            "drag: the handle's own edges grab it",
            "Red",
            256,
            296,
            [128],
            [
                {"event": "press", "x": 142, "y": 22},
                {"event": "move", "x": 132, "y": 22},
                {"event": "release", "x": 132, "y": 22},
                {"event": "press", "x": 143, "y": 37},
                {"event": "move", "x": 153, "y": 37},
                {"event": "release", "x": 153, "y": 37},
            ],
        ),
        slider_scenario(
            "remove: right-click a handle; the first in list order wins an overlap",
            "Green",
            256,
            296,
            [100, 104, 200],
            [
                {"event": "context", "x": 60, "y": 30},
                {"event": "context", "x": 122, "y": 30},
                {"event": "context", "x": 226, "y": 30},
                {"event": "context", "x": 225, "y": 30},
            ],
        ),
        slider_scenario(
            "remove: after a drag reorders the list, list order still decides",
            "Green",
            256,
            296,
            [150, 154],
            [
                {"event": "press", "x": 170, "y": 30},
                {"event": "move", "x": 178, "y": 30},
                {"event": "release", "x": 178, "y": 30},
                {"event": "context", "x": 176, "y": 30},
            ],
        ),
        enable_scenario(),
    ]

    paints = [
        paint_scenario("empty, light", "Red", 256, 296, [], -1, False),
        paint_scenario("empty, dark", "Gray", 256, 296, [], -1, True),
        paint_scenario("two markers, one dragged, light", "Green", 256, 296, [50, 150], 1, False),
        paint_scenario("three markers, dark", "Blue", 256, 296, [20, 128, 250], -1, True),
        paint_scenario("crowded labels, light", "Red", 256, 296, [100, 110, 115, 250, 255], -1, False),
        # Labels exactly 30 px apart stay put; 29 apart, the second is pushed to 30.
        paint_scenario("labels at the spacing edge, light", "Blue", 256, 296, [100, 130, 159], -1, False),
        paint_scenario("unsorted after a drag, light", "Red", 256, 296, [200, 150], 0, False),
        paint_scenario("narrow bar, light", "Green", 256, 200, [64, 192], -1, False),
        paint_scenario("16-bit, dark", "Gray", 65536, 296, [16384, 49152], -1, True),
    ]

    out = HERE / "legacy-channel-slider.json"
    out.write_text(json.dumps({"scenarios": scenarios, "paints": paints}, indent=1) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
