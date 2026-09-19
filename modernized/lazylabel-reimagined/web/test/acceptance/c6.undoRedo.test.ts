/**
 * C6 — Undo and redo editing actions: the stack, which is Phase 4's share.
 *
 * The operations it replays are Phase 5's, because there is nothing to edit until the tools exist.
 * What Phase 4 owes is a stack that cannot be made to do the two things RULE-052 and RULE-053
 * record legacy doing.
 */

import { describe, expect, it, vi } from "vitest";

import { DEFAULT_MAX_BYTES, History, type HistoryOperation } from "../../src/workspace/history.js";

/** An operation that records whether it ran, so replay order is observable. */
function op(label: string, bytes = 8, log: string[] = []): HistoryOperation & { log: string[] } {
  return {
    label,
    bytes,
    log,
    undo: () => log.push(`undo ${label}`),
    redo: () => log.push(`redo ${label}`),
  };
}

describe("C6: the undo stack", () => {
  it("starts with nothing to undo or redo", () => {
    const history = new History();
    expect(history.state).toMatchObject({ canUndo: false, canRedo: false, entries: 0 });
  });

  it("undoes the most recent action first", () => {
    const log: string[] = [];
    const history = new History();
    history.record(op("first", 8, log));
    history.record(op("second", 8, log));

    history.undo();
    history.undo();

    expect(log).toEqual(["undo second", "undo first"]);
  });

  it("redoes in the order the actions happened", () => {
    const log: string[] = [];
    const history = new History();
    history.record(op("first", 8, log));
    history.record(op("second", 8, log));
    history.undo();
    history.undo();
    log.length = 0;

    history.redo();
    history.redo();

    expect(log).toEqual(["redo first", "redo second"]);
  });

  it("reports what undo and redo would do, for a menu label", () => {
    const history = new History();
    history.record(op("Erase"));
    expect(history.state.undoLabel).toBe("Erase");

    history.undo();
    expect(history.state).toMatchObject({ undoLabel: null, redoLabel: "Erase" });
  });

  it("clears the redo stack when a new action is recorded (RULE-052)", () => {
    const history = new History();
    history.record(op("first"));
    history.undo();
    expect(history.state.canRedo).toBe(true);

    history.record(op("second"));

    // Redoing now would replay an edit into a document that has moved on.
    expect(history.state.canRedo).toBe(false);
    expect(history.redo()).toBe(false);
  });

  it("forgets everything when a new image loads (RULE-052)", () => {
    const history = new History();
    history.record(op("first"));
    history.undo();

    history.clear();

    // An entry undoes an edit to a PARTICULAR image; replaying one against a different image would
    // corrupt it silently.
    expect(history.state).toMatchObject({ canUndo: false, canRedo: false, entries: 0, bytes: 0 });
  });

  it("answers false rather than throwing when there is nothing to do", () => {
    const history = new History();
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });

  describe("the defects on the card, designed out", () => {
    it("cannot record an action that has no way to undo itself (RULE-052)", () => {
      // Legacy has a delete_segments HANDLER and nothing that records the action, so a deletion is
      // not undoable -- and because the unrecorded deletion shifts indices, a later undo removes
      // the wrong segment. An entry here carries both directions or it is not an entry.
      const history = new History();
      const incomplete = { label: "Delete", bytes: 8 } as unknown as HistoryOperation;

      history.record(incomplete);
      // Recording it is a type error; performing it is a runtime one, so the failure is loud rather
      // than a silently skipped undo.
      expect(() => history.undo()).toThrow();
    });

    it("replays the entry's own undo, never a shared payload path (RULE-053)", () => {
      // Legacy's erase stores wrapper objects and undo passes them to the ADD path, which appends
      // records with no mask or type. Each entry owning its inverse is what makes that impossible.
      const eraseUndo = vi.fn();
      const addUndo = vi.fn();
      const history = new History();

      history.record({ label: "Add", bytes: 8, undo: addUndo, redo: () => {} });
      history.record({ label: "Erase", bytes: 8, undo: eraseUndo, redo: () => {} });
      history.undo();

      expect(eraseUndo).toHaveBeenCalledTimes(1);
      expect(addUndo).not.toHaveBeenCalled();
    });
  });

  describe("bounded by bytes, not by entries", () => {
    it("drops the oldest entries once the budget is exceeded", () => {
      const history = new History(100);
      for (let i = 0; i < 5; i += 1) history.record(op(`action ${i}`, 30));

      // 5 x 30 = 150 over a 100 budget, so the oldest go.
      expect(history.state.bytes).toBeLessThanOrEqual(100);
      expect(history.state.dropped).toBeGreaterThan(0);
      expect(history.state.undoLabel).toBe("action 4");
    });

    it("says how much history became unreachable", () => {
      const history = new History(100);
      for (let i = 0; i < 5; i += 1) history.record(op(`action ${i}`, 30));

      // Silence here would let a user believe an old action is still undoable when it is not.
      expect(history.state.dropped).toBe(2);
    });

    it("counts bytes rather than entries, which differ by orders of magnitude", () => {
      // One entry holding a full-image mask against one holding a moved vertex. An entry count
      // would treat these as equal and bound nothing useful.
      const history = new History(1_000);
      history.record(op("moved a vertex", 16));
      history.record(op("erased a large object", 900));

      expect(history.state.entries).toBe(2);
      expect(history.state.bytes).toBe(916);
    });

    it("keeps a single entry larger than the whole budget", () => {
      const history = new History(100);
      history.record(op("an enormous edit", 5_000));

      // Dropping it would leave an action visible in the menu that cannot be undone, which is worse
      // than briefly exceeding a limit that exists to prevent exactly that confusion.
      expect(history.state.canUndo).toBe(true);
      expect(history.state.dropped).toBe(0);
    });

    it("releases the bytes an undone action was holding", () => {
      const history = new History();
      history.record(op("big", 1_000));
      expect(history.state.bytes).toBe(1_000);

      history.undo();
      expect(history.state.bytes).toBe(0);

      history.redo();
      expect(history.state.bytes).toBe(1_000);
    });

    it("refuses an operation that declares a nonsense size", () => {
      const history = new History();
      for (const bytes of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => history.record(op("bad", bytes)), String(bytes)).toThrow(RangeError);
      }
    });

    it("has a default budget that is generous but finite", () => {
      // Legacy has no cap at all, which the card records. A session that edits large masks all day
      // should not be able to exhaust memory through its undo history.
      expect(DEFAULT_MAX_BYTES).toBeGreaterThan(64 * 1024 * 1024);
      expect(Number.isFinite(DEFAULT_MAX_BYTES)).toBe(true);
    });
  });

  describe("telling the interface about it", () => {
    it("notifies a subscriber on every change", () => {
      const seen: boolean[] = [];
      const history = new History();
      history.subscribe((state) => seen.push(state.canUndo));

      history.record(op("first"));
      history.undo();
      history.redo();
      history.clear();

      expect(seen).toEqual([true, false, true, false]);
    });

    it("stops notifying once unsubscribed", () => {
      const listener = vi.fn();
      const history = new History();
      const stop = history.subscribe(listener);

      history.record(op("first"));
      stop();
      history.record(op("second"));

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
