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

/**
 * `file_manager_show_name` is deliberately NOT honoured: the Image column holds the button that
 * opens the image, so hiding it would leave a table nothing can be opened from. Legacy lets you
 * hide it and it is a trap there -- one of the few places where copying the behaviour would be
 * copying a defect.
 */
const NAME_COLUMN = dropped(
  "the Image column holds the button that opens the image; hiding it, as legacy allows, leaves a "
    + "table nothing can be opened from.",
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
  // Scales the step the four `pan_*` keys move the zoomed image by. The PANE scrolls rather than
  // the canvas being transformed: the pane already scrolls once an image is larger than it, and a
  // transform would be a second way to position the image that the scrollbar could disagree with.
  pan_multiplier: read,

  polygon_join_threshold: read,
  fragment_threshold: read,
  // Legacy's Auto-Convert, read through `tools/autoPolygon.ts`: an accepted AI mask becomes an
  // editable polygon. `polygon_resolution` is the 1-100 slider legacy maps to an epsilon factor
  // for `approxPolyDP` (`control_panel.py:892-899`).
  auto_polygon_enabled: read,
  polygon_resolution: read,

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
  // RULE-089, and it took all four packages. Sending the adjustments with an embed is what makes
  // the API render the picture the user is looking at and post it to the model; omitting them is
  // the rule's default, where the model segments the original file and no image crosses that wire.
  operate_on_view: read,

  auto_save: dropped(
    "decision 7: nothing is written without an explicit act. Legacy saves on navigation, which is "
      + "how it deletes every sidecar for an image whose segments happen to be empty. The key stays "
      + "so an imported legacy settings file round-trips rather than losing a value the user set.",
  ),
  export_formats: read,
  stream_window_size: gap(
    "propagation's streaming window. RULE-026's arithmetic IS built and proven against legacy's "
      + "own loop (`inference/src/lazylabel_inference/windows.py`) -- what is missing is the web "
      + "side: the job API this would be sent to still answers 501 (C11). Narrower than it was, "
      + "and still a gap, because a user setting it here changes nothing.",
  ),
  dark_mode: read,
  multi_view_grid_mode: dropped(
    "decision 8: legacy's four-view setting was a control over two viewers, and the split view is "
      + "rebuilt with two. Kept for the same round-trip reason as auto_save.",
  ),

  pixel_priority_enabled: read,
  pixel_priority_ascending: read,

  file_manager_show_name: NAME_COLUMN,
  file_manager_show_npz: read,
  file_manager_show_txt: read,
  file_manager_show_seg: read,
  file_manager_show_coco: read,
  file_manager_show_voc: read,
  file_manager_show_cm: read,
  file_manager_show_cml: read,
  // Read, and the reason the listing can be asked for DETAILS at all: each costs a stat per image
  // on the server, so the browser fetches them only while one of these is on or a sort needs them.
  file_manager_show_modified: read,
  file_manager_show_size: read,
  // Read, and honest about its limits: only the two NAME orders can be performed, because the
  // listing carries no `modified` and no `size`. The other four fall back to name and the browser
  // says so, rather than showing a list sorted by name that claims to be sorted by size.
  file_manager_sort_order: read,

  propagation_confidence_threshold: read,
};
