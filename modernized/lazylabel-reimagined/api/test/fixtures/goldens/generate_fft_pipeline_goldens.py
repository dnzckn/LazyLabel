"""Golden pixels for legacy's FFT Threshold section, from legacy's own pipeline.

Run with the app venv, from this directory:

    E:/venv/lazylabel/Scripts/python.exe generate_fft_pipeline_goldens.py

Nothing below is transcribed. `legacy-fft.json` beside this holds the filter alone, from a copy
of its code on numpy's FFT; these cases run legacy's own `FFTThresholdWidget` (scipy's FFT, as the
application imports it) inside legacy's own `ImageAdjustmentManager`, on PNG files written here, so
each goes through the path the application takes:

  1. `update_channel_threshold_for_image` feeds the widgets the image (lines 489-544 of
     `image_adjustment_manager.py`): an effectively-gray colour file becomes its first channel, and
     the FFT widget is told whether the image is grayscale (`fft_threshold_widget.py:270-326`).
  2. The box is ticked and the thresholds set through the sliders' own `set_indicators`, as a drag
     or a double-click leaves them (lines 236-263), a rescale window or channel markers first where
     a case has them.
  3. `get_current_modified_image` produces the pixels (lines 604-643): rescale, channel threshold,
     then the FFT, each inside the crop when there is one, then the 16-bit conversion.

The cases are the ones the web's port could get wrong: the box ticked with no thresholds (the
transform and back, then stretched to 0..255), fractional cutoffs, a value exactly on an intensity
threshold, odd sizes, 16-bit, and a crop -- on a 16-bit image, legacy's crop region comes out black,
because the filter's 8-bit result is written into the 16-bit image and divided by 256 with the rest.

Nothing is written into the legacy tree: bytecode writing is off before anything is loaded.
"""

import base64
import importlib
import importlib.util
import json
import os
import pathlib
import sys
import tempfile
import types
from types import SimpleNamespace

sys.dont_write_bytecode = True
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import cv2  # noqa: E402
import numpy as np  # noqa: E402
from PyQt6.QtGui import QPixmap  # noqa: E402
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
package = types.ModuleType("legacy_widgets")
package.__path__ = [str(legacy_source() / "lazylabel" / "ui" / "widgets")]
sys.modules["legacy_widgets"] = package
ctw = importlib.import_module("legacy_widgets.channel_threshold_widget")
rsw = importlib.import_module("legacy_widgets.rescale_widget")
fftw = importlib.import_module("legacy_widgets.fft_threshold_widget")
iam = load("ui/managers/image_adjustment_manager.py", "legacy_image_adjustment_manager")


class Panel:
    """The control-panel calls the manager makes, forwarded to legacy's own widgets."""

    def __init__(self):
        self.threshold = ctw.ChannelThresholdWidget()
        self.rescale = rsw.RescaleWidget()
        self.fft = fftw.FFTThresholdWidget()

    def update_channel_threshold_for_image(self, image_array):
        self.threshold.update_for_image(image_array)

    def update_rescale_for_image(self, image_array, crop_coords=None):
        self.rescale.update_for_image(image_array, crop_coords)

    def update_fft_threshold_for_image(self, image_array):
        self.fft.update_fft_threshold_for_image(image_array)

    def auto_collapse_fft_threshold_for_image(self, *_args):
        pass

    def get_channel_threshold_widget(self):
        return self.threshold

    def get_rescale_widget(self):
        return self.rescale

    def get_fft_threshold_widget(self):
        return self.fft


def legacy_view(path, case):
    panel = Panel()
    window = SimpleNamespace(
        current_image_path=str(path),
        control_panel=panel,
        crop_manager=SimpleNamespace(current_crop_coords=case.get("crop")),
    )
    manager = iam.ImageAdjustmentManager.__new__(iam.ImageAdjustmentManager)
    manager.mw = window
    manager._cached_original_image = None
    manager._cached_multi_view_original_images = None
    manager.update_channel_threshold_for_image(QPixmap(str(path)))

    if case.get("window") is not None:
        # Where a drag of the two handles leaves them (rescale_widget.py:155-166).
        panel.rescale.slider._min_val, panel.rescale.slider._max_val = case["window"]
    for name, values in case.get("markers", {}).items():
        bar = panel.threshold.sliders[name]
        bar.checkbox.setChecked(True)
        bar.slider.set_indicators(values)

    panel.fft.enable_checkbox.setChecked(True)
    panel.fft.frequency_slider.set_indicators(list(case.get("frequencies", [])))
    panel.fft.intensity_slider.set_indicators(list(case.get("intensities", [])))

    view = manager.get_current_modified_image()
    if view.ndim == 2:
        view = np.stack([view, view, view], axis=2)
    return panel.fft.is_active(), view


def write_png(folder, name, array):
    """cv2 writes BGR, so colour is reordered first: the file holds the RGB meant here."""
    if array.ndim == 3:
        array = cv2.cvtColor(array, cv2.COLOR_RGB2BGR)
    path = pathlib.Path(folder) / f"{name}.png"
    assert cv2.imwrite(str(path), array), name
    return path


