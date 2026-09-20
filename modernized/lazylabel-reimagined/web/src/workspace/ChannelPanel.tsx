/**
 * Rescale and channel thresholding — the controls over RULE-032 and RULE-029.
 *
 * THE RULES RUN ON THE SERVER, and this panel only asks. They belong before the 16-bit to 8-bit
 * conversion and the browser only ever receives what comes after it, so applying a rescale here
 * would quantise a 16-bit image to 256 levels and then stretch those — not the rule, and worst on
 * exactly the images a rescale exists for. `workspace/processing.ts` turns what is set here into
 * the query the pixels URL carries.
 *
 * THE ORDER IS SHOWN, NOT IMPLIED. RULE-032 fixes it — rescale, then channel threshold — and each
 * step reads the previous one's output. Two controls side by side with nothing to say otherwise
 * invite a user to treat them as independent, and the first surprise is a threshold that lands
 * somewhere else once the rescale window moves. So the panel numbers them.
 *
 * WHAT IS OFFERED DEPENDS ON THE SOURCE, which is why the metadata carries the channel count.
 * RULE-032 disables rescale for a colour image and RULE-029 offers one Gray channel for a
 * grayscale one against three separate ones for colour. Offering a control the server will ignore
 * is worse than not offering it: the user sets it and nothing happens.
 */

import { useCallback, useState, type ReactNode } from "react";

import {
  FREQUENCY_SLIDER_MAX,
  MAX_16_BIT,
  MAX_8_BIT,
  MIN_MARKER_SPACING,
  channelsFor,
  markersAreLegal,
  rescaleApplies,
  type Channel,
} from "./processing.js";
import { useWorkspace } from "./WorkspaceProvider.jsx";

const CHANNEL_NAMES: Readonly<Record<Channel, string>> = {
  gray: "Gray",
  r: "Red",
  g: "Green",
  b: "Blue",
};

