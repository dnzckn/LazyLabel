/**
 * The file list's columns: legacy's ten, in legacy's order, each shown by its RULE-036 setting.
 *
 * Legacy's order is fixed (fast_file_manager.py:277-288): Name, the seven formats as NPZ OHE, NPZ
 * CM, YOLO Det, YOLO Seg, COCO, VOC, CreateML, then Modified and Size. The list followed the API's
 * load-priority order until 2026-09-26 (CONTROL_PARITY.md CP-63), which put YOLO Det last.
 *
 * THE MAPPING IS BY SUFFIX, NOT BY FORMAT NAME, because that is what legacy's settings are named
 * after and what the API's column list carries. `file_manager_show_npz` means the `.npz` column;
 * a rename of the format would not change which column a user hid.
 *
 * NAME CAN BE HIDDEN, as legacy's column menu lets it be (fast_file_manager.py:1169, 406-414). It
 * was always shown here until 2026-09-26; the owner asked for every feature to behave as legacy's.
 */

/** A status column as the API reports it: a format and the suffix its file carries. */
export interface Column {
  readonly format: string;
  readonly suffix: string;
}

/** One column of the list. */
export interface ListColumn {
  /** "name", "modified", "size", or the format a status column shows. */
  readonly id: string;
  /** Legacy's header text. */
  readonly title: string;
  readonly kind: "name" | "format" | "modified" | "size";
  /** The setting that shows it. None for a format legacy never had: that column is always shown. */
  readonly setting?: string;
  /** The suffix a status column's file carries, for its tooltip. */
  readonly suffix?: string;
}

/** Legacy's seven status columns in its order, by the suffix each shows (fast_file_manager.py:277-288, 450-459). */
const STATUS: readonly { readonly suffix: string; readonly title: string; readonly setting: string }[] = [
  { suffix: ".npz", title: "NPZ OHE", setting: "file_manager_show_npz" },
  { suffix: "_CM.npz", title: "NPZ CM", setting: "file_manager_show_cm" },
  { suffix: ".txt", title: "YOLO Det", setting: "file_manager_show_txt" },
  { suffix: "_seg.txt", title: "YOLO Seg", setting: "file_manager_show_seg" },
  { suffix: "_coco.json", title: "COCO", setting: "file_manager_show_coco" },
  { suffix: ".xml", title: "VOC", setting: "file_manager_show_voc" },
  { suffix: "_createml.json", title: "CreateML", setting: "file_manager_show_cml" },
];

/**
 * Every column of the list, in legacy's order, whichever order the API reports its formats in.
 *
 * A format legacy never had goes after CreateML under its suffix, and has no setting: a column
 * added to the API should appear rather than vanish, since a user who cannot see a column does not
 * know to look for the switch that hides it.
 */
export function listColumns(formats: readonly Column[]): readonly ListColumn[] {
  const known = STATUS.flatMap((status): ListColumn[] => {
    const column = formats.find((candidate) => candidate.suffix === status.suffix);
    return column === undefined
      ? []
      : [{ id: column.format, title: status.title, kind: "format", setting: status.setting, suffix: column.suffix }];
  });
  const unknown = formats
    .filter((column) => !STATUS.some((status) => status.suffix === column.suffix))
    .map((column): ListColumn => ({ id: column.format, title: column.suffix, kind: "format", suffix: column.suffix }));
  return [
    { id: "name", title: "Name", kind: "name", setting: "file_manager_show_name" },
    ...known,
    ...unknown,
    { id: "modified", title: "Modified", kind: "modified", setting: "file_manager_show_modified" },
    { id: "size", title: "Size", kind: "size", setting: "file_manager_show_size" },
  ];
}

/** The columns switched on. A missing setting is on; only `false` hides. */
export function shownColumns(
  columns: readonly ListColumn[],
  values: Readonly<Record<string, unknown>>,
): readonly ListColumn[] {
  return columns.filter((column) => column.setting === undefined || values[column.setting] !== false);
}

/**
 * A file's size as legacy's list shows it (fast_file_manager.py:527-533): binary units and one
 * decimal in every one of them, so "912.0 B" and "1.4 MB". Rounded as Python's `.1f` rounds, with
 * an exact half going to the even tenth: 1280 bytes is "1.2 KB" there, where `toFixed` says 1.3.
 */
export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return "";
  if (bytes < 0) return "-";
  let divisor = 1;
  for (const unit of ["B", "KB", "MB", "GB"]) {
    if (bytes < 1024 * divisor) return `${tenths(bytes, divisor)} ${unit}`;
    divisor *= 1024;
  }
  return `${tenths(bytes, divisor)} TB`;
}

/** `bytes / divisor` to one decimal, in integers so an exact half is seen as one. */
function tenths(bytes: number, divisor: number): string {
  const scaled = bytes * 10;
  let whole = Math.floor(scaled / divisor);
  const rest = scaled - whole * divisor;
  if (rest * 2 > divisor || (rest * 2 === divisor && whole % 2 === 1)) whole += 1;
  return `${Math.floor(whole / 10)}.${whole % 10}`;
}

/**
 * When a file was last written, as legacy's list shows it: local time as "%Y-%m-%d %H:%M", and "-"
 * when the time could not be read (fast_file_manager.py:466-479). Blank when the listing was not
 * asked for it.
 */
export function formatModified(modified: number | null | undefined): string {
  if (modified === undefined) return "";
  if (modified === null || modified <= 0) return "-";
  const at = new Date(modified);
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
}
