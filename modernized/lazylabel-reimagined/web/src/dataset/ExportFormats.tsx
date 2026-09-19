/**
 * Choosing which formats a save writes.
 *
 * Persona flow 4's second step: "choose the export formats; they are saved to settings.json when
 * the app closes." Here they are saved when they change, because decision 7 replaced the
 * write-everything-on-exit behaviour that lost the last image's work.
 *
 * RULE-088's clauses live in `@lazylabel/settings-schema` and are called, not reimplemented. The
 * one with teeth is that the list can never be empty: an empty selection makes a save write no
 * files and still report success, and the user finds out when they reopen the image. Legacy
 * enforces it by silently re-checking the box the user just cleared; this refuses the removal and
 * says why, which is the same rule without the sleight of hand.
 */

import { useCallback, useState, type ReactNode } from "react";

import { KNOWN_EXPORT_FORMATS, canRemoveExportFormat, normalizeExportFormats } from "@lazylabel/settings-schema";

import { useSettings } from "../settings/SettingsProvider.jsx";

/** The suffix each format writes, so the control is labelled the way the file list is. */
const SUFFIX: Readonly<Record<string, string>> = {
  NPZ: ".npz",
  NPZ_CLASS_MAP: "_CM.npz",
  YOLO_DETECTION: ".txt",
  YOLO_SEGMENTATION: "_seg.txt",
  COCO_JSON: "_coco.json",
  PASCAL_VOC: ".xml",
  CREATEML: "_createml.json",
};

export interface ExportFormatsProps {
  /** Called with the selection whenever it changes, so a caller can save with it. */
  readonly onChange?: (formats: readonly string[]) => void;
}

export function ExportFormats({ onChange }: ExportFormatsProps): ReactNode {
  const { settings, save } = useSettings();
  const [refusal, setRefusal] = useState<string | null>(null);

  // Whatever is stored, read through the same normalizer the API uses, so a settings file written
  // by hand cannot put the UI into a state the save path would reject.
  const selected = normalizeExportFormats(settings.values["export_formats"]).formats;

  const toggle = useCallback(
    (format: string) => {
      setRefusal(null);
      const isOn = selected.includes(format);

      if (isOn && !canRemoveExportFormat(selected, format)) {
        setRefusal(
          `${format} is the only selected format. A save with none selected writes no files at all, so at least one has to stay.`,
        );
        return;
      }

      const next = isOn ? selected.filter((f) => f !== format) : [...selected, format];
      onChange?.(next);
      void save({ ...settings, values: { ...settings.values, export_formats: next } });
    },
    [onChange, save, selected, settings],
  );

  return (
    <fieldset>
      <legend>Formats to write</legend>

      <ul className="formats">
        {KNOWN_EXPORT_FORMATS.map((format) => (
          <li key={format}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(format)}
                onChange={() => toggle(format)}
              />{" "}
              {format} <code>{SUFFIX[format]}</code>
            </label>
          </li>
        ))}
      </ul>

      {refusal !== null && (
        <p role="status" className="banner banner--warning">
          {refusal}
        </p>
      )}
    </fieldset>
  );
}
