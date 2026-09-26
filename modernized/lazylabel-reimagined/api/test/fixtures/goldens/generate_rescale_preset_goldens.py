"""Golden pixels for legacy's Rescale histogram dialog, from legacy's own pipeline.

Run with the app venv, from this directory:

    E:/venv/lazylabel/Scripts/python.exe generate_rescale_preset_goldens.py

Nothing below is transcribed. Each case goes through the path the application takes when the Hist
button is pressed (L ui/main_window.py:2786-2825), with legacy's own classes loaded from the
read-only snapshot (2a7d5d8):

  1. `ImageAdjustmentManager.update_channel_threshold_for_image` feeds the widgets the image
     (`image_adjustment_manager.py:489-544`), collapsing an effectively-gray colour file to its
     first channel.
  2. A `RescaleHistogramDialog` is built on the rescale widget's image region, the crop when there
     is one (`rescale_widget.py:420-430`), with the slider's values, exactly as
     `_on_rescale_histogram_requested` builds it (main_window.py:2794-2804).
  3. The case's action is done through the dialog's own controls: the Equalize or CLAHE button
     (with its Clip and Tile boxes set first), or the Contrast Stretch slider. Apply is pressed.
  4. Apply's two signals go where main_window sends them: `applied` to the rescale widget's
     `set_values_from_histogram`, and `lut_applied` to `_apply_rescale_lut`, which is taken from
     main_window.py itself (lines 2809-2825), not rewritten here.
  5. A crop drawn AFTER Apply goes through `_on_crop_changed_for_fft` (lines 2831-2857), also
     taken from main_window.py: it drops a CLAHE result and keeps an equalization table.
  6. Channel markers or FFT thresholds are set on legacy's own widgets, and
     `get_current_modified_image` produces the pixels (`image_adjustment_manager.py:604-643`).

Also recorded, for the API's histogram route: the region the dialog is given (its level counts),
and what CLAHE makes of it, which is what the dialog previews (rescale_histogram_dialog.py:547-564).

Nothing is written into the legacy tree: bytecode writing is off before anything is loaded.
"""

import ast
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

PARAMETER = {"Gray": "markers_gray", "Red": "markers_r", "Green": "markers_g", "Blue": "markers_b"}


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


def widgets_package():
    """The snapshot's widgets folder as a package, so a widget's relative imports resolve."""
    package = types.ModuleType("legacy_widgets")
    package.__path__ = [str(legacy_source() / "lazylabel" / "ui" / "widgets")]
    sys.modules["legacy_widgets"] = package
    return package


def load(relative: str, name: str):
    path = legacy_source() / "lazylabel" / relative
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main_window_method(name: str):
    """One MainWindow method, compiled from main_window.py's own source with its line numbers."""
    path = legacy_source() / "lazylabel" / "ui" / "main_window.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    window = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "MainWindow")
    method = next(n for n in window.body if isinstance(n, ast.FunctionDef) and n.name == name)
    namespace = {"np": np}
    exec(compile(ast.Module(body=[method], type_ignores=[]), str(path), "exec"), namespace)
    return namespace[name]


