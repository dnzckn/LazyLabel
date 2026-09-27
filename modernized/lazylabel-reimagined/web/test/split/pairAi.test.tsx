/**
 * The Multi tab's AI: one prompt, asked of each image's own model -- what the Multi tab is for.
 *
 * The owner, 2026-09-27: "the point of multi mode is to be able to use AI tool in it and be able to
 * create segments using the same coordinates across both images for prompting the models, yet the
 * contours of the segments can vary slightly". Legacy's linked AI click and box go to every target
 * viewer at the same image pixel, each viewer's own model predicts on its own image, and each shows
 * its own preview (main_window.py:6645-6720, 6778-6804); Space makes each preview that viewer's
 * own segment and Escape clears both (ai_segment_manager.py:301-403; keyboard_event_manager.py:
 * 44-57, 315-319). Until 2026-09-27 the accepted MASK was copied into the other image instead.
 *
 * The whole app is mounted with only the HTTP client stubbed. Each image's "model" finds the object
 * in a different place, so which image's answer landed where is visible in the store.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";
import { decodeMask, type WireSegment } from "@lazylabel/contracts";

import type { AnnotationsResult, ApiClient, WireSegmentRequest, WireSegmentResponse } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { App } from "../../src/shell/App.jsx";
import { outsideOf } from "../../src/split/pairAi.js";
import { EMPTY_PROMPT } from "../../src/tools/ai.js";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";
import { chooseTool } from "../acceptance/harness.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The canvas is 200x100 at the origin, so a click coordinate IS an image coordinate. */
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };
const MODEL = "SAM 2.1 large";

const SIZES: Readonly<Record<string, { width: number; height: number }>> = {
  "frames/a.png": { width: 200, height: 100 },
  "frames/b.png": { width: 200, height: 100 },
  // Smaller: a prompt on a.png's right half is outside it.
  "frames/c.png": { width: 100, height: 50 },
};

/** Where each image's own model finds the object: an 8x8 square, somewhere else in each. */
const FOUND: Readonly<Record<string, readonly [number, number]>> = {
  "frames/a.png": [2, 2],
  "frames/b.png": [20, 20],
  "frames/c.png": [30, 10],
};

/** a.png calls class 0 "car"; b.png calls class 0 "tree" and class 1 "car". Neither has annotations. */
const ALIASES: Readonly<Record<string, Record<string, string>>> = {
  "frames/a.png": { "0": "car" },
  "frames/b.png": { "0": "tree", "1": "car" },
};

function answer(key: string): WireSegmentResponse {
  const size = SIZES[key]!;
  const [x, y] = FOUND[key]!;
  return {
    mask: { height: size.height, width: size.width, box: [x, y, x + 8, y + 8], data: btoa("\u0001".repeat(64)) },
    score: 0.9,
    chosen: 0,
    alternatives: [0.9],
  };
}

function loaded(key: string): AnnotationsResult {
  const aliases = ALIASES[key];
  if (aliases === undefined) return { kind: "none" };
  return {
    kind: "loaded",
    annotations: { segments: [], classAliases: aliases, failures: [], rejected: 0, sourceFile: `${key}.npz`, sourceFormat: "NPZ" },
  } as unknown as AnnotationsResult;
}

/** Which image's object a segment covers: the image whose model found that square. */
function whose(segment: WireSegment, key: string): string {
  if (segment.mask === undefined) {
    // A polygon, from Auto-Convert: whose square its first corner is on.
    const [cx, cy] = segment.vertices?.[0] ?? [Number.NaN, Number.NaN];
    const found = Object.entries(FOUND).find(
      ([image, [x, y]]) => image === key && cx >= x - 1 && cx <= x + 9 && cy >= y - 1 && cy <= y + 9,
    );
    return `${segment.type} of ${found === undefined ? "neither" : found[0].slice("frames/".length)}`;
  }
  const mask = decodeMask(segment.mask);
  for (const [image, [x, y]] of Object.entries(FOUND)) {
    if (mask.data[(y + 4) * mask.width + (x + 4)] === 1 && SIZES[image]!.width === SIZES[key]!.width) {
      return image.slice("frames/".length);
    }
  }
  return "neither";
}

/** Both sides of the store: which image, and for each annotation whose object it is and its class. */
function Probe(): ReactNode {
  const { sides } = useWorkspace();
  return (
    <pre data-testid="pair">
      {JSON.stringify(
        sides.map((side) => ({
          key: side.open?.image.key ?? null,
          found: side.segments.map((segment) => whose(segment, side.open?.image.key ?? "")),
          classes: side.segments.map((segment) => segment.classId),
          aliases: side.classAliases,
          vertices: side.segments.map((segment) => segment.vertices ?? null),
        })),
      )}
    </pre>
  );
}

interface Side {
  readonly key: string | null;
  readonly found: readonly string[];
  readonly classes: readonly (number | null)[];
  readonly aliases: Readonly<Record<string, string>>;
  readonly vertices: readonly (readonly (readonly [number, number])[] | null)[];
}

const pair = (): readonly [Side, Side] => JSON.parse(screen.getByTestId("pair").textContent ?? "[]");

