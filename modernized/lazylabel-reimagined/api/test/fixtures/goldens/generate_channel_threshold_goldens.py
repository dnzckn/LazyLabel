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

The rescale and FFT widgets are stood in by inactive fakes: their own goldens cover them, and here
they would only be noise.

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
iam = load("ui/managers/image_adjustment_manager.py", "legacy_image_adjustment_manager")


class Inactive:
    """The rescale and FFT widgets, switched off."""

    def has_active_rescaling(self):
        return False

    def is_active(self):
        return False


class Panel:
    """The three control-panel calls the manager makes, forwarding the channel one to the widget."""

    def __init__(self):
        self.widget = ctw.ChannelThresholdWidget()

    def update_channel_threshold_for_image(self, image_array):
        self.widget.update_for_image(image_array)

    def update_rescale_for_image(self, *_args):
        pass

    def update_fft_threshold_for_image(self, *_args):
        pass

    def auto_collapse_fft_threshold_for_image(self, *_args):
        pass

    def get_channel_threshold_widget(self):
        return self.widget

    def get_rescale_widget(self):
        return Inactive()

    def get_fft_threshold_widget(self):
        return Inactive()


def legacy_view(path, markers, crop):
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

    active = panel.widget.has_active_thresholding()
    view = manager.get_current_modified_image()
    if view.ndim == 2:
        view = np.stack([view, view, view], axis=2)
    return channels, active, view


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
        # Saturated primaries: legacy casts to int16 before differencing, so 65535 against 0 wraps
        # to a difference of 1 and this vivid image counts as gray. Reproduced, not endorsed.
        "wrapgray16": np.stack(
            [u16(np.where(v16 % 2 == 0, 65535, 0)), u16(v16 * 0), u16(np.where(v16 % 2 == 0, 65535, 0))],
            axis=2,
        ),
    }


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
    ("wrapgray16", {"Gray": [30000]}, None),
]


def main():
    made = images()
    cases = []
    with tempfile.TemporaryDirectory() as folder:
        paths = {name: write_png(folder, name, array) for name, array in made.items()}
        for image, markers, crop in CASES:
            path = paths[image]
            channels, active, view = legacy_view(path, markers, crop)
            query = [f"{PARAMETER[name]}={','.join(str(v) for v in sorted(values))}"
                     for name, values in markers.items() if values]
            if crop is not None:
                query.append(f"crop={','.join(str(v) for v in crop)}")
            cases.append(
                {
                    "image": image,
                    "markers": markers,
                    "crop": list(crop) if crop is not None else None,
                    "query": "&".join(query),
                    "channels": channels,
                    "active": bool(active),
                    "width": int(view.shape[1]),
                    "height": int(view.shape[0]),
                    "rgb": base64.b64encode(np.ascontiguousarray(view).tobytes()).decode("ascii"),
                }
            )
        pngs = {name: base64.b64encode(path.read_bytes()).decode("ascii") for name, path in paths.items()}

    out = HERE / "legacy-channel-threshold.json"
    out.write_text(json.dumps({"images": pngs, "cases": cases}, indent=1) + "\n")
    print(f"wrote {out} with {len(cases)} cases")


if __name__ == "__main__":
    main()
