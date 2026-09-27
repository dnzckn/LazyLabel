/**
 * The running half: legacy's one status bar message, replaced by the next and cleared on its timer
 * (L ui/widgets/status_bar.py:159-232; CONTROL_PARITY.md CP-64).
 *
 * `notifications.test.ts` pins the policy. This pins that it happens, in the status bar.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NotificationHost,
  NotificationProvider,
  useNotifications,
} from "../../src/notifications/NotificationProvider.jsx";
import type { CreateOptions } from "../../src/notifications/notifications.js";
import { StatusBar } from "../../src/shell/StatusBar.jsx";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** A button per message the test wants to raise, so raising one is a click. */
function Raiser({ options }: { readonly options: readonly CreateOptions[] }) {
  const { notify } = useNotifications();
  return (
    <>
      {options.map((option, index) => (
        <button key={index} type="button" onClick={() => notify(option)}>
          raise {index}
        </button>
      ))}
    </>
  );
}

function mount(options: readonly CreateOptions[]) {
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

describe("one message at a time", () => {
  it("replaces the one showing, as legacy's single label does", () => {
    mount([
      { severity: "error", message: "AI prediction failed" },
      { severity: "success", message: "Saved: cat.npz" },
    ]);

    raise(0);
    raise(1);

    expect(screen.queryByText("Error: AI prediction failed")).toBeNull();
    expect(screen.getByText("Saved: cat.npz")).toBeTruthy();
  });

  it("restarts the timer with the new message's own", () => {
    mount([
      { severity: "error", message: "AI prediction failed" },
      { severity: "info", message: "Model unloaded" },
    ]);

    raise(0);
    advance(7_000);
    raise(1);
    advance(2_999);
    expect(screen.getByText("Model unloaded")).toBeTruthy();
    advance(1);
    expect(screen.queryByText("Model unloaded")).toBeNull();
  });

  it("shows a repeat once, with no count", () => {
    mount([{ severity: "info", message: "Loaded: cat.png" }]);

    raise();
    raise();

    expect(screen.getAllByText("Loaded: cat.png")).toHaveLength(1);
    expect(screen.queryByText(/×/)).toBeNull();
  });
});

describe("clearing itself on legacy's timers", () => {
  it.each([
    ["info", 3_000],
    ["success", 3_000],
    ["warning", 5_000],
    ["error", 8_000],
  ] as const)("clears %s after %i ms", (severity, ms) => {
    mount([{ severity, message: "something happened" }]);

    raise();
    advance(ms - 1);
    expect(screen.getByText(/something happened/)).toBeTruthy();
    advance(1);
    expect(screen.queryByText(/something happened/)).toBeNull();
  });

  it("keeps legacy's 0 until the next message", () => {
    mount([
      { severity: "info", message: "Loading image into AI model...", durationMs: 0 },
      { severity: "success", message: "AI model ready for prompting" },
    ]);

    raise(0);
    advance(60_000);
    expect(screen.getByText("Loading image into AI model...")).toBeTruthy();
    raise(1);
    expect(screen.queryByText("Loading image into AI model...")).toBeNull();
  });

  it("has no Dismiss button: nothing stays for one", () => {
    mount([{ severity: "error", message: "Error saving: disk full" }]);

    raise();

    expect(screen.queryByRole("button", { name: /Dismiss/ })).toBeNull();
  });
});

describe("what a reader is told", () => {
  it("prefixes and announces a failure at once", () => {
    mount([{ severity: "error", message: "AI prediction failed" }]);
    raise();
    expect(screen.getByRole("alert").textContent).toBe("Error: AI prediction failed");
  });

  it("prefixes and announces a warning the same way", () => {
    mount([{ severity: "warning", message: "No AI segment preview to accept" }]);
    raise();
    expect(screen.getByRole("alert").textContent).toBe("Warning: No AI segment preview to accept");
  });

  it("lets a confirmation wait for a pause", () => {
    mount([{ severity: "success", message: "Saved: cat.npz" }]);
    raise();
    expect(screen.getByRole("status").textContent).toBe("Saved: cat.npz");
  });

  it("puts the detail in the tooltip, not the line", () => {
    mount([{ severity: "error", message: "AI prediction failed", detail: "the model raised" }]);
    raise();
    const line = screen.getByRole("alert");
    expect(line.textContent).toBe("Error: AI prediction failed");
    expect(line.title).toContain("the model raised");
  });

  it("renders nothing at all when there is nothing to say", () => {
    mount([]);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("in the status bar", () => {
  function Bar({ options }: { readonly options: readonly CreateOptions[] }) {
    return (
      <NotificationProvider>
        <Raiser options={options} />
        <StatusBar image={null} health={null} />
      </NotificationProvider>
    );
  }

  it("shows it in the centre, blank at rest, beside the open image's summary", () => {
    // Legacy's message label is blank at rest (status_bar.py:219-223); the summary is in its
    // permanent label, which stays.
    render(<Bar options={[{ severity: "success", message: "Saved: cat.npz" }]} />);
    const bar = screen.getByRole("contentinfo", { name: "Status" });
    const centre = () => bar.querySelector(".status-bar__messages")?.textContent;
    const summary = bar.querySelector(".status-bar__image")?.textContent;
    expect(centre()).toBe("");

    raise();
    expect(bar.querySelector(".status-bar__messages .status-bar__message--success")?.textContent).toBe("Saved: cat.npz");
    expect(bar.querySelector(".status-bar__image")?.textContent).toBe(summary);

    advance(3_000);
    expect(centre()).toBe("");
  });

  it("colours it by kind, as legacy's _COLORS do", () => {
    render(<Bar options={[{ severity: "warning", message: "No segments to save." }]} />);

    raise();

    expect(document.querySelector(".status-bar__message--warning")?.textContent).toBe("Warning: No segments to save.");
  });
});

describe("using it outside a provider", () => {
  it("fails loudly rather than silently dropping messages", () => {
    const Orphan = () => {
      useNotifications();
      return null;
    };
    // React logs the thrown error; keep the test output readable.
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Orphan />)).toThrow(/NotificationProvider/);
    spy.mockRestore();
  });
});
