/**
 * The centre pane's tabs: Single, Multi and Sequence, as in legacy.
 *
 * Two properties matter more than the look. There is ONE interactive view, because it registers
 * the save, undo and pan keys and two copies would answer each key twice. And the sequence
 * controls stay mounted when their tab is left, told that it is hidden: they throw their timeline
 * away then, as legacy's do, and keep only what legacy keeps (SEQUENCE_PARITY.md SP-15).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import { HotkeyProvider, useHotkey } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { CentreTabs as Bare, type CentreTabsProps } from "../../src/shell/CentreTabs.jsx";
import { useSequenceActive } from "../../src/sequence/sequenceActive.js";

afterEach(cleanup);

/** The tabs as the app mounts them: under the hotkeys and the notifications. */
function CentreTabs(props: CentreTabsProps): ReactNode {
  return (
    <NotificationProvider>
      <NotificationHost />
      <HotkeyProvider bindings={defaultSettings().hotkeys}>
        <Bare {...props} />
      </HotkeyProvider>
    </NotificationProvider>
  );
}

const key = (action: string) => defaultSettings().hotkeys[action]!.primary;

/** Presses a stored letter binding such as "Ctrl+H" on the document, as the dispatcher hears it. */
function press(stored: string): KeyboardEvent {
  const parts = stored.split("+");
  const letter = parts[parts.length - 1]!;
  const event = new KeyboardEvent("keydown", {
    key: letter.toLowerCase(),
    code: `Key${letter.toUpperCase()}`,
    ctrlKey: parts.includes("Ctrl"),
    shiftKey: parts.includes("Shift"),
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

/** Stands in for the sequence controls: says whether it was told its tab is showing. */
function ActiveProbe(): ReactNode {
  return <p>{useSequenceActive() ? "sequence showing" : "sequence hidden"}</p>;
}

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

  it("tells the shell when the Sequence tab is left, and only then (SP-15)", () => {
    // Legacy loads the open image from disk whenever the Sequence tab is left, for Single or Multi
    // (main_window.py:3043-3056, 7242-7272, 5930-5946). The shell does that reload; this says when.
    const onLeaveSequence = vi.fn();
    render(
      <CentreTabs
        viewer={<View />}
        multi={(viewer) => <div>{viewer}</div>}
        sequence={<Counter />}
        onLeaveSequence={onLeaveSequence}
      />,
    );

    fireEvent.click(tab("Multi"));
    fireEvent.click(tab("Single"));
    expect(onLeaveSequence).not.toHaveBeenCalled();

    fireEvent.click(tab("Sequence"));
    fireEvent.click(tab("Sequence"));
    expect(onLeaveSequence).not.toHaveBeenCalled();

    fireEvent.click(tab("Single"));
    expect(onLeaveSequence).toHaveBeenCalledTimes(1);

    fireEvent.click(tab("Sequence"));
    fireEvent.click(tab("Multi"));
    expect(onLeaveSequence).toHaveBeenCalledTimes(2);
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

  it("heads the Sequence tab with legacy's Sequence Mode line, and only that tab", () => {
    render(
      <CentreTabs
        viewer={<View />}
        multi={(viewer) => <div>{viewer}</div>}
        sequence={<Counter />}
        sequenceStatus="f03.png (3/23) -- Conf: 0.9876"
      />,
    );
    expect(screen.queryByText(/Sequence Mode/)).toBeNull();

    fireEvent.click(tab("Sequence"));

    expect(screen.getByText("Sequence Mode: f03.png (3/23) -- Conf: 0.9876")).toBeTruthy();
  });

  it("puts only the chosen tab in the Tab order", () => {
    mount();

    expect(tab("Single").tabIndex).toBe(0);
    expect(tab("Multi").tabIndex).toBe(-1);
    expect(tab("Sequence").tabIndex).toBe(-1);
  });
});

describe("the tab list's own keys", () => {
  it("does not also change the image when an arrow moves between tabs", () => {
    // Left and Right are previous and next image too, and the dispatcher heard them as well, so
    // moving between tabs by keyboard changed the image (CONTROL_PARITY.md CP-19).
    const nextImage = vi.fn();
    function NextImage(): ReactNode {
      useHotkey("load_next_image", nextImage);
      return null;
    }
    render(
      <NotificationProvider>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <Bare viewer={<View />} multi={(viewer) => <div>{viewer}</div>} sequence={<Counter />} />
          <NextImage />
        </HotkeyProvider>
      </NotificationProvider>,
    );
    tab("Single").focus();

    fireEvent.keyDown(tab("Single"), { key: "ArrowRight", code: "ArrowRight" });

    expect(tab("Multi").getAttribute("aria-selected")).toBe("true");
    expect(nextImage).not.toHaveBeenCalled();
  });
});

describe("the sequence keys", () => {
  function mountWithProbe() {
    render(<CentreTabs viewer={<View />} multi={(viewer) => <div>{viewer}</div>} sequence={<ActiveProbe />} />);
  }

  it("keeps Ctrl+H and Ctrl+P from the browser before the Sequence tab was ever opened", () => {
    // Nothing had registered them, so they fell through: the browser's history and print dialogs.
    mountWithProbe();

    expect(press(key("find_archetypes")).defaultPrevented).toBe(true);
    expect(press(key("propagate")).defaultPrevented).toBe(true);
  });

  it("says how to start on entering the Sequence tab, as legacy's does (SP-55)", async () => {
    // main_window.py:5346-5382: with no timeline built, which leaving always makes so (SP-15).
    mountWithProbe();

    fireEvent.click(tab("Sequence"));

    expect(await screen.findByText("Sequence Mode: Set start/end frames, then Build Timeline")).toBeTruthy();
  });

  it("answers the sequence keys as legacy's do on another tab, before the timeline exists (SP-56)", async () => {
    // Legacy's shortcuts are the window's, over a sequence mode made at startup
    // (main_window.py:691, 3327), so they answer on every tab (4664-4706, 5040-5059, 5150-5168).
    mountWithProbe();

    press(key("find_archetypes"));
    press(key("next_flagged_frame"));
    press(key("prev_suggested_frame"));

    expect(await screen.findByText("Build a timeline first")).toBeTruthy();
    expect(await screen.findByText("No more flagged frames")).toBeTruthy();
    expect(await screen.findByText("No suggested frames")).toBeTruthy();
  });

  it("tells the sequence controls whether their tab is showing, so their keys act only there", () => {
    // The controls stay mounted when the tab is left; N pressed on Single opened a flagged frame.
    mountWithProbe();

    fireEvent.click(tab("Sequence"));
    expect(screen.getByText("sequence showing")).toBeTruthy();

    fireEvent.click(tab("Single"));
    expect(screen.getByText("sequence hidden")).toBeTruthy();
  });
});
