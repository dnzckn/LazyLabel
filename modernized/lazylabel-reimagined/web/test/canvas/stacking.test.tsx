/**
 * Everything on the canvas is drawn at legacy's depth, and the tools still take every press.
 *
 * The owner, 2026-09-27: "shapes you're still drawing appear above existing segments; the desktop
 * app draws them underneath." Legacy's scene stacks its items by Z value. In the single view, which
 * the Sequence tab shares, a polygon, box, circle or AI prompt being drawn is at Z 0, under every
 * annotation at its index + 1; the AI preview at 50, the vertex handles at 200 and the selection at
 * 999 and 1000 are over them (polygon_drawing_manager.py:99-158; single_view_mouse_handler.py:
 * 146-166, 242-250; ai_segment_manager.py:447-465, 512-513; editable_vertex.py:14;
 * segment_display_manager.py:332-388, 522-542). The Multi tab puts what is being drawn at 999 and
 * 1000 and its preview at 500 (main_window.py:5457, 5666-5704, 5727, 5835, 6773, 6846). Every tool
 * drew its marks on the surface that takes its pointer events, laid over the annotations, so a
 * polygon being drawn covered the segments it was drawn over.
 *
 * jsdom paints nothing, so this asks what a browser would. The stylesheet is loaded into the
 * document, and a layer's place in the paint order comes from its computed z-index and then its
 * place in the document: the order a browser paints positioned boxes in one stacking context (CSS
 * 2.1, appendix E), which the stack is made to be. A press lands on the topmost layer that takes
 * pointer events.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage, WireSegment } from "@lazylabel/contracts";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { AnnotationsResult, ApiClient, WireSegmentResponse } from "../../src/api/client.js";
import { AiLayer } from "../../src/canvas/AiLayer.jsx";
import { AnnotationCanvas } from "../../src/canvas/AnnotationCanvas.jsx";
import { EditLayer } from "../../src/canvas/EditLayer.jsx";
import { PolygonLayer } from "../../src/canvas/PolygonLayer.jsx";
import { ViewKindContext } from "../../src/canvas/viewKind.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { IdlePress } from "../../src/split/IdlePress.jsx";
import { AiPreview } from "../../src/workspace/AiTool.jsx";
import { OpenImageView } from "../../src/workspace/OpenImageView.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";
import { renderWithSettings } from "./settingsHarness.jsx";

const STYLES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "styles.css");

// Removed again afterwards: other files may share this document, and the stylesheet would change
// what their queries find.
let sheet: HTMLStyleElement | null = null;
beforeAll(async () => {
  sheet = document.createElement("style");
  sheet.textContent = await readFile(STYLES, "utf-8");
  document.head.appendChild(sheet);
});
afterAll(() => sheet?.remove());

const RECT = { left: 0, top: 0, width: 40, height: 20, right: 40, bottom: 20, x: 0, y: 0 };
const WIDTH = 40;
const HEIGHT = 20;
const TRIANGLE: WireSegment = { type: "Polygon", classId: 2, vertices: [[10, 5], [30, 5], [20, 18]] };

/** A 10x10 square found at (5, 5). */
const ANSWER: WireSegmentResponse = {
  mask: { height: HEIGHT, width: WIDTH, box: [5, 5, 15, 15], data: btoa("\u0001".repeat(100)) },
  score: 0.9,
  chosen: 0,
  alternatives: [0.9],
};

