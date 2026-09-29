/**
 * Choosing which formats a save writes.
 *
 * Persona flow 4's second step: "choose the export formats; they are saved to settings.json when
 * the app closes." Here they are saved when they change, because decision 7 replaced the
 * write-everything-on-exit behaviour that lost the last image's work.
 *
 * LEGACY'S CONTROL: "Export Formats:" and a dropdown beside it whose text sums up the choice, "NPZ,
 * YOLO Det", "3 formats", "All formats", and which opens on a checklist of the seven
 * (settings_widget.py:46-57; export_format_widget.py:16-106). It was seven checkboxes under a
 * heading until 2026-09-29, when the owner asked for every setting to be as the desktop app has it.
 *
 * Each format reads as legacy's menu names it, with its tooltip (core/exporters/__init__.py:26-57).
 * It read as the format's id and suffix, "YOLO_DETECTION .txt", until 2026-09-26 (CONTROL_PARITY.md
 * CP-61). The ids are what is stored and sent; only the words on screen are legacy's.
 *
 * RULE-088's clauses live in `@lazylabel/settings-schema` and are called, not reimplemented. The
 * one with teeth is that the list can never be empty: an empty selection makes a save write no
 * files and still report success. As legacy's does, the last format stays ticked when it is
 * cleared (export_format_widget.py:94-101), and the dropdown's tooltip says why.
 */

import { useCallback, useEffect, useRef, type ReactNode } from "react";

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

/** Legacy's short names, for the dropdown's own text (export_format_widget.py:66-74). */
const SHORT: Readonly<Record<string, string>> = {
  NPZ: "NPZ",
  NPZ_CLASS_MAP: "NPZ CM",
  YOLO_DETECTION: "YOLO Det",
  YOLO_SEGMENTATION: "YOLO Seg",
  COCO_JSON: "COCO",
  PASCAL_VOC: "VOC",
  CREATEML: "CML",
};

/**
 * What the closed dropdown says, in legacy's words (export_format_widget.py:76-92): up to two by
 * their short names in the menu's order, "N formats" beyond that, "All formats" for all seven.
 */
export function summaryOf(selected: readonly string[]): string {
  const count = selected.length;
  if (count === 0) return "(none)";
  if (count === KNOWN_EXPORT_FORMATS.length) return "All formats";
  if (count <= 2) {
    return KNOWN_EXPORT_FORMATS.filter((format) => selected.includes(format))
      .map((format) => SHORT[format] ?? format)
      .join(", ");
  }
  return `${count} formats`;
}

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

  // Closed by a press anywhere else, as a menu is: open, it lies over the controls under it.
  const dropdown = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const element = dropdown.current;
      if (element?.open === true && !element.contains(event.target as Node)) element.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return (
    // Legacy's row: the label, then the dropdown carrying the group's tooltip (settings_widget.py:
    // 46-57). Each format in the menu has its own.
    <div className="formats">
      <span className="formats__label">Export Formats:</span>
      <details
        ref={dropdown}
        className="formats__dropdown"
        title={"Select which annotation formats to save.\nAt least one format must be selected."}
      >
        <summary>{summaryOf(selected)}</summary>
        <div className="formats__menu">
          {KNOWN_EXPORT_FORMATS.map((format) => (
            <label key={format} title={TOOLTIP[format]}>
              <input
                type="checkbox"
                checked={selected.includes(format)}
                onChange={() => toggle(format)}
              />{" "}
              {LABEL[format] ?? format}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
