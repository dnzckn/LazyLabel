/**
 * Which formats a save writes — RULE-088's second half.
 *
 * The rule card carries four clauses that are easy to miss because they read like UI trivia and are
 * not. The export format list decides which files a save WRITES, so getting it wrong changes what
 * ends up in the user's folder:
 *
 *   - the list can never be empty;
 *   - unknown format names are dropped, and if none remain the defaults are used;
 *   - an empty or invalid saved list falls back to the defaults;
 *   - unchecking the last selected format re-checks it (the UI face of the first clause).
 *
 * Legacy enforces these in the widget rather than in the settings loader, which is why a settings
 * file can hold a list the app would never let you choose. Normalizing here means the API and the
 * browser cannot disagree about what a stored list means.
 */

import { DEFAULT_EXPORT_FORMATS } from "./schema.js";

/** The seven format names, as `ExportFormat` spells them. */
export const KNOWN_EXPORT_FORMATS: readonly string[] = [
  "NPZ",
  "NPZ_CLASS_MAP",
  "YOLO_DETECTION",
  "YOLO_SEGMENTATION",
  "COCO_JSON",
  "PASCAL_VOC",
  "CREATEML",
];

export interface ExportFormatsResult {
  readonly formats: readonly string[];
  /** What was changed and why. Empty when the input was already valid. */
  readonly warnings: readonly string[];
}

/**
 * Coerce a stored export-format list into one the app can act on.
 *
 * Order is preserved rather than sorted: it is the order the user chose, and nothing downstream
 * depends on it, so reordering would be a change with no benefit. Duplicates are collapsed.
 */
export function normalizeExportFormats(value: unknown): ExportFormatsResult {
  const warnings: string[] = [];

  if (!Array.isArray(value)) {
    return {
      formats: [...DEFAULT_EXPORT_FORMATS],
      warnings: [
        value === undefined
          ? "no export formats were stored; the defaults were used"
          : "the stored export formats were not a list; the defaults were used",
      ],
    };
  }

  const seen = new Set<string>();
  const formats: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !KNOWN_EXPORT_FORMATS.includes(entry)) {
      warnings.push(`${JSON.stringify(entry)} is not an export format; it was dropped`);
      continue;
    }
    if (seen.has(entry)) continue;
    seen.add(entry);
    formats.push(entry);
  }

  if (formats.length === 0) {
    // The clause that matters most. An empty list means a save writes NOTHING, which the user reads
    // as "my work was saved" right up until they reopen the image.
    warnings.push("no usable export formats remained; the defaults were used");
    return { formats: [...DEFAULT_EXPORT_FORMATS], warnings };
  }

  return { formats, warnings };
}

/**
 * Whether a format may be removed from the current selection.
 *
 * False for the last one. Legacy expresses this by re-checking the box the user just cleared; the
 * honest version is to refuse the removal and say why, rather than to accept it and undo it.
 */
export function canRemoveExportFormat(current: readonly string[], format: string): boolean {
  return current.length > 1 && current.includes(format);
}
