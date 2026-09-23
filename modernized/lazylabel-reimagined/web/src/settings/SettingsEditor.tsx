/**
 * The settings no other control sets -- the settings half of C13's "web settings and hotkey editor".
 *
 * Found 2026-09-23 by asking of every key not "does anything READ it", which the settings guard
 * answers, but "can a user SET it". Twelve could not: each was read by the app and kept its default
 * unless a desktop import brought a value, so a new user could never turn on Operate On View
 * (RULE-089) or pixel priority (RULE-012), change pan speed or the join threshold, or choose the
 * file list's columns. Each saves when it changes, as the export formats do.
 *
 * RULE-050's clamps apply when editing FINISHES -- "given the user types 25 into Join, when editing
 * finishes, then the join threshold becomes 10" -- and non-numeric input reverts to the value in
 * force, as legacy's does.
 */

import { useState, type ReactNode } from "react";

import { useSettings } from "./SettingsProvider.jsx";

/** The file list's columns, with the suffix each one reports on. */
const COLUMNS: readonly (readonly [key: string, label: string])[] = [
  ["file_manager_show_npz", ".npz"],
  ["file_manager_show_cm", "_CM.npz"],
  ["file_manager_show_txt", ".txt"],
  ["file_manager_show_seg", "_seg.txt"],
  ["file_manager_show_coco", "_coco.json"],
  ["file_manager_show_voc", ".xml"],
  ["file_manager_show_cml", "_createml.json"],
];

export function SettingsEditor(): ReactNode {
  const { settings, save } = useSettings();
  const [problem, setProblem] = useState<string | null>(null);
  const values = settings.values;

  const put = (key: string, value: unknown) => {
    setProblem(null);
    save({ ...settings, values: { ...values, [key]: value } }).catch((cause: unknown) => {
      setProblem(`That setting could not be saved: ${cause instanceof Error ? cause.message : String(cause)}. Nothing changed.`);
    });
  };

  const number = (key: string, label: string, min: number, max: number, integer: boolean) => (
    <label className="crop__field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={integer ? 1 : 0.1}
        // Keyed on the stored value, so a save or a reload shows what is in force now.
        key={String(values[key])}
        defaultValue={String(values[key])}
        aria-label={label}
        onBlur={(event) => {
          const typed = event.currentTarget.value.trim();
          const parsed = Number(typed);
          if (typed === "" || !Number.isFinite(parsed)) {
            event.currentTarget.value = String(values[key]); // RULE-050: non-numeric reverts
            return;
          }
          const clamped = Math.min(max, Math.max(min, integer ? Math.round(parsed) : parsed));
          event.currentTarget.value = String(clamped);
          if (clamped !== values[key]) put(key, clamped);
        }}
      />
    </label>
  );

  const toggle = (key: string, label: string, disabled = false) => (
    <label>
      <input
        type="checkbox"
        checked={values[key] === true}
        disabled={disabled}
        onChange={(event) => put(key, event.currentTarget.checked)}
      />{" "}
      {label}
    </label>
  );

  return (
    <section>
      <h2>Settings</h2>

      {problem !== null && (
        <p role="status" className="banner banner--error">
          {problem}
        </p>
      )}

      <fieldset>
        <legend>Drawing</legend>
        {number("pan_multiplier", "Pan speed", 0.1, 10, false)}
        {number("polygon_join_threshold", "Join threshold (pixels)", 1, 10, true)}
      </fieldset>

      <fieldset>
        <legend>AI</legend>
        {toggle("operate_on_view", "Send the adjusted image to the AI, as you see it (Operate On View)")}
      </fieldset>

      <fieldset>
        <legend>Where annotations overlap</legend>
        {toggle("pixel_priority_enabled", "Give each pixel to one class")}
        {toggle(
          "pixel_priority_ascending",
          "The lower class id wins",
          values["pixel_priority_enabled"] !== true,
        )}
      </fieldset>

      <fieldset>
        <legend>File list columns</legend>
        {COLUMNS.map(([key, label]) => (
          <span key={key}>{toggle(key, label)} </span>
        ))}
      </fieldset>
    </section>
  );
}
