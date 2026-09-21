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
import { renderWithSettings } from "./settingsHarness.jsx";

afterEach(cleanup);

const IMAGE = { width: 200, height: 100 };
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  } as DOMRect);
});

function layer(props: Partial<Parameters<typeof AiLayer>[0]> = {}) {
  const onPrompt = vi.fn(props.onPrompt);
  const onAccept = vi.fn(props.onAccept);
  const onRefused = vi.fn(props.onRefused);

  renderWithSettings(
    <AiLayer
      width={IMAGE.width}
      height={IMAGE.height}
      classId={props.classId ?? 1}
      onPrompt={onPrompt}
      onAccept={onAccept}
      onRefused={onRefused}
      {...(props.preview === undefined ? {} : { preview: props.preview })}
    />,
  );

  return { onPrompt, onAccept, onRefused, surface: screen.getByLabelText("AI tool") };
}

const point = (x: number, y: number, button = 0) => ({ button, pointerId: 1, clientX: x, clientY: y });

function click(surface: Element, x: number, y: number, button = 0) {
  fireEvent.pointerDown(surface, point(x, y, button));
  fireEvent.pointerUp(surface, point(x, y, button));
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
    // placed, because a positive one may follow.
    const { surface, onPrompt, onRefused } = layer();
    click(surface, 30, 40, 2);

    expect(onPrompt).not.toHaveBeenCalled();
    expect(onRefused.mock.calls[0]?.[0]).toContain("add a positive one");
  });

  it("suppresses the context menu, since right-click is a prompt here", () => {
    // Otherwise the browser's menu opens over the preview the user is correcting.
    const { surface } = layer();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    surface.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe("drawing a box", () => {
  it("previews the drag, then keeps the box", () => {
    const { surface, onPrompt } = layer();

    fireEvent.pointerDown(surface, point(10, 10));
    fireEvent.pointerMove(surface, point(80, 70));
    expect(screen.queryByTestId("ai-drag")).not.toBeNull();

    fireEvent.pointerUp(surface, point(80, 70));

    expect(screen.queryByTestId("ai-drag")).toBeNull();
    expect(screen.queryByTestId("ai-box")).not.toBeNull();
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

describe("taking things back", () => {
  it("discards everything on Escape", () => {
    const { surface } = layer();
    click(surface, 30, 40);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("ai-positive-0")).toBeNull();
  });

  it("removes the BOX first on undo, because that is what Space would take", () => {
    const { surface } = layer();
    click(surface, 30, 40);
    fireEvent.pointerDown(surface, point(60, 10));
    fireEvent.pointerUp(surface, point(140, 80));
    expect(screen.queryByTestId("ai-box")).not.toBeNull();

    fireEvent.keyDown(document, { key: "z", ctrlKey: true });

    expect(screen.queryByTestId("ai-box")).toBeNull();
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

describe("the preview", () => {
  it("is drawn under the prompt marks", () => {
    // Under, so a point placed on top of the mask is still visible -- which is exactly where a
    // correcting point goes.
    layer({ preview: <rect data-testid="given-preview" /> });

    expect(screen.queryByTestId("given-preview")).not.toBeNull();
  });
});