beforeEach(() => {
  // The canvas is 40x20 at the origin, so a pointer coordinate IS an image coordinate.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ ...RECT, toJSON: () => RECT } as DOMRect);
  // A context that draws nothing: jsdom has none, and what is painted is not the question here.
  const noop = () => undefined;
  const context = {
    fillStyle: "",
    save: noop,
    restore: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    arc: noop,
    fill: noop,
    clearRect: noop,
    drawImage: noop,
    putImageData: noop,
    createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A layer's z-index. `auto` is painted with 0: after the picture, in document order. */
function depthOf(layer: Element): number {
  const z = getComputedStyle(layer).zIndex;
  return z === "" || z === "auto" ? 0 : Number(z);
}

/** The layers bottom first, as a browser paints positioned boxes in one stacking context. */
function paintOrder(layers: readonly Element[]): Element[] {
  return [...layers].sort(
    (a, b) => depthOf(a) - depthOf(b) || (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1),
  );
}

/** Every layer laid over the picture: the stack's positioned canvases and surfaces. */
function layersOf(stack: Element): Element[] {
  return [...stack.querySelectorAll("canvas, svg")].filter(
    (element) => element.parentElement?.closest("svg") === null && getComputedStyle(element).position === "absolute",
  );
}

/** What a press over the picture lands on: the topmost layer that takes pointer events. */
function pressedLayer(stack: Element): Element | undefined {
  return paintOrder(layersOf(stack))
    .reverse()
    .find((layer) => getComputedStyle(layer).pointerEvents !== "none");
}

/**
 * That these layers of `stack` are painted in this order, bottom first, and in the one stacking
 * context the stack is: nothing between them and it may be another, and it keeps their z-indexes
 * from ordering them against anything outside it.
 */
function expectBottomFirst(stack: Element, layers: Readonly<Record<string, Element | null>>): void {
  const over = layersOf(stack);
  const names = Object.keys(layers);
  for (const name of names) {
    expect(layers[name], `${name}: not drawn`).not.toBeNull();
    expect(over.includes(layers[name]!), `${name} is not a layer of its own over the picture`).toBe(true);
  }
  expect(new Set(Object.values(layers)).size, "two of these are one layer").toBe(names.length);

  const painted = paintOrder(names.map((name) => layers[name]!));
  expect(painted.map((layer) => names.find((name) => layers[name] === layer))).toEqual(names);

  expect(getComputedStyle(stack).isolation, "the stack is not a stacking context").toBe("isolate");
  for (const box of stack.querySelectorAll(".annotation-canvas")) {
    expect(getComputedStyle(box).isolation).not.toBe("isolate");
    expect(depthOf(box)).toBe(0);
  }
}

const at = (x: number, y: number, button = 0) => ({ button, pointerId: 1, clientX: x, clientY: y });

function click(surface: Element, x: number, y: number): void {
  fireEvent.pointerDown(surface, at(x, y));
  fireEvent.pointerUp(surface, at(x, y));
}

const overlayOf = (stack: Element) => stack.querySelector(".annotation-canvas__overlay");
const selectionOf = (stack: Element) => stack.querySelector(".annotation-canvas__selection");

/** The picture with the triangle selected, and a tool's layers over it, as the view lays them. */
function stackWith(tool: ReactNode, { editing = false }: { readonly editing?: boolean } = {}): ReactNode {
  return (
    <div className="canvas-stack">
      <AnnotationCanvas
        imageUrl="/pixels"
        width={WIDTH}
        height={HEIGHT}
        segments={[TRIANGLE]}
        selected={[0]}
        editing={editing}
      />
      {tool}
    </div>
  );
}

/** The same, in the half of the Multi tab being edited. */
function inMultiView(stack: ReactNode): ReactNode {
  return (
    <div className="split__view">
      <ViewKindContext.Provider value="multi">{stack}</ViewKindContext.Provider>
    </div>
  );
}

const aiLayer = (view: "single" | "multi") => (
  <AiLayer
    width={WIDTH}
    height={HEIGHT}
    onPrompt={() => undefined}
    onAccept={() => undefined}
    preview={<AiPreview result={ANSWER} view={view} />}
  />
);

const editLayer = (
  <EditLayer
    width={WIDTH}
    height={HEIGHT}
    segments={[TRIANGLE]}
    selected={[0]}
    onPreview={() => undefined}
    onCommit={() => undefined}
  />
);

const polygonLayer = <PolygonLayer width={WIDTH} height={HEIGHT} onComplete={() => undefined} />;

/** The preview's surface: the one its mask is drawn on. */
const previewSurface = () => screen.getByTestId("ai-mask").closest("svg");

function imageRow(key: string): WireDatasetImage {
  return { key, name: key, sidecars: {}, annotated: false, sharesSidecarsWith: [] };
}

function ViewHarness(): ReactNode {
  const { openImage, addSegment, toggleSelected, setActiveTool } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(imageRow("a.png"))}>open a</button>
      <button type="button" onClick={() => addSegment(TRIANGLE, "Add polygon")}>add</button>
      <button type="button" onClick={() => toggleSelected(0)}>select it</button>
      <button type="button" onClick={() => setActiveTool("polygon")}>polygon tool</button>
      <button type="button" onClick={() => setActiveTool("box")}>box tool</button>
      <button type="button" onClick={() => setActiveTool("circle")}>circle tool</button>
    </>
  );
}

/** The real view, with the triangle on the image, and selected when asked. */
async function openView({ select }: { readonly select: boolean }): Promise<Element> {
  const api = {
    getSettings: async () => defaultSettings(),
    putSettings: async (s: unknown) => s,
    imageMetadata: async () => ({ width: WIDTH, height: HEIGHT, sourceDepth: 8, sourceFormat: "png" }),
    loadAnnotations: async (): Promise<AnnotationsResult> => ({ kind: "none" }),
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
    models: async () => [],
  } as unknown as ApiClient;

  const view = render(
    <NotificationProvider>
      <SettingsProvider client={api}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={api} projectId="p1" confirmNavigation={() => true}>
            <ViewHarness />
            <OpenImageView client={api} projectId="p1" />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
  fireEvent.click(screen.getByText("open a"));
  await waitFor(() => expect(view.container.querySelector(".canvas-stack")).not.toBeNull());
  fireEvent.click(screen.getByText("add"));
  if (select) fireEvent.click(screen.getByText("select it"));
  return view.container.querySelector(".canvas-stack")!;
}

describe("in the single view, which the Sequence tab shares", () => {
  it("draws a polygon in progress under the annotations and the selection, and the press still reaches the tool", async () => {
    const stack = await openView({ select: true });
    fireEvent.click(screen.getByText("polygon tool"));
    const surface = await screen.findByLabelText("Polygon tool");

    click(surface, 5, 3);
    click(surface, 35, 3);
    click(surface, 35, 17);
    await waitFor(() => expect(screen.getByTestId("draft-fill")).toBeTruthy());

    // Legacy's dots, fill and edges at Z 0; the triangle at 1, its highlight at 999.
    expectBottomFirst(stack, { "the polygon in progress": surface, "the annotations": overlayOf(stack) });
    expectBottomFirst(stack, {
      "the polygon in progress": surface,
      "the annotations": overlayOf(stack),
      "the selection": selectionOf(stack),
    });
    expect(pressedLayer(stack)).toBe(surface);
    // The dots, fill and edges are all on that surface, under the annotations with it.
    expect(surface.querySelectorAll('[data-testid^="vertex-"], [data-testid^="edge-"]')).toHaveLength(5);
  });

  it("draws the box and circle rubber bands under the annotations, and the press still reaches the tool", async () => {
    const stack = await openView({ select: false });

    for (const [tool, label] of [["box tool", "Box tool"], ["circle tool", "Circle tool"]] as const) {
      fireEvent.click(screen.getByText(tool));
      const surface = await screen.findByLabelText(label);
      fireEvent.pointerDown(surface, at(8, 4));
      fireEvent.pointerMove(surface, at(32, 16));
      await waitFor(() => expect(surface.querySelector('[data-testid="shape-preview"]')).not.toBeNull());

      // Legacy's rubber bands at Z 0 (single_view_mouse_handler.py:146-166).
      expectBottomFirst(stack, { [`the ${tool}'s band`]: surface, "the annotations": overlayOf(stack) });
      expect(pressedLayer(stack)).toBe(surface);
      fireEvent.keyDown(document, { key: "Escape" });
    }
  });

  it("draws the AI points under the annotations, and the preview over both and under the selection", () => {
    const { container } = renderWithSettings(stackWith(aiLayer("single")));
    const stack = container.querySelector(".canvas-stack")!;
    const surface = screen.getByLabelText("AI tool");
    click(surface, 20, 10);
    expect(surface.querySelector('[data-testid="ai-positive-0"]')).not.toBeNull();

    // The points at Z 0, the triangle at 1, the preview at 50, the highlight at 999.
    expectBottomFirst(stack, { "the AI points": surface, "the annotations": overlayOf(stack) });
    expectBottomFirst(stack, {
      "the AI points": surface,
      "the annotations": overlayOf(stack),
      "the AI preview": previewSurface(),
      "the selection": selectionOf(stack),
    });
    expect(pressedLayer(stack)).toBe(surface);
  });

  it("draws the vertex handles over the annotations and under the selection's highlight", () => {
    const { container } = renderWithSettings(stackWith(editLayer, { editing: true }));
    const stack = container.querySelector(".canvas-stack")!;
    const surface = screen.getByLabelText("Edit tool");
    expect(surface.querySelectorAll("ellipse")).toHaveLength(3);

    // The triangle at Z 1, its handles at 200 and its highlight at 999 (editable_vertex.py:14;
    // segment_display_manager.py:505-508, 522).
    expectBottomFirst(stack, {
      "the annotations": overlayOf(stack),
      "the vertex handles": surface,
      "the selection": selectionOf(stack),
    });
    expect(pressedLayer(stack)).toBe(surface);
  });
});

describe("in the Multi tab", () => {
  it("draws the AI preview over the annotations, under the selection, and the points over all three", () => {
    const { container } = renderWithSettings(inMultiView(stackWith(aiLayer("multi"))));
    const stack = container.querySelector(".canvas-stack")!;
    const surface = screen.getByLabelText("AI tool");
    click(surface, 20, 10);
    expect(surface.querySelector('[data-testid="ai-positive-0"]')).not.toBeNull();

    // The triangle at Z 1, the preview at 500, the highlight at 999, the points at 1000.
    expectBottomFirst(stack, {
      "the annotations": overlayOf(stack),
      "the AI preview": previewSurface(),
      "the selection": selectionOf(stack),
      "the AI points": surface,
    });
    expect(pressedLayer(stack)).toBe(surface);
  });

  it("draws a polygon in progress over the selection", () => {
    const { container } = renderWithSettings(inMultiView(stackWith(polygonLayer)));
    const stack = container.querySelector(".canvas-stack")!;
    const surface = screen.getByLabelText("Polygon tool");
    click(surface, 5, 3);
    click(surface, 35, 3);
    expect(surface.querySelector('[data-testid="edge-0"]')).not.toBeNull();

    // Its edges at Z 999 and dots at 1000 (main_window.py:5666, 5676).
    expectBottomFirst(stack, {
      "the annotations": overlayOf(stack),
      "the selection": selectionOf(stack),
      "the polygon in progress": surface,
    });
    expect(pressedLayer(stack)).toBe(surface);
  });

  it("keeps the vertex handles under the selection's highlight", () => {
    const { container } = renderWithSettings(inMultiView(stackWith(editLayer, { editing: true })));
    const stack = container.querySelector(".canvas-stack")!;
    const surface = screen.getByLabelText("Edit tool");

    // Z 200 in the Multi tab too (main_window.py:2506).
    expectBottomFirst(stack, {
      "the annotations": overlayOf(stack),
      "the vertex handles": surface,
      "the selection": selectionOf(stack),
    });
    expect(pressedLayer(stack)).toBe(surface);
  });

  it("in the half not being edited, lays the preview under the selection and the prompt and the press over it", () => {
    // The other half's layers, by the classes the split view gives them (SplitView.tsx: PairPrompt,
    // PairDraftMarks, IdlePress): the preview, the linked prompt's points, and the press surface.
    const { container } = renderWithSettings(
      <div className="split__picture">
        <AnnotationCanvas imageUrl="/pixels" width={WIDTH} height={HEIGHT} segments={[TRIANGLE]} selected={[0]}>
          <svg className="ai-preview" aria-hidden="true">
            <AiPreview result={ANSWER} view="multi" />
          </svg>
          <svg className="split__prompt" aria-label="AI prompt" />
          <IdlePress tool="ai" name="b.png" width={WIDTH} height={HEIGHT} onPress={() => undefined} />
        </AnnotationCanvas>
      </div>,
    );
    const half = container.querySelector(".split__picture")!;

    expectBottomFirst(half, {
      "the annotations": overlayOf(half),
      "the AI preview": previewSurface(),
      "the selection": selectionOf(half),
      "the linked prompt": screen.getByLabelText("AI prompt"),
      "the press surface": screen.getByLabelText("Draw on b.png"),
    });
    expect(pressedLayer(half)).toBe(screen.getByLabelText("Draw on b.png"));
  });
});
