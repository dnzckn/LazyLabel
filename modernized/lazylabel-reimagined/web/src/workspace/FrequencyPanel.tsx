/**
 * The FFT Threshold section — legacy's `FFTThresholdWidget` (`ui/widgets/fft_threshold_widget.py`),
 * the control over RULE-030.
 *
 * LAID OUT AS LEGACY'S IS, in its words: a group box titled "FFT Frequency Band Thresholding"; the
 * "Enable FFT Frequency Thresholding" box; the status line; "Frequency Thresholds (Double-click to
 * add):" over the "Frequency Bands" bar; "Intensity Thresholds (Double-click to add):" over the
 * "Intensity Levels" bar; and its one line of instructions (lines 163-219). The bars' own tooltips
 * are legacy's.
 *
 * THE BARS ARE LEGACY'S `FFTThresholdSlider`s (`ThresholdBar`, `variant="fft"`): double-click adds a
 * marker, drag moves it, right-click removes it, and each can be emptied (lines 24-139). Cutoffs are
 * 0 to 10000 and keep their fraction; intensities are whole levels 0 to 255.
 *
 * THE BOX IS THE SWITCH. Unticked, both bars take no input; ticking turns the filter on even with no
 * thresholds, which still changes the image (the transform and back, stretched to 0..255); unticking
 * clears both bars (lines 236-251). Legacy's box can be ticked on a colour image, where it does
 * nothing (lines 328-330), and so can this one.
 *
 * THE PIXELS ARE THE SERVER'S. This only sets the box and the thresholds in the workspace's
 * processing; the pixels URL, Operate On View and the tiles all read them from there. A drag is
 * committed on release, as the channel bars' are (`ThresholdBar.tsx`); legacy's FFT re-renders live.
 */

import type { ReactNode } from "react";

import { FREQUENCY_SLIDER_MAX } from "./processing.js";
import { ThresholdBar } from "./ThresholdBar.jsx";
import { useWorkspace } from "./WorkspaceProvider.jsx";

/** Legacy's tooltips for the two bars, word for word (lines 188-190, 204-206). */
export const FFT_TOOLTIPS = {
  frequency: "Double-click to add frequency cutoff points.\nEach band gets mapped to different intensity.",
  intensity: "Double-click to add intensity threshold points.\nApplied after frequency band processing.",
} as const;

/** The status line for the image open (lines 175-176, 277-290, 307-315), and how legacy colours it. */
export function fftStatus(sourceChannels: number | null): { readonly text: string; readonly tone: "note" | "good" | "bad" } {
  if (sourceChannels === null) return { text: "Load a single channel (grayscale) image", tone: "note" };
  if (sourceChannels === 1) return { text: "✓ Grayscale image - FFT processing available", tone: "good" };
  return { text: "❌ Multi-channel color image - not supported", tone: "bad" };
}

export function FrequencyPanel(): ReactNode {
  const { open, processing, setProcessing } = useWorkspace();
  const status = fftStatus(open?.metadata?.sourceChannels ?? null);
  const enabled = processing.fft === true;

  return (
    <fieldset className="fft">
      <legend>FFT Frequency Band Thresholding</legend>
      <label className="fft__enable">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) =>
            setProcessing(
              event.currentTarget.checked
                ? { ...processing, fft: true }
                : { ...processing, fft: false, frequencies: [], intensities: [] },
            )
          }
        />
        Enable FFT Frequency Thresholding
      </label>
      <span className={`processing__info processing__info--${status.tone}`}>{status.text}</span>

      <span className="fft__label fft__label--frequency">{"Frequency Thresholds\n(Double-click to add):"}</span>
      <ThresholdBar
        variant="fft"
        channel="Frequency Bands"
        maximum={FREQUENCY_SLIDER_MAX}
        markers={processing.frequencies}
        enabled={enabled}
        title={FFT_TOOLTIPS.frequency}
        onChange={(frequencies) => setProcessing({ ...processing, frequencies })}
      />

      <span className="fft__label fft__label--intensity">{"Intensity Thresholds\n(Double-click to add):"}</span>
      <ThresholdBar
        variant="fft"
        channel="Intensity Levels"
        maximum={255}
        markers={processing.intensities}
        enabled={enabled}
        title={FFT_TOOLTIPS.intensity}
        onChange={(intensities) => setProcessing({ ...processing, intensities })}
      />

      <span className="fft__instructions">Freq: low→dark, high→bright | Intensity: quantization</span>
    </fieldset>
  );
}
