/**
 * C3 — segment an object by clicking or boxing it with SAM. Also persona flow 1, end to end, which
 * is Phase 5 exit criterion 1.
 *
 * ONE FILE FOR BOTH, and named for the capability because that is what the coverage guard reads.
 * The capability and the persona flow are the same path through the app: a flow is what a person
 * does, a capability is what the app offers, and here they are the same six steps. Two files would
 * be two names for one test.
 *
 * "An annotator opens a folder, clicks objects so SAM draws their masks, and moves on while labels
 * are saved beside each image." The six steps `topology.json` records, through the real components
 * with only the HTTP client stubbed.
 *
 * WHAT THIS ADDS OVER `AiTool.test`. That file proves the tool's network half in isolation: one
 * encode per image, request sequencing, the fragment filter. This proves the persona can reach it
 * — pick a model, choose the AI tool, click, accept, and have the mask arrive in the store as a
 * real annotation with the right class. Flow 3's equivalent found that the edit layer had never
 * been wired into the view at all, which is exactly the class of gap a component test cannot see.
 *
 * Step 6, "go to the next image; labels are saved automatically", is asserted as decision 7 settled
 * it rather than as legacy behaves: LazyLabel's auto-save is a SETTING, and with it off, navigating
 * must not silently write. What is checked here is that switching images carries nothing over —
 * the previous image's annotations, selection and undo history are all gone, which is RULE-052 and
 * is what stops an undo reaching into a file that is no longer on screen.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { AnnotationsResult, ApiClient, WireSegmentResponse } from "../../src/api/client.js";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { ModelPicker } from "../../src/workspace/ModelPicker.jsx";
import { OpenImageView } from "../../src/workspace/OpenImageView.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

const IMAGE = { width: 40, height: 20 };
const RECT = { left: 0, top: 0, width: 40, height: 20, right: 40, bottom: 20, x: 0, y: 0 };

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  } as DOMRect);
});

const MODEL = "SAM 2.1 large";

function imageRow(key: string): WireDatasetImage {
  return { key, name: key, sidecars: {}, annotated: false, sharesSidecarsWith: [] };
}

/** A mask covering one 8x8 square, comfortably above any fragment threshold used here. */
function response(): WireSegmentResponse {
  const side = 8;
  let binary = "";
  for (let i = 0; i < side * side; i += 1) binary += String.fromCharCode(1);

  return {
    mask: { height: IMAGE.height, width: IMAGE.width, box: [2, 2, 2 + side, 2 + side], data: btoa(binary) },
    score: 0.9,
    chosen: 0,
    alternatives: [0.9],
  };
}

function Harness(): React.ReactNode {
  const { openImage, segments, imageState, history, setActiveTool } = useWorkspace();

  return (
    <>
      <button type="button" onClick={() => openImage(imageRow("a.png"))}>open a</button>
      <button type="button" onClick={() => openImage(imageRow("b.png"))}>open b</button>
      <button type="button" onClick={() => setActiveTool("ai")}>ai tool</button>
      <p data-testid="count">{segments.length}</p>
      <p data-testid="class">{segments.map((s) => s.classId).join(",")}</p>
      <p data-testid="types">{segments.map((s) => s.type).join(",")}</p>
      <p data-testid="dirty">{imageState?.dirty === true ? "dirty" : "clean"}</p>
      <p data-testid="undoable">{history.state.canUndo ? "yes" : "no"}</p>
    </>
  );
}

function mount(overrides: Partial<ApiClient> = {}) {
  /*
   * ONE promise, handed out by the stub and awaited by the test.
   *
   * The encode has to have finished before a click is worth making -- a prompt that arrives first
   * is not sent, which is `AiTool`'s own rule. Waiting for the "Preparing this image" banner to go
   * looks like the way to know, and is not: `encoding` starts false and the effect sets it, so the
   * banner is absent at mount and an absence test passes before the encode has even started.
   *
   * Awaiting the promise the stub returned, inside `act`, is the signal with no race in it.
   */
  const embedded = Promise.resolve({ handle: "h1", cached: false });
  const embed = vi.fn(() => embedded);
  const segment = vi.fn(async () => response());
  const saveAnnotations = vi.fn(async () => ({ written: {}, stale: [], skippedEmpty: [] }));

  const api = {
    getSettings: async () => defaultSettings(),
    putSettings: async (s: unknown) => s,
    imageMetadata: async () => ({ ...IMAGE, sourceDepth: 8, sourceFormat: "png" }),
    loadAnnotations: async (): Promise<AnnotationsResult> => ({ kind: "none" }),
    pixelsUrl: () => "/pixels",
    models: async () => [
      {
        name: MODEL,
        family: "sam2",
        size: "large",
        videoCapable: true,
        present: true,
        verified: true,
        detail: null,
      },
    ],
    embed,
    segment,
    saveAnnotations,
    ...overrides,
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={api}>
        {/* Unsaved work is no longer discarded silently when another image opens -- decision 7.
            These tests navigate deliberately, so they answer the prompt; the prompt itself is
            covered in `test/workspace/navigateAway.test.tsx`. */}
        <WorkspaceProvider client={api} projectId="p1" confirmNavigation={() => true}>
          <Harness />
          <ModelPicker client={api} />
          <NotificationHost />
          <OpenImageView client={api} projectId="p1" />
        </WorkspaceProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );

  return { embed, segment, saveAnnotations, embedded };
}

