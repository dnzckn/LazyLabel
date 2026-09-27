"""Golden pixels for RULE-029's channel thresholding, from legacy's own pipeline.

Run with the app venv, from this directory:

    E:/venv/lazylabel/Scripts/python.exe generate_channel_threshold_goldens.py

Nothing below is transcribed. Legacy's `ImageAdjustmentManager` and `ChannelThresholdWidget` are
imported from the read-only snapshot (2a7d5d8) and run on PNG files written here, so each case
goes through the path the application takes:

  1. `update_channel_threshold_for_image` decides which channels exist
     (`image_adjustment_manager.py:489-534`): one Gray bar when the channels agree to RULE-024's
     tolerance, three for colour, none at all for four-channel colour.
  2. The case's markers are set on those bars, with each bar's checkbox ticked.
  3. `get_current_modified_image` produces the pixels (`image_adjustment_manager.py:604-643`): it
     reads the file with cv2, collapses an effectively-gray image to its first channel, thresholds
     it inside the crop if there is one, and divides 16-bit by 256.

That array is what the viewer shows once thresholding is active (`apply_image_processing_fast`,
lines 357-424, runs the same steps) and what SAM is given under Operate On View. A 2-D result is
shown as Grayscale8, so it is widened to RGB here, which is what the API returns.

The rescale widget is legacy's own too, because a rescale runs just before the threshold and
decides which band a pixel lands in: its arithmetic is float32 (`rescale_widget.py:378-391`), and
on 16-bit data that truncates differently from float64 often enough to move a pixel across a
marker. Cases with a window set its handles the way a drag does (lines 155-166). The FFT widget is
an inactive fake; its own golden covers it.

ONE DELIBERATE DIFFERENCE. Legacy's gray test casts 16-bit samples to int16 and wraps
(`image_adjustment_manager.py:556`); the owner decided on 2026-09-27 that the web takes the true
differences instead (RULE-024). So `_is_grayscale_3ch` is replaced by the same test in int32, and a
case whose image the snapshot's own test answers differently is marked "rederived". Only `vivid16`
is: to legacy it is one Gray bar and its red channel; here, three bars and its own colours.

Nothing is written into the legacy tree: bytecode writing is off before anything is loaded.
"""

import base64
import importlib.util
import json
import os
import pathlib
import sys
import tempfile
from types import SimpleNamespace

sys.dont_write_bytecode = True
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import cv2  # noqa: E402
import numpy as np  # noqa: E402
from PyQt6.QtGui import QPixmap  # noqa: E402
from PyQt6.QtWidgets import QApplication  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent

# Legacy's names for the bars, and the query parameter the web sends for each.
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


def load(relative: str, name: str):
    path = legacy_source() / "lazylabel" / relative
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


APP = QApplication.instance() or QApplication([])
ctw = load("ui/widgets/channel_threshold_widget.py", "legacy_channel_threshold_widget")
rsw = load("ui/widgets/rescale_widget.py", "legacy_rescale_widget")
iam = load("ui/managers/image_adjustment_manager.py", "legacy_image_adjustment_manager")

# Legacy's gray test as the snapshot has it, kept to mark the cases whose answer changes below.
LEGACY_IS_GRAY = iam.ImageAdjustmentManager._is_grayscale_3ch


def is_gray_without_the_wrap(image_array):
    """Legacy's `_is_grayscale_3ch` (image_adjustment_manager.py:546-560) with int32 for int16.

    The one deliberate difference from legacy in these goldens: the owner's decision of 2026-09-27
    on RULE-024, "Fix it in the web". Legacy casts to int16 before differencing (line 556), so a
    sample above 32767 wraps negative and channels 32768 or more apart come out close together:
    65535 against 0 differs by 1. The web takes the true difference, and so does this.
    """
    if len(image_array.shape) != 3 or image_array.shape[2] < 3:
        return False
    diffs = np.abs(np.diff(image_array[:, :, :3].astype(np.int32), axis=2))
    threshold = 3 if image_array.dtype != np.uint16 else 768
    return int(diffs.max()) <= threshold


iam.ImageAdjustmentManager._is_grayscale_3ch = staticmethod(is_gray_without_the_wrap)
REDERIVED = "RULE-024 without legacy's int16 wrap, the owner's decision of 2026-09-27"


class InactiveFft:
    """The FFT widget, switched off."""

    def is_active(self):
        return False


class Panel:
    """The control-panel calls the manager makes, forwarded to legacy's own widgets."""

    def __init__(self):
        self.widget = ctw.ChannelThresholdWidget()
        self.rescale = rsw.RescaleWidget()

    def update_channel_threshold_for_image(self, image_array):
        self.widget.update_for_image(image_array)

    def update_rescale_for_image(self, image_array, crop_coords=None):
        self.rescale.update_for_image(image_array, crop_coords)

    def update_fft_threshold_for_image(self, *_args):
        pass

    def auto_collapse_fft_threshold_for_image(self, *_args):
        pass

    def get_channel_threshold_widget(self):
        return self.widget

    def get_rescale_widget(self):
        return self.rescale

    def get_fft_threshold_widget(self):
        return InactiveFft()