function mount(
  failing: ReadonlySet<string> = new Set(),
  values: Record<string, unknown> = {},
  /** Images whose encode answers only when this promise settles. */
  slow: ReadonlyMap<string, Promise<unknown>> = new Map(),
) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ ...RECT, toJSON: () => RECT } as DOMRect);

  const embed = vi.fn(async (request: { image: string }) => {
    await slow.get(request.image);
    return { handle: `h:${request.image}`, cached: true };
  });
  const segment = vi.fn(async (request: WireSegmentRequest) => {
    const key = request.handle.slice(2);
    if (failing.has(key)) throw new Error("model fell over");
    return answer(key);
  });

  const client = {
    getSettings: async () => {
      const settings = defaultSettings();
      return { ...settings, values: { ...settings.values, ...values } };
    },
    putSettings: async (settings: unknown) => settings,
    health: async () => ({
      status: "ok",
      dataset: "ok",
      database: "ok",
      degraded: [],
      ai: { available: true, reason: null, videoCapable: false, accelerator: "test" },
    }),
    listImages: async () => ({
      folder: "frames",
      folders: [],
      annotatedCount: 0,
      unrecognized: 0,
      columns: [{ format: "NPZ", suffix: ".npz" }],
      images: ["a.png", "b.png", "c.png"].map((name) => ({
        key: `frames/${name}`,
        name,
        sidecars: { NPZ: false },
        annotated: false,
        sharesSidecarsWith: [],
      })),
    }),
    loadAnnotations: async (_project: string, key: string) => loaded(key),
    imageMetadata: async (_project: string, key: string) => ({
      ...SIZES[key]!,
      sourceDepth: 8,
      sourceChannels: 3,
      sourceFormat: "png",
    }),
    models: async () => [
      {
        name: MODEL,
        family: "sam2",
        size: "large",
        videoCapable: true,
        segmenter: true,
        present: true,
        verified: true,
        detail: null,
      },
    ],
    embed,
    segment,
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/thumbnail",
    saveAnnotations: async () => ({ written: { NPZ: "r1" }, stale: [] as string[], skippedEmpty: [] as string[] }),
    deleteAnnotations: async () => ({ deleted: [] as string[] }),
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={client} projectId="default" confirmNavigation={() => true}>
            <App client={client} />
            <Probe />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );

  return { embed, segment };
}

/** a.png opened, the Multi tab chosen, `second` paired with it, and the AI tool ready on both. */
async function pairUp(second = "b.png", failing?: ReadonlySet<string>, values?: Record<string, unknown>) {
  const handles = mount(failing, values);
  fireEvent.doubleClick(await screen.findByRole("button", { name: "a.png" }));
  await waitFor(() => expect(pair()[0].aliases).toEqual(ALIASES["frames/a.png"]));
  fireEvent.click(screen.getByRole("tab", { name: "Multi" }));
  fireEvent.change(await screen.findByLabelText("Second image"), { target: { value: `frames/${second}` } });
  await waitFor(() => expect(pair()[1].key).toBe(`frames/${second}`));
  // Measured and drawn: the other half's picture is up.
  await waitFor(() => expect(halves()[1]!.querySelector("canvas")).not.toBeNull());
  chooseTool("AI (1)");
  // Each image is encoded for its own model: the one being edited, then the other.
  await waitFor(() =>
    expect(handles.embed.mock.calls.map(([request]) => request.image)).toEqual(
      expect.arrayContaining(["frames/a.png", `frames/${second}`]),
    ),
  );
  await waitFor(() => expect(screen.queryByText("Loading image into AI model...")).toBeNull());
  await act(async () => {
    await Promise.resolve();
  });
  return handles;
}

const halves = () => screen.getAllByRole("figure");
const surface = () => screen.getByLabelText("AI tool");

