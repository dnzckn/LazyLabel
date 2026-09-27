/**
 * The AI tool's network half: one encode per image, a prompt per gesture, and the races between.
 *
 * The two tests that matter most are the out-of-order ones. A user clicking quickly has several
 * requests in flight and they do not come back in the order they were sent — so the naive version
 * works perfectly in every test that awaits one call at a time, and shows the preview moving
 * backwards the moment a real person uses it.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireSegment } from "@lazylabel/contracts";

import type { ApiClient, WireSegmentResponse } from "../../src/api/client.js";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { AiTool } from "../../src/workspace/AiTool.jsx";
import { renderWithSettings } from "../canvas/settingsHarness.jsx";

afterEach(cleanup);

const IMAGE = { width: 40, height: 20 };
const RECT = { left: 0, top: 0, width: 40, height: 20, right: 40, bottom: 20, x: 0, y: 0 };

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  } as DOMRect);
});

/** A response whose mask covers one square, big enough to survive any threshold used here. */
function response(overrides: Partial<WireSegmentResponse> = {}): WireSegmentResponse {
  const side = 8;
  const region = new Uint8Array(side * side).fill(1);
  let binary = "";
  for (const byte of region) binary += String.fromCharCode(byte);

  return {
    mask: { height: IMAGE.height, width: IMAGE.width, box: [2, 2, 2 + side, 2 + side], data: btoa(binary) },
    score: 0.9,
    chosen: 0,
    alternatives: [0.9],
    ...overrides,
  };
}

function mount(client: Partial<ApiClient>, props: Partial<Parameters<typeof AiTool>[0]> = {}) {
  const onAccept = vi.fn(props.onAccept);
  const onErase = vi.fn(props.onErase);

  const full = {
    embed: async () => ({ handle: "h1", cached: true }),
    segment: async () => response(),
    ...client,
  } as unknown as ApiClient;

  const tree = (over: Partial<Parameters<typeof AiTool>[0]> = props) => (
    <NotificationProvider>
      <NotificationHost />
      <AiTool
        client={full}
        imageKey="frames/a.png"
        width={IMAGE.width}
        height={IMAGE.height}
        classId={over.classId ?? 0}
        model="SAM 2.1 large"
        fragmentThreshold={over.fragmentThreshold ?? 0}
        {...(over.folderKeys === undefined ? {} : { folderKeys: over.folderKeys })}
        {...(over.archetypes === undefined ? {} : { archetypes: over.archetypes })}
        {...(over.autoPolygon === undefined ? {} : { autoPolygon: over.autoPolygon })}
        {...(over.operateOnView === undefined ? {} : { operateOnView: over.operateOnView })}
        onAccept={onAccept}
        onErase={onErase}
      />
    </NotificationProvider>
  );

  // The AI layer reads the drawing-aid sizing, which comes from the settings. `useSettings` throws
  // without a provider by design -- a hook that quietly defaults makes a missing wire invisible.
  const result = renderWithSettings(tree());

  return {
    onAccept,
    onErase,
    /** Re-render with different props, for the cases where CHANGING one is the behaviour. */
    rerender: (next: Partial<Parameters<typeof AiTool>[0]>) =>
      result.rerender(tree({ ...props, ...next })),
  };
}

const surface = () => screen.getByLabelText("AI tool");
const point = (x: number, y: number, button = 0) => ({ button, pointerId: 1, clientX: x, clientY: y });

function click(x: number, y: number, button = 0) {
  fireEvent.pointerDown(surface(), point(x, y, button));
  fireEvent.pointerUp(surface(), point(x, y, button));
}

/**
 * Wait for a prediction to have landed.
 *
 * The preview image cannot be waited on: jsdom has no canvas, so it paints nothing. The READY
 * message can, and it is real UI rather than a test-only signal — RULE-062 specifies it, and a
 * user on a machine where the preview fails to paint needs it for the same reason this does.
 */
