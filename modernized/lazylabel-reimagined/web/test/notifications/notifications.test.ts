/**
 * What the app says, and how long it says it for.
 *
 * The anchor case is RULE-083: legacy announces deleting every annotation file for an image — no
 * prompt, no undo — as a neutral notice on a five-second timer, visually identical to "Saved". The
 * rewrite does not delete like that at all, but the notification rule it exposes outlives the
 * specific bug: severity has to track consequence, and anything a user might need to act on has to
 * survive them looking away.
 */

import { describe, expect, it } from "vitest";

import {
  TRANSIENT_MS,
  create,
  dismiss,
  push,
  sticky,
  type Notification,
} from "../../src/notifications/notifications.js";

function made(overrides: Parameters<typeof create>[1]): Notification {
  return create("n1", overrides);
}

describe("how long a notification lives", () => {
  it("lets a plain confirmation clear itself", () => {
    expect(made({ severity: "success", message: "Saved a.npz." }).autoDismissMs).toBe(TRANSIENT_MS);
    expect(made({ severity: "info", message: "Model loaded." }).autoDismissMs).toBe(TRANSIENT_MS);
  });

  it("keeps a failure until it is dismissed", () => {
    // A user who was looking at the image rather than the corner of the screen must still be able
    // to find out that the save failed.
    expect(made({ severity: "error", message: "The save failed." }).autoDismissMs).toBeNull();
  });

  it("keeps a warning until it is dismissed", () => {
    expect(made({ severity: "warning", message: "Two files disagree." }).autoDismissMs).toBeNull();
  });

  it("keeps anything irreversible, however calmly it is worded", () => {
    // The RULE-083 case exactly. "Deleted: cat_coco.json, cat.npz, cat.txt" is a mild sentence
    // about a permanent, unpromptable, un-undoable act, and legacy lets it expire in five seconds.
    const notification = made({
      severity: "info",
      message: "Deleted cat_coco.json, cat.npz, cat.txt.",
      irreversible: true,
    });

    expect(notification.autoDismissMs).toBeNull();
  });

  it("derives the timer rather than letting callers set it", () => {
    // Every "this one should stay" decision made at a call site is a decision that can be missed at
    // one call site, and it will be the destructive one.
    const options = { severity: "error", message: "x" } as const;
    expect(Object.keys(options)).not.toContain("autoDismissMs");
    expect(made(options).autoDismissMs).toBeNull();
  });
});

describe("repeats", () => {
  it("coalesces an immediate repeat instead of stacking it", () => {
    // Click, accept, next: the same confirmation arrives dozens of times a minute, and a stack of
    // identical lines buries the one warning that mattered.
    let list: readonly Notification[] = [];
    list = push(list, create("a", { severity: "success", message: "Saved a.npz." }));
    list = push(list, create("b", { severity: "success", message: "Saved a.npz." }));
    list = push(list, create("c", { severity: "success", message: "Saved a.npz." }));

    expect(list).toHaveLength(1);
    expect(list[0]?.count).toBe(3);
  });

  it("does not coalesce across an intervening message", () => {
    // Two identical messages with something else between them are two events. Merging them would
    // claim both happened at the moment of the second.
    let list: readonly Notification[] = [];
    list = push(list, create("a", { severity: "success", message: "Saved." }));
    list = push(list, create("b", { severity: "error", message: "Failed." }));
    list = push(list, create("c", { severity: "success", message: "Saved." }));

    expect(list.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("does not merge messages that differ only in severity", () => {
    let list: readonly Notification[] = [];
    list = push(list, create("a", { severity: "info", message: "Done." }));
    list = push(list, create("b", { severity: "warning", message: "Done." }));

    expect(list).toHaveLength(2);
  });

  it("does not merge messages that differ only in their detail", () => {
    let list: readonly Notification[] = [];
    list = push(list, create("a", { severity: "warning", message: "Saved.", detail: "a.xml stale" }));
    list = push(list, create("b", { severity: "warning", message: "Saved.", detail: "b.xml stale" }));

    expect(list).toHaveLength(2);
  });
});

describe("dismissing", () => {
  it("removes the one asked for and leaves the rest", () => {
    const list = [
      create("a", { severity: "error", message: "one" }),
      create("b", { severity: "error", message: "two" }),
    ];

    expect(dismiss(list, "a").map((entry) => entry.id)).toEqual(["b"]);
  });

  it("finds everything that will not clear itself", () => {
    // What a "dismiss all" acts on. The transient ones are already leaving.
    const list = [
      create("a", { severity: "success", message: "one" }),
      create("b", { severity: "error", message: "two" }),
      create("c", { severity: "info", message: "three", irreversible: true }),
    ];

    expect(sticky(list).map((entry) => entry.id)).toEqual(["b", "c"]);
  });
});