APP = QApplication.instance() or QApplication([])
widgets_package()
ctw = importlib.import_module("legacy_widgets.channel_threshold_widget")
rsw = importlib.import_module("legacy_widgets.rescale_widget")
rhd = importlib.import_module("legacy_widgets.rescale_histogram_dialog")
fftw = importlib.import_module("legacy_widgets.fft_threshold_widget")
iam = load("ui/managers/image_adjustment_manager.py", "legacy_image_adjustment_manager")
apply_rescale_lut = main_window_method("_apply_rescale_lut")
on_crop_changed = main_window_method("_on_crop_changed_for_fft")


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
    crop_manager = SimpleNamespace(current_crop_coords=case.get("cropAtApply"))
    window = SimpleNamespace(
        current_image_path=str(path),
        control_panel=panel,
        crop_manager=crop_manager,
        settings=SimpleNamespace(operate_on_view=False),
    )
    manager = iam.ImageAdjustmentManager.__new__(iam.ImageAdjustmentManager)
    manager.mw = window
    manager._cached_original_image = None
    manager._cached_multi_view_original_images = None
    # _on_crop_changed_for_fft re-renders through the manager; the pixels are read below instead.
    window.image_adjustment_manager = SimpleNamespace(apply_image_processing_fast=lambda: None)
    window._mark_sam_dirty = lambda: None

    manager.update_channel_threshold_for_image(QPixmap(str(path)))
    rescale = panel.rescale

    # The Hist button (main_window.py:2786-2807).
    region = rescale.get_image_for_histogram()
    data_max = 65535 if region.dtype == np.uint16 else 255
    dialog = rhd.RescaleHistogramDialog(
        region,
        data_min=0,
        data_max=data_max,
        current_min=rescale.slider.min_val,
        current_max=rescale.slider.max_val,
    )
    dialog.applied.connect(rescale.set_values_from_histogram)
    dialog.lut_applied.connect(lambda lut, name: apply_rescale_lut(window, lut, name))

    action = case["action"]
    if action["kind"] == "equalize":
        dialog.btn_equalize.click()
    elif action["kind"] == "clahe":
        dialog.clahe_clip_spin.setValue(action["clip"])
        dialog.clahe_tile_spin.setValue(action["tile"])
        dialog.btn_clahe.click()
    elif action["kind"] == "stretch":
        # The slider opens at 4 (0.4%) and stretches only when it MOVES (lines 386-393, 506-510),
        # so each case gives the values it passes through.
        for value in action["slider"]:
            dialog.stretch_slider.setValue(value)
    else:
        raise ValueError(action)
    dialog.apply_btn.click()

    after = case.get("cropAfter", "unchanged")
    if after != "unchanged":
        crop_manager.current_crop_coords = after
        on_crop_changed(window)

    for name, values in case.get("markers", {}).items():
        bar = panel.threshold.sliders[name]
        bar.checkbox.setChecked(True)
        bar.slider.set_indicators(values)

    fft = case.get("fft")
    if fft is not None:
        panel.fft.enable_checkbox.setChecked(True)
        panel.fft.frequency_thresholds = list(fft["frequencies"])
        panel.fft.intensity_thresholds = list(fft["intensities"])

    view = manager.get_current_modified_image()
    if view.ndim == 2:
        view = np.stack([view, view, view], axis=2)

    return {
        "window": [rescale.slider.min_val, rescale.slider.max_val],
        "preset": rescale._preset_name,
        "info": rescale.info_label.text(),
        "region": region,
        "view": view,
    }


def write_png(folder, name, array):
    """cv2 writes BGR, so colour is reordered first: the file holds the RGB meant here."""
    if array.ndim == 3:
        array = cv2.cvtColor(array, cv2.COLOR_RGB2BGR)
    path = pathlib.Path(folder) / f"{name}.png"
    assert cv2.imwrite(str(path), array), name
    return path


