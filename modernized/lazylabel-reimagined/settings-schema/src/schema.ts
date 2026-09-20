/**
 * The versioned settings and hotkey schema.
 *
 * The defaults below are the legacy ones, field for field, from `config/settings.py` and
 * `config/hotkeys.py` at 2a7d5d8. They are copied rather than derived because a user who upgrades
 * should find their app behaving as it did, and a default silently changing during a port is the
 * kind of difference nobody reports and everybody feels.
 */

export const SETTINGS_SCHEMA_VERSION = 1;

/** Which annotation formats a save writes, when the user has expressed no preference. */
export const DEFAULT_EXPORT_FORMATS: readonly string[] = ["NPZ", "YOLO_DETECTION"];

/**
 * Every setting the app knows about, with its default.
 *
 * A key's presence here is what makes it "known": known keys are type-checked on import, and
 * anything else is preserved untouched rather than discarded.
 */
export const DEFAULT_SETTINGS: Readonly<Record<string, unknown>> = Object.freeze({
  // UI
  window_width: 1600,
  window_height: 900,
  left_panel_width: 250,
  right_panel_width: 350,

  // Annotation
  point_radius: 0.3,
  line_thickness: 0.5,
  pan_multiplier: 1.0,
  polygon_join_threshold: 2,
  fragment_threshold: 0,

  // Auto-polygon conversion
  auto_polygon_enabled: false,
  polygon_resolution: 80,

  // Image adjustment
  brightness: 0.0,
  contrast: 0.0,
  gamma: 1.0,
  saturation: 1.0,

  // Model
  //
  // The legacy two are kept so an imported settings.json round-trips, but nothing READS them: they
  // are the file-name-based selection RULE-085 rules out, where renaming a checkpoint changes how
  // the software interprets its contents. `ai_model` replaces them with a manifest NAME, which is
  // a statement by whoever put the file there rather than a guess from its spelling.
  //
  // Empty means no model chosen. The AI tools are offered only once it is set, because a wrong
  // guess here is a request the service can only refuse.
  ai_model: "",
  default_model_type: "vit_h",
  default_model_filename: "sam_vit_h_4b8939.pth",
  operate_on_view: false,

  // Save
  auto_save: true,
  export_formats: DEFAULT_EXPORT_FORMATS,

  // UI state
  annotation_size_multiplier: 1.0,

  // Streaming
  stream_window_size: 250,

  // Theme
  dark_mode: true,

  // Multi-view
  multi_view_grid_mode: "2_view",

  // Pixel priority
  pixel_priority_enabled: false,
  pixel_priority_ascending: true,

  // File manager display
  file_manager_show_name: true,
  file_manager_show_npz: true,
  file_manager_show_txt: true,
  file_manager_show_seg: false,
  file_manager_show_coco: false,
  file_manager_show_voc: false,
  file_manager_show_cm: false,
  file_manager_show_cml: false,
  file_manager_show_modified: true,
  file_manager_show_size: true,
  file_manager_sort_order: 0,

  // Sequence propagation. Decision 9 persists this; legacy held it only in memory.
  propagation_confidence_threshold: 0.5,
});

export interface HotkeyBinding {
  readonly primary: string;
  readonly secondary: string | null;
}

export interface HotkeyAction extends HotkeyBinding {
  readonly description: string;
  readonly category: string;
  /** Mouse actions cannot be rebound, and legacy never persists them. */
  readonly mouseRelated: boolean;
}

function action(
  description: string,
  category: string,
  primary: string,
  secondary: string | null = null,
  mouseRelated = false,
): HotkeyAction {
  return { description, category, primary, secondary, mouseRelated };
}

