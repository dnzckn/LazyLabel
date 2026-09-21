/**
 * Decision 7 and RULE-057, as the cases that cost a user work.
 *
 * Each block below is a legacy behaviour that loses annotations, written as the test that stops it
 * coming back. The rule cards name every one of them; none is hypothetical.

 *
 * Names RULE-068 so the rule is traceable to the test that proves it: a rule named in
 * NO test cannot be audited, because "covered by a test that does not say so" and "not
 * covered" look identical to a reviewer. Enter completes pending work then saves.
 */

import { describe as group, expect, it } from "vitest";

import {
  canSave,
  describe,
  onClose,
  onNavigateAway,
  provenanceFromLoad,
  summarize,
  type ImageState,
} from "../../src/workspace/saveState.js";

const ON = { saveOnNavigate: true };
const OFF = { saveOnNavigate: false };

function image(overrides: Partial<ImageState> = {}): ImageState {
  return {
    key: "img_005.png",
    provenance: "loaded",
    dirty: true,
    segmentCount: 4,
    ...overrides,
  };
}

group("navigating away", () => {
  it("saves a dirty image when Auto-Save is on", () => {
    // RULE-057: auto-save on navigation stays, and stays the default. The annotator's loop is
    // click, accept, next, and decision 7 forbids silent loss rather than automatic saving.
    expect(onNavigateAway(image(), ON)).toEqual({ kind: "save", image: "img_005.png" });
  });

  it("asks instead of discarding when Auto-Save is off", () => {
    // Legacy discards silently here. The setting being off means "do not save for me", not
    // "throw my work away without telling me".
    const decision = onNavigateAway(image(), OFF);

    expect(decision.kind).toBe("ask");
    if (decision.kind !== "ask") throw new Error("expected a prompt");
    expect(decision.at).toEqual([{ key: "img_005.png", segmentCount: 4 }]);
  });

  it("does nothing for an image that was not edited", () => {
    expect(onNavigateAway(image({ dirty: false }), ON)).toEqual({ kind: "proceed" });
    expect(onNavigateAway(image({ dirty: false }), OFF)).toEqual({ kind: "proceed" });
  });

  it("does nothing when no image is open", () => {
    expect(onNavigateAway(null, ON)).toEqual({ kind: "proceed" });
  });

  it("SAVES an empty image rather than deleting its files", () => {
    // The clause that costs the most. In two-viewer mode legacy deletes ALL annotation files of a
    // viewer image that has no segments, on every pair change, regardless of the setting -- so a
    // user who opens a pair to look at it and moves on destroys whatever those images carried.
    // Zero segments is a legitimate state that writes empty files; it is never a deletion.
    expect(onNavigateAway(image({ segmentCount: 0 }), ON)).toEqual({
      kind: "save",
      image: "img_005.png",
    });
  });

  it("refuses to write back an image whose annotations never loaded", () => {
    // Legacy commits the current path before decoding succeeds, so an image that fails to open --
    // a non-ASCII path on Windows is enough -- becomes current with zero segments, and the next
    // navigation writes that emptiness over its real annotations.
    const decision = onNavigateAway(image({ provenance: "failed", segmentCount: 0 }), ON);

    expect(decision.kind).toBe("ask");
    if (decision.kind !== "ask") throw new Error("expected a prompt");
    expect(decision.at[0]?.unsafe).toContain("could not be read");
  });

  it("checks provenance before the setting, not after", () => {
    // Order of the checks is the rule. If the setting were read first, Auto-Save on would write
    // over a file this session never managed to read -- which is the destructive case itself.
    expect(onNavigateAway(image({ provenance: "failed" }), ON).kind).toBe("ask");
    expect(onNavigateAway(image({ provenance: "failed" }), OFF).kind).toBe("ask");
  });

  it("treats an image with no annotation file as safe to save", () => {
    // "absent" is not "failed". An unannotated image is the normal case, and writing its first
    // annotation file must not need a prompt.
    expect(onNavigateAway(image({ provenance: "absent" }), ON)).toEqual({
      kind: "save",
      image: "img_005.png",
    });
  });
});

group("closing", () => {
  it("never saves, whatever the setting says", () => {
    // Not auto-save-on-close even with Auto-Save on: a user closing after an experiment they did
    // not want may be closing precisely to discard it, and a silent save is harder to undo than
    // the loss it would replace.
    const decision = onClose([image()]);

    expect(decision.kind).toBe("ask");
  });

  it("proceeds when nothing is dirty", () => {
    expect(onClose([image({ dirty: false })])).toEqual({ kind: "proceed" });
    expect(onClose([])).toEqual({ kind: "proceed" });
  });

  it("reports every dirty image, not only the open one", () => {
    // Legacy loses the last-edited image on exit, and loses propagated sequence frames and the
    // other half of a multi-view pair the same way, without naming any of them.
    const decision = onClose([
      image({ key: "a.png", segmentCount: 2 }),
      image({ key: "b.png", dirty: false }),
      image({ key: "c.png", segmentCount: 7 }),
    ]);

    if (decision.kind !== "ask") throw new Error("expected a prompt");
    expect(decision.at.map((entry) => entry.key)).toEqual(["a.png", "c.png"]);
  });

  it("marks an unsafe image as unsafe in the close prompt too", () => {
    const decision = onClose([image({ provenance: "failed" })]);

    if (decision.kind !== "ask") throw new Error("expected a prompt");
    expect(decision.at[0]?.unsafe).toBeDefined();
  });
});