function click(x: number, y: number, button = 0) {
  fireEvent.pointerDown(surface(), { button, pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerUp(surface(), { button, pointerId: 1, clientX: x, clientY: y });
}

function drag(from: readonly [number, number], to: readonly [number, number]) {
  fireEvent.pointerDown(surface(), { button: 0, pointerId: 1, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(surface(), { button: 0, pointerId: 1, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(surface(), { button: 0, pointerId: 1, clientX: to[0], clientY: to[1] });
}

const press = (key: string, code: string, modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {}) =>
  fireEvent.keyDown(document, { key, code, ...modifiers });

/** The handles the segment requests went to, in order. */
const askedOf = (segment: ReturnType<typeof mount>["segment"]) =>
  segment.mock.calls.map(([request]) => request.handle.slice("h:frames/".length));

describe("one prompt, asked of each image's own model", () => {
  it("starts linked, as legacy's pair does", async () => {
    // multi_view_coordinator.py:46.
    await pairUp();
    expect((screen.getByLabelText("Link the two images") as HTMLInputElement).checked).toBe(true);
  });

  it("asks both images at the same pixel, each with its own handle", async () => {
    const { segment } = await pairUp();

    click(50, 40);

    await waitFor(() => expect(segment).toHaveBeenCalledTimes(2));
    expect(segment.mock.calls.map(([request]) => request)).toEqual(
      expect.arrayContaining([
        { handle: "h:frames/a.png", points: [{ x: 50, y: 40, positive: true }] },
        { handle: "h:frames/b.png", points: [{ x: 50, y: 40, positive: true }] },
      ]),
    );
  });

  it("draws the point and the other image's own preview in the half not being edited", async () => {
    await pairUp();

    click(50, 40);
    click(70, 30, 2);

    const other = halves()[1]!;
    await waitFor(() => expect(within(other).getByTestId("ai-mask")).toBeTruthy());
    const positive = within(other).getByTestId("ai-positive-0");
    expect([positive.getAttribute("cx"), positive.getAttribute("cy")]).toEqual(["50", "40"]);
    expect(within(other).getByTestId("ai-negative-1").getAttribute("cx")).toBe("70");
    // And the half being edited shows its own.
    expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy();
    // Both halves in legacy's Multi style: opaque, with a black pen (main_window.py:6765-6772).
    for (const half of halves()) {
      const mark = within(half).getByTestId("ai-positive-0");
      expect([mark.getAttribute("fill"), mark.getAttribute("stroke")]).toEqual(["rgb(0, 255, 0)", "rgb(0, 0, 0)"]);
    }
    expect(within(other).getByTestId("ai-negative-1").getAttribute("fill")).toBe("rgb(255, 0, 0)");
  });

  it("draws each half's preview on a surface apart from the points, which legacy puts at other depths", async () => {
    // The preview at Z 500, under the selection; the points at 1000, over it (main_window.py:6846,
    // 6773). One surface held both until 2026-09-27; the stylesheet stacks the two
    // (`test/canvas/stacking.test.tsx`).
    await pairUp();

    click(50, 40);

    await waitFor(() => expect(halves().every((half) => within(half).queryByTestId("ai-mask") !== null)).toBe(true));
    for (const half of halves()) {
      const preview = within(half).getByTestId("ai-mask").closest("svg")!;
      const points = within(half).getByTestId("ai-positive-0").closest("svg")!;
      expect(preview.getAttribute("class")).toBe("ai-preview");
      expect(preview.getAttribute("aria-hidden")).toBe("true");
      expect(points).not.toBe(preview);
      expect(preview.contains(points)).toBe(false);
    }
    // The half not being edited draws its points on the prompt's own surface.
    expect(within(halves()[1]!).getByTestId("ai-positive-0").closest("svg")!.getAttribute("class")).toBe("split__prompt");
  });

  it("sends a box to both images", async () => {
    const { segment } = await pairUp();

    drag([20, 20], [80, 70]);

    await waitFor(() => expect(segment).toHaveBeenCalledTimes(2));
    expect(segment.mock.calls.map(([request]) => request.box)).toEqual([
      [20, 20, 80, 70],
      [20, 20, 80, 70],
    ]);
    // The other half shows its own answer to the box, and no box: legacy removes its rubber band at
    // the release (main_window.py:5558-5561).
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());
    expect(halves()[1]!.querySelector('[aria-label="AI prompt"] rect')).toBeNull();
  });

  it("asks a box alone, and the next click the points alone, as legacy's Multi view does", async () => {
    // The box is `predict_from_box(target_idx, box)` and nothing else (main_window.py:6693-6704);
    // a later click predicts from the viewer's points (6788-6797). The points went with the box.
    const { segment } = await pairUp();
    click(50, 40);
    await waitFor(() => expect(segment).toHaveBeenCalledTimes(2));

    drag([20, 20], [80, 70]);
    await waitFor(() => expect(segment).toHaveBeenCalledTimes(4));
    expect(segment.mock.calls.slice(2).map(([request]) => request)).toEqual([
      { handle: "h:frames/a.png", box: [20, 20, 80, 70] },
      { handle: "h:frames/b.png", box: [20, 20, 80, 70] },
    ]);
    // The point stays placed, in both halves.
    expect(halves().map((half) => within(half).queryByTestId("ai-positive-0") !== null)).toEqual([true, true]);

    click(60, 30);
    await waitFor(() => expect(segment).toHaveBeenCalledTimes(6));
    const points = [
      { x: 50, y: 40, positive: true },
      { x: 60, y: 30, positive: true },
    ];
    expect(segment.mock.calls.slice(4).map(([request]) => request)).toEqual([
      { handle: "h:frames/a.png", points },
      { handle: "h:frames/b.png", points },
    ]);
  });
});

describe("a prompt placed while the other image is still being encoded", () => {
  it("is asked of it once it is encoded, and this image's preview stays", async () => {
    // Legacy's linked prediction loads a viewer's image first when it must, then predicts, so both
    // images get a mask (sam_multi_view_manager.py:272-284, main_window.py:6668-6675, 6778-6804).
    // Here the other image answered nothing, and its encode landing took this image's preview too:
    // Space then accepted nothing, and Enter saved one image (found 2026-09-27, CP-31).
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { segment } = mount(new Set(), {}, new Map([["frames/b.png", gate]]));
    fireEvent.doubleClick(await screen.findByRole("button", { name: "a.png" }));
    await waitFor(() => expect(pair()[0].aliases).toEqual(ALIASES["frames/a.png"]));
    fireEvent.click(screen.getByRole("tab", { name: "Multi" }));
    fireEvent.change(await screen.findByLabelText("Second image"), { target: { value: "frames/b.png" } });
    await waitFor(() => expect(halves()[1]!.querySelector("canvas")).not.toBeNull());
    chooseTool("AI (1)");
    // This image is encoded; the other is still being loaded into its model.
    await waitFor(() => expect(screen.queryByText("Image ready for AI prompts") ?? surface()).toBeTruthy());
    await act(async () => {
      await Promise.resolve();
    });

    click(50, 40);
    await waitFor(() => expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy());
    expect(askedOf(segment)).toEqual(["a.png"]);

    await act(async () => {
      release();
      await gate;
    });

    await waitFor(() => expect(askedOf(segment)).toEqual(["a.png", "b.png"]));
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());
    expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy();

    press(" ", "Space");
    await waitFor(() => expect(pair().map((side) => side.found)).toEqual([["a.png"], ["b.png"]]));
  });
});

describe("a prompt placed while THIS image is still being encoded", () => {
  it("is asked of both images once each is encoded", async () => {
    // Legacy's Multi view loads the viewer's image first when it must, then predicts
    // (main_window.py:6778-6804). A click at once on a fresh pair was drawn in both halves and
    // asked of neither: no preview, and Space and Enter saved nothing (found 2026-09-27).
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { embed, segment } = mount(new Set(), {}, new Map([["frames/a.png", gate]]));
    fireEvent.doubleClick(await screen.findByRole("button", { name: "a.png" }));
    await waitFor(() => expect(pair()[0].aliases).toEqual(ALIASES["frames/a.png"]));
    fireEvent.click(screen.getByRole("tab", { name: "Multi" }));
    fireEvent.change(await screen.findByLabelText("Second image"), { target: { value: "frames/b.png" } });
    await waitFor(() => expect(halves()[1]!.querySelector("canvas")).not.toBeNull());
    chooseTool("AI (1)");
    await waitFor(() => expect(embed.mock.calls.map(([request]) => request.image)).toContain("frames/a.png"));

    click(50, 40);
    await act(async () => {
      await Promise.resolve();
    });
    expect(segment).not.toHaveBeenCalled();
    expect(screen.queryByText("AI model is updating, please wait...")).toBeNull();

    await act(async () => {
      release();
      await gate;
    });

    await waitFor(() => expect(askedOf(segment).sort()).toEqual(["a.png", "b.png"]));
    await waitFor(() => expect(halves().map((half) => within(half).queryByTestId("ai-mask") !== null)).toEqual([true, true]));

    press(" ", "Space");
    await waitFor(() => expect(pair().map((side) => side.found)).toEqual([["a.png"], ["b.png"]]));
  });
});

describe("Space: each image's own answer becomes its own annotation", () => {
  it("adds each image's own mask, not a copy of the other's", async () => {
    await pairUp();
    click(50, 40);
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());

    press(" ", "Space");

    // a.png's model found its square at (2, 2), b.png's at (20, 20): the contours differ.
    await waitFor(() => expect(pair().map((side) => side.found)).toEqual([["a.png"], ["b.png"]]));
  });

  it("files the other image's under the class of the same NAME, with that image's own id", async () => {
    // linked.ts's rule: a.png's class 0 is "car", which b.png calls 1.
    await pairUp();
    click(50, 40);
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());

    press(" ", "Space");

    await waitFor(() => expect(pair().map((side) => side.classes)).toEqual([[0], [1]]));
    expect(pair()[1].aliases).toEqual(ALIASES["frames/b.png"]);
  });

  it("converts each image's own mask to a polygon when Auto-Convert is on", async () => {
    // _create_segment_from_mask for each target viewer (ai_segment_manager.py:362-364).
    await pairUp("b.png", undefined, { auto_polygon_enabled: true });
    click(50, 40);
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());

    press(" ", "Space");

    await waitFor(() =>
      expect(pair().map((side) => side.found)).toEqual([["Polygon of a.png"], ["Polygon of b.png"]]),
    );
  });

  it("takes both back with one undo", async () => {
    await pairUp();
    click(50, 40);
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());
    press(" ", "Space");
    await waitFor(() => expect(pair().map((side) => side.found.length)).toEqual([1, 1]));

    press("z", "KeyZ", { ctrlKey: true });

    await waitFor(() => expect(pair().map((side) => side.found.length)).toEqual([0, 0]));
  });

  it("clears both halves' points and previews once accepted", async () => {
    await pairUp();
    click(50, 40);
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());

    press(" ", "Space");

    await waitFor(() => expect(document.querySelector('[data-testid="ai-mask"]')).toBeNull());
    expect(document.querySelector('[data-testid="ai-positive-0"]')).toBeNull();
  });

  it("erases each image with its own answer on Shift+Space", async () => {
    await pairUp();
    click(50, 40);
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());
    press(" ", "Space");
    await waitFor(() => expect(pair().map((side) => side.found)).toEqual([["a.png"], ["b.png"]]));

    click(50, 40);
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());
    press(" ", "Space", { shiftKey: true });

    await waitFor(() => expect(pair().map((side) => side.found)).toEqual([[], []]));
    // Legacy's success, counting the viewers it cut in (ai_segment_manager.py:390-394).
    const said = await screen.findByText("Erased segments in 2 viewer(s)");
    expect(said.getAttribute("class")).toContain("status-bar__message--success");
  });
});

