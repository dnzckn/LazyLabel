"""Golden behaviour of legacy's FFT Threshold section, recorded from the widgets themselves.

Run with the app venv, from this directory:

    E:/venv/lazylabel/Scripts/python.exe generate_fft_slider_goldens.py

Nothing below is transcribed. `ui/widgets/fft_threshold_widget.py` is imported from the read-only
snapshot (2a7d5d8), with the channel threshold module it builds on, and driven with real Qt events
on an offscreen platform, so what lands in `legacy-fft-slider.json` is what the widgets do:

  - the markers after each double-click, press, move, release and right-click on the two
    `FFTThresholdSlider`s: "Frequency Bands", 0 to 10000 with fractional values, and "Intensity
    Levels", 0 to 255 in whole levels (lines 24-139, 179-207)
  - every paint call each slider makes for a given state, captured by standing a recording painter
    in for QPainter: its own colours whatever the theme, and its own labels, a percent rounded as
    Python rounds or a whole level, with no spreading apart (lines 27-119)
  - the widget's checkbox: a disabled slider takes nothing, ticking enables both, unticking clears
    both (lines 236-251)
  - its status line for each kind of image (lines 270-326)

The replay in `workspace/FrequencyPanel.test.tsx` sends the same events to the web section and
expects the same markers and drawing. Events go through `QApplication.sendEvent`, so a disabled
slider refuses them the way the application's does.

Nothing is written into the legacy tree: bytecode writing is off before the module is loaded.
"""

import importlib
import json
import os
import pathlib
import sys
import types

sys.dont_write_bytecode = True
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import numpy as np  # noqa: E402
from PyQt6.QtCore import QEvent, QPoint, QPointF, Qt  # noqa: E402
from PyQt6.QtGui import QBrush, QContextMenuEvent, QMouseEvent, QPainter, QPen  # noqa: E402
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


APP = QApplication.instance() or QApplication([])
package = types.ModuleType("legacy_widgets")
package.__path__ = [str(legacy_source() / "lazylabel" / "ui" / "widgets")]
sys.modules["legacy_widgets"] = package
fftw = importlib.import_module("legacy_widgets.fft_threshold_widget")

LEFT = Qt.MouseButton.LeftButton
NO_BUTTON = Qt.MouseButton.NoButton
NAMES = {"frequency": ("Frequency Bands", 10000), "intensity": ("Intensity Levels", 255)}


def mouse(kind, x, y, button, buttons):
    point = QPointF(x, y)
    return QMouseEvent(kind, point, point, button, buttons, Qt.KeyboardModifier.NoModifier)


def send(widget, step):
    kind = step["event"]
    x, y = step.get("x", 0), step.get("y", 0)
    if kind == "dblclick":
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
        QApplication.sendEvent(widget, QContextMenuEvent(QContextMenuEvent.Reason.Mouse, QPoint(x, y)))
    else:
        raise ValueError(kind)


def slider_of(kind, width, start):
    name, maximum = NAMES[kind]
    slider = fftw.FFTThresholdSlider(channel_name=name, minimum=0, maximum=maximum)
    slider.resize(width, 60)
    if start:
        slider.set_indicators(start)
    return slider


def scenario(name, kind, width, start, steps):
    slider = slider_of(kind, width, start)
    recorded = []
    for step in steps:
        send(slider, step)
        recorded.append({**step, "markers": slider.get_indicators(), "dragging": slider.dragging_index})
    return {"name": name, "kind": kind, "width": width, "start": start, "steps": recorded}


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


def paint(name, kind, width, markers, dragging):
    slider = slider_of(kind, width, markers)
    slider.dragging_index = dragging
    real_fft, real_base = fftw.QPainter if hasattr(fftw, "QPainter") else None, None
    # The FFT slider imports QPainter inside paintEvent (lines 30-31), from PyQt6.QtGui itself.
    import PyQt6.QtGui as gui

    real = gui.QPainter
    gui.QPainter = RecordingPainter
    try:
        slider.paintEvent(None)
    finally:
        gui.QPainter = real
    del real_fft, real_base
    return {"name": name, "kind": kind, "width": width, "markers": markers, "dragging": dragging, "calls": RecordingPainter.calls}


def widget_scenario():
    """The checkbox: a disabled slider refuses input, ticking enables both, unticking clears both."""
    widget = fftw.FFTThresholdWidget()
    widget.frequency_slider.resize(296, 60)
    widget.intensity_slider.resize(296, 60)
    emitted = []
    widget.fft_threshold_changed.connect(lambda: emitted.append(True))
    recorded = []

    def note(step):
        recorded.append(
            {
                **step,
                "checked": widget.enable_checkbox.isChecked(),
                "frequency": widget.frequency_slider.get_indicators(),
                "intensity": widget.intensity_slider.get_indicators(),
                "frequencyThresholds": list(widget.frequency_thresholds),
                "intensityThresholds": list(widget.intensity_thresholds),
                "emitted": len(emitted),
            }
        )

    for step in [
        {"event": "dblclick", "slider": "frequency", "x": 148, "y": 30},
        {"event": "check"},
        {"event": "dblclick", "slider": "frequency", "x": 148, "y": 30},
        {"event": "dblclick", "slider": "intensity", "x": 60, "y": 30},
        {"event": "dblclick", "slider": "frequency", "x": 60, "y": 30},
        {"event": "uncheck"},
        {"event": "check"},
    ]:
        emitted.clear()
        if step["event"] == "check":
            widget.enable_checkbox.setChecked(True)
        elif step["event"] == "uncheck":
            widget.enable_checkbox.setChecked(False)
        else:
            target = widget.frequency_slider if step["slider"] == "frequency" else widget.intensity_slider
            send(target, step)
        note(step)
    return recorded