def images():
    rng = np.random.default_rng(47)

    def natural(h, w, low, high, dtype):
        y, x = np.mgrid[:h, :w]
        base = 0.5 + 0.3 * np.sin(x / 4.0) * np.cos(y / 6.0) + 0.15 * np.sin((x + 2 * y) / 1.7)
        base = base + rng.normal(0, 0.05, (h, w))
        base = (base - base.min()) / (base.max() - base.min())
        return np.round(low + base * (high - low)).astype(dtype)

    gray8 = natural(40, 48, 20, 160, np.uint8)
    # Exactly 0 to 255: the stretch after the transform lands on whole numbers, where the last bits
    # of the transform decide which way a pixel truncates.
    full8 = natural(32, 32, 0, 255, np.uint8)
    odd8 = natural(23, 31, 10, 240, np.uint8)
    gray16 = natural(30, 40, 3000, 60000, np.uint16)
    near = np.stack(
        [gray8, np.clip(gray8.astype(int) + 2, 0, 255), np.clip(gray8.astype(int) - 1, 0, 255)], axis=2
    ).astype(np.uint8)
    colour = np.stack([gray8, 255 - gray8, gray8 // 2 + 30], axis=2).astype(np.uint8)
    return {"gray8": gray8, "full8": full8, "odd8": odd8, "gray16": gray16, "neargray8": near, "rgb8": colour}


CASES = [
    {"image": "gray8"},
    {"image": "full8"},
    {"image": "odd8"},
    {"image": "gray16"},
    {"image": "gray8", "frequencies": [1000]},
    {"image": "gray8", "frequencies": [507.8125, 5000.0]},
    {"image": "gray8", "frequencies": [1000, 1000]},
    {"image": "gray8", "frequencies": [3906.25, 390.625, 7812.5]},
    {"image": "gray8", "intensities": [100]},
    {"image": "full8", "intensities": [60, 180]},
    {"image": "full8", "intensities": [127, 127]},
    {"image": "gray8", "frequencies": [2000], "intensities": [100, 101, 200]},
    {"image": "odd8", "frequencies": [1500]},
    {"image": "odd8", "frequencies": [1500], "intensities": [128]},
    {"image": "gray16", "frequencies": [800]},
    {"image": "gray16", "intensities": [90]},
    {"image": "gray8", "frequencies": [1000], "crop": (5, 4, 30, 25)},
    {"image": "gray8", "crop": (5, 4, 30, 25)},
    {"image": "gray16", "frequencies": [800], "crop": (5, 4, 30, 25)},
    {"image": "neargray8", "frequencies": [1000]},
    {"image": "rgb8", "frequencies": [1000], "intensities": [100]},
    {"image": "gray8", "window": (40, 120), "frequencies": [1000]},
    {"image": "gray8", "markers": {"Gray": [100]}, "frequencies": [1500], "intensities": [128]},
]


def number(value):
    """A threshold as the web sends it: fractions kept, whole numbers without a point."""
    value = float(value)
    return str(int(value)) if value.is_integer() else repr(value)


def query_for(case):
    parts = []
    if case.get("window") is not None:
        parts += [f"rescaleMin={case['window'][0]}", f"rescaleMax={case['window'][1]}"]
    for values in case.get("markers", {}).values():
        parts.append("markers_gray=" + ",".join(str(v) for v in sorted(values)))
    parts.append("fft=1")
    if case.get("frequencies"):
        parts.append("frequencies=" + ",".join(number(v) for v in sorted(case["frequencies"])))
    if case.get("intensities"):
        parts.append("intensities=" + ",".join(number(v) for v in sorted(case["intensities"])))
    if case.get("crop") is not None:
        parts.append("crop=" + ",".join(str(v) for v in case["crop"]))
    return "&".join(parts)


def main():
    made = images()
    cases = []
    with tempfile.TemporaryDirectory() as folder:
        paths = {name: write_png(folder, name, array) for name, array in made.items()}
        for case in CASES:
            active, view = legacy_view(paths[case["image"]], case)
            cases.append(
                {
                    "image": case["image"],
                    "frequencies": list(case.get("frequencies", [])),
                    "intensities": list(case.get("intensities", [])),
                    "crop": list(case["crop"]) if case.get("crop") is not None else None,
                    "window": list(case["window"]) if case.get("window") is not None else None,
                    "markers": case.get("markers", {}),
                    "active": bool(active),
                    "query": query_for(case),
                    "width": int(view.shape[1]),
                    "height": int(view.shape[0]),
                    "rgb": base64.b64encode(np.ascontiguousarray(view).tobytes()).decode("ascii"),
                }
            )
        pngs = {name: base64.b64encode(path.read_bytes()).decode("ascii") for name, path in paths.items()}

    out = HERE / "legacy-fft-pipeline.json"
    out.write_text(json.dumps({"images": pngs, "cases": cases}, indent=1) + "\n")
    print(f"wrote {out} with {len(cases)} cases")


if __name__ == "__main__":
    main()