/** The legacy default hotkeys, in the legacy categories. */
export const DEFAULT_HOTKEYS: Readonly<Record<string, HotkeyAction>> = Object.freeze({
  load_next_image: action("Load Next Image", "Navigation", "Right"),
  load_previous_image: action("Load Previous Image", "Navigation", "Left"),
  fit_view: action("Fit View", "Navigation", "."),

  sam_mode: action("AI Mode (Points + Box)", "Modes", "1"),
  polygon_mode: action("Polygon Mode", "Modes", "2"),
  bbox_mode: action("Bounding Box Mode", "Modes", "3"),
  circle_mode: action("Circle Mode", "Modes", "4"),
  selection_mode: action("Selection Mode", "Modes", "E"),
  pan_mode: action("Pan Mode", "Modes", "Q"),
  edit_mode: action("Edit Mode", "Modes", "R"),

  clear_points: action("Clear Points/Vertices", "Actions", "C"),
  save_segment: action("Save Current Segment", "Actions", "Space"),
  erase_segment: action("Erase with Current Segment", "Actions", "Shift+Space"),
  save_output: action("Save Output", "Actions", "Return"),
  save_output_alt: action("Save Output (Alt)", "Actions", "Enter"),
  undo: action("Undo Last Action", "Actions", "Ctrl+Z"),
  redo: action("Redo Last Action", "Actions", "Ctrl+Y", "Ctrl+Shift+Z"),
  escape: action("Cancel/Clear Selection", "Actions", "Escape"),
  toggle_ai_filter: action("Toggle AI Filter", "Actions", "Z"),

  merge_segments: action("Merge Selected Segments", "Segments", "M"),
  delete_segments: action("Delete Selected Segments", "Segments", "V"),
  delete_segments_alt: action("Delete Selected Segments (Alt)", "Segments", "Backspace"),
  select_all: action("Select All Segments", "Segments", "Ctrl+A"),
  convert_to_polygons: action("Toggle Auto-Convert AI to Polygon", "Segments", "P"),

  toggle_recent_class: action("Toggle Recent Class", "Classes", "X"),

  zoom_in: action("Zoom In", "View", "Ctrl+Plus"),
  zoom_out: action("Zoom Out", "View", "Ctrl+Minus"),

  pan_up: action("Pan Up", "Movement", "W"),
  pan_down: action("Pan Down", "Movement", "S"),
  pan_left: action("Pan Left", "Movement", "A"),
  pan_right: action("Pan Right", "Movement", "D"),

  add_reference_frame: action("Add Current Frame as Reference", "Sequence", "G"),
  next_flagged_frame: action("Next Flagged Frame", "Sequence", "N"),
  prev_flagged_frame: action("Previous Flagged Frame", "Sequence", "Shift+N"),
  next_reference_frame: action("Next Reference Frame", "Sequence", "B"),
  prev_reference_frame: action("Previous Reference Frame", "Sequence", "Shift+B"),
  next_suggested_frame: action("Next Archetype Frame", "Sequence", "H"),
  prev_suggested_frame: action("Previous Archetype Frame", "Sequence", "Shift+H"),
  find_archetypes: action("Find Archetypes", "Sequence", "Ctrl+H"),
  propagate: action("Start Propagation", "Sequence", "Ctrl+P"),

  left_click: action("AI: Point (click) / Box (drag) / Select", "Mouse", "Left Click", null, true),
  right_click: action("Add Negative Point", "Mouse", "Right Click", null, true),
  mouse_drag: action("Drag/Pan", "Mouse", "Mouse Drag", null, true),
});

/**
 * What the metadata store holds for one user.
 *
 * `values` carries every setting key, known and unknown alike. Keeping the unknown ones is the
 * whole point: RULE-088 records that the legacy loader passes the parsed JSON straight into a
 * dataclass constructor, so ONE unrecognized key raises TypeError, the handler swallows it, and
 * every preference the user ever set is replaced by defaults. A settings file written by a newer
 * version, or by a build with a feature flag, silently wipes the lot.
 */
export interface StoredSettings {
  readonly schemaVersion: number;
  readonly values: Readonly<Record<string, unknown>>;
  readonly hotkeys: Readonly<Record<string, HotkeyBinding>>;
}

export function defaultSettings(): StoredSettings {
  const hotkeys: Record<string, HotkeyBinding> = {};
  for (const [name, entry] of Object.entries(DEFAULT_HOTKEYS)) {
    hotkeys[name] = { primary: entry.primary, secondary: entry.secondary };
  }
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    values: { ...DEFAULT_SETTINGS },
    hotkeys,
  };
}