describe("Escape clears both", () => {
  it("takes the points and previews out of both halves", async () => {
    await pairUp();
    click(50, 40);
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());

    press("Escape", "Escape");

    await waitFor(() => expect(document.querySelector('[data-testid="ai-mask"]')).toBeNull());
    expect(document.querySelector('[data-testid="ai-positive-0"]')).toBeNull();
    press(" ", "Space");
    expect(pair().map((side) => side.found)).toEqual([[], []]);
  });
});

describe("the other half, made the one edited", () => {
  it("keeps the prompt and both previews, and Space still accepts both", async () => {
    // Legacy's active viewer changes an index and nothing else (multi_view_coordinator.py:92-103).
    await pairUp();
    click(50, 40);
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());

    fireEvent.click(halves()[1]!);
    await waitFor(() => expect(within(halves()[1]!).getByLabelText("AI tool")).toBeTruthy());

    expect(within(halves()[0]!).getByTestId("ai-positive-0")).toBeTruthy();
    expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy();
    expect(within(halves()[1]!).getByTestId("ai-positive-0")).toBeTruthy();
    press(" ", "Space");

    await waitFor(() => expect(pair().map((side) => side.found)).toEqual([["a.png"], ["b.png"]]));
  });
});

describe("a press on the half not being edited", () => {
  // Legacy's press in either viewer makes it the active one AND is the tool's: the AI tool's point
  // or box, a polygon's vertex, a box or a circle (main_window.py:5498-5537, 5539-5583). Until
  // 2026-09-27 a click there only made it the one edited.
  const idle = (name: string) => within(halves()[1]!).getByLabelText(`Draw on ${name}`);
  const pressIdle = (name: string, from: readonly [number, number], to = from, button = 0) => {
    const surface = idle(name);
    fireEvent.pointerDown(surface, { button, pointerId: 1, clientX: from[0], clientY: from[1] });
    if (to !== from) fireEvent.pointerMove(surface, { button, pointerId: 1, clientX: to[0], clientY: to[1] });
    fireEvent.pointerUp(surface, { button, pointerId: 1, clientX: to[0], clientY: to[1] });
  };

  it("places the AI point there, asks both images, and makes that half the one edited", async () => {
    const { segment } = await pairUp();

    pressIdle("b.png", [50, 40]);

    await waitFor(() => expect(within(halves()[1]!).getByLabelText("AI tool")).toBeTruthy());
    await waitFor(() => expect(segment).toHaveBeenCalledTimes(2));
    expect(segment.mock.calls.map(([request]) => request)).toEqual(
      expect.arrayContaining([
        { handle: "h:frames/a.png", points: [{ x: 50, y: 40, positive: true }] },
        { handle: "h:frames/b.png", points: [{ x: 50, y: 40, positive: true }] },
      ]),
    );
    // Drawn in the half left too, with that image's own preview.
    await waitFor(() => expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy());
    expect(within(halves()[0]!).getByTestId("ai-positive-0").getAttribute("cx")).toBe("50");
  });

  it("adds to the prompt already placed, as legacy's linked viewers share it", async () => {
    const { segment } = await pairUp();
    click(50, 40);
    await waitFor(() => expect(segment).toHaveBeenCalledTimes(2));

    pressIdle("b.png", [70, 30], [70, 30], 2);

    await waitFor(() => expect(segment).toHaveBeenCalledTimes(4));
    expect(segment.mock.calls.at(-1)![0].points).toEqual([
      { x: 50, y: 40, positive: true },
      { x: 70, y: 30, positive: false },
    ]);
  });

  it("sends a drag there to both images as a box", async () => {
    const { segment } = await pairUp();

    pressIdle("b.png", [20, 20], [80, 70]);

    await waitFor(() => expect(segment).toHaveBeenCalledTimes(2));
    expect(segment.mock.calls.map(([request]) => request.box)).toEqual([
      [20, 20, 80, 70],
      [20, 20, 80, 70],
    ]);
  });

  it("asks only the image pressed while unlinked", async () => {
    const { segment } = await pairUp();
    fireEvent.click(screen.getByLabelText("Link the two images"));

    pressIdle("b.png", [50, 40]);

    await waitFor(() => expect(segment).toHaveBeenCalledTimes(1));
    expect(askedOf(segment)).toEqual(["b.png"]);
    press(" ", "Space");
    await waitFor(() => expect(pair().map((side) => side.found)).toEqual([[], ["b.png"]]));
  });

  it("draws a box there with the box tool, in both images while linked", async () => {
    // _handle_multi_view_bbox_press and its release (main_window.py:5708-5822).
    await pairUp();
    chooseTool("Box (3)");

    pressIdle("b.png", [20, 20], [60, 50]);

    await waitFor(() => expect(within(halves()[1]!).getByLabelText("Box tool")).toBeTruthy());
    await waitFor(() => expect(pair().map((side) => side.found.length)).toEqual([1, 1]));
  });

  it("places a polygon's first vertex there with the polygon tool", async () => {
    // _handle_multi_view_polygon_click (main_window.py:5585-5657).
    await pairUp();
    chooseTool("Poly (2)");

    pressIdle("b.png", [30, 25]);

    const vertex = await waitFor(() => within(halves()[1]!).getByTestId("vertex-0"));
    expect([vertex.getAttribute("cx"), vertex.getAttribute("cy")]).toEqual(["30", "25"]);
  });
});

