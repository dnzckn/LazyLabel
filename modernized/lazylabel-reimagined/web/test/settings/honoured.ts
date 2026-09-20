/**
 * Which settings the app actually acts on, and why the rest do not.
 *
 * A settings screen that persists a value nothing reads is a lie the user cannot detect: they set
 * it, it is remembered, it changes nothing. This project has now found four of those the hard way
 * — `operate_on_view`, RULE-012's two pixel-priority keys, and `propagation_confidence_threshold`
 * — each by noticing rather than by anything failing. This list is so that noticing is not the
 * mechanism.
 *
 * Every key in the schema is classified here as one of three things, and `honoured.test.ts` checks
 * the classification against the source:
 *
 *   - READ — some code looks it up. The test fails if that stops being true.
 *   - DROPPED — deliberately not honoured, with the decision that says so. The test fails if code
 *     starts reading it, because then the reason has gone stale.
 *   - GAP — a real hole, with what is missing. Same check as DROPPED; the difference is that a GAP
 *     is work and a DROPPED is a decision.
 *
 * A new setting that nobody classifies fails the test, which is the point: the question "does
 * anything read this?" gets asked once, when it is cheapest to answer.
 */

export type Honoured =
  | { readonly kind: "read" }
  | { readonly kind: "dropped"; readonly why: string }
  | { readonly kind: "gap"; readonly missing: string };

const read: Honoured = { kind: "read" };
const dropped = (why: string): Honoured => ({ kind: "dropped", why });
const gap = (missing: string): Honoured => ({ kind: "gap", missing });

/** A browser window is the browser's, not the app's. */
const GEOMETRY = dropped(
  "desktop window geometry. A browser window is sized by the user and the panels reflow; "
    + "restoring pixel widths would fight both.",
);

/** The dataset browser shows every format column it knows about, always. */
const COLUMN = gap(
  "the dataset browser shows a column for every format the API reports, so these cannot hide one. "
    + "Legacy's defaults differ per column, which is why they are stored rather than assumed.",
);

export const HONOURED: Readonly<Record<string, Honoured>> = {
  window_width: GEOMETRY,
  window_height: GEOMETRY,
  left_panel_width: GEOMETRY,
  right_panel_width: GEOMETRY,

  // All three read through `canvas/sizing.ts`, which is where the unit change lives: legacy sizes
  // handles in IMAGE pixels so they grow with zoom, and this app sizes them on SCREEN so they stay
  // grabbable when you are looking at the whole image. The settings therefore arrive as ratios
  // against legacy's own defaults rather than as lengths -- 0.3 read as a screen length is not a
  // smaller handle, it is an invisible one.
  point_radius: read,
  line_thickness: read,
  annotation_size_multiplier: read,
  pan_multiplier: gap("the canvas pans with the browser's own scrolling, which has no multiplier."),

  polygon_join_threshold: read,
  fragment_threshold: read,
  auto_polygon_enabled: gap(
    "RULE-047's automatic polygon closing is not built; the user closes a polygon by clicking the "
      + "first vertex or pressing Space.",
  ),
  polygon_resolution: gap("the vertex-count reduction RULE-047 describes is not built."),

  brightness: read,
  contrast: read,
  gamma: read,
  saturation: read,

  ai_model: read,
  // RULE-085 rules out choosing a checkpoint by its FILE NAME: renaming a file would change how
  // the software interprets its contents. `ai_model` names a manifest entry instead, which is a
  // statement by whoever put the file there. Both legacy keys are kept so an imported settings.json
  // round-trips rather than losing a value the user set.
  default_model_type: dropped(
    "RULE-085: selection by file name is replaced by a manifest NAME (`ai_model`), because "
      + "renaming a checkpoint must not change how the software reads it.",
  ),
  default_model_filename: dropped(
    "RULE-085, as `default_model_type`: the file name is not allowed to be the identity.",
  ),
  operate_on_view: gap(
    "RULE-089. With it on, the model should segment the ADJUSTED pixels on screen rather than the "
      + "decoded file. The adjustments are applied in the browser and the model reads the file, so "
      + "honouring it means the request carries the view -- a contract change across three "
      + "packages. The AI panel says so on screen rather than implying otherwise.",
  ),

  auto_save: dropped(
    "decision 7: nothing is written without an explicit act. Legacy saves on navigation, which is "
      + "how it deletes every sidecar for an image whose segments happen to be empty. The key stays "
      + "so an imported legacy settings file round-trips rather than losing a value the user set.",
  ),
  export_formats: read,
  stream_window_size: gap("propagation's streaming window; propagation is not built (C11)."),
  dark_mode: read,
  multi_view_grid_mode: dropped(
    "decision 8: legacy's four-view setting was a control over two viewers, and the split view is "
      + "rebuilt with two. Kept for the same round-trip reason as auto_save.",
  ),

  pixel_priority_enabled: read,
  pixel_priority_ascending: read,

  file_manager_show_name: COLUMN,
  file_manager_show_npz: COLUMN,
  file_manager_show_txt: COLUMN,
  file_manager_show_seg: COLUMN,
  file_manager_show_coco: COLUMN,
  file_manager_show_voc: COLUMN,
  file_manager_show_cm: COLUMN,
  file_manager_show_cml: COLUMN,
  file_manager_show_modified: COLUMN,
  file_manager_show_size: COLUMN,
  file_manager_sort_order: gap(
    "the dataset browser lists images in the order the API returns them; RULE-036's sort is not "
      + "wired to a control.",
  ),

  propagation_confidence_threshold: read,
};
