/**
 * Rescale — the controls over RULE-032, and RULE-031's presets, as legacy's `RescaleWidget`
 * (`ui/widgets/rescale_widget.py:183-441`) lays them out: a title row with Hist and Reset, the
 * slider, one line of status under it.
 *
 * THE RULES RUN ON THE SERVER, and this panel only asks. They belong before the 16-bit to 8-bit
 * conversion and the browser only ever receives what comes after it, so applying a rescale here
 * would quantise a 16-bit image to 256 levels and then stretch those. `workspace/processing.ts`
 * turns what is set here into the query the pixels URL carries.
 *
 * GRAYSCALE ONLY (RULE-032), where grayscale is decided from the pixels (RULE-024). The widget is
 * always there, as legacy's is; without a grayscale image its slider and buttons are disabled and
 * the status line says why (lines 248, 264-283). Reset is legacy's, clearing the window and any
 * preset (lines 229-235, 320-328).
 *
 * THE WINDOW IS ONE SLIDER WITH TWO HANDLES that cannot pass each other (`RescaleSlider.tsx`). A
 * window at the full range is no window at all, as legacy's `has_active_rescaling` says
 * (lines 330-339), so it is not sent.
 *
 * HIST OPENS LEGACY'S HISTOGRAM DIALOG on the image, or on the crop when there is one
 * (`main_window.py:2786-2807`; `RescaleHistogramDialog.tsx`). What its Apply sends lands where
 * legacy's lands: the lines on the slider, clearing any preset (`set_values_from_histogram`,
 * lines 432-441), or Equalize or CLAHE as the preset, which the status line then names (lines
 * 341-351; `main_window.py:2809-2825`).
 */

import { useCallback, useRef, useState, type ReactNode } from "react";
import type { WireHistogram } from "@lazylabel/contracts";

import type { ApiClient } from "../api/client.js";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import { MAX_16_BIT, MAX_8_BIT, rescaleApplies, type Preset } from "./processing.js";
import { RescaleHistogramDialog, type AppliedPreset } from "./RescaleHistogramDialog.jsx";
import { RescaleSlider } from "./RescaleSlider.jsx";
import type { Window } from "./rescaleSlider.js";
import { claheName } from "./rescaleHistogram.js";
import { useWorkspace } from "./WorkspaceProvider.jsx";

/** Legacy's status line under the slider, word for word (`rescale_widget.py:248, 282, 297-299, 350`). */
export function rescaleInfo(sourceChannels: number | null, maximum: number, preset: Preset | null = null): string {
  if (sourceChannels === null) return "Load a grayscale image to enable";
  if (!rescaleApplies(sourceChannels)) return "RGB image — rescale disabled";
  if (preset !== null) {
    const name = preset.kind === "equalize" ? "Histogram Equalization" : claheName(preset.clipLimit, preset.tilesX);
    return `Preset: ${name}`;
  }
  return `Range: 0–${maximum}  |  Drag handles to rescale`;
}

export function RescalePanel({ client, projectId }: { readonly client: ApiClient; readonly projectId: string }): ReactNode {
  const { open, processing, setProcessing } = useWorkspace();
  const { notify } = useNotifications();
  const metadata = open?.metadata ?? null;
  const grayscale = metadata !== null && rescaleApplies(metadata.sourceChannels);
  const maximum = metadata?.sourceDepth === 16 ? MAX_16_BIT : MAX_8_BIT;
  const [histogram, setHistogram] = useState<{ readonly key: string; readonly answer: WireHistogram } | null>(null);
  // The Hist press being answered, so an answer for an image already left behind is dropped.
  const asking = useRef(0);

  const setWindow = useCallback(
    ({ min, max }: Window) => {
      // Moving a handle clears any preset (rescale_widget.py:305-314). The full range is legacy's
      // "no rescaling" (lines 330-339).
      const full = min === 0 && max === maximum;
      setProcessing({ ...processing, preset: null, rescale: full ? null : { min, max } });
    },
    [maximum, processing, setProcessing],
  );

  const window = grayscale ? (processing.rescale ?? { min: 0, max: maximum }) : { min: 0, max: maximum };

  const openHistogram = () => {
    if (open === null) return;
    asking.current += 1;
    const ask = asking.current;
    const key = open.image.key;
    client.imageHistogram(projectId, key, { crop: processing.crop }).then(
      (answer) => {
        if (asking.current === ask) setHistogram({ key, answer });
      },
      (cause: unknown) => {
        if (asking.current !== ask) return;
        notify({ severity: "error", message: cause instanceof Error ? cause.message : String(cause) });
      },
    );
  };

  const applyPreset = (preset: AppliedPreset) => {
    if (metadata === null) return;
    const crop = processing.crop;
    setProcessing({
      ...processing,
      preset:
        preset.kind === "equalize"
          ? {
              kind: "equalize",
              // The table comes from the region the dialog was opened on (rescale_widget.py:420-430).
              source: crop === null ? [0, 0, metadata.width, metadata.height] : [crop.x1, crop.y1, crop.x2, crop.y2],
            }
          : { kind: "clahe", clipLimit: preset.clipLimit, tilesX: preset.tiles, tilesY: preset.tiles },
    });
  };

  return (
    <div className="rescale">
      <div className="rescale__title">
        <span className="rescale__name">Rescale (Min/Max)</span>
        <button
          type="button"
          className="rescale__hist"
          title="Open histogram for visual min/max selection"
          disabled={!grayscale}
          onClick={openHistogram}
        >
          Hist
        </button>
        <button
          type="button"
          className="rescale__reset"
          title="Reset rescale to full range"
          disabled={!grayscale}
          onClick={() => setProcessing({ ...processing, preset: null, rescale: null })}
        >
          Reset
        </button>
      </div>

      <RescaleSlider maximum={maximum} window={window} enabled={grayscale} onChange={setWindow} />

      <span className="processing__info">
        {rescaleInfo(metadata?.sourceChannels ?? null, maximum, grayscale ? processing.preset : null)}
      </span>

      {histogram !== null && histogram.key === open?.image.key && (
        <RescaleHistogramDialog
          histogram={histogram.answer}
          current={window}
          loadClahe={(clipLimit, tiles) =>
            client.imageHistogram(projectId, histogram.key, { crop: processing.crop, clahe: { clipLimit, tiles } })
          }
          onApplyWindow={setWindow}
          onApplyPreset={applyPreset}
          onClose={() => setHistogram(null)}
        />
      )}
    </div>
  );
}