describe("a linked polygon in progress", () => {
  // Legacy puts each vertex into both linked viewers and draws it in both (main_window.py:5680-5706).
  // It was drawn in the half being edited only, and lost when the other half was chosen.
  const vertexAt = (x: number, y: number) =>
    fireEvent.pointerDown(screen.getByLabelText("Polygon tool"), { button: 0, pointerId: 1, clientX: x, clientY: y });

  it("is drawn in both halves", async () => {
    await pairUp();
    chooseTool("Poly (2)");

    vertexAt(10, 10);
    vertexAt(60, 10);
    vertexAt(60, 50);

    const other = halves()[1]!;
    await waitFor(() => expect(within(other).getByTestId("pair-vertex-2")).toBeTruthy());
    expect(within(other).getByTestId("pair-vertex-1").getAttribute("cx")).toBe("60");
  });

  it("is continued from the other half, and finished there into both images", async () => {
    await pairUp();
    chooseTool("Poly (2)");
    vertexAt(10, 10);
    vertexAt(60, 10);
    vertexAt(60, 50);

    const idle = within(halves()[1]!).getByLabelText("Draw on b.png");
    fireEvent.pointerDown(idle, { button: 0, pointerId: 1, clientX: 10, clientY: 50 });

    await waitFor(() => expect(within(halves()[1]!).getByTestId("vertex-3")).toBeTruthy());
    expect(within(halves()[0]!).getByTestId("pair-vertex-3")).toBeTruthy();
    press(" ", "Space");
    await waitFor(() => expect(pair().map((side) => side.found.length)).toEqual([1, 1]));
    expect(document.querySelector('[data-testid^="pair-vertex-"]')).toBeNull();
  });

  it("stays the view's own while unlinked", async () => {
    await pairUp();
    fireEvent.click(screen.getByLabelText("Link the two images"));
    chooseTool("Poly (2)");

    vertexAt(10, 10);

    await waitFor(() => expect(within(halves()[0]!).getByTestId("vertex-0")).toBeTruthy());
    expect(within(halves()[1]!).queryByTestId("pair-vertex-0")).toBeNull();
  });
});

