/**
 * Choosing which formats a save writes.
 *
 * Persona flow 4's second step: "choose the export formats; they are saved to settings.json when
 * the app closes." Here they are saved when they change, because decision 7 replaced the
 * write-everything-on-exit behaviour that lost the last image's work.
 *
 * Each format reads as legacy's Export Formats menu names it, with its tooltip
 * (core/exporters/__init__.py:26-57; ui/widgets/export_format_widget.py:31-36). It read as the
 * format's id and suffix, "YOLO_DETECTION .txt", until 2026-09-26 (CONTROL_PARITY.md CP-61). The
 * ids are what is stored and sent; only the words on screen are legacy's.
 *
 * RULE-088's clauses live in `@lazylabel/settings-schema` and are called, not reimplemented. The
 * one with teeth is that the list can never be empty: an empty selection makes a save write no
 * files and still report success. As legacy's does, the last format stays ticked when it is
 * cleared (export_format_widget.py:94-101), and the group's tooltip says why.
 */

import { useCallback, type ReactNode } from "react";

import { KNOWN_EXPORT_FORMATS, canRemoveExportFormat, normalizeExportFormats } from "@lazylabel/settings-schema";

import { useSettings } from "../settings/SettingsProvider.jsx";

/** Legacy's name for each format (core/exporters/__init__.py:26-34). */
const LABEL: Readonly<Record<string, string>> = {
  NPZ: "NPZ",
  NPZ_CLASS_MAP: "NPZ Class Map",
  YOLO_DETECTION: "YOLO Detection",
  YOLO_SEGMENTATION: "YOLO Segmentation",
  COCO_JSON: "COCO JSON",
  PASCAL_VOC: "Pascal VOC",
  CREATEML: "CreateML",
};

/** Legacy's tooltip for each format, word for word (core/exporters/__init__.py:36-58). */
const TOOLTIP: Readonly<Record<string, string>> = {
  NPZ: "One-hot encoded mask tensor (H×W×C). One binary channel per class. Supports overlapping classes.",
  NPZ_CLASS_MAP:
    "Single-channel class map (H×W). Each pixel stores its class index. Overlaps default to lowest class index; use Pixel Priority to control.",
  YOLO_DETECTION: "YOLO bounding box format. One .txt file per image with normalized coordinates.",
  YOLO_SEGMENTATION: "YOLO polygon segmentation format. Normalized polygon vertices per object.",
  COCO_JSON: "COCO-style JSON with polygon segmentation, bounding boxes, and categories.",
  PASCAL_VOC: "Pascal VOC XML format with bounding box annotations.",
  CREATEML: "Apple CreateML JSON format with bounding box annotations.",
};

export interface ExportFormatsProps {
  /** Called with the selection whenever it changes, so a caller can save with it. */
  readonly onChange?: (formats: readonly string[]) => void;
}

export function ExportFormats({ onChange }: ExportFormatsProps): ReactNode {
  const { settings, save } = useSettings();

  // Whatever is stored, read through the same normalizer the API uses, so a settings file written
  // by hand cannot put the UI into a state the save path would reject.
  const selected = normalizeExportFormats(settings.values["export_formats"]).formats;

  const toggle = useCallback(
    (format: string) => {
      const isOn = selected.includes(format);
      // The last one stays ticked, as legacy re-ticks it.
      if (isOn && !canRemoveExportFormat(selected, format)) return;

      const next = isOn ? selected.filter((f) => f !== format) : [...selected, format];
      onChange?.(next);
      void save({ ...settings, values: { ...settings.values, export_formats: next } });
    },
    [onChange, save, selected, settings],
  );

  return (
    // Legacy's label and tooltip (settings_widget.py:46-57).
    <fieldset title={"Select which annotation formats to save.\nAt least one format must be selected."}>
      <legend>Export Formats</legend>

      <ul className="formats">
        {KNOWN_EXPORT_FORMATS.map((format) => (
          <li key={format}>
            <label title={TOOLTIP[format]}>
              <input
                type="checkbox"
                checked={selected.includes(format)}
                onChange={() => toggle(format)}
              />{" "}
              {LABEL[format] ?? format}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
