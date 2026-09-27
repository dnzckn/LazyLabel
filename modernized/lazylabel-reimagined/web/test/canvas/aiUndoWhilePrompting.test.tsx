/**
 * Ctrl+Z while placing AI points -- the same race `keysWhileDrawing.test.tsx` found for polygons.
 *
 * The AI layer takes back the last point it placed; the dispatcher's Undo takes back the last
 * ANNOTATION. Both heard Ctrl+Z, and the dispatcher ran first, so a user stepping back one point
 * lost the object they had accepted before it. With nothing placed, Undo is exactly what should
 * happen, and must still reach the history.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiLayer } from "../../src/canvas/AiLayer.jsx";
import { useHotkey } from "../../src/hotkeys/HotkeyProvider.jsx";
import { renderWithSettings } from "./settingsHarness.jsx";

afterEach(cleanup);

const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ ...RECT, toJSON: () => RECT } as DOMRect);
});

/** Stands where HistoryControls does: the app's Undo, on the dispatcher. */
function HistoryUndo({ onUndo }: { readonly onUndo: () => void }): ReactNode {
  useHotkey("undo", onUndo);
  return null;
}

function mount() {
  const undo = vi.fn();
  const onPrompt = vi.fn();
  renderWithSettings(
    <>
      <HistoryUndo onUndo={undo} />
      <AiLayer width={200} height={100} onPrompt={onPrompt} onAccept={vi.fn()} onRefused={vi.fn()} />
    </>,
  );
  return { undo, surface: screen.getByLabelText("AI tool") };
}

function place(surface: Element, x: number, y: number) {
  fireEvent.pointerDown(surface, { button: 0, pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerUp(surface, { button: 0, pointerId: 1, clientX: x, clientY: y });
}

const ctrlZ = () => fireEvent.keyDown(document.body, { key: "z", code: "KeyZ", ctrlKey: true });

describe("Ctrl+Z while prompting the AI", () => {
  it("takes back the last point and NOT the previous annotation", () => {
    const { undo, surface } = mount();
    place(surface, 30, 40);
    place(surface, 60, 40);

    ctrlZ();

    expect(screen.queryByTestId("ai-positive-1")).toBeNull();
    expect(screen.queryByTestId("ai-positive-0")).not.toBeNull();
    expect(undo).not.toHaveBeenCalled();
  });

  it("still reaches Undo when there is nothing placed to take back", () => {
    const { undo } = mount();

    ctrlZ();

    expect(undo).toHaveBeenCalledTimes(1);
  });
});