const shown = (id: string) => screen.getByTestId(id).textContent;

function clickImage(x: number, y: number) {
  const surface = screen.getByLabelText("AI tool");
  fireEvent.pointerDown(surface, { button: 0, pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerUp(surface, { button: 0, pointerId: 1, clientX: x, clientY: y });
}

/** Steps 1–3: pick an image, choose the model, reach the AI surface. */
async function readyToPrompt() {
  const handles = mount();

  fireEvent.click(screen.getByText("open a"));
  await waitFor(() => expect(screen.getAllByText("a.png").length).toBeGreaterThan(0));

  // The model is chosen by NAME from the manifest. Legacy matches on a file-name substring, which
  // loads `sam2_hiera_large_tuned.pt` as "tiny".
  // By ROLE and name rather than by label text: the label also carries the family and size, so an
  // exact label match would be brittle for no gain.
  fireEvent.click(await screen.findByRole("radio", { name: new RegExp(MODEL) }));
  fireEvent.click(screen.getByText("ai tool"));
  await waitFor(() => expect(screen.getByLabelText("AI tool")).toBeTruthy());

  // The encode has to be done before clicking: a prompt that lands first is not sent, which is
  // `AiTool`'s rule and the product answer to the same race this used to lose.
  await act(async () => {
    await handles.embedded;
  });

  return handles;
}

/**
 * Wait for a prediction to have landed.
 *
 * The preview itself cannot be waited on -- jsdom paints no canvas. The READY message can, and it
 * is real UI rather than a test signal: RULE-062 specifies it, and a user whose preview fails to
 * paint needs it for the same reason this does.
 */
async function previewReady(): Promise<void> {
  await screen.findByText(/AI preview ready/);
}

describe("flow 1, step by step", () => {
  it("prepares the image once, then answers each click", async () => {
    // The encode is the expensive half -- seconds cold, against a fraction of a second per prompt.
    // Encoding per prompt would make the tool unusable while looking like a slow model.
    const { embed, segment } = await readyToPrompt();

    clickImage(6, 6);
    await previewReady();
    clickImage(10, 10);
    await waitFor(() => expect(segment).toHaveBeenCalledTimes(2));

    expect(embed).toHaveBeenCalledTimes(1);
  });

  it("accepts the preview on Space and it becomes a real annotation", async () => {
    await readyToPrompt();

    clickImage(6, 6);
    await previewReady();
    fireEvent.keyDown(document, { key: " " });

    await waitFor(() => expect(shown("count")).toBe("1"));
    expect(shown("types")).toBe("AI");
    // No class is active and the image was empty, so the next free id is 0.
    expect(shown("class")).toBe("0");
    expect(shown("dirty")).toBe("dirty");
    expect(shown("undoable")).toBe("yes");
  });

  it("does not turn a preview into an annotation until it is accepted", async () => {
    // A preview is a proposal. Legacy draws it the same way it draws a committed mask, which is
    // how a user ends up unsure whether a click has already labelled something.
    await readyToPrompt();

    clickImage(6, 6);
    await previewReady();

    expect(shown("count")).toBe("0");
    expect(shown("dirty")).toBe("clean");
  });

  it("says nothing can be segmented until a model is chosen", async () => {
    // Rather than sending a request the service can only refuse. The manifest may also be empty,
    // which is a deployment with no checkpoints rather than a broken one.
    mount();
    fireEvent.click(screen.getByText("open a"));
    await waitFor(() => expect(screen.getAllByText("a.png").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("ai tool"));

    expect(screen.queryByLabelText("AI tool")).toBeNull();
  });
});

describe("flow 1, step 6: moving to the next image", () => {
  it("carries nothing over from the previous image", async () => {
    // RULE-052 scopes undo to the open image. An undo that reached into the previous one's edits
    // would apply them to annotations that are not on screen -- and the store is also where the
    // per-image class ids of decision 6 stop leaking between files.
    await readyToPrompt();
    clickImage(6, 6);
    await previewReady();
    fireEvent.keyDown(document, { key: " " });
    await waitFor(() => expect(shown("count")).toBe("1"));

    fireEvent.click(screen.getByText("open b"));

    await waitFor(() => expect(shown("count")).toBe("0"));
    expect(shown("undoable")).toBe("no");
    expect(shown("dirty")).toBe("clean");
  });

  it("does not save on the way out", async () => {
    // Decision 7, and it is where this flow departs from legacy's description. Auto-save is a
    // SETTING; with it off, navigating away must not write. Legacy's multi-view navigation saves
    // regardless of the setting (RULE-057), which is how work is written that a user meant to
    // discard.
    const { saveAnnotations } = await readyToPrompt();
    clickImage(6, 6);
    await previewReady();
    fireEvent.keyDown(document, { key: " " });
    await waitFor(() => expect(shown("count")).toBe("1"));

    fireEvent.click(screen.getByText("open b"));
    await waitFor(() => expect(shown("count")).toBe("0"));

    expect(saveAnnotations).not.toHaveBeenCalled();
  });
});