def images():
    rng = np.random.default_rng(31)
    y, x = np.mgrid[:20, :24]

    # A dark image with its detail in a narrow band and a few bright pixels, which is what the
    # dialog exists for. 24 by 20: an 8-tile grid does not divide the height.
    gray8 = 40 + 25 * np.sin(x / 3.0) * np.cos(y / 4.0) + rng.normal(0, 6, (20, 24))
    gray8[2, 3] = 250
    gray8[15, 20] = 5
    gray8 = np.clip(np.round(gray8), 0, 255).astype(np.uint8)

    # 16-bit data between 3,000 and 5,000 with one saturated pixel and one black one.
    y16, x16 = np.mgrid[:18, :20]
    gray16 = 4000 + 900 * np.sin(x16 / 2.5) * np.cos(y16 / 3.5) + rng.normal(0, 60, (18, 20))
    gray16[1, 1] = 65535
    gray16[16, 18] = 0
    gray16 = np.clip(np.round(gray16), 0, 65535).astype(np.uint16)

    near = np.stack([gray8, np.clip(gray8.astype(int) + 2, 0, 255), np.clip(gray8.astype(int) - 1, 0, 255)], axis=2)
    colour = np.stack([gray8, 255 - gray8, (gray8 // 2 + 60)], axis=2).astype(np.uint8)
    return {
        "gray8": gray8,
        "gray16": gray16,
        "neargray8": near.astype(np.uint8),
        "rgb8": colour,
    }


def full(image):
    return [0, 0, image.shape[1], image.shape[0]]


CROP8 = (3, 2, 19, 15)
CROP8B = (2, 3, 22, 17)
CROP16 = (1, 1, 17, 15)

CASES = [
    {"image": "gray8", "action": {"kind": "equalize"}},
    {"image": "gray8", "action": {"kind": "equalize"}, "cropAtApply": CROP8},
    # The table was built from the whole image; a crop drawn afterwards keeps it (main_window.py:2837-2845
    # clears only CLAHE) and applies it inside the crop.
    {"image": "gray8", "action": {"kind": "equalize"}, "cropAfter": CROP8},
    {"image": "gray8", "action": {"kind": "clahe", "clip": 2.0, "tile": 8}},
    {"image": "gray8", "action": {"kind": "clahe", "clip": 2.0, "tile": 8}, "cropAtApply": CROP8B},
    {"image": "gray8", "action": {"kind": "clahe", "clip": 0.5, "tile": 2}},
    {"image": "gray8", "action": {"kind": "clahe", "clip": 40.0, "tile": 32}},
    {"image": "gray8", "action": {"kind": "clahe", "clip": 3.5, "tile": 5}, "cropAtApply": CROP8},
    # A crop drawn after CLAHE drops it: the image goes back to what the window says.
    {"image": "gray8", "action": {"kind": "clahe", "clip": 2.0, "tile": 8}, "cropAfter": CROP8},
    {"image": "gray16", "action": {"kind": "equalize"}},
    {"image": "gray16", "action": {"kind": "equalize"}, "cropAtApply": CROP16},
    # CLAHE on 16-bit data is done on the 16-bit values, with 65,536 bins (rescale_histogram_dialog.py:67-73).
    {"image": "gray16", "action": {"kind": "clahe", "clip": 2.0, "tile": 8}},
    {"image": "gray16", "action": {"kind": "clahe", "clip": 3.5, "tile": 4}, "cropAtApply": CROP16},
    {"image": "gray16", "action": {"kind": "clahe", "clip": 40.0, "tile": 3}},
    {"image": "neargray8", "action": {"kind": "equalize"}},
    {"image": "neargray8", "action": {"kind": "clahe", "clip": 2.0, "tile": 8}},
    # A preset sits in the rescale step, BEFORE the channel threshold (image_adjustment_manager.py:619-630).
    {"image": "gray8", "action": {"kind": "clahe", "clip": 2.0, "tile": 8}, "markers": {"Gray": [100, 180]}},
    {"image": "gray8", "action": {"kind": "equalize"}, "markers": {"Gray": [128]}, "cropAtApply": CROP8},
    {"image": "gray16", "action": {"kind": "equalize"}, "markers": {"Gray": [30000]}},
    {"image": "gray16", "action": {"kind": "clahe", "clip": 2.0, "tile": 8}, "markers": {"Gray": [20000, 45000]}},
    # And before the FFT.
    {"image": "gray8", "action": {"kind": "clahe", "clip": 2.0, "tile": 8}, "fft": {"frequencies": [1500], "intensities": []}},
    # Contrast Stretch sets the window, and Apply hands the window to the slider.
    {"image": "gray8", "action": {"kind": "stretch", "slider": [5, 4]}},
    {"image": "gray8", "action": {"kind": "stretch", "slider": [0]}},
    {"image": "gray8", "action": {"kind": "stretch", "slider": [35]}, "cropAtApply": CROP8},
    {"image": "gray16", "action": {"kind": "stretch", "slider": [10]}},
    {"image": "gray16", "action": {"kind": "stretch", "slider": [500]}},
    # Opened and applied without touching anything: the slider never moved, so nothing is stretched.
    {"image": "gray8", "action": {"kind": "stretch", "slider": []}},
]


def query_for(case, result, image):
    parts = []
    action = case["action"]
    crop_now = case.get("cropAfter", "unchanged")
    crop_now = case.get("cropAtApply") if crop_now == "unchanged" else crop_now
    if result["preset"] is not None:
        if action["kind"] == "equalize":
            source = case.get("cropAtApply") or full(image)
            parts.append("preset=equalize:" + ",".join(str(v) for v in source))
        else:
            parts.append(f"preset=clahe:{action['clip']}:{action['tile']}:{action['tile']}")
    else:
        lo, hi = result["window"]
        top = 65535 if image.dtype == np.uint16 else 255
        if not (lo == 0 and hi == top) and hi > lo:
            parts.append(f"rescaleMin={lo}")
            parts.append(f"rescaleMax={hi}")
    for name, values in case.get("markers", {}).items():
        parts.append(f"{PARAMETER[name]}={','.join(str(v) for v in sorted(values))}")
    fft = case.get("fft")
    if fft is not None:
        parts.append("fft=1")
        if fft["frequencies"]:
            parts.append("frequencies=" + ",".join(repr(float(v)) if not float(v).is_integer() else str(int(v)) for v in sorted(fft["frequencies"])))
        if fft["intensities"]:
            parts.append("intensities=" + ",".join(str(v) for v in sorted(fft["intensities"])))
    if parts and crop_now is not None:
        parts.append("crop=" + ",".join(str(v) for v in crop_now))
    return "&".join(parts)


def levels(array):
    values, counts = np.unique(array.ravel(), return_counts=True)
    return [[int(v), int(c)] for v, c in zip(values, counts)]


def histogram_cases(made):
    """What the dialog is given, and what its CLAHE preview is computed from."""
    out = []
    for image, crop, clahe in [
        ("gray8", None, None),
        ("gray8", CROP8, None),
        ("gray16", None, None),
        ("gray16", CROP16, None),
        ("neargray8", None, None),
        ("gray8", None, (2.0, 8)),
        ("gray8", CROP8B, (2.0, 8)),
        ("gray16", None, (2.0, 8)),
        ("gray16", CROP16, (3.5, 4)),
    ]:
        array = made[image]
        if array.ndim == 3:
            # The dialog's image is the rescale widget's, which is the collapsed first channel.
            array = array[:, :, 0]
        region = array if crop is None else array[crop[1]:crop[3], crop[0]:crop[2]]
        data_max = 65535 if region.dtype == np.uint16 else 255
        if clahe is not None:
            region = rhd._build_clahe_lut_image(region, clahe[0], clahe[1], data_max)
        out.append(
            {
                "image": image,
                "crop": list(crop) if crop is not None else None,
                "clahe": list(clahe) if clahe is not None else None,
                "depth": 16 if region.dtype == np.uint16 else 8,
                "pixels": int(region.size),
                "min": int(region.min()),
                "max": int(region.max()),
                "levels": levels(region),
            }
        )
    return out


def main():
    made = images()
    cases = []
    with tempfile.TemporaryDirectory() as folder:
        paths = {name: write_png(folder, name, array) for name, array in made.items()}
        for case in CASES:
            image = made[case["image"]]
            result = legacy_view(paths[case["image"]], case)
            cases.append(
                {
                    "image": case["image"],
                    "action": case["action"],
                    "cropAtApply": list(case["cropAtApply"]) if case.get("cropAtApply") else None,
                    "cropAfter": (
                        None
                        if case.get("cropAfter", "unchanged") in ("unchanged", None)
                        else list(case["cropAfter"])
                    ),
                    "markers": case.get("markers", {}),
                    "fft": case.get("fft"),
                    "window": result["window"],
                    "preset": result["preset"],
                    "info": result["info"],
                    "query": query_for(case, result, image),
                    "width": int(result["view"].shape[1]),
                    "height": int(result["view"].shape[0]),
                    "rgb": base64.b64encode(np.ascontiguousarray(result["view"]).tobytes()).decode("ascii"),
                }
            )
        pngs = {name: base64.b64encode(path.read_bytes()).decode("ascii") for name, path in paths.items()}

    out = HERE / "legacy-rescale-presets.json"
    out.write_text(
        json.dumps({"images": pngs, "cases": cases, "histograms": histogram_cases(made)}, indent=1) + "\n"
    )
    print(f"wrote {out} with {len(cases)} cases")


if __name__ == "__main__":
    main()
