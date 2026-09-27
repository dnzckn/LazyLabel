/**
 * What the status bar says, and for how long: legacy's (CONTROL_PARITY.md CP-64).
 *
 * Legacy's NotificationManager puts every message in the status bar on a timer by kind -- 3 s, 3 s,
 * 5 s and 8 s -- with "Warning: " and "Error: " before those two (L ui/managers/
 * notification_manager.py:18-74; L ui/widgets/status_bar.py:159-213). The web kept failures,
 * warnings and deletions until dismissed. RULE-083's deletion notice is the anchor case: legacy's
 * "Deleted: ..." is an ordinary 3 s message, and the owner chose legacy's behaviour on 2026-09-26.
 */

import { describe, expect, it } from "vitest";

import { DURATION_MS, create, statusText, type Notification } from "../../src/notifications/notifications.js";
import { deletionNotice } from "../../src/workspace/saveState.js";

function made(overrides: Parameters<typeof create>[1]): Notification {
  return create("n1", overrides);
}

describe("how long a message shows", () => {
  it("is legacy's timer for its kind", () => {
    expect(made({ severity: "info", message: "Loaded: cat.png" }).autoDismissMs).toBe(3_000);
    expect(made({ severity: "success", message: "Saved" }).autoDismissMs).toBe(3_000);
    expect(made({ severity: "warning", message: "No AI segment preview to accept" }).autoDismissMs).toBe(5_000);
    expect(made({ severity: "error", message: "AI prediction failed" }).autoDismissMs).toBe(8_000);
    expect(DURATION_MS).toEqual({ info: 3_000, success: 3_000, warning: 5_000, error: 8_000 });
  });

  it("clears a failure too, as legacy's does", () => {
    // Kept until dismissed until CP-64; legacy's error message goes after 8 s like any other.
    expect(made({ severity: "error", message: "Error saving: disk full" }).autoDismissMs).not.toBeNull();
  });

  it("is the call's own where legacy passes one", () => {
    expect(made({ severity: "warning", message: "AI model is updating, please wait...", durationMs: 2_000 }).autoDismissMs).toBe(2_000);
  });

  it("is until the next message for legacy's 0", () => {
    expect(made({ severity: "info", message: "Loading image into AI model...", durationMs: 0 }).autoDismissMs).toBeNull();
  });

  it("gives a deletion the ordinary timer, as legacy's 'Deleted: ...' has", () => {
    const notice = deletionNotice(["cat.json", "cat.txt"]);
    expect(made(notice).autoDismissMs).toBe(3_000);
  });
});

describe("what the line says", () => {
  it("puts legacy's prefix before a warning and an error, and nothing before the others", () => {
    expect(statusText(made({ severity: "error", message: "AI prediction failed" }))).toBe("Error: AI prediction failed");
    expect(statusText(made({ severity: "warning", message: "No AI segment preview to accept" }))).toBe(
      "Warning: No AI segment preview to accept",
    );
    expect(statusText(made({ severity: "info", message: "Model unloaded" }))).toBe("Model unloaded");
    expect(statusText(made({ severity: "success", message: "Models list refreshed." }))).toBe("Models list refreshed.");
  });

  it("leaves the detail out of the line", () => {
    expect(statusText(made({ severity: "error", message: "AI prediction failed", detail: "the model raised" }))).toBe(
      "Error: AI prediction failed",
    );
  });
});
