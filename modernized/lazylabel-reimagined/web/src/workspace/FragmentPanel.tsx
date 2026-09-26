/**
 * RULE-027's fragment filter: how much of an AI mask to throw away, and the key that toggles it.
 *
 * The threshold was READ and never SETTABLE -- `fragment_threshold` reached the AI tool, and the
 * only way to change it was to edit the settings file by hand. `toggleThreshold`, the rule's own
 * "what Z toggles to", was written and tested and called by nothing. Both halves existed; neither
 * was reachable.
 *
 * THE MEMORY IS THE POINT OF THE TOGGLE. Z turns the filter off and back on again to the value it
 * had, which is how a user checks whether a piece the model found was real or noise: off, look,
 * on. A toggle without memory would come back at zero and they would have to retype the number
 * every time. From a stored 0 the first press goes to the rule's own default rather than doing
 * nothing, which is the other half of the same idea.
 *
 * LEGACY'S WORDS (fragment_threshold_widget.py:27-63): "Filter:", its tooltips and its one italic
 * line. The paragraph printed here until 2026-09-26 also said that the kept pieces have their holes
 * filled and that the toggle key checks a small piece; the owner asked for no paragraphs, and the
 * hole filling is announced when it happens (`AiTool`).
 */

import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { MAX_THRESHOLD, MIN_THRESHOLD, toggleThreshold } from "../tools/fragments.js";

export function FragmentPanel(): ReactNode {
  const { settings, save } = useSettings();
  const raw = Number(settings.values["fragment_threshold"]);
  const threshold = Number.isFinite(raw) ? Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, raw)) : 0;

  // What Z restores. In memory rather than in the settings, as legacy has it: it is the state of
  // one session's toggling, not a preference, and persisting it would restore a value the user
  // last saw switched OFF.
  const remembered = useRef(0);
  // EVERY non-zero value it takes, as legacy's `last_ai_filter_value` follows every set
  // (main_window.py:1320-1324), the slider's and the stored one's included. Only Z updated it, so a
  // slider dragged to 0 and then Z came back at 100 rather than where it had been
  // (`CONTROL_PARITY.md` CP-24).
  useEffect(() => {
    if (threshold > MIN_THRESHOLD) remembered.current = threshold;
  }, [threshold]);

  const set = useCallback(
    (value: number) => {
      void save({ ...settings, values: { ...settings.values, fragment_threshold: value } });
    },
    [save, settings],
  );

  useHotkey("toggle_ai_filter", () => {
    const next = toggleThreshold(threshold, remembered.current);
    remembered.current = next.remembered;
    set(next.threshold);
  });

  return (
    <>
      {/* Legacy's row: the label in a narrow right-aligned column, the value, then the slider. */}
      <label
        className="adjustment"
        title="Filter out small AI segments. 0=no filtering, 50=drop <50% of largest, 100=only keep largest"
      >
        <span className="adjustment__label">
          Filter:{" "}
          {/* A span, not an <output>: that element carries an implicit `status` role, so a slider
              value would be announced as a live region alongside the app's real status messages --
              and would answer to the same role query they do. */}
          <span className="adjustment__value" title="Fragment threshold value (0-100)">
            {threshold}
          </span>
        </span>
        <input
          type="range"
          min={MIN_THRESHOLD}
          max={MAX_THRESHOLD}
          value={threshold}
          aria-label="Fragment threshold"
          onChange={(event) => set(Number(event.target.value))}
        />
      </label>
      <p className="panel__caption">Filters small AI segments relative to the largest segment</p>
    </>
  );
}