def statuses():
    """What the status line says for each kind of image the widget can be given."""
    widget = fftw.FFTThresholdWidget()
    out = [{"image": "none", "text": widget.status_label.text(), "style": widget.status_label.styleSheet()}]
    gray = np.arange(64, dtype=np.uint8).reshape(8, 8)
    for name, array in [
        ("gray", gray),
        ("gray stored as RGB", np.stack([gray, gray, gray], axis=2)),
        ("colour", np.stack([gray, 255 - gray, gray // 2], axis=2)),
        ("four channels", np.stack([gray, 255 - gray, gray // 2, gray], axis=2)),
    ]:
        widget.enable_checkbox.setChecked(True)
        widget.update_fft_threshold_for_image(array)
        out.append(
            {
                "image": name,
                "text": widget.status_label.text(),
                "style": widget.status_label.styleSheet(),
                "checkedAfter": widget.enable_checkbox.isChecked(),
                "active": widget.is_active(),
            }
        )
    widget.update_fft_threshold_for_image(None)
    out.append({"image": "none again", "text": widget.status_label.text(), "style": widget.status_label.styleSheet()})
    return out


def texts():
    widget = fftw.FFTThresholdWidget()
    from PyQt6.QtWidgets import QGroupBox, QLabel

    group = widget.findChild(QGroupBox)
    labels = [label.text() for label in widget.findChildren(QLabel)]
    return {
        "group": group.title(),
        "checkbox": widget.enable_checkbox.text(),
        "labels": labels,
        "frequencyTooltip": widget.frequency_slider.toolTip(),
        "intensityTooltip": widget.intensity_slider.toolTip(),
        "labelStyles": [label.styleSheet() for label in widget.findChildren(QLabel)],
    }


def main():
    # At 296 px the track is 256 px from x=20. A frequency marker at x sits at (x - 20) / 256 x 10000.
    scenarios = [
        scenario(
            "frequency: a double-click adds a FRACTIONAL cutoff",
            "frequency",
            296,
            [],
            [
                {"event": "dblclick", "x": 148, "y": 30},
                {"event": "dblclick", "x": 33, "y": 30},
                # Within ten units (0.1%) of a marker: ignored. At 296 px a pixel is 39.06 units.
                {"event": "dblclick", "x": 148, "y": 30},
                {"event": "dblclick", "x": 149, "y": 30},
                {"event": "dblclick", "x": 275, "y": 30},
                {"event": "dblclick", "x": 19, "y": 30},
                {"event": "dblclick", "x": 20, "y": 30},
                {"event": "dblclick", "x": 200, "y": 24},
            ],
        ),
        scenario(
            "frequency: a narrow bar",
            "frequency",
            200,
            [],
            [
                {"event": "dblclick", "x": 100, "y": 30},
                {"event": "dblclick", "x": 101, "y": 30},
                {"event": "dblclick", "x": 179, "y": 30},
            ],
        ),
        scenario(
            "frequency: a drag follows the pointer, fractional, clamped to 0 and 10000",
            "frequency",
            296,
            [1000.0, 5000.0],
            [
                {"event": "press", "x": 150, "y": 30},
                {"event": "move", "x": 90, "y": 30},
                {"event": "move", "x": 91, "y": 52},
                {"event": "move", "x": -40, "y": 30},
                {"event": "move", "x": 500, "y": 30},
                {"event": "release", "x": 500, "y": 30},
                {"event": "press", "x": 45, "y": 30},
                {"event": "move", "x": 262, "y": 30},
                {"event": "release", "x": 262, "y": 30},
            ],
        ),
        scenario(
            "frequency: right-click removes, the first in list order, and can remove the last one",
            "frequency",
            296,
            [1000.0, 1200.0, 8000.0],
            [
                {"event": "context", "x": 100, "y": 30},
                {"event": "context", "x": 47, "y": 30},
                {"event": "context", "x": 224, "y": 30},
                {"event": "context", "x": 51, "y": 30},
            ],
        ),
        scenario(
            "intensity: whole levels, 0 to 255",
            "intensity",
            296,
            [],
            [
                {"event": "dblclick", "x": 148, "y": 30},
                {"event": "dblclick", "x": 139, "y": 30},
                {"event": "dblclick", "x": 138, "y": 30},
                {"event": "dblclick", "x": 275, "y": 30},
                {"event": "dblclick", "x": 20, "y": 30},
                {"event": "press", "x": 148, "y": 30},
                {"event": "move", "x": 400, "y": 30},
                {"event": "release", "x": 400, "y": 30},
                {"event": "context", "x": 276, "y": 30},
            ],
        ),
    ]

    paints = [
        paint("frequency, empty", "frequency", 296, [], -1),
        paint("frequency, three cutoffs", "frequency", 296, [1000.0, 3906.25, 9999.9], -1),
        # Python's round() goes to even on an exact half: 2.5% writes 2%, 3.5% writes 4%, 37.5% 38%.
        paint("frequency, labels on halves", "frequency", 296, [250.0, 350.0, 3750.0, 4650.0], -1),
        paint("frequency, one dragged, crowded labels", "frequency", 296, [5000.0, 5100.0, 5200.0], 1),
        paint("frequency, unsorted after a drag", "frequency", 296, [7000.0, 2000.0], 0),
        paint("intensity, empty", "intensity", 296, [], -1),
        paint("intensity, three levels", "intensity", 296, [60, 128, 200], -1),
        paint("intensity, narrow, one dragged", "intensity", 200, [30, 225], 1),
    ]

    out = HERE / "legacy-fft-slider.json"
    out.write_text(
        json.dumps(
            {
                "scenarios": scenarios,
                "paints": paints,
                "widget": widget_scenario(),
                "statuses": statuses(),
                "texts": texts(),
            },
            indent=1,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
