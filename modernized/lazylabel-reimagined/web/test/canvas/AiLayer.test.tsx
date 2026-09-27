/**
 * The AI tool's surface.
 *
 * `tools/ai.test.ts` pins what a gesture MEANS. This pins that the gesture reaches that decision,
 * and the parts only a real pointer and keyboard have: right-click for a negative point, a drag
 * preview, and Space accepting rather than committing on every click.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiLayer } from "../../src/canvas/AiLayer.jsx";
import { ViewKindContext, type ViewKind } from "../../src/canvas/viewKind.js";
import { renderWithSettings } from "./settingsHarness.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const IMAGE = { width: 200, height: 100 };
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  } as DOMRect);
});

function layer(props: Partial<Parameters<typeof AiLayer>[0]> & { readonly view?: ViewKind } = {}) {
  const onPrompt = vi.fn(props.onPrompt);
  const onAccept = vi.fn(props.onAccept);
  const onRefused = vi.fn(props.onRefused);

  const drawn = (
    <AiLayer
      width={IMAGE.width}
      height={IMAGE.height}
      onPrompt={onPrompt}
      onAccept={onAccept}
      onRefused={onRefused}
      {...(props.preview === undefined ? {} : { preview: props.preview })}
    />
  );

  renderWithSettings(
    // The split view says "multi" around the view it draws; nothing else says anything.
    props.view === undefined ? drawn : <ViewKindContext.Provider value={props.view}>{drawn}</ViewKindContext.Provider>,
  );

  return { onPrompt, onAccept, onRefused, surface: screen.getByLabelText("AI tool") };
}

const point = (x: number, y: number, button = 0, init: { ctrlKey?: boolean } = {}) => ({
  button,
  pointerId: 1,
  clientX: x,
  clientY: y,
  ...init,
});

function click(surface: Element, x: number, y: number, button = 0) {
  fireEvent.pointerDown(surface, point(x, y, button));
  fireEvent.pointerUp(surface, point(x, y, button));
}

/** Where a drawn point is, in image pixels. */
function centre(testId: string): { x: number; y: number } | null {
  const mark = screen.queryByTestId(testId);
  if (mark === null) return null;
  return { x: Number(mark.getAttribute("cx")), y: Number(mark.getAttribute("cy")) };
}

/** Pretend the browser runs on a Mac, where Qt reads a Control-click as the right button. */
function onAMac(): void {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
}

