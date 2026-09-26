"""Golden behaviour of legacy's Rescale histogram dialog, recorded from the dialog itself.

Run with the app venv, from this directory:

    E:/venv/lazylabel/Scripts/python.exe generate_rescale_histogram_goldens.py

Nothing below is transcribed. `ui/widgets/rescale_histogram_dialog.py` is imported from the
read-only snapshot (2a7d5d8) and driven on an offscreen platform, so what lands in
`legacy-rescale-histogram.json` is what the dialog actually does:

  - its size, and its canvas's size, at the size it opens at (lines 332-334)
  - every paint call the histogram canvas makes for a given state, captured by standing a
    recording painter in for QPainter: bars, preview outlines, border, min and max lines, handles,
    axis labels, the rotated y label and the value labels (lines 159-272)
  - the min and max after each press, move and release on the canvas, sent as real Qt events
    (lines 274-303)
  - what Contrast Stretch sets for each slider value, and the label it writes (lines 506-528)
  - the labels Equalize and CLAHE write, and CLAHE re-running when Clip or Tile change (530-564)
  - the Linear/Log button's text and the stats line (346-365, 458-462, 500-502)
  - what Apply sends in each state (576-581)

The images are the ones `api/test/fixtures/goldens/generate_rescale_preset_goldens.py` writes, made
the same way, and the level counts of each region are recorded so the web test can answer the
histogram request with exactly what the dialog was given.

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
from PyQt6.QtCore import QEvent, QPointF, Qt  # noqa: E402
from PyQt6.QtGui import QBrush, QColor, QMouseEvent, QPainter, QPen  # noqa: E402
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
rhd = importlib.import_module("legacy_widgets.rescale_histogram_dialog")

LEFT = Qt.MouseButton.LeftButton
NO_BUTTON = Qt.MouseButton.NoButton


def images():
    """The API generator's images, made the same way (same seed, same order of draws)."""
    rng = np.random.default_rng(31)
    y, x = np.mgrid[:20, :24]
    gray8 = 40 + 25 * np.sin(x / 3.0) * np.cos(y / 4.0) + rng.normal(0, 6, (20, 24))
    gray8[2, 3] = 250
    gray8[15, 20] = 5
    gray8 = np.clip(np.round(gray8), 0, 255).astype(np.uint8)

    y16, x16 = np.mgrid[:18, :20]
    gray16 = 4000 + 900 * np.sin(x16 / 2.5) * np.cos(y16 / 3.5) + rng.normal(0, 60, (18, 20))
    gray16[1, 1] = 65535
    gray16[16, 18] = 0
    gray16 = np.clip(np.round(gray16), 0, 65535).astype(np.uint16)
    return {"gray8": gray8, "gray16": gray16}


def levels(array):
    values, counts = np.unique(array.ravel(), return_counts=True)
    return [[int(v), int(c)] for v, c in zip(values, counts)]


def dialog_for(image, current=(None, None)):
    top = 65535 if image.dtype == np.uint16 else 255
    lo = 0 if current[0] is None else current[0]
    hi = top if current[1] is None else current[1]
    return rhd.RescaleHistogramDialog(image, data_min=0, data_max=top, current_min=lo, current_max=hi)


# ---- The canvas's paint calls ----------------------------------------------------------------------


def colour_of(colour):
    return list(colour.getRgb())


