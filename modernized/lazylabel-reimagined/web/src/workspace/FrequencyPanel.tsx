/**
 * The frequency filter — the control over RULE-030, in legacy's "FFT Threshold" section.
 *
 * It runs on the server, third in RULE-032's order, and only on a grayscale image: legacy's widget
 * refuses colour (`ui/widgets/fft_threshold_widget.py:277-317`). Grayscale is decided from the
 * pixels (RULE-024), so the metadata's channel count is the same answer the server acts on, and a
 * colour image is told so in legacy's words rather than offered a slider that would do nothing.
 *
 * ONE CUTOFF, from a slider: band 0 is weighted 0 and the last 1, so a single threshold is a
 * high-pass. Legacy's section has an enable box and two multi-marker bars, frequency and intensity
 * (`CONTROL_PARITY.md` CP-46).
 */

import type { ReactNode } from "react";

import { FREQUENCY_SLIDER_MAX } from "./processing.js";
import { ProcessingSlider } from "./ProcessingSlider.jsx";
import { useWorkspace } from "./WorkspaceProvider.jsx";

export function FrequencyPanel(): ReactNode {
  const { open, processing, setProcessing } = useWorkspace();
  const metadata = open?.metadata ?? null;

  if (metadata === null) {
    return <p className="processing__info processing__info--note">Load a single channel (grayscale) image</p>;
  }
  if (metadata.sourceChannels !== 1) {
    return (
      <p className="processing__info processing__info--bad">
        ❌ Multi-channel color image - not supported
      </p>
    );
  }

  return (
    <>
      <p className="processing__info processing__info--good">
        ✓ Grayscale image - FFT processing available
      </p>
      <ProcessingSlider
        label="Frequency cutoff"
        max={FREQUENCY_SLIDER_MAX}
        value={processing.frequencies[0] ?? 0}
        onChange={(value) => setProcessing({ ...processing, frequencies: value === 0 ? [] : [value] })}
      />
    </>
  );
}