describe("when one image cannot answer", () => {
  it("shows nothing there when its prediction fails, and keeps the other's", async () => {
    await pairUp("b.png", new Set(["frames/b.png"]));

    click(50, 40);

    expect(await screen.findByText(/AI prediction failed/)).toBeTruthy();
    await waitFor(() => expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy());
    expect(within(halves()[1]!).queryByTestId("ai-mask")).toBeNull();

    press(" ", "Space");

    await waitFor(() => expect(pair().map((side) => side.found)).toEqual([["a.png"], []]));
    expect(screen.getByText(/Added to this image only: no prediction in b\.png/)).toBeTruthy();
  });

  it("does not ask an image the prompt falls outside, and says so", async () => {
    // The same pixel, not moved: legacy hands it to the other model anyway; the service refuses a
    // point outside the image (prompts.py:84-97), so that image is not asked and shows nothing.
    const { segment } = await pairUp("c.png");

    click(150, 80);

    expect(await screen.findByText(/The prompt is outside c\.png/)).toBeTruthy();
    await waitFor(() => expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy());
    expect(askedOf(segment)).toEqual(["a.png"]);
    expect(within(halves()[1]!).queryByTestId("ai-mask")).toBeNull();
  });

  it("asks the smaller image once the prompt fits it", async () => {
    const { segment } = await pairUp("c.png");

    click(40, 20);

    await waitFor(() => expect(askedOf(segment).sort()).toEqual(["a.png", "c.png"]));
  });
});

describe("unlinked", () => {
  it("asks only the image being edited, as before", async () => {
    const { segment } = await pairUp();
    fireEvent.click(screen.getByLabelText("Link the two images"));

    click(50, 40);

    await waitFor(() => expect(segment).toHaveBeenCalledTimes(1));
    expect(askedOf(segment)).toEqual(["a.png"]);
    expect(within(halves()[1]!).queryByTestId("ai-positive-0")).toBeNull();

    press(" ", "Space");
    await waitFor(() => expect(pair().map((side) => side.found)).toEqual([["a.png"], []]));
  });
});

/** A press, released where it went down, on the half not being edited. */
function pressHalf(side: 0 | 1, name: string, at: readonly [number, number], button = 0) {
  const surface = within(halves()[side]!).getByLabelText(`Draw on ${name}`);
  fireEvent.pointerDown(surface, { button, pointerId: 1, clientX: at[0], clientY: at[1] });
  fireEvent.pointerUp(surface, { button, pointerId: 1, clientX: at[0], clientY: at[1] });
}

const unlink = () => fireEvent.click(screen.getByLabelText("Link the two images"));