class RecordingPainter:
    """Stands in for QPainter inside `paintEvent` and writes down what it is asked to draw."""

    RenderHint = QPainter.RenderHint
    calls = []

    def __init__(self, _device):
        self._pen = QPen()
        self._brush = QBrush()
        self._translate = [0, 0]
        self._rotate = 0
        self._saved = []
        RecordingPainter.calls = []

    def setRenderHint(self, *_args):
        pass

    def setPen(self, pen):
        self._pen = QPen(pen)

    def setBrush(self, brush):
        self._brush = QBrush(brush)

    def save(self):
        self._saved.append((list(self._translate), self._rotate))

    def restore(self):
        self._translate, self._rotate = self._saved.pop()

    def translate(self, x, y):
        self._translate = [self._translate[0] + x, self._translate[1] + y]

    def rotate(self, degrees):
        self._rotate += degrees

    def _pen_of(self):
        pen = self._pen
        if pen.style() == Qt.PenStyle.NoPen:
            return None
        style = {Qt.PenStyle.SolidLine: "solid", Qt.PenStyle.DashLine: "dash"}[pen.style()]
        return {"rgba": colour_of(pen.color()), "width": pen.width(), "style": style}

    def _brush_of(self):
        brush = self._brush
        if brush.style() == Qt.BrushStyle.NoBrush:
            return None
        return {"rgba": colour_of(brush.color())}

    def fillRect(self, rect, colour):
        RecordingPainter.calls.append(
            {"op": "fillRect", "x": rect.x(), "y": rect.y(), "width": rect.width(), "height": rect.height(),
             "brush": {"rgba": colour_of(QColor(colour))}}
        )

    def drawRect(self, rect):
        RecordingPainter.calls.append(
            {"op": "rect", "x": rect.x(), "y": rect.y(), "width": rect.width(), "height": rect.height(),
             "pen": self._pen_of(), "brush": self._brush_of()}
        )

    def drawLine(self, x1, y1, x2, y2):
        RecordingPainter.calls.append({"op": "line", "x1": x1, "y1": y1, "x2": x2, "y2": y2, "pen": self._pen_of()})

    def drawPolygon(self, polygon):
        points = [[polygon.point(i).x(), polygon.point(i).y()] for i in range(polygon.count())]
        RecordingPainter.calls.append({"op": "polygon", "points": points, "pen": self._pen_of(), "brush": self._brush_of()})

    def drawText(self, x, y, text):
        RecordingPainter.calls.append(
            {"op": "text", "x": x, "y": y, "text": text, "pen": self._pen_of(),
             "translate": list(self._translate), "rotate": self._rotate}
        )


def paint(canvas):
    real = rhd.QPainter
    rhd.QPainter = RecordingPainter
    try:
        canvas.paintEvent(None)
    finally:
        rhd.QPainter = real
    return RecordingPainter.calls


# ---- Events on the canvas --------------------------------------------------------------------------


def mouse(kind, x, y, button, buttons):
    point = QPointF(x, y)
    return QMouseEvent(kind, point, point, button, buttons, Qt.KeyboardModifier.NoModifier)


def send(widget, step):
    kind = step["event"]
    x, y = step["x"], step["y"]
    if kind == "press":
        QApplication.sendEvent(widget, mouse(QEvent.Type.MouseButtonPress, x, y, LEFT, LEFT))
    elif kind == "move":
        QApplication.sendEvent(widget, mouse(QEvent.Type.MouseMove, x, y, NO_BUTTON, LEFT))
    elif kind == "release":
        QApplication.sendEvent(widget, mouse(QEvent.Type.MouseButtonRelease, x, y, LEFT, NO_BUTTON))
    else:
        raise ValueError(kind)


