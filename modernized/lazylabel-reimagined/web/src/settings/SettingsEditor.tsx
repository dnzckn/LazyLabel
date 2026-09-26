/**
 * The settings no other control sets -- the settings half of C13's "web settings and hotkey editor".
 *
 * Found 2026-09-23 by asking of every key not "does anything READ it", which the settings guard
 * answers, but "can a user SET it". Six could not: each was read by the app and kept its default
 * unless a desktop import brought a value, so a new user could never turn on Operate On View
 * (RULE-089) or pixel priority (RULE-012), change pan speed, the join threshold or the streaming
 * window. Each saves when it changes, as the export formats do.
 *
 * The file list's seven format columns were reported unsettable in the same sweep and were NOT:
 * the dataset browser's Columns chooser sets them through a computed key, and their names live in
 * `columns.ts`, which the sweep did not read. They had a second set of switches here for a few
 * commits; one control per setting is the rule, and theirs is beside the list they change.
 *
 * WHAT IT SHOWS is what legacy's widgets show for the same settings: their labels and controls, with
 * their tooltips as the only explanation (`annotation_settings_widget.py:79-93`,
 * `sequence_widget.py:369-381`, `settings_widget.py:59-102`). It had a sentence in place of each
 * label until the owner called it out on 2026-09-26. The Pan tooltip keeps legacy's first sentence
 * only: this app has no Shift boost, so the second would promise one.
 *
 * RULE-050's clamps apply when editing FINISHES -- "given the user types 25 into Join, when editing
 * finishes, then the join threshold becomes 10" -- and non-numeric input reverts to the value in
 * force, as legacy's does. Editing finishes on Enter or on leaving the field, as a QLineEdit's
 * `editingFinished` does.
 */

import { useState, type ReactNode } from "react";

import { useSettings } from "./SettingsProvider.jsx";

/** Legacy's tooltips, word for word except where noted above. */
const TIPS = {
  pan: "Adjusts the speed of WASD panning.",
  join: "The pixel distance to 'snap' a polygon closed.",
  window:
    "Number of frames per streaming chunk.\nLower values use less memory but may\nreduce temporal consistency.\n\nDefault: 250 (~3 GB per chunk)",
  operateOnView:
    "If checked, SAM model will operate on the currently displayed (adjusted) image.\nOtherwise, it operates on the original image.",
  pixelPriority: "Control pixel ownership when multiple classes overlap",
  ascending: "Lower class indices take priority over higher ones",
  descending: "Higher class indices take priority over lower ones",
} as const;

export function SettingsEditor(): ReactNode {
  const { settings, save } = useSettings();
  const [problem, setProblem] = useState<string | null>(null);
  const values = settings.values;

  const put = (key: string, value: unknown) => {
    setProblem(null);
    save({ ...settings, values: { ...values, [key]: value } }).catch((cause: unknown) => {
      // In the dialog as well as in the notification the provider raises, which the dialog covers.
      setProblem(`Not saved: ${cause instanceof Error ? cause.message : String(cause)}`);
    });
  };

  const number = (key: string, label: string, title: string, min: number, max: number, integer: boolean, step?: number) => (
    <NumberField
      label={label}
      title={title}
      value={Number(values[key])}
      min={min}
      max={max}
      integer={integer}
      {...(step === undefined ? {} : { step })}
      onCommit={(value) => put(key, value)}
    />
  );

  const enabled = values["pixel_priority_enabled"] === true;
  const ascending = values["pixel_priority_ascending"] !== false;

  return (
    <section className="settings-editor">
      <h2>Settings</h2>

      {problem !== null && (
        <p role="alert" className="banner banner--error">
          {problem}
        </p>
      )}

      <fieldset>
        <legend>Annotation Settings</legend>
        {number("pan_multiplier", "Pan", TIPS.pan, 0.1, 10, false)}
        {number("polygon_join_threshold", "Join", TIPS.join, 1, 10, true)}
      </fieldset>

      <fieldset>
        <legend>Sequence</legend>
        {/* RULE-026: a window of 50-1000 frames in steps of 50, 250 by default. Longer sequences
            run in windows of this size, overlapping by five frames. */}
        {number("stream_window_size", "Window", TIPS.window, 50, 1000, true, 50)}
      </fieldset>

      <fieldset>
        <legend>Application Settings</legend>
        <label title={TIPS.operateOnView}>
          <input
            type="checkbox"
            checked={values["operate_on_view"] === true}
            onChange={(event) => put("operate_on_view", event.currentTarget.checked)}
          />{" "}
          Operate On View
        </label>
        <label title={TIPS.pixelPriority}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => put("pixel_priority_enabled", event.currentTarget.checked)}
          />{" "}
          Enable Pixel Priority
        </label>
        {/* Legacy's direction pair, indented under the switch and live only while it is on. */}
        <div className="settings-editor__indent">
          <label title={TIPS.ascending}>
            <input
              type="radio"
              name="pixel_priority_direction"
              checked={ascending}
              disabled={!enabled}
              onChange={() => put("pixel_priority_ascending", true)}
            />{" "}
            Ascending
          </label>
          <label title={TIPS.descending}>
            <input
              type="radio"
              name="pixel_priority_direction"
              checked={!ascending}
              disabled={!enabled}
              onChange={() => put("pixel_priority_ascending", false)}
            />{" "}
            Descending
          </label>
        </div>
      </fieldset>
    </section>
  );
}

/**
 * A number typed in and applied when editing finishes.
 *
 * The typing is held here until then, so the field keeps its focus through a save; it used to be
 * keyed on the stored value, which remounted it, and focus went with the old one.
 */
function NumberField({
  label,
  title,
  value,
  min,
  max,
  integer,
  step,
  onCommit,
}: {
  readonly label: string;
  readonly title: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly integer: boolean;
  readonly step?: number;
  readonly onCommit: (value: number) => void;
}): ReactNode {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const typed = draft.trim();
    const parsed = Number(typed);
    // RULE-050: non-numeric input reverts to the value in force, which dropping the draft shows.
    if (typed === "" || !Number.isFinite(parsed)) return;
    const snapped = step !== undefined ? Math.round(parsed / step) * step : integer ? Math.round(parsed) : parsed;
    const clamped = Math.min(max, Math.max(min, snapped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <label className="crop__field" title={title}>
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step ?? (integer ? 1 : 0.1)}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
    </label>
  );
}
