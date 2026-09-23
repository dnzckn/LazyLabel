/**
 * The collapsible panel, and the rule that an unbuilt section says so.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import { HotkeyProvider, useHotkey } from "../../src/hotkeys/HotkeyProvider.jsx";
import { Panel, Workspace } from "../../src/shell/Panel.jsx";

afterEach(cleanup);

describe("collapsing", () => {
  it("shows its content by default", () => {
    render(<Panel title="Classes"><p>inside</p></Panel>);
    expect(screen.getByText("inside")).toBeTruthy();
  });

  it("hides and shows on the header", () => {
    render(<Panel title="Classes"><p>inside</p></Panel>);

    fireEvent.click(screen.getByRole("button", { name: /Classes/ }));
    expect(screen.getByText("inside").closest("[hidden]")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Classes/ }));
    expect(screen.getByText("inside").closest("[hidden]")).toBeNull();
  });

  it("says whether it is open, not only which way the arrow points", () => {
    // A triangle tells a screen-reader user nothing. aria-expanded is the state; the label is what
    // pressing it does.
    render(<Panel title="Classes"><p>inside</p></Panel>);
    const header = screen.getByRole("button", { name: /Classes/ });

    expect(header.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
  });

  it("can start closed when asked", () => {
    render(<Panel title="Classes" initiallyCollapsed><p>inside</p></Panel>);
    expect(screen.queryByText("inside")).toBeNull();
  });
});

/*
 * Collapsing is for ROOM, and it used to unmount what the panel held (found 2026-09-23). Collapsing
 * the Sequence panel threw away a whole unsaved propagation without a word, and collapsing Drawing
 * tools took Ctrl+Z away, because Undo's hotkey lives in the history controls inside it.
 */
describe("what a collapsed panel keeps", () => {
  function Counter(): ReactNode {
    const [count, setCount] = useState(0);
    return <button type="button" onClick={() => setCount(count + 1)}>{`clicked ${count}`}</button>;
  }

  it("keeps the state of what it holds", () => {
    render(<Panel title="Sequence"><Counter /></Panel>);
    fireEvent.click(screen.getByText("clicked 0"));
    const header = screen.getByRole("button", { name: /Sequence/ });

    fireEvent.click(header);
    fireEvent.click(header);

    expect(screen.getByText("clicked 1")).toBeTruthy();
  });

  it("keeps the hotkeys of what it holds working while collapsed", () => {
    const undo = vi.fn();
    function Undo(): ReactNode {
      useHotkey("undo", undo);
      return null;
    }
    render(
      <HotkeyProvider bindings={defaultSettings().hotkeys}>
        <Panel title="Drawing tools"><Undo /></Panel>
      </HotkeyProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Drawing tools/ }));
    fireEvent.keyDown(document.body, { key: "z", code: "KeyZ", ctrlKey: true });

    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("builds a panel that starts closed only when it is first opened", () => {
    // A panel nobody opens costs nothing; one that has been opened keeps what it built.
    render(<Panel title="Sequence" initiallyCollapsed><Counter /></Panel>);
    expect(screen.queryByText("clicked 0")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Sequence/ }));
    fireEvent.click(screen.getByText("clicked 0"));
    fireEvent.click(screen.getByRole("button", { name: /Sequence/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sequence/ }));

    expect(screen.getByText("clicked 1")).toBeTruthy();
  });
});

describe("a section that is not built yet", () => {
  it("says what is missing and which phase builds it", () => {
    // A row of disabled buttons that look like the real thing invites a user to press something.
    // Saying where the work stands does not.
    render(
      <Panel title="Drawing tools" pending={{ phase: "Phase 5", summary: "polygons, boxes and circles" }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Drawing tools/ }));

    expect(screen.getByText(/Built in Phase 5: polygons, boxes and circles/)).toBeTruthy();
  });

  it("starts closed, so unbuilt sections do not fill the panel", () => {
    render(<Panel title="Drawing tools" pending={{ phase: "Phase 5", summary: "later" }} />);
    expect(screen.queryByText(/Built in Phase 5/)).toBeNull();
  });

  it("marks the header, so the phase is visible without opening it", () => {
    render(<Panel title="Drawing tools" pending={{ phase: "Phase 5", summary: "later" }} />);
    expect(screen.getByText("Phase 5")).toBeTruthy();
  });

  it("shows its explanation instead of any children it was given", () => {
    // Belt and braces: a section marked pending must not also render half-finished content, which
    // is exactly how "not built" and "built badly" become indistinguishable.
    render(
      <Panel title="Drawing tools" pending={{ phase: "Phase 5", summary: "later" }}>
        <p>half-finished</p>
      </Panel>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Drawing tools/ }));

    expect(screen.queryByText("half-finished")).toBeNull();
    expect(screen.getByText(/Built in Phase 5/)).toBeTruthy();
  });
});

describe("the three panes", () => {
  it("gives each one a name a reader can navigate by", () => {
    render(<Workspace left={<p>tools</p>} centre={<p>image</p>} right={<p>dataset</p>} />);

    expect(screen.getByLabelText("Tools").textContent).toBe("tools");
    expect(screen.getByLabelText("Image").textContent).toBe("image");
    expect(screen.getByLabelText("Dataset").textContent).toBe("dataset");
  });

  it("puts the image in the main landmark, not a sidebar", () => {
    // The image is the thing the page is about. Marking the tools as main and the canvas as an
    // aside would send anyone navigating by landmark to the wrong place.
    render(<Workspace left={<p>tools</p>} centre={<p>image</p>} right={<p>dataset</p>} />);

    expect(screen.getByRole("main").textContent).toBe("image");
  });
});
