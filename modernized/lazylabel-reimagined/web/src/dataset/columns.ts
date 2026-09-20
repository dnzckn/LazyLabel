/**
 * Which of the dataset browser's format columns are shown — RULE-036's ten settings.
 *
 * All ten were stored and read by nothing, so the table showed a column for every format the API
 * reported and a user could not hide one. On a folder whose images carry two of the seven formats,
 * five of the columns are a field of dots.
 *
 * THE MAPPING IS BY SUFFIX, NOT BY FORMAT NAME, because that is what legacy's settings are named
 * after and what the API's column list carries. `file_manager_show_npz` means the `.npz` column;
 * the format behind it is `NPZ`, and the two have agreed so far, but the setting was written
 * against the suffix and a rename of the format would not change which column a user hid.
 *
 * The IMAGE column has a setting too (`file_manager_show_name`) and is deliberately NOT honoured:
 * it holds the button that opens the image, so hiding it would leave a table nothing can be opened
 * from. Legacy lets you hide it and it is a trap there; this is one of the few places where
 * copying the behaviour would be copying a defect.
 */

/** Setting key by the suffix its column shows. */
const BY_SUFFIX: Readonly<Record<string, string>> = {
  ".npz": "file_manager_show_npz",
  "_CM.npz": "file_manager_show_cm",
  ".txt": "file_manager_show_txt",
  "_seg.txt": "file_manager_show_seg",
  "_coco.json": "file_manager_show_coco",
  ".xml": "file_manager_show_voc",
  "_createml.json": "file_manager_show_cml",
};

export interface Column {
  readonly format: string;
  readonly suffix: string;
}

/**
 * The columns to render, in the API's order.
 *
 * A column whose suffix nothing maps to is SHOWN. A new format added to the API without a setting
 * should appear rather than vanish: a user who cannot see a column does not know to look for the
 * switch that hides it.
 */
export function visibleColumns(
  columns: readonly Column[],
  values: Readonly<Record<string, unknown>>,
): readonly Column[] {
  return columns.filter((column) => {
    const key = BY_SUFFIX[column.suffix];
    if (key === undefined) return true;
    return values[key] !== false;
  });
}

/** Every column the browser knows how to hide, for the control that hides them. */
export function hideableColumns(columns: readonly Column[]): readonly (Column & { readonly setting: string })[] {
  return columns.flatMap((column) => {
    const setting = BY_SUFFIX[column.suffix];
    return setting === undefined ? [] : [{ ...column, setting }];
  });
}