def legacy_view(path, markers, crop, rescale_window=None):
    panel = Panel()
    window = SimpleNamespace(
        current_image_path=str(path),
        control_panel=panel,
        crop_manager=SimpleNamespace(current_crop_coords=crop),
    )
    manager = iam.ImageAdjustmentManager.__new__(iam.ImageAdjustmentManager)
    manager.mw = window
    manager._cached_original_image = None
    manager._cached_multi_view_original_images = None

    manager.update_channel_threshold_for_image(QPixmap(str(path)))
    channels = list(panel.widget.sliders.keys())

    for name, values in markers.items():
        if name not in panel.widget.sliders:
            raise SystemExit(f"{path.name}: legacy offers {channels}, not {name}")
        bar = panel.widget.sliders[name]
        bar.checkbox.setChecked(True)
        bar.slider.set_indicators(values)

    if rescale_window is not None:
        # Where a drag of the two handles leaves them (rescale_widget.py:155-166).
        panel.rescale.slider._min_val, panel.rescale.slider._max_val = rescale_window

    processed = panel.widget.has_active_thresholding() or panel.rescale.has_active_rescaling()
    view = manager.get_current_modified_image()
    if view.ndim == 2:
        view = np.stack([view, view, view], axis=2)
    return channels, processed, view


def write_png(folder, name, rgb_or_gray):
    """cv2 writes BGR(A), so colour is reordered first: the file holds the RGB meant here."""
    array = rgb_or_gray
    if array.ndim == 3 and array.shape[2] == 3:
        array = cv2.cvtColor(array, cv2.COLOR_RGB2BGR)
    elif array.ndim == 3 and array.shape[2] == 4:
        array = cv2.cvtColor(array, cv2.COLOR_RGBA2BGRA)
    path = pathlib.Path(folder) / f"{name}.png"
    assert cv2.imwrite(str(path), array), name
    return path


