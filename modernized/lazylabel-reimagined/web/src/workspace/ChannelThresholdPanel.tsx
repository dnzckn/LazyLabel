/**
 * Channel thresholding — legacy's `ChannelThresholdWidget`
 * (`ui/widgets/channel_threshold_widget.py:316-585`), one row per channel: a checkbox, then that
 * channel's bar.
 *
 * WHAT IT SHOWS IS WHAT LEGACY'S SHOWS. One Gray row for a grayscale image and Red, Green and Blue
 * for colour (lines 437-453), where "grayscale" is decided from the pixels (RULE-024) and arrives
 * as the metadata's channel count. Nothing at all before an image is open. Legacy's three lines of
 * instructions are the tooltip, in its words (lines 413-418).
 *
 * A ROW IS OFF UNTIL ITS BOX IS TICKED, and unticking it clears its markers (lines 351-357), so the
 * markers the server is sent are only ever the ticked channels'. Every row starts unticked and
 * empty on each image, as legacy's rows are rebuilt for each one (lines 455-469); the workspace
 * gives each image fresh processing, and the rows are keyed on the image so a drag in progress
 * cannot carry over.
 *
 * THE PIXELS ARE THE SERVER'S. This only sets markers in the workspace's processing; the pixels
 * URL, Operate On View and the save all read them from there (`processing.ts`).
 */

import type { ReactNode } from "react";

import { CHANNEL_NAMES, channelsFor, type Channel } from "./processing.js";
import { ThresholdBar } from "./ThresholdBar.jsx";
import { barMaximum } from "./thresholdBar.js";
import { useWorkspace } from "./WorkspaceProvider.jsx";

/** Legacy's instructions label, word for word (`channel_threshold_widget.py:413-418`). */
export const CHANNEL_THRESHOLD_HINT =
  "✓ Check to enable\n• Double-click to add threshold\n• Right-click to remove";

export function ChannelThresholdPanel(): ReactNode {
  const { open, processing, setProcessing } = useWorkspace();
  const metadata = open?.metadata ?? null;
  if (open === null || metadata === null) return null;

  const maximum = barMaximum(metadata.sourceDepth);

  const setEnabled = (channel: Channel, enabled: boolean) =>
    setProcessing({
      ...processing,
      enabled: { ...processing.enabled, [channel]: enabled },
      markers: enabled ? processing.markers : { ...processing.markers, [channel]: [] },
    });

  const setMarkers = (channel: Channel, markers: number[]) =>
    setProcessing({ ...processing, markers: { ...processing.markers, [channel]: markers } });

  return (
    <div className="threshold" title={CHANNEL_THRESHOLD_HINT}>
      {channelsFor(metadata.sourceChannels).map((channel) => {
        const enabled = processing.enabled?.[channel] === true;
        return (
          <div className="threshold__row" key={`${open.image.key}\u0000${channel}`}>
            <input
              type="checkbox"
              aria-label={CHANNEL_NAMES[channel]}
              checked={enabled}
              onChange={(event) => setEnabled(channel, event.currentTarget.checked)}
            />
            <ThresholdBar
              channel={CHANNEL_NAMES[channel]}
              maximum={maximum}
              markers={processing.markers[channel] ?? []}
              enabled={enabled}
              onChange={(markers) => setMarkers(channel, markers)}
            />
          </div>
        );
      })}
    </div>
  );
}