group("what the prompt says", () => {
  it("names the image and counts the segments", () => {
    // "You have unsaved changes" is true of every such prompt ever written and gives a user
    // nothing to decide with. The rule card asks for what would be lost, by name.
    expect(describe([{ key: "img_005.png", segmentCount: 4 }])).toBe(
      "img_005.png has 4 segments that have not been saved.",
    );
  });

  it("reads correctly for exactly one segment", () => {
    expect(describe([{ key: "a.png", segmentCount: 1 }])).toBe(
      "a.png has 1 segment that has not been saved.",
    );
  });

  it("totals across images and stops listing after three", () => {
    const at = [
      { key: "a.png", segmentCount: 1 },
      { key: "b.png", segmentCount: 2 },
      { key: "c.png", segmentCount: 3 },
      { key: "d.png", segmentCount: 4 },
    ];

    expect(describe(at)).toBe(
      "4 images have unsaved work — a.png, b.png, c.png and 1 more — 10 segments in total.",
    );
  });

  it("explains an image that cannot be saved automatically", () => {
    const sentence = describe([
      { key: "a.png", segmentCount: 0, unsafe: "its annotations could not be read" },
    ]);

    expect(sentence).toContain("It cannot be saved automatically");
    expect(sentence).toContain("could not be read");
  });

  it("names which images are unsafe when only some are", () => {
    const sentence = describe([
      { key: "a.png", segmentCount: 1 },
      { key: "b.png", segmentCount: 2, unsafe: "its annotations could not be read" },
    ]);

    expect(sentence).toContain("b.png cannot be saved automatically");
  });

  it("says so plainly when there is nothing at stake", () => {
    expect(describe([])).toBe("Nothing is unsaved.");
  });
});

group("whether the save button is available", () => {
  it("agrees with the navigation logic about what is unsafe", () => {
    // Computed in one place because two copies of this answer are how a save button offers to do
    // what the navigation path has already refused.
    expect(canSave(image())).toBe(true);
    expect(canSave(image({ provenance: "absent" }))).toBe(true);
    expect(canSave(image({ provenance: "failed" }))).toBe(false);
    expect(canSave(null)).toBe(false);
  });

  it("stays available for a clean image, so a user can re-write the files", () => {
    // Saving an unchanged image is a legitimate act -- it is how a user writes a newly selected
    // format for an image they have not otherwise touched.
    expect(canSave(image({ dirty: false }))).toBe(true);
  });
});

group("reading provenance from a load result", () => {
  it("keeps \"no file\" and \"could not be read\" apart", () => {
    // The whole safety property rests on this distinction, and it is exactly the one a later tidy
    // would collapse into a single "no annotations" branch. An image with no annotation file is
    // the normal case and saves without ceremony; an image whose annotations could not be READ
    // must not be written back at all. Legacy conflates them, which is how a failed load ends up
    // overwriting a real file with emptiness.
    expect(provenanceFromLoad("loaded")).toBe("loaded");
    expect(provenanceFromLoad("none")).toBe("absent");
    expect(provenanceFromLoad("failed")).toBe("failed");
  });

  it("yields a provenance that the save logic then treats differently", () => {
    const from = (kind: "loaded" | "none" | "failed") =>
      onNavigateAway(image({ provenance: provenanceFromLoad(kind) }), ON).kind;

    expect(from("loaded")).toBe("save");
    expect(from("none")).toBe("save");
    expect(from("failed")).toBe("ask");
  });
});


/**
 * The line the status bar shows.
 *
 * It had no tests, which is worth saying because it is the one piece of continuous state a user
 * reads without looking for it — and the crop clause below is there precisely because something
 * destructive was invisible outside a panel that starts collapsed.
 */
group("the status line", () => {
  const state = (over: Partial<ImageState> = {}): ImageState => ({
    key: "frames/a.png",
    provenance: "loaded",
    dirty: false,
    segmentCount: 3,
    ...over,
  });

  it("says nothing is open when nothing is", () => {
    expect(summarize(null)).toBe("No image open.");
  });

  it("says an image could not be read, rather than showing it as empty", () => {
    // The distinction the whole save path rests on: an image with no annotation file and one whose
    // annotations could not be READ both have zero segments, and only one is safe to write over.
    expect(summarize(state({ provenance: "failed" }))).toBe("frames/a.png could not be read.");
  });

  it("counts one segment in the singular", () => {
    expect(summarize(state({ segmentCount: 1 }))).toBe("frames/a.png — 1 segment, saved.");
  });

  it("says ZERO out loud rather than smoothing it away", () => {
    // "0 segments, unsaved" is precisely the state a user needs to see before a save writes empty
    // files over an image that had annotations.
    expect(summarize(state({ segmentCount: 0, dirty: true }))).toBe(
      "frames/a.png — 0 segments, unsaved.",
    );
  });

  it("announces a CROP, because it is destructive and its panel starts collapsed", () => {
    // A crop blanks every mask pixel outside it on the next save, and the exported files keep
    // their full size, so nothing about them looks cropped afterwards. Legacy shows nothing at
    // all, which is how one survives an image change and blanks most of the next.
    expect(summarize(state(), true)).toBe("frames/a.png — 3 segments, saved, cropped on save.");
  });

  it("announces it whether the image is saved or not", () => {
    expect(summarize(state({ dirty: true }), true)).toBe(
      "frames/a.png — 3 segments, unsaved, cropped on save.",
    );
  });

  it("says nothing about a crop when there is none", () => {
    expect(summarize(state(), false)).not.toMatch(/crop/);
  });
});
