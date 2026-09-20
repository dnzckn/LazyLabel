/**
 * Forgetting ONE image's edits while another image is still open.
 *
 * RULE-052 clears history when an image loads, and with one open image an unscoped clear says
 * exactly that. With two, it says far too much: opening into the right-hand pane would throw away
 * everything the user drew on the left. These are the cases that separates the two readings.
 */

import { describe, expect, it } from "vitest";

import { History, type HistoryOperation } from "../../src/workspace/history.js";

/** An entry that records where it ran, so a test can see WHICH inverse was replayed. */
function entry(
  label: string,
  scope: readonly string[] | undefined,
  log: string[],
  bytes = 100,
): HistoryOperation {
  return {
    label,
    bytes,
    ...(scope === undefined ? {} : { scope }),
    undo: () => log.push(`undo ${label}`),
    redo: () => log.push(`redo ${label}`),
  };
}

describe("clearing one scope", () => {
  it("drops that scope's entries and keeps the others", () => {
    const log: string[] = [];
    const history = new History();
    history.record(entry("left draw", ["side:0"], log));
    history.record(entry("right draw", ["side:1"], log));

    history.clear("side:0");

    expect(history.state.entries).toBe(1);
    expect(history.state.undoLabel).toBe("right draw");
    history.undo();
    expect(log).toEqual(["undo right draw"]);
  });

  it("unwinds the survivors in their own order, across an interleaving", () => {
    // The property the whole arrangement rests on: entries removed from the MIDDLE leave the rest
    // replayable. It holds because each entry only touches its own side, so what is left still
    // unwinds into the state it expects. A test rather than a comment, because the day a linked
    // operation touches both sides it stops holding and this is what says so.
    const log: string[] = [];
    const history = new History();
    history.record(entry("L1", ["side:0"], log));
    history.record(entry("R1", ["side:1"], log));
    history.record(entry("L2", ["side:0"], log));
    history.record(entry("R2", ["side:1"], log));

    history.clear("side:0");
    history.undo();
    history.undo();

    expect(log).toEqual(["undo R2", "undo R1"]);
    expect(history.state.canUndo).toBe(false);
  });

  it("drops the matching entries from the REDO stack too", () => {
    // Otherwise a redo after opening a new image would replay an edit into the image that just
    // closed -- the same corruption the clear exists to prevent, reached from the other direction.
    const log: string[] = [];
    const history = new History();
    history.record(entry("left draw", ["side:0"], log));
    history.undo();
    expect(history.state.canRedo).toBe(true);

    history.clear("side:0");

    expect(history.state.canRedo).toBe(false);
  });

  it("drops an entry that touches BOTH sides, whichever side is cleared", () => {
    // A linked edit cannot be half undone: its inverse restores a pair, and after one of the pair
    // has been replaced there is nothing left for it to restore.
    for (const cleared of ["side:0", "side:1"]) {
      const history = new History();
      history.record(entry("linked erase", ["side:0", "side:1"], []));
      history.clear(cleared);
      expect(history.state.entries).toBe(0);
    }
  });

  it("drops an entry that declared NO scope", () => {
    // It has not said what it touches, so it cannot be shown safe to keep. Keeping it would be the
    // more forgiving default and it is the wrong one: a surviving entry that turns out to edit the
    // closed image is exactly the silent corruption at issue.
    const history = new History();
    history.record(entry("anonymous", undefined, []));

    history.clear("side:0");

    expect(history.state.entries).toBe(0);
  });

  it("recomputes the retained bytes rather than subtracting them", () => {
    const history = new History();
    history.record(entry("L", ["side:0"], [], 500));
    history.record(entry("R", ["side:1"], [], 70));

    history.clear("side:0");

    expect(history.state.bytes).toBe(70);
  });

  it("does NOT count a scoped clear as dropped history", () => {
    // `dropped` means "history you can no longer reach because the stack was full", which is worth
    // warning about. Forgetting a closed image's edits is the rule working, and counting it would
    // raise that warning every time the user changes image.
    const history = new History();
    history.record(entry("L", ["side:0"], []));

    history.clear("side:0");

    expect(history.state.dropped).toBe(0);
  });

  it("announces the new state to subscribers", () => {
    const history = new History();
    history.record(entry("L", ["side:0"], []));
    let seen = history.state;
    history.subscribe((state) => (seen = state));

    history.clear("side:0");

    expect(seen.canUndo).toBe(false);
  });

  it("still forgets everything when no scope is named", () => {
    // The one-image behaviour, unchanged: RULE-052 as it was before there were two sides.
    const history = new History();
    history.record(entry("L", ["side:0"], []));
    history.record(entry("R", ["side:1"], []));

    history.clear();

    expect(history.state.entries).toBe(0);
    expect(history.state.bytes).toBe(0);
  });
});