describe("unlinked, each image keeps its own AI prompt", () => {
  // Legacy keeps AI points and a preview per viewer (multi_view_coordinator.py:48-54); unlinked, a
  // click or a box goes to the viewer it is made on alone (197-206; main_window.py:6664-6675), and
  // making the other viewer the active one changes an index and nothing else (92-103). The view
  // here held one prompt, lost when the other half was made the one edited.
  it("keeps each image's own prompt and preview when the other is made the one edited", async () => {
    const { segment } = await pairUp();
    unlink();
    click(50, 40);
    await waitFor(() => expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy());

    pressHalf(1, "b.png", [70, 30]);

    await waitFor(() => expect(within(halves()[1]!).getByLabelText("AI tool")).toBeTruthy());
    await waitFor(() => expect(segment).toHaveBeenCalledTimes(2));
    // b.png is asked its own point alone.
    expect(segment.mock.calls[1]![0]).toEqual({ handle: "h:frames/b.png", points: [{ x: 70, y: 30, positive: true }] });
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());
    expect(within(halves()[1]!).queryByTestId("ai-positive-1")).toBeNull();
    // a.png's point and preview stay in its half.
    expect(within(halves()[0]!).getByTestId("ai-positive-0").getAttribute("cx")).toBe("50");
    expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy();
  });

  it("adds a press back on the first image to that image's own prompt", async () => {
    const { segment } = await pairUp();
    unlink();
    click(50, 40);
    await waitFor(() => expect(segment).toHaveBeenCalledTimes(1));
    pressHalf(1, "b.png", [70, 30]);
    await waitFor(() => expect(segment).toHaveBeenCalledTimes(2));

    pressHalf(0, "a.png", [60, 45], 2);

    await waitFor(() => expect(segment).toHaveBeenCalledTimes(3));
    expect(segment.mock.calls[2]![0]).toEqual({
      handle: "h:frames/a.png",
      points: [
        { x: 50, y: 40, positive: true },
        { x: 60, y: 45, positive: false },
      ],
    });
  });

  it("accepts the image being edited alone on Space, and then clears both", async () => {
    // ai_segment_manager.py:314-336, 387-388; main_window.py:6901-6920.
    await pairUp();
    unlink();
    click(50, 40);
    await waitFor(() => expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy());
    pressHalf(1, "b.png", [70, 30]);
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());
    expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy();

    press(" ", "Space");

    await waitFor(() => expect(pair().map((side) => side.found)).toEqual([[], ["b.png"]]));
    await waitFor(() => expect(document.querySelector('[data-testid="ai-mask"]')).toBeNull());
    expect(document.querySelector('[data-testid="ai-positive-0"]')).toBeNull();
  });

  it("clears the other image's prompt on Space with nothing to accept in the one being edited", async () => {
    // _accept_multi_view clears every viewer whether it accepted anything or not
    // (ai_segment_manager.py:387-388, 403).
    await pairUp();
    unlink();
    click(50, 40);
    await waitFor(() => expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Edit the right image"));
    await waitFor(() => expect(within(halves()[1]!).getByLabelText("AI tool")).toBeTruthy());
    expect(within(halves()[0]!).getByTestId("ai-positive-0")).toBeTruthy();

    press(" ", "Space");

    expect(await screen.findByText(/No AI segment preview to accept/)).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[data-testid="ai-positive-0"]')).toBeNull());
    expect(document.querySelector('[data-testid="ai-mask"]')).toBeNull();
    expect(pair().map((side) => side.found)).toEqual([[], []]);
  });

  it("clears both images' prompts on Escape", async () => {
    await pairUp();
    unlink();
    click(50, 40);
    await waitFor(() => expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy());
    pressHalf(1, "b.png", [70, 30]);
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());
    expect(within(halves()[0]!).getByTestId("ai-positive-0")).toBeTruthy();

    press("Escape", "Escape");

    await waitFor(() => expect(document.querySelector('[data-testid="ai-mask"]')).toBeNull());
    expect(document.querySelector('[data-testid="ai-positive-0"]')).toBeNull();
  });

  it("keeps each image's prompt and preview on unlinking, and accepts the one being edited", async () => {
    // Legacy's viewers keep their points when the link is released (multi_view_coordinator.py:70-78).
    await pairUp();
    click(50, 40);
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());

    unlink();

    expect(halves().map((half) => within(half).queryByTestId("ai-positive-0") !== null)).toEqual([true, true]);
    expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy();
    press(" ", "Space");
    await waitFor(() => expect(pair().map((side) => side.found)).toEqual([["a.png"], []]));
  });

  it("asks a prompt placed while its image was being encoded once it is, the other being edited then", async () => {
    // Legacy's prediction loads a viewer's image first and then predicts (main_window.py:6778-6804).
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { embed, segment } = mount(new Set(), {}, new Map([["frames/a.png", gate]]));
    fireEvent.doubleClick(await screen.findByRole("button", { name: "a.png" }));
    await waitFor(() => expect(pair()[0].aliases).toEqual(ALIASES["frames/a.png"]));
    fireEvent.click(screen.getByRole("tab", { name: "Multi" }));
    fireEvent.change(await screen.findByLabelText("Second image"), { target: { value: "frames/b.png" } });
    await waitFor(() => expect(halves()[1]!.querySelector("canvas")).not.toBeNull());
    unlink();
    chooseTool("AI (1)");
    await waitFor(() => expect(embed.mock.calls.map(([request]) => request.image)).toContain("frames/a.png"));

    click(50, 40);
    pressHalf(1, "b.png", [70, 30]);

    await waitFor(() => expect(askedOf(segment)).toEqual(["b.png"]));
    await act(async () => {
      release();
      await gate;
    });
    await waitFor(() => expect(askedOf(segment)).toEqual(["b.png", "a.png"]));
    expect(segment.mock.calls[1]![0].points).toEqual([{ x: 50, y: 40, positive: true }]);
    await waitFor(() => expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy());
  });
});

describe("unlinked, each image keeps its own polygon in progress", () => {
  // Legacy keeps a polygon in progress per viewer and, unlinked, puts a vertex into the viewer
  // clicked alone (main_window.py:5599-5706). Space and Shift+Space finish every viewer's of three
  // vertices or more, each into its own image (keyboard_event_manager.py:118-123, 157-163), and
  // Escape clears them all (315-334). The view here kept one, lost when the other half was chosen.
  const vertexAt = (x: number, y: number) =>
    fireEvent.pointerDown(screen.getByLabelText("Polygon tool"), { button: 0, pointerId: 1, clientX: x, clientY: y });
  const vertexIdle = (side: 0 | 1, name: string, x: number, y: number) =>
    fireEvent.pointerDown(within(halves()[side]!).getByLabelText(`Draw on ${name}`), {
      button: 0,
      pointerId: 1,
      clientX: x,
      clientY: y,
    });

  async function twoPolygons(onLeft: readonly (readonly [number, number])[]) {
    await pairUp();
    unlink();
    chooseTool("Poly (2)");
    for (const [x, y] of onLeft) vertexAt(x, y);
    vertexIdle(1, "b.png", 100, 10);
    await waitFor(() => expect(within(halves()[1]!).getByLabelText("Polygon tool")).toBeTruthy());
    vertexAt(150, 10);
    vertexAt(150, 50);
  }

  it("keeps each image's own when the other is made the one edited, drawn in its half", async () => {
    await pairUp();
    unlink();
    chooseTool("Poly (2)");
    vertexAt(10, 10);
    vertexAt(60, 10);

    vertexIdle(1, "b.png", 30, 25);

    const vertex = await waitFor(() => within(halves()[1]!).getByTestId("vertex-0"));
    expect(vertex.getAttribute("cx")).toBe("30");
    expect(within(halves()[1]!).queryByTestId("vertex-1")).toBeNull();
    expect(within(halves()[0]!).getByTestId("pair-vertex-1").getAttribute("cx")).toBe("60");
  });

  it("finishes both on Space, each into its own image, in one undo step", async () => {
    await twoPolygons([
      [10, 10],
      [60, 10],
      [60, 50],
    ]);

    press(" ", "Space");

    await waitFor(() =>
      expect(pair().map((side) => side.vertices)).toEqual([
        [
          [
            [10, 10],
            [60, 10],
            [60, 50],
          ],
        ],
        [
          [
            [100, 10],
            [150, 10],
            [150, 50],
          ],
        ],
      ]),
    );
    // Each with its own image's class: the next free id there.
    expect(pair().map((side) => side.classes)).toEqual([[0], [0]]);
    expect(document.querySelector('[data-testid^="pair-vertex-"], [data-testid^="vertex-"]')).toBeNull();

    press("z", "KeyZ", { ctrlKey: true });

    await waitFor(() => expect(pair().map((side) => side.vertices.length)).toEqual([0, 0]));
  });

  it("leaves one of fewer than three vertices as it is, as legacy's Space does", async () => {
    await twoPolygons([
      [10, 10],
      [60, 10],
    ]);

    press(" ", "Space");

    await waitFor(() => expect(pair().map((side) => side.vertices.length)).toEqual([0, 1]));
    expect(within(halves()[0]!).getByTestId("pair-vertex-1")).toBeTruthy();
  });

  it("clears both on Escape", async () => {
    await twoPolygons([
      [10, 10],
      [60, 10],
      [60, 50],
    ]);
    expect(within(halves()[0]!).getByTestId("pair-vertex-2")).toBeTruthy();

    press("Escape", "Escape");

    await waitFor(() =>
      expect(document.querySelector('[data-testid^="pair-vertex-"], [data-testid^="vertex-"]')).toBeNull(),
    );
    press(" ", "Space");
    expect(pair().map((side) => side.vertices.length)).toEqual([0, 0]);
  });
});

