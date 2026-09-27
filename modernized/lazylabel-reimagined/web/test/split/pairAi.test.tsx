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
