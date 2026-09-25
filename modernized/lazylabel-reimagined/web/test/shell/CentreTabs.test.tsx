/**
 * The centre pane's tabs: Single, Multi and Sequence, as in legacy.
 *
 * Two properties matter more than the look. There is ONE interactive view, because it registers
 * the save, undo and pan keys and two copies would answer each key twice. And the sequence
 * controls survive leaving their tab, because they hold a built timeline and any propagated masks
 * not yet saved.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { CentreTabs } from "../../src/shell/CentreTabs.jsx";

afterEach(cleanup);

let mounts = 0;

/** Stands in for the view: counts how often it is built. */
function View(): ReactNode {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <p>the view</p>;
}

/** Stands in for the sequence controls: holds state a remount would lose. */
function Counter(): ReactNode {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount(count + 1)}>{`clicked ${count}`}</button>;
}

function mount() {
  mounts = 0;
  render(
    <CentreTabs
      viewer={<View />}
      multi={(viewer) => (
        <div data-testid="multi">
          <p>two viewers</p>
          {viewer}
        </div>
      )}
      sequence={<Counter />}
    />,
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });

describe("the centre tabs", () => {
  it("starts on Single, showing the view alone", () => {
    mount();

    expect(tab("Single").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("the view")).toBeTruthy();
    expect(screen.queryByText("two viewers")).toBeNull();
    expect(screen.queryByText(/clicked/)).toBeNull();
  });

  it("shows the sequence controls under the same view, without building it again", () => {
    mount();
    fireEvent.click(tab("Sequence"));

    expect(tab("Sequence").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("the view")).toBeTruthy();
    expect(screen.getByText("clicked 0")).toBeTruthy();
    // Single and Sequence put the view in the same place, so moving between them keeps it.
    expect(mounts).toBe(1);
  });

  it("keeps the sequence controls' state when the tab is left and chosen again", () => {
    mount();
    fireEvent.click(tab("Sequence"));
    fireEvent.click(screen.getByText("clicked 0"));

    fireEvent.click(tab("Single"));
    expect(screen.getByText("clicked 1").closest("[hidden]")).not.toBeNull();

    fireEvent.click(tab("Multi"));
    fireEvent.click(tab("Sequence"));
    expect(screen.getByText("clicked 1").closest("[hidden]")).toBeNull();
  });

  it("hands the view to Multi, so there is still exactly one", () => {
    mount();
    fireEvent.click(tab("Multi"));

    expect(screen.getByTestId("multi").textContent).toContain("the view");
    expect(screen.getAllByText("the view")).toHaveLength(1);
  });

  it("moves between tabs with the arrow keys, as a tab list does", () => {
    mount();
    tab("Single").focus();

    fireEvent.keyDown(tab("Single"), { key: "ArrowRight" });
    expect(tab("Multi").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("Multi"));

    fireEvent.keyDown(tab("Multi"), { key: "End" });
    expect(tab("Sequence").getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(tab("Sequence"), { key: "ArrowRight" });
    expect(tab("Single").getAttribute("aria-selected")).toBe("true");
  });

  it("puts only the chosen tab in the Tab order", () => {
    mount();

    expect(tab("Single").tabIndex).toBe(0);
    expect(tab("Multi").tabIndex).toBe(-1);
    expect(tab("Sequence").tabIndex).toBe(-1);
  });
});