export function ChannelPanel(): ReactNode {
  const { open, processing, setProcessing } = useWorkspace();
  const metadata = open?.metadata ?? null;

  const [draft, setDraft] = useState("");
  const [chosen, setChannel] = useState<Channel>("gray");
  const [error, setError] = useState<string | null>(null);

  const maximum = metadata?.sourceDepth === 16 ? MAX_16_BIT : MAX_8_BIT;
  const sourceChannels = metadata?.sourceChannels ?? 3;
  const channels = channelsFor(sourceChannels);
  const canRescale = rescaleApplies(sourceChannels);
  // The source decides which channels exist, so a choice made on one image can be meaningless on
  // the next -- "Gray" on a colour one. Falling back to the first available keeps the select and
  // the marker it adds talking about the same channel.
  const channel = channels.includes(chosen) ? chosen : channels[0]!;

  const setWindow = useCallback(
    (min: number, max: number) => {
      setProcessing({ ...processing, rescale: { min, max } });
    },
    [processing, setProcessing],
  );

  const addMarker = useCallback(() => {
    const value = Number.parseInt(draft.trim(), 10);
    if (!Number.isInteger(value)) {
      setError("A marker is a whole number.");
      return;
    }
    if (value < 0 || value > maximum) {
      setError(`A marker has to be between 0 and ${maximum} on this image.`);
      return;
    }

    const next = [...(processing.markers[channel] ?? []), value].sort((a, b) => a - b);
    if (!markersAreLegal(next)) {
      // Refused BEFORE it is added, with the reason. Legacy silently snaps a too-close marker to
      // the minimum distance, which moves a band boundary the user did not move.
      setError(
        `Markers have to be at least ${MIN_MARKER_SPACING} apart, and ${value} is closer than `
          + "that to one already set.",
      );
      return;
    }

    setError(null);
    setDraft("");
    setProcessing({ ...processing, markers: { ...processing.markers, [channel]: next } });
  }, [channel, draft, maximum, processing, setProcessing]);

  const removeMarker = useCallback(
    (which: Channel, value: number) => {
      const next = (processing.markers[which] ?? []).filter((marker) => marker !== value);
      setError(null);
      setProcessing({ ...processing, markers: { ...processing.markers, [which]: next } });
    },
    [processing, setProcessing],
  );

  const reset = useCallback(() => {
    setError(null);
    setProcessing({ ...processing, rescale: null, markers: {}, frequencies: [], intensities: [] });
  }, [processing, setProcessing]);

  const setCutoff = useCallback(
    (value: number) => {
      // ONE cutoff from the slider, which makes it a high-pass: band 0 is weighted 0 and the last
      // 1, so the frequencies BELOW the cutoff are the ones removed. RULE-030 allows more bands
      // and legacy's widget offers them; one is what a slider can express honestly, and the extra
      // bands are a shape of control this panel does not have yet.
      setProcessing({ ...processing, frequencies: value === 0 ? [] : [value] });
    },
    [processing, setProcessing],
  );

  if (metadata === null) {
    return <p className="panel__missing">These need an open image to measure against.</p>;
  }

  const window = processing.rescale;
  const crossed = window !== null && window.max <= window.min;

  return (
    <div className="channel">
      <h4 className="channel__step">1 · Rescale</h4>

      {canRescale ? (
        <>
          <p className="panel__missing">
            Everything at or below the low end becomes 0 and everything at or above the high end
            becomes {maximum}. What falls outside is discarded, not compressed.
          </p>

          <Slider
            label="Rescale low"
            max={maximum}
            value={window?.min ?? 0}
            onChange={(value) => setWindow(value, window?.max ?? maximum)}
          />
          <Slider
            label="Rescale high"
            max={maximum}
            value={window?.max ?? maximum}
            onChange={(value) => setWindow(window?.min ?? 0, value)}
          />

          {crossed && (
            // The handles have been dragged past each other. The rule LEAVES THE IMAGE ALONE
            // rather than dividing by zero or blanking it, and saying so is what stops a user
            // concluding the rescale is broken when it is refusing an impossible window.
            <p role="status" className="banner banner--warning">
              The high end is not above the low one, so no rescaling is applied. The image is left
              as it is rather than blanked.
            </p>
          )}
        </>
      ) : (
        // Named, not shown disabled. RULE-032 turns rescale off for colour, and a greyed slider
        // invites a user to wonder what would enable it.
        <p className="panel__missing">
          Rescale applies to grayscale images only, and this one is colour.
        </p>
      )}

      <h4 className="channel__step">2 · Channel thresholds</h4>
      <p className="panel__missing">
        N markers make N+1 bands. Values run 0–{maximum} because this image is{" "}
        {metadata.sourceDepth}-bit; the {MIN_MARKER_SPACING}-level minimum spacing is in absolute
        units, so on a 16-bit image it is barely a constraint at all.
      </p>

      <div className="channel__add">
        {channels.length > 1 && (
          <label className="crop__field">
            <span>Channel</span>
            <select
              value={channel}
              aria-label="Channel"
              onChange={(event) => setChannel(event.target.value as Channel)}
            >
              {channels.map((name) => (
                <option key={name} value={name}>
                  {CHANNEL_NAMES[name]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="crop__field">
          <span>Marker</span>
          <input
            type="number"
            min={0}
            max={maximum}
            value={draft}
            aria-label="Marker value"
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button type="button" onClick={addMarker}>
          Add marker
        </button>
      </div>

      {error !== null && (
        <p role="alert" className="banner banner--error">
          {error}
        </p>
      )}

      {channels.map((name) => {
        const markers = processing.markers[name] ?? [];
        if (markers.length === 0) return null;

        return (
          <ul className="channel__markers" key={name}>
            {markers.map((marker) => (
              <li key={marker}>
                {CHANNEL_NAMES[name]} {marker}{" "}
                <button
                  type="button"
                  onClick={() => removeMarker(name, marker)}
                  aria-label={`Remove ${CHANNEL_NAMES[name]} marker ${marker}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        );
      })}

      <h4 className="channel__step">3 · Frequency bands</h4>

      {/* Offered whatever the source says, and that is deliberate. RULE-030 runs on "2-D or
          exactly equal-channel" images, so a grayscale scan SAVED AS COLOUR qualifies -- and only
          the server can tell, because the answer is in the pixels rather than in the header. The
          text says who decides rather than the panel guessing and refusing the images most likely
          to want it. */}
      <p className="panel__missing">
        A high-pass: everything closer to the centre of the spectrum than the cutoff is removed,
        which takes out the broad shading and leaves the detail. The result is always 8-bit,
        whatever the source was.
      </p>

      {canRescale ? null : (
        // Said BEFORE the slider is moved, not after nothing happens. RULE-030 runs on "2-D or
        // exactly equal-channel" images; this file has three channels, and whether they are
        // identical is a fact about its pixels that only the server can see. A user who sets a
        // cutoff on a real colour photograph gets no change and would otherwise have no way to
        // tell that from a broken control.
        <p role="status" className="banner banner--warning">
          This image is colour. The filter runs only if its three channels turn out to be
          identical — a grayscale scan saved as colour, which is common. If they are not, the
          cutoff below will do nothing and the image will come back unchanged.
        </p>
      )}

      <Slider
        label="Frequency cutoff"
        max={FREQUENCY_SLIDER_MAX}
        value={processing.frequencies[0] ?? 0}
        onChange={setCutoff}
      />

      {(processing.frequencies[0] ?? 0) > 0 && (
            // The number a user can act on. The transform is seconds on a large image, which is
            // why the server caches it and refuses above a limit rather than appearing to hang.
        <p role="status" className="panel__missing">
          Cutoff {(((processing.frequencies[0] ?? 0) / FREQUENCY_SLIDER_MAX) * 100).toFixed(2)}% of
          the half-diagonal. Large images take a moment the first time; the result is then reused
          until something above it changes.
        </p>
      )}

      <button
        type="button"
        onClick={reset}
        disabled={
          window === null && noMarkers(processing.markers) && processing.frequencies.length === 0
        }
      >
        Reset processing
      </button>
    </div>
  );
}

function noMarkers(markers: Readonly<Partial<Record<Channel, readonly number[]>>>): boolean {
  return (["gray", "r", "g", "b"] as const).every((name) => (markers[name] ?? []).length === 0);
}

function Slider({
  label,
  max,
  value,
  onChange,
}: {
  readonly label: string;
  readonly max: number;
  readonly value: number;
  readonly onChange: (value: number) => void;
}): ReactNode {
  return (
    <label className="adjustment">
      <span className="adjustment__label">
        {label} <span className="adjustment__value">{value}</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