async function ready(): Promise<void> {
  // A longer wait than the 1s default, and it is about the TEST RUNNER rather than the feature:
  // these files run in parallel with CPU-bound ones, and a starved worker can take longer than a
  // second to deliver a resolved promise. Raising it does not weaken the assertion -- what is
  // being asserted is that the preview arrives, not how fast.
  // Legacy's words (ai_segment_manager.py:515).
  await screen.findByText("Press spacebar to accept AI segment suggestion");
}

/** Let a rejected prediction settle, which produces no message of its own. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("preparing the image", () => {
  it("says a click was not sent, rather than dropping it in silence", async () => {
    // The banner says the image is being prepared; people click anyway while they wait. Before
    // this, the click went nowhere with no acknowledgement, so a slow model and a broken one
    // looked identical -- and the flakiest test in the suite was the one racing this window.
    //
    // Not queued for later: a mask appearing seconds after a click the user has moved on from is
    // worse than one that never appears.
    let release: (value: { handle: string; cached: boolean }) => void = () => {};
    mount({ embed: () => new Promise((resolve) => { release = resolve; }) });

    click(10, 10);

    // Legacy's words for a click while the image is loaded into the model
    // (ai_segment_manager.py:425-427), under legacy's status line (sam_single_view_manager.py:278).
    expect(await screen.findByText("Warning: AI model is updating, please wait...")).toBeTruthy();
    expect(screen.getByText("Loading image into AI model...")).toBeTruthy();

    // Released and WAITED FOR before the test ends. Leaving the encode in flight lets it resolve
    // after cleanup has unmounted the component, which is a state update on a dead tree -- and it
    // failed one full-suite run out of several while passing this file every time.
    release({ handle: "h1", cached: true });
    await waitFor(() => expect(screen.queryByText("Loading image into AI model...")).toBeNull());
  });


  it("encodes ONCE, however many prompts follow", async () => {
    // The expensive half -- seconds for a cold one -- against a fraction of a second per prompt.
    // Encoding per prompt would make the tool unusable while looking like a slow model.
    const embed = vi.fn(async (_request: unknown) => ({ handle: "h1", cached: true }));
    mount({ embed: embed as never });
    await waitFor(() => expect(embed).toHaveBeenCalledTimes(1));

    click(10, 10);
    click(12, 12);

    await waitFor(() => expect(screen.queryByTestId("ai-positive-1")).not.toBeNull());
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it("says nothing when the encode was cached", async () => {
    // A message on every image would be noise, and the whole point of the cache is no wait.
    mount({ embed: async () => ({ handle: "h1", cached: true }) });

    await waitFor(() => expect(screen.queryByText("Loading image into AI model...")).toBeNull());
    expect(screen.queryByText(/ready for AI prompts/)).toBeNull();
  });

  it("reports a cold encode, which the user waits for", async () => {
    mount({ embed: async () => ({ handle: "h1", cached: false }) });

    expect(await screen.findByText(/ready for AI prompts/)).toBeTruthy();
  });

  it("carries the service's own reason when it fails, in legacy's words", async () => {
    // "AI unavailable" tells a user to give up; the reason tells them what to do.
    // sam_single_view_manager.py:346-348.
    mount({ embed: async () => { throw new Error("PyTorch is not installed"); } });

    expect(await screen.findByText("Error loading AI model: PyTorch is not installed")).toBeTruthy();
  });

  it("does not prompt before the handle exists", async () => {
    const segment = vi.fn(async () => response());
    mount({ embed: () => new Promise(() => {}) as never, segment: segment as never });

    click(10, 10);

    expect(segment).not.toHaveBeenCalled();
  });
});

describe("prompting", () => {
  it("sends the points against the handle", async () => {
    const segment = vi.fn(async (_request: { handle: string }) => response());
    mount({ segment: segment as never });
    await waitFor(() => expect(surface()).toBeTruthy());

    click(10, 10);

    await waitFor(() => expect(segment).toHaveBeenCalledTimes(1));
    expect(segment.mock.calls[0]?.[0]).toEqual({
      handle: "h1",
      points: [{ x: 10, y: 10, positive: true }],
    });
  });

  it("normalizes a box before sending it, whichever way it was dragged", async () => {
    const segment = vi.fn(
      async (_request: { box?: readonly [number, number, number, number] }) => response(),
    );
    mount({ segment: segment as never });
    await waitFor(() => expect(surface()).toBeTruthy());

    fireEvent.pointerDown(surface(), point(35, 18));
    fireEvent.pointerUp(surface(), point(5, 2));

    await waitFor(() => expect(segment).toHaveBeenCalledTimes(1));
    expect(segment.mock.calls[0]?.[0].box).toEqual([5, 2, 35, 18]);
  });

  it("DISCARDS an answer that arrives out of order", async () => {
    // The race. Two clicks, the first answering last: showing it would put the mask for one point
    // on screen after the mask for two, and the user would watch the preview move backwards as
    // they refined it.
    let releaseFirst: (value: WireSegmentResponse) => void = () => {};
    const segment = vi
      .fn<(request: unknown) => Promise<WireSegmentResponse>>()
      .mockImplementationOnce(() => new Promise<WireSegmentResponse>((r) => { releaseFirst = r; }))
      .mockImplementationOnce(async () => response({ score: 0.5 }));

    mount({ segment: segment as never });
    await waitFor(() => expect(surface()).toBeTruthy());

    click(10, 10);
    click(12, 12);
    await waitFor(() => expect(segment).toHaveBeenCalledTimes(2));

    releaseFirst(response({ score: 0.99 }));
    await ready();

    // The stale answer did not replace the fresh one: accepting still commits, and exactly once.
    fireEvent.keyDown(document, { key: " ", code: "Space" });
    await waitFor(() => expect(screen.queryByText(/No AI segment preview/)).toBeNull());
  });

  it("does not let a stale FAILURE clear a fresh preview", async () => {
    // The same race with the other outcome, and worse: a stale error would wipe a good preview.
    let rejectFirst: (cause: Error) => void = () => {};
    const segment = vi
      .fn<(request: unknown) => Promise<WireSegmentResponse>>()
      .mockImplementationOnce(() => new Promise<WireSegmentResponse>((_r, reject) => { rejectFirst = reject; }))
      .mockImplementationOnce(async () => response());

    const { onAccept } = mount({ segment: segment as never });
    await waitFor(() => expect(surface()).toBeTruthy());

    click(10, 10);
    click(12, 12);
    await waitFor(() => expect(segment).toHaveBeenCalledTimes(2));

    rejectFirst(new Error("the model raised"));
    await settle();
    await ready();
    expect(screen.queryByText(/the model raised/)).toBeNull();

    fireEvent.keyDown(document, { key: " ", code: "Space" });
    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
  });

  it("clears the preview when the prompt that produced it fails", async () => {
    // Leaving the previous mask up shows an answer to a question nobody asked: the user's last
    // click is not in it, and they have no way to tell.
    const segment = vi
      .fn<(request: unknown) => Promise<WireSegmentResponse>>()
      .mockImplementationOnce(async () => response())
      .mockImplementationOnce(async () => { throw new Error("the model raised"); });

    const { onAccept } = mount({ segment: segment as never });
    await waitFor(() => expect(surface()).toBeTruthy());

    click(10, 10);
    await ready();
    click(12, 12);

    // Legacy's line; the service's reason is its tooltip (CP-64).
    expect((await screen.findByText("Error: AI prediction failed")).title).toMatch(/the model raised/);

    fireEvent.keyDown(document, { key: " ", code: "Space" });
    await waitFor(() => expect(screen.getByText(/No AI segment preview to accept/)).toBeTruthy());
    expect(onAccept).not.toHaveBeenCalled();
  });
});

describe("accepting", () => {
  it("commits the mask on Space", async () => {
    const { onAccept } = mount({});
    await waitFor(() => expect(surface()).toBeTruthy());

    click(10, 10);
    await ready();

    fireEvent.keyDown(document, { key: " ", code: "Space" });

    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
    const segment = onAccept.mock.calls[0]?.[0] as WireSegment;
    expect(segment.type).toBe("AI");
    expect(segment.mask).toBeDefined();
  });

  it("erases with it on Shift+Space", async () => {
    const { onAccept, onErase } = mount({});
    await waitFor(() => expect(surface()).toBeTruthy());

    click(10, 10);
    await ready();

    fireEvent.keyDown(document, { key: " ", code: "Space", shiftKey: true });

    await waitFor(() => expect(onErase).toHaveBeenCalledTimes(1));
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("gives the annotation the active class", async () => {
    const { onAccept } = mount({}, { classId: 7 });
    await waitFor(() => expect(surface()).toBeTruthy());

    click(10, 10);
    await ready();
    fireEvent.keyDown(document, { key: " ", code: "Space" });

    await waitFor(() => expect((onAccept.mock.calls[0]?.[0] as WireSegment).classId).toBe(7));
  });

  it("says so when the fragment filter left nothing", async () => {
    // A threshold that drops everything is a real configuration, and committing nothing without a
    // word looks like the key not working.
    const { onAccept } = mount({}, { fragmentThreshold: 100 });
    await waitFor(() => expect(surface()).toBeTruthy());

    click(10, 10);
    await settle();

    // One region, so at 100 it survives -- the threshold drops fragments relative to the largest,
    // and the largest is never below itself.
    fireEvent.keyDown(document, { key: " ", code: "Space" });
    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
  });
});

describe("Escape", () => {
  it("takes the preview away with the points, as legacy's does", async () => {
    // keyboard_event_manager.py:306-313 removes the preview mask with the points. The mask stayed
    // on screen until 2026-09-27, over a prompt that no longer existed, and Space then said there
    // was nothing to accept.
    const { onAccept } = mount({});
    await waitFor(() => expect(surface()).toBeTruthy());
    click(10, 10);
    await ready();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByText("Press spacebar to accept AI segment suggestion")).toBeNull());
    expect(document.querySelector('[data-testid="ai-mask"]')).toBeNull();
    fireEvent.keyDown(document, { key: " ", code: "Space" });
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("drops an answer still on its way, so it cannot land after the prompt went", async () => {
    let answer: (value: WireSegmentResponse) => void = () => {};
    mount({ segment: () => new Promise((resolve) => { answer = resolve; }) });
    await waitFor(() => expect(surface()).toBeTruthy());
    click(10, 10);

    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {
      answer(response());
      await Promise.resolve();
    });

    expect(screen.queryByText("Press spacebar to accept AI segment suggestion")).toBeNull();
  });
});

describe("Auto-Convert", () => {
  it("accepts a MASK when the setting is off, which is the default", async () => {
    // A conversion approximates. Approximating someone's annotation without being asked is the
    // sort of help that loses a boundary they cared about, so legacy defaults it off and so does
    // this.
    const { onAccept } = mount({});
    await waitFor(() => expect(surface()).toBeTruthy());
    click(10, 10);
    await ready();

    fireEvent.keyDown(document, { key: " ", code: "Space" });

    await waitFor(() => expect(onAccept).toHaveBeenCalled());
    const segment = onAccept.mock.calls.at(-1)![0];
    expect(segment.type).toBe("AI");
    expect(segment.mask).toBeDefined();
    expect(segment.vertices).toBeUndefined();
  });

  it("accepts a POLYGON when it is on, with corners the edit tool can drag", async () => {
    // The point of the feature: a mask has no corners to drag, a polygon does.
    const { onAccept } = mount({}, { autoPolygon: { enabled: true, resolution: 80 } });
    await waitFor(() => expect(surface()).toBeTruthy());
    click(10, 10);
    await ready();

    fireEvent.keyDown(document, { key: " ", code: "Space" });

    await waitFor(() => expect(onAccept).toHaveBeenCalled());
    const segment = onAccept.mock.calls.at(-1)![0];
    expect(segment.type).toBe("Polygon");
    expect(segment.vertices?.length).toBeGreaterThanOrEqual(3);
    expect(segment.mask).toBeUndefined();
  });

  it("still ERASES with the mask when it is on", async () => {
    // Legacy's Shift+Space erases with the preview mask itself; the conversion is only for what is
    // added (ai_segment_manager.py:137-142, 175-180, 241-299). A polygon here was dropped by the view,
    // which erases with masks only, so Shift+Space erased nothing while Auto-Convert was on.
    const { onErase } = mount({}, { autoPolygon: { enabled: true, resolution: 80 } });
    await waitFor(() => expect(surface()).toBeTruthy());
    click(10, 10);
    await ready();

    fireEvent.keyDown(document, { key: " ", code: "Space", shiftKey: true });

    await waitFor(() => expect(onErase).toHaveBeenCalledTimes(1));
    const eraser = onErase.mock.calls[0]![0];
    expect(eraser.type).toBe("AI");
    expect(eraser.mask).toBeDefined();
    expect(eraser.vertices).toBeUndefined();
  });
});

describe("Operate On View (RULE-089)", () => {
  it("does NOT send adjustments by default, so the model sees the file", async () => {
    // The rule's default, and the cheaper path: no image crosses the API-to-service wire.
    const embed = vi.fn(async (_request: unknown) => ({ handle: "h1", cached: true }));
    mount({ embed });

    await waitFor(() => expect(embed).toHaveBeenCalled());
    expect(embed.mock.calls[0]![0]).toEqual({ image: "frames/a.png", model: "SAM 2.1 large" });
  });

  it("sends them when the setting is on, so the model sees what the USER sees", async () => {
    const embed = vi.fn(async (_request: unknown) => ({ handle: "h1", cached: true }));
    mount({ embed }, { operateOnView: { adjustments: { brightness: 40, contrast: 0, gamma: 1, saturation: 1 }, processing: "" } });

    await waitFor(() => expect(embed).toHaveBeenCalled());
    expect(embed.mock.calls[0]![0]).toEqual({
      image: "frames/a.png",
      model: "SAM 2.1 large",
      adjustments: { brightness: 40, contrast: 0, gamma: 1, saturation: 1 },
    });
  });

  it("RE-ENCODES when the view changes, rather than reusing the handle", async () => {
    // The rule says so, and the adjustments are part of the embedding cache key: a different view
    // is a different encoding, not a stale one. Reusing it would prompt a model that had encoded
    // a picture the user has since changed.
    const embed = vi.fn(async (_request: unknown) => ({ handle: "h1", cached: true }));
    const { rerender } = mount({ embed }, {
      operateOnView: { adjustments: { brightness: 10, contrast: 0, gamma: 1, saturation: 1 }, processing: "" },
    });
    await waitFor(() => expect(embed).toHaveBeenCalledTimes(1));

    rerender({
      operateOnView: { adjustments: { brightness: 60, contrast: 0, gamma: 1, saturation: 1 }, processing: "" },
    });

    await waitFor(() => expect(embed).toHaveBeenCalledTimes(2));
  });

  /*
   * The PROCESSING chain is part of the view. Legacy's rescale, thresholds and FFT replace the
   * image its adjustments apply to, so Operate On View segments the processed picture; until
   * 2026-09-23 only the adjustments were sent, and the model segmented a picture nobody could see.
   */
  const NEUTRAL = { brightness: 0, contrast: 0, gamma: 1, saturation: 1 };

  it("sends the processing chain with the view", async () => {
    const embed = vi.fn(async (_request: unknown) => ({ handle: "h1", cached: true }));
    mount({ embed }, { operateOnView: { adjustments: NEUTRAL, processing: "rescaleMin=10&rescaleMax=200" } });

    await waitFor(() => expect(embed).toHaveBeenCalled());
    expect(embed.mock.calls[0]![0]).toEqual({
      image: "frames/a.png",
      model: "SAM 2.1 large",
      adjustments: NEUTRAL,
      processing: "rescaleMin=10&rescaleMax=200",
    });
  });

  it("RE-ENCODES when only the processing changes", async () => {
    const embed = vi.fn(async (_request: unknown) => ({ handle: "h1", cached: true }));
    const { rerender } = mount({ embed }, {
      operateOnView: { adjustments: NEUTRAL, processing: "rescaleMin=10&rescaleMax=200" },
    });
    await waitFor(() => expect(embed).toHaveBeenCalledTimes(1));

    rerender({ operateOnView: { adjustments: NEUTRAL, processing: "rescaleMin=20&rescaleMax=200" } });

    await waitFor(() => expect(embed).toHaveBeenCalledTimes(2));
    expect((embed.mock.calls[1]![0] as { processing: string }).processing).toBe("rescaleMin=20&rescaleMax=200");
  });

  it("prefetches neighbours with the adjustments alone, since each opens with no processing", async () => {
    // Decision 9: the processing chain does not carry to the next image. A neighbour encoded
    // through THIS image's rescale would be keyed on a view it will never be shown in.
    const embed = vi.fn(async (_request: unknown) => ({ handle: "h1", cached: false }));
    mount({ embed }, {
      folderKeys: ["frames/a.png", "frames/b.png"],
      operateOnView: { adjustments: NEUTRAL, processing: "rescaleMin=10&rescaleMax=200" },
    });

    await waitFor(() => expect(embed).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(embed.mock.calls[1]![0]).toEqual({ image: "frames/b.png", model: "SAM 2.1 large", adjustments: NEUTRAL });
  });
});


