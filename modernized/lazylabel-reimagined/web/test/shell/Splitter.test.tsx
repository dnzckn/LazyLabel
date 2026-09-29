/**
 * The right-hand column's splitter: legacy's vertical QSplitter (right_panel.py:67-85).
 *
 * The owner, 2026-09-29: "the right side controls should be fixed normalized to the height, so not
 * an infinte hight scrol bar look to the pyqt6 implementation for how it was done there". The
 * column was one long scroll, and a folder of 86 photos pushed Segments and Classes far down it.
 *
 * jsdom lays nothing out, so each section's height is given here, as the page would measure it,
 * and what is checked is what the splitter hands the stylesheet: each section's flex-grow factor
 * (`--share`) and minimum (`--min`), and a closed section's class. The page itself was checked in
 * headless Chromium (E:\lazylabel-layout-check).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Splitter, type SplitterSection } from "../../src/shell/Splitter.jsx";
import {
  KEY_STEP,
  dividerValue,
  growFactors,
  moveDivider,
  pairAt,
  readShares,
} from "../../src/shell/splitter.js";

const KEY = "test.splitter";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function sections(collapsed: readonly boolean[] = [false, false, false]): SplitterSection[] {
  return [
    { id: "images", label: "Images", share: 0.38, min: 200, collapsed: collapsed[0] ?? false, content: <p>files</p> },
    { id: "segments", label: "Segments", share: 0.31, min: 170, collapsed: collapsed[1] ?? false, content: <p>segments</p> },
    { id: "classes", label: "Classes", share: 0.31, min: 150, collapsed: collapsed[2] ?? false, content: <p>classes</p> },
  ];
}

const boxes = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(".splitter__section")];
const shares = (): number[] => boxes().map((box) => Number(box.style.getPropertyValue("--share")));
const dividers = (): HTMLElement[] => screen.getAllByRole("separator");

/** Gives each section the height the page would measure. */
function measure(heights: readonly number[]): void {
  boxes().forEach((box, index) => {
    const height = heights[index] ?? 0;
    box.getBoundingClientRect = () =>
      ({ top: 0, bottom: height, left: 0, right: 330, width: 330, height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  });
}

function drag(divider: HTMLElement, from: number, to: number): void {
  fireEvent.pointerDown(divider, { button: 0, buttons: 1, clientX: 100, clientY: from, pointerId: 7 });
  fireEvent.pointerMove(document.body, { buttons: 1, clientX: 100, clientY: to, pointerId: 7 });
  fireEvent.pointerUp(document.body, { button: 0, buttons: 0, clientX: 100, clientY: to, pointerId: 7 });
}

describe("the column as legacy's splitter", () => {
  it("stacks the sections in legacy's order with a divider between each two", () => {
    render(<Splitter sections={sections()} />);

    expect(boxes().map((box) => box.textContent)).toEqual(["files", "segments", "classes"]);
    expect(dividers().map((divider) => divider.getAttribute("aria-label"))).toEqual([
      "Resize Images and Segments",
      "Resize Segments and Classes",
    ]);
    // Each divider sits between the two sections it resizes.
    const [first, second] = dividers();
    expect(first!.previousElementSibling).toBe(boxes()[0]);
    expect(first!.nextElementSibling).toBe(boxes()[1]);
    expect(second!.nextElementSibling).toBe(boxes()[2]);
  });

  it("starts at legacy's shares, about 38, 31 and 31 percent, each with its minimum", () => {
    // Legacy's sections are 294, 242 and 234 pixels of 770 at its default 1600x900.
    render(<Splitter sections={sections()} />);

    expect(shares()).toEqual([38, 31, 31]);
    expect(boxes().map((box) => box.style.getPropertyValue("--min"))).toEqual(["200px", "170px", "150px"]);
  });

  it("is a separator a keyboard can reach, with where it stands as its value", () => {
    render(<Splitter sections={sections()} />);
    const [first] = dividers();

    expect(first!.tabIndex).toBe(0);
    expect(first!.getAttribute("aria-orientation")).toBe("horizontal");
    expect(first!.getAttribute("aria-valuenow")).toBe(String(Math.round((100 * 0.38) / 0.69)));
    expect(first!.getAttribute("aria-controls")).toBe(boxes()[0]!.id);
  });
});

describe("dragging a divider", () => {
  it("trades height between the two sections beside it, and leaves the third alone", () => {
    render(<Splitter sections={sections()} />);
    measure([300, 240, 240]);

    drag(dividers()[0]!, 300, 340);

    // The two keep their 540 pixels between them: 340 and 200 now.
    const [images, segments, classes] = shares();
    expect(images).toBeCloseTo((100 * 0.69 * 340) / 540, 3);
    expect(segments).toBeCloseTo((100 * 0.69 * 200) / 540, 3);
    expect(classes).toBe(31);
  });

  it("measures every move from the press, so a drag back returns to where it began", () => {
    render(<Splitter sections={sections()} />);
    measure([300, 240, 240]);
    const [first] = dividers();

    fireEvent.pointerDown(first!, { button: 0, buttons: 1, clientY: 300, pointerId: 7 });
    fireEvent.pointerMove(document.body, { buttons: 1, clientY: 350, pointerId: 7 });
    fireEvent.pointerMove(document.body, { buttons: 1, clientY: 300, pointerId: 7 });
    fireEvent.pointerUp(document.body, { button: 0, buttons: 0, clientY: 300, pointerId: 7 });

    expect(shares()[0]).toBeCloseTo((100 * 0.69 * 300) / 540, 3);
    expect(shares()[1]).toBeCloseTo((100 * 0.69 * 240) / 540, 3);
  });

  it("stops at a section's minimum, however far the pointer goes", () => {
    render(<Splitter sections={sections()} />);
    measure([300, 240, 240]);

    drag(dividers()[0]!, 300, 900);
    // Segments keeps its 170 pixels; the file list gets the rest of the 540.
    expect(shares()[1]).toBeCloseTo((100 * 0.69 * 170) / 540, 3);

    measure([370, 170, 240]);
    drag(dividers()[0]!, 370, -500);
    // And the file list keeps its 200.
    expect(shares()[0]).toBeCloseTo((100 * 0.69 * 200) / 540, 3);
  });

  it("marks the divider while it is dragged, and not after", () => {
    render(<Splitter sections={sections()} />);
    measure([300, 240, 240]);
    const [first] = dividers();

    fireEvent.pointerDown(first!, { button: 0, buttons: 1, clientY: 300, pointerId: 7 });
    expect(first!.className).toContain("splitter__handle--dragging");
    fireEvent.pointerUp(document.body, { button: 0, buttons: 0, clientY: 300, pointerId: 7 });
    expect(first!.className).not.toContain("splitter__handle--dragging");
  });

  it("ignores another button and another pointer", () => {
    render(<Splitter sections={sections()} />);
    measure([300, 240, 240]);
    const [first] = dividers();

    fireEvent.pointerDown(first!, { button: 2, buttons: 2, clientY: 300, pointerId: 7 });
    fireEvent.pointerMove(document.body, { buttons: 2, clientY: 360, pointerId: 7 });
    fireEvent.pointerDown(first!, { button: 0, buttons: 1, clientY: 300, pointerId: 7 });
    fireEvent.pointerMove(document.body, { buttons: 1, clientY: 360, pointerId: 8 });
    fireEvent.pointerUp(document.body, { button: 0, buttons: 0, clientY: 360, pointerId: 7 });

    expect(shares()).toEqual([38, 31, 31]);
  });
});

describe("the divider from the keyboard", () => {
  it("moves by a step with Down and Up, and to either section's minimum with End and Home", () => {
    render(<Splitter sections={sections()} />);
    measure([300, 240, 240]);
    const [first] = dividers();
    first!.focus();

    fireEvent.keyDown(first!, { key: "ArrowDown" });
    expect(shares()[0]).toBeCloseTo((100 * 0.69 * (300 + KEY_STEP)) / 540, 3);

    measure([300 + KEY_STEP, 240 - KEY_STEP, 240]);
    fireEvent.keyDown(first!, { key: "ArrowUp" });
    expect(shares()[0]).toBeCloseTo((100 * 0.69 * 300) / 540, 3);

    measure([300, 240, 240]);
    fireEvent.keyDown(first!, { key: "End" });
    expect(shares()[1]).toBeCloseTo((100 * 0.69 * 170) / 540, 3);

    measure([370, 170, 240]);
    fireEvent.keyDown(first!, { key: "Home" });
    expect(shares()[0]).toBeCloseTo((100 * 0.69 * 200) / 540, 3);
  });

  it("keeps its keys from the application's shortcuts", () => {
    const shortcuts = vi.fn();
    document.addEventListener("keydown", shortcuts);
    try {
      render(<Splitter sections={sections()} />);
      measure([300, 240, 240]);

      fireEvent.keyDown(dividers()[0]!, { key: "ArrowDown" });
      expect(shortcuts).not.toHaveBeenCalled();

      // A key the divider does not use goes on as before.
      fireEvent.keyDown(dividers()[0]!, { key: "a" });
      expect(shortcuts).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("keydown", shortcuts);
    }
  });
});

describe("a section closed to its header", () => {
  it("is drawn at its header's height, and its share goes to the open sections", () => {
    render(<Splitter sections={sections([false, true, false])} />);

    expect(boxes().map((box) => box.classList.contains("splitter__section--collapsed"))).toEqual([false, true, false]);
    // The open two fill the column between them, in their own proportion.
    const [images, segments, classes] = shares();
    expect(segments).toBe(0);
    expect(images! + classes!).toBeCloseTo(100, 3);
    expect(images! / classes!).toBeCloseTo(0.38 / 0.31, 3);
  });

  it("moves with its dividers, which resize the open sections either side of it", () => {
    render(<Splitter sections={sections([false, true, false])} />);
    measure([400, 20, 360]);

    expect(dividers().map((divider) => divider.getAttribute("aria-label"))).toEqual([
      "Resize Images and Classes",
      "Resize Images and Classes",
    ]);
    drag(dividers()[1]!, 420, 460);

    // The file list and the classes share their 760 pixels: 440 and 320 now.
    const [images, , classes] = shares();
    expect(images! / (images! + classes!)).toBeCloseTo(440 / 760, 3);
  });

  it("leaves a divider with no open section beyond it nothing to move", () => {
    render(<Splitter sections={sections([false, true, true])} />);
    measure([760, 20, 20]);

    for (const divider of dividers()) {
      expect(divider.getAttribute("aria-disabled")).toBe("true");
      expect(divider.hasAttribute("tabindex")).toBe(false);
      expect(divider.hasAttribute("aria-valuenow")).toBe(false);
    }
    drag(dividers()[0]!, 760, 600);
    expect(shares()).toEqual([100, 0, 0]);
  });

  it("gets its share back when it opens again", () => {
    const { rerender } = render(<Splitter sections={sections([false, true, false])} />);
    rerender(<Splitter sections={sections()} />);
    expect(shares()).toEqual([38, 31, 31]);
  });
});

describe("remembered in this browser", () => {
  it("keeps the viewer's dividers for the next time the page opens", () => {
    const first = render(<Splitter sections={sections()} storageKey={KEY} />);
    measure([300, 240, 240]);
    drag(dividers()[0]!, 300, 340);
    const moved = shares();
    first.unmount();

    render(<Splitter sections={sections()} storageKey={KEY} />);
    expect(shares()).toEqual(moved);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toHaveLength(3);
  });

  it("writes nothing until a divider is moved", () => {
    render(<Splitter sections={sections()} storageKey={KEY} />);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("starts from legacy's shares when what is stored cannot be used", () => {
    localStorage.setItem(KEY, "not json");
    const { unmount } = render(<Splitter sections={sections()} storageKey={KEY} />);
    expect(shares()).toEqual([38, 31, 31]);
    unmount();

    localStorage.setItem(KEY, JSON.stringify([0.5, 0.5]));
    render(<Splitter sections={sections()} storageKey={KEY} />);
    expect(shares()).toEqual([38, 31, 31]);
  });

  it("still works where the browser refuses its storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    render(<Splitter sections={sections()} storageKey={KEY} />);
    expect(shares()).toEqual([38, 31, 31]);

    measure([300, 240, 240]);
    drag(dividers()[0]!, 300, 340);
    expect(shares()[0]).toBeCloseTo((100 * 0.69 * 340) / 540, 3);
  });
});

describe("the arithmetic", () => {
  it("pairs a divider with the nearest open section on each side", () => {
    expect(pairAt([false, false, false], 0)).toEqual({ above: 0, below: 1 });
    expect(pairAt([false, true, false], 0)).toEqual({ above: 0, below: 2 });
    expect(pairAt([false, true, false], 1)).toEqual({ above: 0, below: 2 });
    expect(pairAt([true, false, false], 0)).toBeNull();
    expect(pairAt([false, false, true], 1)).toBeNull();
  });

  it("keeps the two shares' sum, and moves nothing where the minimums do not fit", () => {
    const pair = { above: 0, below: 1 };
    const moved = moveDivider([0.38, 0.31, 0.31], pair, { above: 300, below: 240 }, 40, { above: 200, below: 170 });
    expect(moved[0]! + moved[1]!).toBeCloseTo(0.69, 10);
    expect(moved[2]).toBe(0.31);

    expect(moveDivider([0.38, 0.31, 0.31], pair, { above: 150, below: 150 }, 40, { above: 200, below: 170 })).toEqual([
      0.38, 0.31, 0.31,
    ]);
    expect(moveDivider([0.38, 0.31, 0.31], pair, { above: 0, below: 0 }, 40, { above: 0, below: 0 })).toEqual([
      0.38, 0.31, 0.31,
    ]);
  });

  it("draws the open sections' shares as parts of 100, since factors under 1 leave height unused", () => {
    // Flexbox hands out only the fraction of the free height that factors under 1 add up to: with
    // Segments closed, 0.38 and 0.31 left almost a third of the column empty.
    expect(growFactors([0.38, 0.31, 0.31], [false, true, false]).reduce((sum, grow) => sum + grow, 0)).toBeCloseTo(100, 3);
    expect(growFactors([0.38, 0.31, 0.31], [false, true, true])).toEqual([100, 0, 0]);
    expect(growFactors([0.2, 0.2, 0.2], [false, false, false])).toEqual([33.3333, 33.3333, 33.3333]);
  });

  it("reads back only a list of positive numbers for every section", () => {
    const defaults = [0.38, 0.31, 0.31];
    expect(readShares(null, defaults)).toEqual(defaults);
    expect(readShares("{", defaults)).toEqual(defaults);
    expect(readShares("[0.5, 0.5]", defaults)).toEqual(defaults);
    expect(readShares("[0.5, -0.1, 0.6]", defaults)).toEqual(defaults);
    expect(readShares('[0.5, "0.2", 0.3]', defaults)).toEqual(defaults);
    expect(readShares("[0.5, 0.2, 0.3]", defaults)).toEqual([0.5, 0.2, 0.3]);
  });

  it("gives the divider's place as the percentage of its pair above it", () => {
    expect(dividerValue([0.38, 0.31, 0.31], { above: 0, below: 1 })).toBe(55);
    expect(dividerValue([0.38, 0.31, 0.31], { above: 1, below: 2 })).toBe(50);
  });
});
