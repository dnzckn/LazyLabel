/**
 * The settings and hotkey schema, shared by the API and the web app.
 *
 * A separate package rather than a corner of the API, for one structural reason: the rebinding
 * dialog must refuse a conflicting key while the user is typing, so the browser needs this logic
 * locally, and importing the API package into a browser bundle would drag `node:sqlite` and
 * `node:fs` along with it. Two implementations of RULE-049 would then drift, which is the failure
 * the format library exists to prevent one directory over.
 *
 * Nothing here touches a file, a socket or a database. It is data shapes, defaults, and the rules
 * for deciding whether a proposed change is allowed.
 */

export {
  DEFAULT_EXPORT_FORMATS,
  DEFAULT_HOTKEYS,
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION,
  defaultSettings,
  type HotkeyAction,
  type HotkeyBinding,
  type StoredSettings,
} from "./schema.js";

export {
  importLegacySettings,
  type ImportResult,
  type ImportWarning,
} from "./importLegacy.js";

export { shapeProblems } from "./shape.js";

export {
  KNOWN_EXPORT_FORMATS,
  canRemoveExportFormat,
  normalizeExportFormats,
  type ExportFormatsResult,
} from "./exportFormats.js";

export {
  actionHolding,
  canRebind,
  checkAssignment,
  findConflicts,
  type HotkeyConflict,
} from "./hotkeyConflicts.js";
