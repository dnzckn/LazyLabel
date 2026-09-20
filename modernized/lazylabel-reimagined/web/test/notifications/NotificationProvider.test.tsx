/**
 * The running half: timers that fire, timers that do not, and what a reader is told.
 *
 * `notifications.test.ts` pins the policy. This pins that the policy actually happens — a rule
 * saying an error must stay is worth nothing if a timer clears it anyway.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TRANSIENT_MS } from "../../src/notifications/notifications.js";
import {
  NotificationHost,
  NotificationProvider,
  useNotifications,
} from "../../src/notifications/NotificationProvider.jsx";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** A button per notification the test wants to raise, so raising one is a click. */
function Raiser({ options }: { readonly options: readonly Parameters<ReturnType<typeof useNotifications>["notify"]>[0][] }) {
  const { notify, dismissAll } = useNotifications();
  return (
    <>
      {options.map((option, index) => (
        <button key={index} type="button" onClick={() => notify(option)}>
          raise {index}
        </button>
      ))}
      <button type="button" onClick={dismissAll}>
        clear
      </button>
    </>
  );
}

function mount(options: readonly Parameters<ReturnType<typeof useNotifications>["notify"]>[0][]) {
  render(
    <NotificationProvider>
      <Raiser options={options} />
      <NotificationHost />
    </NotificationProvider>,
  );
}

function raise(index = 0) {
  fireEvent.click(screen.getByRole("button", { name: `raise ${index}` }));
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("clearing itself", () => {
  it("removes a confirmation once its time is up", () => {
    mount([{ severity: "success", message: "Saved a.npz." }]);
    raise();
    expect(screen.getByText("Saved a.npz.")).toBeTruthy();

    advance(TRANSIENT_MS);

    expect(screen.queryByText("Saved a.npz.")).toBeNull();
  });

  it("is still there just before its time is up", () => {
    mount([{ severity: "success", message: "Saved a.npz." }]);
    raise();

    advance(TRANSIENT_MS - 1);

    expect(screen.getByText("Saved a.npz.")).toBeTruthy();
  });

  it("never removes a failure", () => {
    // The rule is worth nothing if a timer clears it anyway.
    mount([{ severity: "error", message: "The save failed." }]);
    raise();

    advance(TRANSIENT_MS * 100);

    expect(screen.getByText("The save failed.")).toBeTruthy();
  });

  it("never removes something irreversible, however calmly it is worded", () => {
    mount([{ severity: "info", message: "Deleted 3 files.", irreversible: true }]);
    raise();

    advance(TRANSIENT_MS * 100);

    expect(screen.getByText("Deleted 3 files.")).toBeTruthy();
  });

  it("clears each on its own schedule rather than in a sweep", () => {
    mount([
      { severity: "success", message: "first" },
      { severity: "success", message: "second" },
    ]);

    raise(0);
    advance(TRANSIENT_MS - 1000);
    raise(1);

    advance(1000); // the first is now due, the second has a second still to run
    expect(screen.queryByText("first")).toBeNull();
    expect(screen.getByText("second")).toBeTruthy();
  });
});

describe("dismissing", () => {
  it("offers a button only on what stays", () => {
    // A dismiss button on something already leaving is a button that vanishes while being aimed at.
    mount([{ severity: "success", message: "Saved." }]);
    raise();

    expect(screen.queryByRole("button", { name: /^Dismiss:/ })).toBeNull();
  });

  it("removes the notification when pressed", () => {
    mount([{ severity: "error", message: "The save failed." }]);
    raise();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss: The save failed." }));

    expect(screen.queryByText("The save failed.")).toBeNull();
  });

  it("does not bring a dismissed notification back when its timer would have fired", () => {
    mount([{ severity: "success", message: "Saved." }]);
    raise();
    advance(1000);

    // Nothing to press, so dismiss by clearing -- the timer for it is still pending.
    fireEvent.click(screen.getByRole("button", { name: "clear" }));
    expect(screen.queryByText("Saved.")).toBeNull();

    advance(TRANSIENT_MS);
    expect(screen.queryByText("Saved.")).toBeNull();
  });

  it("clears everything, including what would have stayed", () => {
    mount([
      { severity: "error", message: "first" },
      { severity: "success", message: "second" },
    ]);
    raise(0);
    raise(1);

    fireEvent.click(screen.getByRole("button", { name: "clear" }));

    expect(screen.queryByLabelText("Notifications")).toBeNull();
  });
});

describe("what a reader is told", () => {
  it("announces a failure without waiting for a pause", () => {
    // The annotator's eyes are on the image, not the corner of the screen.
    mount([{ severity: "error", message: "The save failed." }]);
    raise();

    expect(screen.getByRole("alert").textContent).toContain("The save failed.");
  });

  it("announces a warning the same way", () => {
    mount([{ severity: "warning", message: "Two files disagree." }]);
    raise();

    expect(screen.getByRole("alert").textContent).toContain("Two files disagree.");
  });

  it("lets a confirmation wait for a pause", () => {
    mount([{ severity: "success", message: "Saved." }]);
    raise();

    expect(screen.getByRole("status").textContent).toContain("Saved.");
  });

  it("shows the detail alongside the message, not instead of it", () => {
    mount([{ severity: "warning", message: "Saved.", detail: "a.xml was left alone." }]);
    raise();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Saved.");
    expect(alert.textContent).toContain("a.xml was left alone.");
  });

  it("counts a repeat rather than stacking it", () => {
    mount([{ severity: "success", message: "Saved." }]);
    raise();
    raise();
    raise();

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("×3");
  });

  it("renders nothing at all when there is nothing to say", () => {
    mount([{ severity: "success", message: "Saved." }]);

    expect(screen.queryByLabelText("Notifications")).toBeNull();
  });
});

describe("using it outside a provider", () => {
  it("fails loudly rather than silently dropping messages", () => {
    // A notification system that quietly does nothing is worse than none: every caller believes
    // the user was told.
    function Orphan() {
      useNotifications();
      return null;
    }

    expect(() => render(<Orphan />)).toThrow(/NotificationProvider/);
  });
});