def images():
    """16x16 images whose every value is chosen, so each band edge is crossed somewhere."""
    v8 = np.arange(256, dtype=np.int32).reshape(16, 16)
    v16 = (np.arange(256, dtype=np.int64) * 257).reshape(16, 16)
    # Every band edge the 16-bit cases use, planted on the diagonal so each is hit exactly.
    for i, value in enumerate([16383, 16384, 20000, 32767, 32768, 49999, 50000, 65534, 65535, 1000]):
        v16[i, i] = value

    def u8(a):
        return np.clip(a, 0, 255).astype(np.uint8)

    def u16(a):
        return np.clip(a, 0, 65535).astype(np.uint16)

    return {
        "gray8": u8(v8),
        "rgb8": np.stack([u8(v8), u8((v8 * 7 + 13) % 256), u8(255 - v8)], axis=2),
        # Channels within 3 of each other: RULE-024 makes this one Gray channel, read from red.
        "neargray8": np.stack([u8(v8), u8(v8 + 2), u8(v8 - 1)], axis=2),
        # One pixel differs by 4, which is past the tolerance: three channels.
        "almostgray8": np.stack([u8(v8), u8(v8 + 2), u8(np.where(v8 == 77, v8 + 6, v8 - 1))], axis=2),
        "exactgray8": np.stack([u8(v8), u8(v8), u8(v8)], axis=2),
        "rgba_neargray8": np.stack([u8(v8), u8(v8 + 1), u8(v8), u8(v8 * 0 + 200)], axis=2),
        "rgba_colour8": np.stack([u8(v8), u8(255 - v8), u8(v8 // 2), u8(v8 * 0 + 255)], axis=2),
        "gray16": u16(v16),
        "rgb16": np.stack([u16(v16), u16(65535 - v16), u16((v16 * 3) % 65536)], axis=2),
        # Adjacent channels within 768 (green to blue exactly 768): one Gray channel.
        "neargray16": np.stack([u16(v16), u16(v16 + 400), u16(v16 - 368)], axis=2),
        # Saturated magenta on black. Legacy's int16 wrap makes 65535 against 0 a difference of 1,
        # so to legacy this is gray; without the wrap, as the web decides it, it is colour.
        "vivid16": np.stack(
            [u16(np.where(v16 % 2 == 0, 65535, 0)), u16(v16 * 0), u16(np.where(v16 % 2 == 0, 65535, 0))],
            axis=2,
        ),
        "rescale16": RESCALED,
    }


# A 16-bit window under which legacy's float32 rescale and a float64 one disagree on thousands of
# values, by one level each.
WINDOW16 = (3279, 61249)


def float32_rescale(values, low, high, top):
    """`apply_rescaling`'s arithmetic, for choosing values; the goldens themselves come from legacy."""
    v = np.clip(values.astype(np.float32), low, high)
    return ((v - low) / (high - low) * top).astype(np.uint16 if top > 255 else np.uint8)


def rescale16():
    """32x32 gray16: every value where the two precisions disagree under WINDOW16, then an even spread."""
    everything = np.arange(65536)
    low, high = WINDOW16
    wide = np.trunc((np.clip(everything, low, high) - low) / (high - low) * 65535).astype(np.int64)
    narrow = float32_rescale(everything, low, high, 65535).astype(np.int64)
    disagree = everything[wide != narrow][:512]
    spread = np.linspace(0, 65535, 1024 - disagree.size).astype(np.int64)
    chosen = np.concatenate([disagree, spread])
    return chosen.reshape(32, 32).astype(np.uint16), int(disagree[0]), int(narrow[disagree[0]])


RESCALED, FIRST_DISAGREEING, ITS_LEGACY_LEVEL = rescale16()

CASES = [
    ("gray8", {"Gray": [128]}, None),
    ("gray8", {"Gray": [50, 150]}, None),
    ("gray8", {"Gray": [25, 55, 85]}, None),
    ("gray8", {"Gray": [150, 50]}, None),
    ("gray8", {"Gray": [100, 100]}, None),
    ("gray8", {"Gray": [0]}, None),
    ("gray8", {"Gray": [255]}, None),
    ("gray8", {"Gray": [256]}, None),
    ("gray8", {"Gray": [10, 20, 30, 40, 50, 60, 70, 80, 90]}, None),
    ("gray8", {"Gray": [20, 118, 128, 180, 210, 255, 0]}, None),
    ("gray8", {"Gray": [128]}, (2, 3, 10, 12)),
    ("rgb8", {"Red": [128]}, None),
    ("rgb8", {"Red": [50, 150], "Blue": [200]}, None),
    ("rgb8", {"Green": [1, 2, 3], "Blue": [64, 128, 192]}, None),
    ("rgb8", {"Red": [40], "Green": [80], "Blue": [120]}, (4, 0, 16, 9)),
    ("neargray8", {"Gray": [128]}, None),
    ("neargray8", {"Gray": [50, 150]}, None),
    ("neargray8", {"Gray": [100]}, (0, 0, 8, 8)),
    ("almostgray8", {"Red": [100], "Green": [100], "Blue": [100]}, None),
    ("exactgray8", {"Gray": [60, 190]}, None),
    ("rgba_neargray8", {"Gray": [100]}, None),
    ("rgba_colour8", {}, None),
    ("gray16", {"Gray": [32768]}, None),
    ("gray16", {"Gray": [20000, 50000]}, None),
    ("gray16", {"Gray": [0, 65535]}, None),
    ("gray16", {"Gray": [65536]}, None),
    ("gray16", {"Gray": [1000, 16384, 32768, 49152, 65280]}, None),
    ("rgb16", {"Red": [32768], "Green": [10000, 60000]}, None),
    ("neargray16", {"Gray": [32768]}, None),
    ("neargray16", {"Gray": [16384, 49152]}, (3, 3, 13, 13)),
    ("vivid16", {"Red": [30000], "Green": [30000], "Blue": [30000]}, None),
    # Rescale in front of the threshold, as legacy orders them (image_adjustment_manager.py:619-630).
    ("gray8", {"Gray": [128]}, None, (50, 200)),
    ("rescale16", {}, None, WINDOW16),
    # The marker sits exactly on the level legacy's float32 rescale gives the first disagreeing
    # value: legacy puts that pixel in the top band, a float64 rescale one level below it.
    ("rescale16", {"Gray": [ITS_LEGACY_LEVEL]}, None, WINDOW16),
    ("rescale16", {"Gray": [ITS_LEGACY_LEVEL, 50000]}, (4, 4, 28, 28), WINDOW16),
]


def main():
    made = images()
    cases = []
    with tempfile.TemporaryDirectory() as folder:
        paths = {name: write_png(folder, name, array) for name, array in made.items()}
        for entry in CASES:
            image, markers, crop, window = (*entry, None)[:4]
            path = paths[image]
            channels, processed, view = legacy_view(path, markers, crop, window)
            query = []
            if window is not None:
                query += [f"rescaleMin={window[0]}", f"rescaleMax={window[1]}"]
            query += [f"{PARAMETER[name]}={','.join(str(v) for v in sorted(values))}"
                      for name, values in markers.items() if values]
            if crop is not None:
                query.append(f"crop={','.join(str(v) for v in crop)}")
            case = {
                "image": image,
                "markers": markers,
                "crop": list(crop) if crop is not None else None,
                "window": list(window) if window is not None else None,
                "query": "&".join(query),
                "channels": channels,
                "processed": bool(processed),
                "width": int(view.shape[1]),
                "height": int(view.shape[0]),
                "rgb": base64.b64encode(np.ascontiguousarray(view).tobytes()).decode("ascii"),
            }
            # Only where the snapshot's own test answers otherwise: every other case is legacy's.
            if LEGACY_IS_GRAY(made[image]) != is_gray_without_the_wrap(made[image]):
                case["rederived"] = REDERIVED
            cases.append(case)
        pngs = {name: base64.b64encode(path.read_bytes()).decode("ascii") for name, path in paths.items()}

    out = HERE / "legacy-channel-threshold.json"
    out.write_text(json.dumps({"images": pngs, "cases": cases}, indent=1) + "\n")
    print(f"wrote {out} with {len(cases)} cases")


if __name__ == "__main__":
    main()