def main():
    made = images()
    out = {"images": {}}
    for name, array in made.items():
        top = 65535 if array.dtype == np.uint16 else 255
        # What the dialog's CLAHE makes of the image for each Clip and Tile the tests press it with,
        # from legacy's own `_build_clahe_lut_image` (lines 50-73): the web asks the server for these.
        clahe = {}
        for clip, tile in [(2.0, 8), (3.5, 4), (2.5, 8), (2.5, 4), (40.0, 4), (6.5, 8)]:
            clahe[f"{clip}:{tile}"] = levels(rhd._build_clahe_lut_image(array, clip, tile, top))
        out["images"][name] = {
            "depth": 16 if array.dtype == np.uint16 else 8,
            "pixels": int(array.size),
            "min": int(array.min()),
            "max": int(array.max()),
            "levels": levels(array),
            "clahe": clahe,
        }

    # ---- The dialog's size, and its canvas's, as it opens.
    probe = dialog_for(made["gray8"])
    probe.show()
    APP.processEvents()
    out["layout"] = {
        "dialog": [probe.width(), probe.height()],
        "canvas": [probe.canvas.width(), probe.canvas.height()],
        "minimumDialog": [probe.minimumWidth(), probe.minimumHeight()],
        "minimumCanvas": [probe.canvas.minimumWidth(), probe.canvas.minimumHeight()],
    }
    width, height = probe.canvas.width(), probe.canvas.height()
    probe.close()

    # ---- Paints.
    paints = []

    def record(name, image_name, current=(None, None), action=None, log=True, dragging=None):
        dialog = dialog_for(made[image_name], current)
        dialog.canvas.resize(width, height)
        if action is not None:
            action(dialog)
        if not log:
            dialog._toggle_log()
        dialog.canvas._dragging = dragging
        paints.append(
            {
                "name": name,
                "image": image_name,
                "current": list(current),
                "log": log,
                "dragging": dragging,
                "min": dialog.canvas._min_val,
                "max": dialog.canvas._max_val,
                "calls": paint(dialog.canvas),
            }
        )

    def equalize(dialog):
        dialog.btn_equalize.click()

    def clahe(clip, tile):
        def act(dialog):
            dialog.clahe_clip_spin.setValue(clip)
            dialog.clahe_tile_spin.setValue(tile)
            dialog.btn_clahe.click()

        return act

    def stretch(value):
        def act(dialog):
            dialog.stretch_slider.setValue(value)

        return act

    record("8-bit, as it opens: log scale, the full range", "gray8")
    record("8-bit, linear scale", "gray8", log=False)
    record("8-bit, a window from the slider", "gray8", current=(30, 90))
    record("8-bit, after Contrast Stretch at 3.5%", "gray8", action=stretch(35))
    record("8-bit, Equalize's preview in orange", "gray8", action=equalize)
    record("8-bit, Equalize's preview, linear scale", "gray8", action=equalize, log=False)
    record("8-bit, the max line being dragged", "gray8", current=(30, 90), dragging="max")
    record("8-bit, the min line being dragged", "gray8", current=(30, 90), dragging="min")
    record("16-bit, as it opens", "gray16")
    record("16-bit, CLAHE's preview", "gray16", action=clahe(2.0, 8))
    record("16-bit, a window", "gray16", current=(3000, 5200), log=False)
    out["paints"] = paints

    # ---- Events: press within 8 px of a line, drag without an offset, the lines cannot cross.
    scenarios = []

    def scenario(name, image_name, current, steps):
        dialog = dialog_for(made[image_name], current)
        dialog.canvas.resize(width, height)
        recorded = []
        for step in steps:
            send(dialog.canvas, step)
            recorded.append(
                {
                    **step,
                    "min": dialog.canvas._min_val,
                    "max": dialog.canvas._max_val,
                    "dragging": dialog.canvas._dragging,
                    "minLabel": dialog.min_label.text(),
                    "maxLabel": dialog.max_label.text(),
                }
            )
        scenarios.append({"name": name, "image": image_name, "current": list(current), "steps": recorded})

    left, top = rhd.HistogramCanvas.MARGIN_LEFT, rhd.HistogramCanvas.MARGIN_TOP
    plot_w = width - rhd.HistogramCanvas.MARGIN_LEFT - rhd.HistogramCanvas.MARGIN_RIGHT
    plot_h = height - rhd.HistogramCanvas.MARGIN_TOP - rhd.HistogramCanvas.MARGIN_BOTTOM
    bottom = top + plot_h - 1

    def x_of(value, top_value):
        return left + int(value / top_value * plot_w)

    x30, x90 = x_of(30, 255), x_of(90, 255)
    scenarios_steps = [
        (
            "drag the max line down past the min line: it stops there",
            "gray8",
            (30, 90),
            [
                {"event": "press", "x": x90 + 8, "y": top + 20},
                {"event": "move", "x": x90 - 100, "y": top + 20},
                {"event": "move", "x": x30 - 50, "y": bottom + 60},
                {"event": "release", "x": x30 - 50, "y": bottom + 60},
            ],
        ),
        (
            "drag the min line up, and to the ends",
            "gray8",
            (30, 90),
            [
                {"event": "press", "x": x30 - 8, "y": bottom + 15},
                {"event": "move", "x": x30 + 40, "y": bottom},
                {"event": "move", "x": -100, "y": bottom},
                {"event": "release", "x": -100, "y": bottom},
                {"event": "press", "x": left, "y": top - 5},
                {"event": "move", "x": x90 + 300, "y": top},
                {"event": "release", "x": x90 + 300, "y": top},
            ],
        ),
        (
            "presses that miss: 9 px off, above the plot, below the handles",
            "gray8",
            (30, 90),
            [
                {"event": "press", "x": x90 + 9, "y": top + 20},
                {"event": "move", "x": x90 + 60, "y": top + 20},
                {"event": "release", "x": x90 + 60, "y": top + 20},
                {"event": "press", "x": x30, "y": top - 6},
                {"event": "move", "x": x30 + 60, "y": top},
                {"event": "release", "x": x30 + 60, "y": top},
                {"event": "press", "x": x30, "y": bottom + 16},
                {"event": "move", "x": x30 + 60, "y": bottom},
                {"event": "release", "x": x30 + 60, "y": bottom},
            ],
        ),
        (
            "lines together: the max line takes the press",
            "gray8",
            (60, 60),
            [
                {"event": "press", "x": x_of(60, 255), "y": top + 50},
                {"event": "move", "x": x_of(20, 255), "y": top + 50},
                {"event": "move", "x": x_of(200, 255), "y": top + 50},
                {"event": "release", "x": x_of(200, 255), "y": top + 50},
            ],
        ),
        (
            "16-bit",
            "gray16",
            (0, 65535),
            [
                {"event": "press", "x": left + plot_w, "y": top + 50},
                {"event": "move", "x": left + plot_w // 2, "y": top + 50},
                {"event": "move", "x": left + plot_w // 2 + 1, "y": top + 50},
                {"event": "release", "x": left + plot_w // 2 + 1, "y": top + 50},
            ],
        ),
    ]
    for name, image_name, current, steps in scenarios_steps:
        scenario(name, image_name, current, steps)
    out["scenarios"] = scenarios

    # ---- Contrast Stretch, for a spread of slider values.
    stretches = []
    for image_name in ("gray8", "gray16"):
        dialog = dialog_for(made[image_name])
        for value in [0, 1, 2, 3, 5, 7, 10, 12, 35, 49, 50, 100, 123, 250, 333, 499, 500, 4]:
            dialog.stretch_slider.setValue(value)
            stretches.append(
                {
                    "image": image_name,
                    "slider": value,
                    "min": dialog.canvas._min_val,
                    "max": dialog.canvas._max_val,
                    "valueLabel": dialog.stretch_value_label.text(),
                    "presetLabel": dialog.preset_label.text(),
                }
            )
    out["stretches"] = stretches

    # ---- Everything else a user reads, and what Apply sends.
    texts = []
    for image_name in ("gray8", "gray16"):
        dialog = dialog_for(made[image_name])
        record_texts = {
            "image": image_name,
            "title": dialog.windowTitle(),
            "stats": dialog.stats_label.text(),
            "min": dialog.min_label.text(),
            "max": dialog.max_label.text(),
            "stretchValue": dialog.stretch_value_label.text(),
            "log": [dialog.log_btn.text()],
        }
        dialog._toggle_log()
        record_texts["log"].append(dialog.log_btn.text())
        dialog._toggle_log()
        record_texts["log"].append(dialog.log_btn.text())
        dialog.btn_equalize.click()
        record_texts["equalize"] = dialog.preset_label.text()
        dialog.clahe_clip_spin.setValue(2.5)
        record_texts["equalizeAfterClip"] = dialog.preset_label.text()
        dialog.btn_clahe.click()
        record_texts["clahe"] = dialog.preset_label.text()
        dialog.clahe_tile_spin.setValue(4)
        record_texts["claheAfterTile"] = dialog.preset_label.text()
        dialog.clahe_clip_spin.setValue(40.0)
        record_texts["claheAfterClip"] = dialog.preset_label.text()
        record_texts["tooltips"] = {
            "stretch": dialog.stretch_slider.toolTip(),
            "equalize": dialog.btn_equalize.toolTip(),
            "clahe": dialog.btn_clahe.toolTip(),
            "clip": dialog.clahe_clip_spin.toolTip(),
            "tile": dialog.clahe_tile_spin.toolTip(),
            "log": dialog.log_btn.toolTip(),
        }
        record_texts["ranges"] = {
            "stretch": [dialog.stretch_slider.minimum(), dialog.stretch_slider.maximum(), 4],
            "clip": [dialog.clahe_clip_spin.minimum(), dialog.clahe_clip_spin.maximum(), dialog.clahe_clip_spin.singleStep(), dialog.clahe_clip_spin.decimals()],
            "tile": [dialog.clahe_tile_spin.minimum(), dialog.clahe_tile_spin.maximum()],
        }
        texts.append(record_texts)
    out["texts"] = texts

    applies = []

    def apply_case(name, image_name, current, act):
        dialog = dialog_for(made[image_name], current)
        dialog.canvas.resize(width, height)
        sent = []
        dialog.applied.connect(lambda lo, hi: sent.append({"signal": "applied", "min": lo, "max": hi}))
        dialog.lut_applied.connect(lambda _lut, name: sent.append({"signal": "lut_applied", "name": name}))
        act(dialog)
        dialog.apply_btn.click()
        applies.append({"name": name, "image": image_name, "current": list(current), "sent": sent})

    def drag_min_to(value):
        def act(dialog):
            x = x_of(dialog.canvas._min_val, 255)
            send(dialog.canvas, {"event": "press", "x": x, "y": top + 20})
            send(dialog.canvas, {"event": "move", "x": x_of(value, 255), "y": top + 20})
            send(dialog.canvas, {"event": "release", "x": x_of(value, 255), "y": top + 20})

        return act

    apply_case("nothing touched: the lines as they opened", "gray8", (30, 90), lambda d: None)
    apply_case("Equalize", "gray8", (0, 255), lambda d: d.btn_equalize.click())
    apply_case("CLAHE", "gray8", (0, 255), clahe(3.5, 4))
    apply_case("Equalize, then a line dragged: the lines win", "gray8", (0, 255),
               lambda d: (d.btn_equalize.click(), drag_min_to(60)(d)))
    apply_case("Contrast Stretch", "gray8", (0, 255), stretch(10))
    apply_case("Equalize, then Contrast Stretch: the stretch wins", "gray8", (0, 255),
               lambda d: (d.btn_equalize.click(), stretch(10)(d)))
    apply_case("Contrast Stretch, then CLAHE: CLAHE wins", "gray8", (0, 255),
               lambda d: (stretch(10)(d), clahe(2.0, 8)(d)))
    apply_case("CLAHE, then Clip changed: CLAHE again with the new clip", "gray16", (0, 65535),
               lambda d: (clahe(2.0, 8)(d), d.clahe_clip_spin.setValue(6.5)))
    out["applies"] = applies

    target = HERE / "legacy-rescale-histogram.json"
    # Compact: thousands of paint calls, and indenting them doubles the file.
    target.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