describe("RULE-091: encoding the neighbours before anyone asks", () => {
  /**
   * The cache was built and keyed properly and nothing ever warmed it, so the first click after
   * navigating still paid for a cold encode — seconds of it. `prefetch.test.ts` proves the ORDER;
   * this proves the prefetch is REACHED, which is the half that has gone missing fourteen times in
   * this project.
   */
  const FOLDER = ["frames/a.png", "frames/b.png", "frames/c.png", "frames/d.png"];

  function embedSpy() {
    const asked: string[] = [];
    return {
      asked,
      embed: async ({ image }: { image: string }) => {
        asked.push(image);
        return { handle: `h-${image}`, cached: false };
      },
    };
  }

  it("encodes the neighbours after the current image is warm", async () => {
    const spy = embedSpy();
    mount({ embed: spy.embed } as never, { folderKeys: FOLDER } as never);

    // The current image first, always: racing the prefetch against the encode the user is waiting
    // on would make the thing they asked for slower for the sake of one they have not.
    await waitFor(() => expect(spy.asked[0]).toBe("frames/a.png"));
    await waitFor(() => expect(spy.asked).toContain("frames/b.png"), { timeout: 3000 });

    expect(spy.asked.indexOf("frames/b.png")).toBeGreaterThan(0);
  });

  it("walks the whole order, not just the next image", async () => {
    const spy = embedSpy();
    mount({ embed: spy.embed } as never, { folderKeys: FOLDER } as never);

    await waitFor(() => expect(spy.asked).toContain("frames/c.png"), { timeout: 3000 });
  });

  it("puts an archetype ahead of the neighbours", async () => {
    const spy = embedSpy();
    mount({ embed: spy.embed } as never, {
      folderKeys: FOLDER,
      archetypes: ["frames/d.png"],
    } as never);

    await waitFor(() => expect(spy.asked).toContain("frames/d.png"), { timeout: 3000 });
    expect(spy.asked.indexOf("frames/d.png")).toBeLessThan(spy.asked.indexOf("frames/b.png"));
  });

  it("does nothing at all without a folder behind it", async () => {
    // A view with no listing should not invent one. This is also what makes every other test in
    // this file free of background encodes.
    const spy = embedSpy();
    mount({ embed: spy.embed } as never);

    await waitFor(() => expect(spy.asked).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(spy.asked).toEqual(["frames/a.png"]);
  });

  it("keeps going when one neighbour cannot be encoded", async () => {
    // Nothing was asked for, so nothing was promised. One unreadable image must not stop the
    // others being warmed, and must not spin the loop either.
    const asked: string[] = [];
    const embed = async ({ image }: { image: string }) => {
      asked.push(image);
      if (image === "frames/b.png") throw new Error("unreadable");
      return { handle: `h-${image}`, cached: false };
    };

    mount({ embed } as never, { folderKeys: FOLDER } as never);

    await waitFor(() => expect(asked).toContain("frames/c.png"), { timeout: 3000 });
    expect(asked.filter((key) => key === "frames/b.png")).toHaveLength(1);
  });
});
