/**
 * The collapsible panel, and the rule that an unbuilt section says so.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
    expect(screen.queryByText("inside")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Classes/ }));
    expect(screen.getByText("inside")).toBeTruthy();
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
