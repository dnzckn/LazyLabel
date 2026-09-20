"""Golden outputs for RULE-030's FFT band filter, from legacy's own algorithm.

Run with the app venv, from this directory:

    E:/venv/lazylabel/Scripts/python.exe generate_fft_goldens.py

Why a fixture rather than a transcription: the card gives the SHAPE of the algorithm and not the
numbers, and a 2-D FFT has too many places to be subtly wrong -- the shift convention, the
normalization, where truncation happens -- for "it looks right" to mean anything. These are the
exact bytes legacy produces, so a TypeScript port either matches them or does not.

The code below is transcribed from `fft_threshold_widget.py:373-496` at snapshot 2a7d5d8, keeping
its order and its rounding. TWO OF ITS ODDITIES ARE DELIBERATE AND ARE WHAT THE ODD-SIZED CASE IS
FOR:

  - It calls `fftshift` a SECOND time to undo the first, where `ifftshift` is the inverse. For an
    even-sized image the two agree; for an odd-sized one they differ by a pixel, so the output is
    shifted. A port that "corrects" this to ifftshift will match on 16x16 and disagree on 15x15,
    which is why both are in here.
  - `astype(np.uint8)` truncates toward zero rather than rounding, after a float normalization
    that lands on fractional values almost everywhere.
"""

import json
import pathlib

import numpy as np
from numpy.fft import fft2, fftshift, ifft2


def apply_fft(image, frequency_thresholds, intensity_thresholds):
    """`_apply_frequency_band_thresholding`, without the cache (which is a documented defect)."""
    height, width = image.shape

    fft_shifted = fftshift(fft2(image.astype(np.float64)))

    y_coords, x_coords = np.ogrid[:height, :width]
    center_y, center_x = height // 2, width // 2
    max_freq = np.sqrt((height / 2) ** 2 + (width / 2) ** 2)
    freq_distance = np.sqrt((y_coords - center_y) ** 2 + (x_coords - center_x) ** 2) / max_freq
    freq_distance = np.clip(freq_distance, 0, 1)

    if not frequency_thresholds:
        result_fft = fft_shifted
    else:
        normalized = [t / 10000.0 for t in sorted(frequency_thresholds)]
        num_bands = len(normalized) + 1
        result_fft = np.zeros_like(fft_shifted, dtype=complex)

        for band_idx in range(num_bands):
            if band_idx == 0:
                band_mask = freq_distance <= normalized[0]
            elif band_idx == num_bands - 1:
                band_mask = freq_distance > normalized[band_idx - 1]
            else:
                band_mask = (freq_distance > normalized[band_idx - 1]) & (
                    freq_distance <= normalized[band_idx]
                )

            # Band 0 is weighted 0 (removed) and the last 1 (kept), evenly in between.
            band_intensity = (band_idx / (num_bands - 1)) if num_bands > 1 else 1.0
            result_fft += fft_shifted * band_mask * band_intensity

    # fftshift, not ifftshift. See the note at the top.
    filtered = np.real(ifft2(fftshift(result_fft)))

    filtered = filtered - np.min(filtered)
    if np.max(filtered) > 0:
        filtered = filtered / np.max(filtered) * 255

    result = filtered.astype(np.uint8)

    if intensity_thresholds:
        result = apply_intensity(result, intensity_thresholds)
    return result


def apply_intensity(image, thresholds):
    """`_apply_intensity_thresholding`."""
    sorted_thresholds = sorted(thresholds)
    num_levels = len(sorted_thresholds) + 1
    out = np.copy(image)

    for level_idx in range(num_levels):
        if level_idx == 0:
            mask = image <= sorted_thresholds[0]
        elif level_idx == num_levels - 1:
            mask = image > sorted_thresholds[level_idx - 1]
        else:
            mask = (image > sorted_thresholds[level_idx - 1]) & (
                image <= sorted_thresholds[level_idx]
            )

        level_value = (level_idx / (num_levels - 1)) * 255 if num_levels > 1 else 255
        out[mask] = level_value

    return out.astype(np.uint8)


def sample(height, width):
    """A deterministic image with structure at several frequencies, so banding has an effect."""
    y, x = np.ogrid[:height, :width]
    low = 80 + 40 * np.sin(2 * np.pi * x / max(1, width))
    mid = 30 * np.sin(2 * np.pi * 4 * y / max(1, height))
    high = 20 * np.sin(2 * np.pi * (x + y) / 3)
    return np.clip(low + mid + high, 0, 255).astype(np.uint8)


CASES = [
    # (label, height, width, frequency thresholds (0..10000), intensity thresholds (0..255))
    ("even-no-thresholds", 16, 16, [], []),
    ("even-highpass-10pc", 16, 16, [1000], []),
    ("even-two-bands", 16, 16, [1000, 4000], []),
    ("even-with-intensity", 16, 16, [1000], [100]),
    # ODD, which is where fftshift and ifftshift disagree.
    ("odd-highpass-10pc", 15, 15, [1000], []),
    ("odd-rectangular", 15, 21, [2000], []),
]


def main():
    out = {
        "source": "legacy/lazylabel/src/lazylabel/ui/widgets/fft_threshold_widget.py:373-496",
        "snapshot": "2a7d5d8",
        "note": (
            "Legacy applies fftshift a second time where ifftshift is the inverse. The two agree "
            "for even dimensions and differ by a pixel for odd ones, so the odd cases here fail "
            "against a port that uses ifftshift."
        ),
        "cases": [],
    }

    for label, height, width, frequencies, intensities in CASES:
        image = sample(height, width)
        result = apply_fft(image, frequencies, intensities)
        out["cases"].append(
            {
                "label": label,
                "height": height,
                "width": width,
                "frequencyThresholds": frequencies,
                "intensityThresholds": intensities,
                "input": image.flatten().tolist(),
                "expected": result.flatten().tolist(),
            }
        )

    path = pathlib.Path(__file__).with_name("legacy-fft.json")
    path.write_text(json.dumps(out), encoding="utf-8")
    print(f"wrote {path} ({path.stat().st_size} bytes, {len(out['cases'])} cases)")


if __name__ == "__main__":
    main()