describe("outsideOf", () => {
  const image = { name: "c.png", width: 100, height: 50 };

  it("passes a prompt inside the image, the box's far edge included", () => {
    expect(outsideOf({ points: [{ x: 99, y: 49, positive: true }], box: null }, image)).toBeNull();
    expect(outsideOf({ ...EMPTY_PROMPT, box: [{ x: 0, y: 0 }, { x: 100, y: 50 }] }, image)).toBeNull();
  });

  it("names the image a point or a box falls outside", () => {
    expect(outsideOf({ points: [{ x: 100, y: 10, positive: false }], box: null }, image)).toBe(
      "The prompt is outside c.png",
    );
    expect(outsideOf({ ...EMPTY_PROMPT, box: [{ x: 10, y: 10 }, { x: 120, y: 20 }] }, image)).toBe(
      "The prompt is outside c.png",
    );
  });
});

describe("legacy's words after Space in the Multi tab (ai_segment_manager.py:387-403)", () => {
  // Found on the real stack, 2026-09-27: the Multi tab's accept was silent.
  it("says \"Saved predictions to 2 viewer(s)\" when a linked pair accepts both", async () => {
    await pairUp();
    click(50, 40);
    await waitFor(() => expect(within(halves()[1]!).getByTestId("ai-mask")).toBeTruthy());

    press(" ", "Space");

    const notice = await screen.findByText("Saved predictions to 2 viewer(s)");
    expect(notice.getAttribute("class")).toContain("status-bar__message--success");
  });

  it("says \"Saved predictions to 1 viewer(s)\" when unlinked", async () => {
    await pairUp();
    unlink();
    click(50, 40);
    await waitFor(() => expect(within(halves()[0]!).getByTestId("ai-mask")).toBeTruthy());

    press(" ", "Space");

    await waitFor(() => expect(pair().map((side) => side.found)).toEqual([["a.png"], []]));
    expect(await screen.findByText("Saved predictions to 1 viewer(s)")).toBeTruthy();
  });

  it("says legacy's plain \"No AI segment preview to accept\" with nothing placed", async () => {
    await pairUp();

    press(" ", "Space");

    const notice = await screen.findByText("No AI segment preview to accept");
    expect(notice.getAttribute("class")).toContain("status-bar__message--info");
  });

  it("says \"No segments to erase\" on Shift+Space with nothing placed", async () => {
    await pairUp();

    press(" ", "Space", { shiftKey: true });

    expect(await screen.findByText("No segments to erase")).toBeTruthy();
  });
});

describe("the middle button in the Multi tab", () => {
  // Legacy's Multi press keeps only whether the button was the left one (main_window.py:5517-5521),
  // so any other, the middle one too, is a negative point where it went down. The single view
  // reads the left and right buttons alone (single_view_mouse_handler.py:131-139).
  it("places a negative point in the image being edited, asked of both", async () => {
    const { segment } = await pairUp();
    click(50, 40);
    await waitFor(() => expect(segment).toHaveBeenCalledTimes(2));

    click(70, 30, 1);

    await waitFor(() => expect(segment).toHaveBeenCalledTimes(4));
    for (const [request] of segment.mock.calls.slice(2)) {
      expect(request.points).toEqual([
        { x: 50, y: 40, positive: true },
        { x: 70, y: 30, positive: false },
      ]);
    }
  });

  it("places a negative point from the half not being edited too", async () => {
    const { segment } = await pairUp();
    click(50, 40);
    await waitFor(() => expect(segment).toHaveBeenCalledTimes(2));

    pressHalf(1, "b.png", [70, 30], 1);

    await waitFor(() => expect(segment).toHaveBeenCalledTimes(4));
    expect(segment.mock.calls.at(-1)![0].points).toEqual([
      { x: 50, y: 40, positive: true },
      { x: 70, y: 30, positive: false },
    ]);
  });
});