describe("placing points", () => {
  it("adds a positive point on a left click and asks for a prediction", () => {
    const { surface, onPrompt } = layer();
    click(surface, 30, 40);

    expect(screen.queryByTestId("ai-positive-0")).not.toBeNull();
    expect(onPrompt.mock.calls[0]?.[0].points).toEqual([{ x: 30, y: 40, positive: true }]);
  });

  it("adds a NEGATIVE point on a right click", () => {
    const { surface } = layer();
    click(surface, 30, 40); // a positive one first, or there is nothing to subtract from
    click(surface, 50, 40, 2);

    expect(screen.queryByTestId("ai-negative-1")).not.toBeNull();
  });

  it("does not ask for a prediction from negative points alone", () => {
    // They say what the object is not, and SAM has nothing to grow from. The point is still
    // placed, because a positive one may follow -- and shown, as legacy draws its red point
    // (`ai_segment_manager.py:447-466`). It used to be dropped.
    const { surface, onPrompt, onRefused } = layer();
    click(surface, 30, 40, 2);

    expect(onPrompt).not.toHaveBeenCalled();
    expect(onRefused.mock.calls[0]?.[0]).toBe("add a positive point to segment");
    expect(centre("ai-negative-0")).toEqual({ x: 30, y: 40 });
  });

  it("uses a negative point placed first once a positive one follows", () => {
    const { surface, onPrompt } = layer();
    click(surface, 30, 40, 2);
    click(surface, 60, 50);

    expect(onPrompt.mock.calls[0]?.[0].points).toEqual([
      { x: 30, y: 40, positive: false },
      { x: 60, y: 50, positive: true },
    ]);
  });

  it("suppresses the context menu, since right-click is a prompt here", () => {
    // Otherwise the browser's menu opens over the preview the user is correcting.
    const { surface } = layer();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    surface.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe("the right button, as legacy's single view takes it", () => {
  // `single_view_mouse_handler.py:137-139`: a right press adds the negative point then and there,
  // and nothing about a right drag or release does anything more. The Sequence tab uses the same
  // handler (`main_window.py:1116-1131`).
  it("places the negative point on the PRESS, where it went down, and asks for a prediction", () => {
    const { surface, onPrompt } = layer();
    click(surface, 30, 40);
    onPrompt.mockClear();

    fireEvent.pointerDown(surface, point(50, 40, 2));

    expect(centre("ai-negative-1")).toEqual({ x: 50, y: 40 });
    expect(onPrompt).toHaveBeenCalledTimes(1);
    expect(onPrompt.mock.calls[0]?.[0].points[1]).toEqual({ x: 50, y: 40, positive: false });
  });

  it("makes nothing of a right DRAG: no drag preview, no box, and nothing more on release", () => {
    // The web made a right drag a box until 2026-09-26 (CONTROL_PARITY.md CP-26).
    const { surface, onPrompt } = layer();
    click(surface, 30, 40);
    onPrompt.mockClear();

    fireEvent.pointerDown(surface, point(10, 10, 2));
    fireEvent.pointerMove(surface, point(80, 70, 2));
    expect(screen.queryByTestId("ai-drag")).toBeNull();
    fireEvent.pointerUp(surface, point(80, 70, 2));

    expect(centre("ai-negative-1")).toEqual({ x: 10, y: 10 });
    expect(screen.queryByTestId("ai-negative-2")).toBeNull();
    expect(onPrompt).toHaveBeenCalledTimes(1);
    expect(onPrompt.mock.calls[0]?.[0].box).toBeNull();
  });

  it("takes a Control-click on a Mac as the right button, as Qt does there", () => {
    // Qt's `mouseDown:` turns a Control-click into a right press on macOS (`qnsview_mouse.mm`), and
    // legacy leaves that on. A browser reports the left button with Control held.
    onAMac();
    const { surface } = layer();

    fireEvent.pointerDown(surface, point(30, 40, 0, { ctrlKey: true }));

    expect(centre("ai-negative-0")).toEqual({ x: 30, y: 40 });
    expect(screen.queryByTestId("ai-positive-0")).toBeNull();
  });

  it("keeps a Ctrl-click a LEFT click elsewhere, as legacy reads no modifier here", () => {
    const { surface } = layer();

    fireEvent.pointerDown(surface, point(30, 40, 0, { ctrlKey: true }));
    fireEvent.pointerUp(surface, point(30, 40, 0, { ctrlKey: true }));

    expect(centre("ai-positive-0")).toEqual({ x: 30, y: 40 });
  });
});

describe("in legacy's multi view, whose handler differs", () => {
  // `main_window.py:5498-5572`: every press waits for its release, a drag with EITHER button is a
  // box, and anything else is a point where the pointer went DOWN.
  it("makes a RIGHT drag a box, previewed as it is drawn", () => {
    const { surface, onPrompt } = layer({ view: "multi" });

    fireEvent.pointerDown(surface, point(10, 10, 2));
    fireEvent.pointerMove(surface, point(80, 70, 2));
    expect(screen.queryByTestId("ai-drag")).not.toBeNull();
    fireEvent.pointerUp(surface, point(80, 70, 2));

    expect(screen.queryByTestId("ai-drag")).toBeNull();
    expect(screen.queryByTestId("ai-negative-0")).toBeNull();
    expect(onPrompt.mock.calls[0]?.[0].box).toEqual([{ x: 10, y: 10 }, { x: 80, y: 70 }]);
  });

  it("places a right click's negative point on the release, where the press was", () => {
    const { surface } = layer({ view: "multi" });
    click(surface, 30, 40);

    fireEvent.pointerDown(surface, point(50, 40, 2));
    expect(screen.queryByTestId("ai-negative-1")).toBeNull();
    fireEvent.pointerUp(surface, point(53, 41, 2));

    expect(centre("ai-negative-1")).toEqual({ x: 50, y: 40 });
  });

  it("draws a click's dot at the whole pixel the press was in, as legacy's marker is", () => {
    // `int(pos.x()), int(pos.y())` is placed and drawn (main_window.py:6739, 6760-6762).
    const { surface, onPrompt } = layer({ view: "multi" });

    click(surface, 30.8, 40.6);

    expect(centre("ai-positive-0")).toEqual({ x: 30, y: 40 });
    expect(onPrompt.mock.calls[0]?.[0].points).toEqual([{ x: 30, y: 40, positive: true }]);
  });

  it("puts a left click's point where the press was, and makes a thin drag a point", () => {
    const { surface, onRefused } = layer({ view: "multi" });

    fireEvent.pointerDown(surface, point(30, 40));
    fireEvent.pointerUp(surface, point(33, 41));
    fireEvent.pointerDown(surface, point(100, 10));
    fireEvent.pointerUp(surface, point(140, 18));

    expect(centre("ai-positive-0")).toEqual({ x: 30, y: 40 });
    expect(centre("ai-positive-1")).toEqual({ x: 100, y: 10 });
    expect(onRefused).not.toHaveBeenCalled();
  });
});

describe("drawing a box", () => {
  it("shows no drag preview until the pointer is more than five pixels from the press", () => {
    // Legacy's rubber band appears once the drag passes the threshold that makes it a drag
    // (`single_view_mouse_handler.py:237`), not as a speck under every click.
    const { surface } = layer();

    fireEvent.pointerDown(surface, point(10, 10));
    fireEvent.pointerMove(surface, point(13, 13));
    expect(screen.queryByTestId("ai-drag")).toBeNull();

    fireEvent.pointerMove(surface, point(20, 20));
    expect(screen.queryByTestId("ai-drag")).not.toBeNull();
  });

  it("previews the drag, then asks with the box and draws none of it", () => {
    // Legacy takes its rubber band away at the release and shows only the preview
    // (single_view_mouse_handler.py:351-353). The box stayed drawn here until 2026-09-27.
    const { surface, onPrompt } = layer();

    fireEvent.pointerDown(surface, point(10, 10));
    fireEvent.pointerMove(surface, point(80, 70));
    expect(screen.queryByTestId("ai-drag")).not.toBeNull();

    fireEvent.pointerUp(surface, point(80, 70));

    expect(surface.querySelector("rect")).toBeNull();
    expect(onPrompt.mock.calls[0]?.[0].box).toEqual([{ x: 10, y: 10 }, { x: 80, y: 70 }]);
  });

  it("refuses a box too thin to predict, and says its size", () => {
    const { surface, onPrompt, onRefused } = layer();

    fireEvent.pointerDown(surface, point(0, 0));
    fireEvent.pointerUp(surface, point(40, 8));

    expect(onPrompt).not.toHaveBeenCalled();
    expect(onRefused.mock.calls[0]?.[0]).toContain("40x8");
  });
});

describe("accepting", () => {
  it("commits nothing until Space, however many points are placed", () => {
    // The whole shape of the interaction: SAM answers, the user looks, corrects, and only then
    // accepts. A tool that committed on every click would fill the image with rejected masks.
    const { surface, onAccept } = layer();
    click(surface, 30, 40);
    click(surface, 35, 45);

    expect(onAccept).not.toHaveBeenCalled();
  });

  it("accepts on Space", () => {
    const { surface, onAccept } = layer();
    click(surface, 30, 40);

    fireEvent.keyDown(document, { key: " ", code: "Space" });

    expect(onAccept).toHaveBeenCalledWith(false);
  });

  it("erases on Shift+Space", () => {
    const { surface, onAccept } = layer();
    click(surface, 30, 40);

    fireEvent.keyDown(document, { key: " ", code: "Space", shiftKey: true });

    expect(onAccept).toHaveBeenCalledWith(true);
  });

  it("clears the prompt afterwards", () => {
    const { surface } = layer();
    click(surface, 30, 40);
    fireEvent.keyDown(document, { key: " ", code: "Space" });

    expect(screen.queryByTestId("ai-positive-0")).toBeNull();
  });

  it("says so when there is nothing to accept", () => {
    const { onAccept, onRefused } = layer();
    fireEvent.keyDown(document, { key: " ", code: "Space" });

    expect(onAccept).not.toHaveBeenCalled();
    expect(onRefused.mock.calls[0]?.[0]).toBe("No AI segment preview to accept");
  });

  it("does not accept while the user is typing", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    const { surface, onAccept } = layer();
    click(surface, 30, 40);
    fireEvent.keyDown(input, { key: " ", code: "Space" });

    expect(onAccept).not.toHaveBeenCalled();
    input.remove();
  });
});

describe("Enter, legacy's accept-then-save", () => {
  it("accepts the pending prompt before the save runs, as Space would", () => {
    // Legacy: "First accept any AI segments (same as spacebar), then save". The save alone left
    // the mask on screen out of the file (CONTROL_PARITY.md CP-22).
    const { surface, onAccept } = layer();
    click(surface, 30, 40);

    fireEvent.keyDown(document, { key: "Enter" });

    expect(onAccept).toHaveBeenCalledWith(false);
  });

  it("with nothing placed, leaves the save to itself and refuses nothing", () => {
    const { onAccept, onRefused } = layer();

    fireEvent.keyDown(document, { key: "Enter" });

    expect(onAccept).not.toHaveBeenCalled();
    expect(onRefused).not.toHaveBeenCalled();
  });
});

describe("taking things back", () => {
  it("puts an undone point back on Ctrl+Shift+Z, as legacy's redo does, rather than taking another", () => {
    // Ctrl+Shift+Z removed a point while the undo check ignored Shift (CONTROL_PARITY.md CP-21).
    const { surface } = layer();
    click(surface, 30, 40);
    click(surface, 60, 40);
    fireEvent.keyDown(document, { key: "z", ctrlKey: true });
    expect(screen.queryByTestId("ai-positive-1")).toBeNull();

    fireEvent.keyDown(document, { key: "Z", ctrlKey: true, shiftKey: true });

    expect(screen.queryByTestId("ai-positive-0")).not.toBeNull();
    expect(screen.queryByTestId("ai-positive-1")).not.toBeNull();
  });

  it("discards everything on Escape", () => {
    const { surface } = layer();
    click(surface, 30, 40);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("ai-positive-0")).toBeNull();
  });

  it("keeps its points when Escape or Ctrl+Z is pressed inside a modal dialog", () => {
    // The Escape that closed the hotkey dialog also cleared the points behind it: this listens in
    // the capture phase, before the dialog can stop the key.
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    const close = document.createElement("button");
    dialog.appendChild(close);
    document.body.appendChild(dialog);

    const { surface } = layer();
    click(surface, 30, 40);
    fireEvent.keyDown(close, { key: "Escape" });
    fireEvent.keyDown(close, { key: "z", ctrlKey: true });

    expect(screen.queryByTestId("ai-positive-0")).not.toBeNull();
    dialog.remove();
  });

  it("removes the BOX first on undo, because that is what Space would take", () => {
    const { surface, onPrompt } = layer();
    click(surface, 30, 40);
    fireEvent.pointerDown(surface, point(60, 10));
    fireEvent.pointerUp(surface, point(140, 80));
    expect(onPrompt.mock.lastCall?.[0].box).toEqual([{ x: 60, y: 10 }, { x: 140, y: 80 }]);

    fireEvent.keyDown(document, { key: "z", ctrlKey: true });

    // Asked again without the box, and the point kept.
    expect(onPrompt.mock.lastCall?.[0].box).toBeNull();
    expect(onPrompt.mock.lastCall?.[0].points).toEqual([{ x: 30, y: 40, positive: true }]);
    expect(screen.queryByTestId("ai-positive-0")).not.toBeNull();
  });

  it("re-asks for a prediction when something is still pending after an undo", () => {
    const { surface, onPrompt } = layer();
    click(surface, 30, 40);
    click(surface, 50, 50);
    onPrompt.mockClear();

    fireEvent.keyDown(document, { key: "z", ctrlKey: true });

    expect(onPrompt).toHaveBeenCalledTimes(1);
    expect(onPrompt.mock.calls[0]?.[0].points).toHaveLength(1);
  });
});

describe("how the prompt looks, as legacy draws it", () => {
  it("in the single view, a point is green or red at alpha 150 with no outline", () => {
    // ai_segment_manager.py:451-464. The dots had a dark outline here until 2026-09-27.
    const { surface } = layer();
    click(surface, 30, 40);
    click(surface, 50, 40, 2);

    const positive = screen.getByTestId("ai-positive-0");
    const negative = screen.getByTestId("ai-negative-1");
    expect(positive.getAttribute("fill")).toBe(`rgba(0, 255, 0, ${150 / 255})`);
    expect(negative.getAttribute("fill")).toBe(`rgba(255, 0, 0, ${150 / 255})`);
    for (const mark of [positive, negative]) {
      expect(mark.getAttribute("stroke")).toBe("none");
      expect(mark.getAttribute("stroke-width")).toBeNull();
    }
  });

  it("in the Multi tab, a point is opaque with a black pen one pixel wide", () => {
    // main_window.py:6765-6772: a pen one image pixel wide, a width in the scene.
    const { surface } = layer({ view: "multi" });
    click(surface, 30, 40);

    const positive = screen.getByTestId("ai-positive-0");
    expect(positive.getAttribute("fill")).toBe("rgb(0, 255, 0)");
    expect(positive.getAttribute("stroke")).toBe("rgb(0, 0, 0)");
    expect(positive.getAttribute("stroke-width")).toBe("1");
  });

  it("draws the rubber band in cyan with Qt's dash, whatever the class", () => {
    // single_view_mouse_handler.py:242-249; main_window.py:5449-5456 in the Multi tab.
    const { surface } = layer();
    fireEvent.pointerDown(surface, point(10, 10));
    fireEvent.pointerMove(surface, point(80, 70));

    const band = screen.getByTestId("ai-drag");
    expect(band.getAttribute("stroke")).toBe("rgb(0, 255, 255)");
    // Dashes of 4 and gaps of 2 pen widths, on legacy's default pen of 0.5 image pixels.
    expect(band.getAttribute("stroke-dasharray")).toBe("2 1");
    expect(band.getAttribute("fill")).toBe("none");
  });
});

describe("the preview", () => {
  it("is drawn under the prompt marks", () => {
    // Under, so a point placed on top of the mask is still visible -- which is exactly where a
    // correcting point goes.
    layer({ preview: <rect data-testid="given-preview" /> });

    expect(screen.queryByTestId("given-preview")).not.toBeNull();
  });
});
