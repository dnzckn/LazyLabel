/**
 * Propagating from the browser: start, watch, stop.
 *
 * The service's suite proves the job behaves and the API's proves the proxy forwards. What is
 * proven here is the part only the browser can get wrong — polling by cursor rather than refetching,
 * folding per-object scores into a per-frame confidence, and telling the truth while a cancel is in
 * flight.
 *
 * The client is a fake, as it is everywhere else in this suite. Nothing here needs a model; what a
 * model is needed for is proving the masks match legacy, which is a different claim.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFinalMaskTensor, type MaskTensor } from "@lazylabel/annotation-formats";
import {
  decodeMask,
  decodeSegment,
  encodeMask,
  type WireMask,
  type WireSaveRequest,
  type WireSegment,
} from "@lazylabel/contracts";
import { defaultSettings } from "@lazylabel/settings-schema";

import type {
  ApiClient,
  WirePropagationFrame,
  WirePropagationJob,
  WirePropagationStart,
} from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { Panel } from "../../src/shell/Panel.jsx";
import { TimelinePanel } from "../../src/sequence/TimelinePanel.jsx";
import { SequenceActiveContext } from "../../src/sequence/sequenceActive.js";
import { PropagationControl } from "../../src/sequence/PropagationControl.jsx";
import type { OpenAnnotations } from "../../src/sequence/references.js";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import type { Frame } from "../../src/sequence/timeline.js";

afterEach(cleanup);

const MASK: WireMask = { height: 2, width: 2, box: [0, 0, 1, 1], data: "AQE=" };
/** One annotation on a reference frame: a square the user drew. */
const SQUARE = {
  type: "Polygon",
  classId: 0,
  vertices: [
    [1, 1],
    [6, 1],
    [6, 6],
    [1, 6],
  ],
};
/**
 * A mask with no pixels, in the CONTRACT's form -- `box: null` -- which is what the service sends.
 * RULE-016 scores it, RULE-060 refuses to commit it. This was `box: [0, 0, -1, -1]` until
 * 2026-09-23, a shape nothing produces, so the form the browser actually receives went untested and
 * crashed the poll the first time an object vanished from a real sequence.
 */
const EMPTY_MASK: WireMask = { height: 2, width: 2, box: null, data: "" };

function frame(index: number, isReference = false): Frame {
  return {
    index,
    key: `frames/f${String(index).padStart(2, "0")}.png`,
    state: isReference ? "reference" : "pending",
    isReference,
    confidence: null,
  } as unknown as Frame;
}

const FRAMES = [frame(0, true), frame(1), frame(2), frame(3)];

function job(overrides: Partial<WirePropagationJob> = {}): WirePropagationJob {
  return {
    id: "job-1",
    state: "running",
    completed: 0,
    total: 4,
    cursor: 0,
    cancelling: false,
    error: null,
    results: [],
    ...overrides,
  };
}

interface Fake {
  readonly client: ApiClient;
  readonly started: WirePropagationStart[];
  readonly polls: { id: string; cursor: number }[];
  readonly cancels: string[];
}

function fakeClient(script: {
  start?: () => WirePropagationJob | Promise<WirePropagationJob>;
  poll?: (call: number, cursor: number) => WirePropagationJob | Promise<WirePropagationJob>;
  cancel?: () => WirePropagationJob | Promise<WirePropagationJob>;
  /** What each reference frame's sidecar holds. A key with no entry has no annotations. */
  annotations?: Record<string, readonly unknown[]>;
  metadata?: () => never;
  /**
   * Which images have sidecars when Propagate is pressed -- what Skip Labeled reads (RULE-081).
   * Defaults to the references alone, which is what a folder looks like before any Save All.
   */
  labelled?: readonly string[];
  /** Makes that listing fail. */
  listing?: () => never;
}): Fake {
  const started: WirePropagationStart[] = [];
  const polls: { id: string; cursor: number }[] = [];
  const cancels: string[] = [];
  let pollCount = 0;

  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (next: unknown) => next,
    listImages: async () => {
      if (script.listing) script.listing();
      const labelled = new Set(
        script.labelled ?? FRAMES.filter((each) => each.isReference).map((each) => each.key),
      );
      return {
        folder: "frames",
        folders: [],
        annotatedCount: labelled.size,
        unrecognized: 0,
        columns: [],
        images: [...FRAMES, frame(4), frame(5)].map((each) => ({
          key: each.key,
          name: each.key.slice("frames/".length),
          sidecars: {},
          annotated: labelled.has(each.key),
          sharesSidecarsWith: [],
        })),
      };
    },
    imageMetadata: async () => {
      if (script.metadata) script.metadata();
      return { width: 8, height: 8, sourceDepth: 8, sourceChannels: 3, sourceFormat: "png" };
    },
    loadAnnotations: async (_project: string, key: string) => ({
      kind: "loaded",
      annotations: {
        sourceFormat: "NPZ",
        sourceFile: key,
        revision: "r1",
        segments: script.annotations?.[key] ?? [SQUARE],
        classAliases: {},
        failures: [],
      },
    }),
    startPropagation: async (request: WirePropagationStart) => {
      started.push(request);
      return script.start?.() ?? job();
    },
    propagationState: async (id: string, cursor: number) => {
      polls.push({ id, cursor });
      return script.poll?.(pollCount++, cursor) ?? job({ state: "completed" });
    },
    cancelPropagation: async (id: string) => {
      cancels.push(id);
      return script.cancel?.() ?? job({ state: "running", cancelling: true });
    },
  } as unknown as ApiClient;

  return { client, started, polls, cancels };
}

function show(fake: Fake, frames: readonly Frame[] = FRAMES) {
  const onScores = vi.fn();
  render(
    <NotificationProvider>
      <NotificationHost />
      <SettingsProvider client={fake.client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <PropagationControl client={fake.client} frames={frames} onScores={onScores} />
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
  return { onScores };
}

const propagate = () => screen.getByRole("button", { name: /^Propagate/ });

describe("Keep Flagged Masks and Skip Labeled (RULE-060, RULE-081)", () => {
  /*
   * Neither control existed until 2026-09-23, when the synthetic-shapes golden held this app to
   * legacy's own sequence mode. `acceptance/c11.goldens.test.tsx` compares every frame; these pin
   * what the controls themselves do.
   */
  it("start at legacy's defaults: flagged masks discarded, labelled frames left alone", () => {
    show(fakeClient({}));

    expect((screen.getByLabelText("Keep flagged masks") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Skip labeled") as HTMLInputElement).checked).toBe(true);
  });

  it("REFUSES to propagate when Skip Labeled cannot tell which frames have labels", async () => {
    // Run unprotected, the next Save All could overwrite every labelled frame in the sequence.
    const fake = fakeClient({
      listing: () => {
        throw new Error("the dataset is unreachable");
      },
    });
    show(fake);

    fireEvent.click(propagate());

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /Nothing was propagated: Skip Labeled could not read which frames already have labels/,
    );
    expect(fake.started).toHaveLength(0);
  });

  /** A client whose settings pick `model`, and whose model list says whether it can propagate. */
  function picking(model: string, videoCapable: boolean): Fake {
    const fake = fakeClient({});
    const defaults = defaultSettings();
    const client = {
      ...fake.client,
      getSettings: async () => ({ ...defaults, values: { ...defaults.values, ai_model: model } }),
      models: async () => [{ name: model, family: videoCapable ? "sam2" : "sam1", videoCapable, present: true, verified: true }],
    } as unknown as ApiClient;
    return { ...fake, client };
  }

  it("sends the picked SAM 2 model with the run, as legacy propagates with the model it has loaded (SP-32)", async () => {
    // Legacy uses the loaded model (main_window.py:4052-4060). The web sent none: the service guessed,
    // and refused outright with two SAM 2 checkpoints listed.
    const fake = picking("SAM 2.1 large", true);
    show(fake);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    fireEvent.click(propagate());

    await waitFor(() => expect(fake.started).toHaveLength(1));
    expect(fake.started[0]!.model).toBe("SAM 2.1 large");
  });

  it("refuses in legacy's words when the picked model is SAM 1 (SP-32)", async () => {
    const fake = picking("SAM vit_h", false);
    show(fake);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    fireEvent.click(propagate());

    expect((await screen.findByRole("alert")).textContent).toMatch(/SAM 2 video predictor not available/);
    expect(fake.started).toHaveLength(0);
  });

  it("aborts while it starts, on a second press, as legacy's Propagate does (SP-40)", async () => {
    // Legacy's button is Abort from the first click, through loading and reference registration
    // (sequence_widget.py:629-640; main_window.py:4417-4445). The web's was disabled then.
    let release: () => void = () => undefined;
    const fake = fakeClient({});
    const client = {
      ...fake.client,
      loadAnnotations: (_project: string, key: string) =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              kind: "loaded",
              annotations: {
                sourceFormat: "NPZ",
                sourceFile: key,
                revision: "r1",
                segments: [SQUARE],
                classAliases: {},
                failures: [],
              },
            });
        }),
    } as unknown as ApiClient;
    show({ ...fake, client });

    fireEvent.click(propagate());
    fireEvent.click(await screen.findByRole("button", { name: "Starting…" }));

    expect(await screen.findByText("Propagation cancelled")).toBeTruthy();
    await act(async () => {
      release();
    });
    expect(fake.started).toHaveLength(0);
    expect(propagate().textContent).toBe("Propagate");
  });

  it("does not need the listing at all once Skip Labeled is off", async () => {
    const fake = fakeClient({
      listing: () => {
        throw new Error("the dataset is unreachable");
      },
    });
    show(fake);

    fireEvent.click(screen.getByLabelText("Skip labeled"));
    fireEvent.click(propagate());

    await waitFor(() => expect(fake.started).toHaveLength(1));
  });
});

describe("starting one", () => {
  it("sends the frame keys and which of them are references", async () => {
    const fake = fakeClient({});
    show(fake);

    fireEvent.click(propagate());

    await waitFor(() => expect(fake.started).toHaveLength(1));
    expect(fake.started[0]!.sequence).toEqual(FRAMES.map((each) => each.key));
    expect(fake.started[0]!.references).toEqual([0]);
  });

  it("sends stream_window_size, the last setting nothing read", async () => {
    // RULE-026. The browser sends it; the service decides whether streaming applies at all, since
    // only it knows the sequence it ends up with.
    const fake = fakeClient({});
    show(fake);

    fireEvent.click(propagate());

    await waitFor(() => expect(fake.started).toHaveLength(1));
    expect(fake.started[0]!.window).toBe(250);
  });

  it("streams by default, and sends Streaming off when it is unticked (RULE-026)", async () => {
    const fake = fakeClient({});
    show(fake);

    fireEvent.click(propagate());
    await waitFor(() => expect(fake.started).toHaveLength(1));
    expect(fake.started[0]!.streaming).toBe(true);
  });

  describe("the range (SP-46)", () => {
    /*
     * Legacy's Range spinboxes: 1-based, the whole timeline by default and whenever the frame
     * count changes, sent as positions, and not sent at the defaults, which mean no limit
     * (sequence_widget.py:318-331, 643-647, 667-679; main_window.py:4369-4378). The web had none.
     */
    const start = () => screen.getByLabelText("Start frame") as HTMLInputElement;
    const end = () => screen.getByLabelText("End frame") as HTMLInputElement;

    it("starts at the whole timeline, 1 to N, and sends no limit then", async () => {
      const fake = fakeClient({});
      show(fake);

      expect([start().value, end().value]).toEqual(["1", "4"]);
      fireEvent.click(propagate());

      await waitFor(() => expect(fake.started).toHaveLength(1));
      expect(fake.started[0]!.start).toBeUndefined();
      expect(fake.started[0]!.end).toBeUndefined();
    });

    it("sends the range set, as 0-based positions", async () => {
      const fake = fakeClient({});
      show(fake);

      fireEvent.change(start(), { target: { value: "2" } });
      fireEvent.change(end(), { target: { value: "3" } });
      fireEvent.click(propagate());

      await waitFor(() => expect(fake.started).toHaveLength(1));
      expect(fake.started[0]!.start).toBe(1);
      expect(fake.started[0]!.end).toBe(2);
    });

    it("holds a value to the timeline, as a spinbox does", () => {
      show(fakeClient({}));

      fireEvent.change(end(), { target: { value: "9" } });
      fireEvent.change(start(), { target: { value: "0" } });

      expect([start().value, end().value]).toEqual(["1", "4"]);
    });

    it("goes back to the whole timeline when the frame count changes, as after a trim", () => {
      const fake = fakeClient({});
      const tree = (frames: readonly Frame[]) => (
        <NotificationProvider>
          <SettingsProvider client={fake.client}>
            <HotkeyProvider bindings={defaultSettings().hotkeys}>
              <PropagationControl client={fake.client} frames={frames} />
            </HotkeyProvider>
          </SettingsProvider>
        </NotificationProvider>
      );
      const { rerender } = render(tree(FRAMES));
      fireEvent.change(start(), { target: { value: "2" } });

      rerender(tree(FRAMES.slice(0, 3)));

      expect([start().value, end().value]).toEqual(["1", "3"]);
    });
  });

  it("sends streaming: false once unticked", async () => {
    const fake = fakeClient({});
    show(fake);

    fireEvent.click(screen.getByLabelText("Streaming"));
    fireEvent.click(propagate());

    await waitFor(() => expect(fake.started).toHaveLength(1));
    expect(fake.started[0]!.streaming).toBe(false);
  });

  it("refuses with nothing to carry from", async () => {
    // Legacy runs the whole sequence and writes an empty mask over every frame, which is worse
    // than doing nothing because it looks like work.
    const fake = fakeClient({});
    show(fake, [frame(0), frame(1)]);

    expect(propagate()).toHaveProperty("disabled", true);
    expect(screen.getByText(/Nothing to carry from yet/)).toBeTruthy();
  });

  it("is on the propagate hotkey, which was listed in the schema and bound to nothing", async () => {
    // The reference table says a key is live only when a handler exists for it. This is the
    // handler; before the control existed, `propagate` was one of forty actions the table listed
    // with a key that did nothing.
    const fake = fakeClient({});
    show(fake);

    fireEvent.keyDown(document, { key: defaultSettings().hotkeys["propagate"]!.primary });

    await waitFor(() => expect(fake.started).toHaveLength(1));
  });

  it("sends the user's OWN annotation as the seed", async () => {
    // Legacy seeds with `add_new_mask`, not with clicks. Re-deriving a prompt from someone's
    // polygon and clicking it again gives a mask close to theirs and not theirs.
    const fake = fakeClient({});
    show(fake);

    fireEvent.click(propagate());

    await waitFor(() => expect(fake.started).toHaveLength(1));
    const objects = fake.started[0]!.objects!;
    expect(objects).toHaveLength(1);
    expect(objects[0]!.frame).toBe(0);
    expect(objects[0]!.mask.data.length).toBeGreaterThan(0);
  });

  it("numbers objects with a running counter, as legacy does", async () => {
    // `max(existing_ids, default=0) + 1`. Two annotations on two reference frames are TWO tracked
    // objects, not one refined twice -- legacy makes no attempt to match them across frames.
    const fake = fakeClient({});
    show(fake, [frame(0, true), frame(1, true), frame(2), frame(3)]);

    fireEvent.click(propagate());

    await waitFor(() => expect(fake.started).toHaveLength(1));
    expect(fake.started[0]!.objects!.map((each) => each.objectId)).toEqual([1, 2]);
  });

  it("seeds from a POLYGON, which RULE-023 says legacy silently ignores", async () => {
    // Legacy seeds only from MASK segments: a polygon on the open frame has no mask in memory and
    // is excluded "silently ... until saved and reloaded". The same polygon works after a save,
    // because NPZ, YOLO-Seg and COCO all carry masks -- so the rule is really about WHEN the
    // rasterization happens. Doing it here, with the function the exporters use, means what seeds
    // the run is the same shape the file would have held.
    const fake = fakeClient({});
    show(fake);

    fireEvent.click(propagate());

    await waitFor(() => expect(fake.started).toHaveLength(1));
    // SQUARE is a Polygon. Legacy would carry nothing from it and say nothing.
    expect(fake.started[0]!.objects![0]!.mask.data.length).toBeGreaterThan(0);
  });

  it("REPORTS a reference it could not use instead of seeding from the rest", async () => {
    // A propagation that quietly seeded from one of two references would produce a plausible
    // result that is not the one the user asked for, and nothing on screen would say so.
    const fake = fakeClient({ annotations: { [FRAMES[1]!.key]: [] } });
    show(fake, [frame(0, true), frame(1, true), frame(2)]);

    fireEvent.click(propagate());

    expect(await screen.findByText(/no annotations to carry/)).toBeTruthy();
    await waitFor(() => expect(fake.started).toHaveLength(1));
    expect(fake.started[0]!.objects).toHaveLength(1);
  });

  it("will not start at all when NO reference could be used", async () => {
    // Legacy starts anyway and writes an empty mask over every frame in the sequence -- work that
    // looks like work and undoes the user's.
    const fake = fakeClient({ annotations: { [FRAMES[0]!.key]: [] } });
    show(fake);

    fireEvent.click(propagate());

    expect(await screen.findByText(/no annotations to carry/)).toBeTruthy();
    expect(fake.started).toHaveLength(0);
  });

  it("shows progress against the total the job reports", async () => {
    const fake = fakeClient({
      start: () => job({ completed: 0, total: 4 }),
      poll: () => job({ state: "running", completed: 2, cursor: 2 }),
    });
    show(fake);

    fireEvent.click(propagate());

    expect(await screen.findByText(/Propagating — 2 of 4 frames/)).toBeTruthy();
  });
});

describe("watching it", () => {
  it("polls from the cursor it was last given, not from zero", async () => {
    // The whole point of a cursor. Refetching would re-send every mask on every tick, and a
    // 600-frame propagation would spend more time sending results than producing them.
    const fake = fakeClient({
      start: () => job({ cursor: 0 }),
      poll: (call) =>
        call === 0
          ? job({ state: "running", completed: 2, cursor: 2 })
          : job({ state: "completed", completed: 4, cursor: 4 }),
    });
    show(fake);

    fireEvent.click(propagate());

    await waitFor(() => expect(fake.polls.length).toBeGreaterThanOrEqual(2));
    expect(fake.polls[0]!.cursor).toBe(0);
    expect(fake.polls[1]!.cursor).toBe(2);
  });

  it("stops polling once the job finishes", async () => {
    const fake = fakeClient({ poll: () => job({ state: "completed", completed: 4, cursor: 4 }) });
    show(fake);

    fireEvent.click(propagate());
    await screen.findByText(/Propagated 4 frames/);
    const settled = fake.polls.length;

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(fake.polls.length).toBe(settled);
  });

  it("offers Save for the frames already committed while the run goes on, as legacy's Save All does (SP-38)", async () => {
    // Legacy's Save All is enabled during a run and writes what is committed (main_window.py:3297-3305).
    // The web offered it only once the run had finished.
    const fake = fakeClient({
      poll: () =>
        job({
          state: "running",
          completed: 2,
          cursor: 2,
          results: [
            { source: FRAMES[1]!.key, objectId: 1, mask: MASK, confidence: 0.999 },
            { source: FRAMES[2]!.key, objectId: 1, mask: MASK, confidence: 0.999 },
          ],
        }),
    });
    show(fake);

    fireEvent.click(propagate());

    // Frame 1 is committed; frame 2, the newest, is not yet.
    expect(await screen.findByRole("button", { name: /Save 1 frame/ }, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("reports each frame's confidence as the MINIMUM over its objects", async () => {
    // RULE-016 scores each object; RULE-060 flags a FRAME. Two objects on one frame at 0.9 and
    // 0.4 make it a 0.4 frame -- the worst object is the reason a human has to look.
    const fake = fakeClient({
      poll: () =>
        job({
          state: "completed",
          completed: 1,
          cursor: 2,
          results: [
            { source: FRAMES[1]!.key, objectId: 1, mask: MASK, confidence: 0.9 },
            { source: FRAMES[1]!.key, objectId: 2, mask: MASK, confidence: 0.4 },
          ],
        }),
    });
    const { onScores } = show(fake);

    fireEvent.click(propagate());

    await waitFor(() => {
      const last = onScores.mock.calls.at(-1)?.[0] as Record<number, number>;
      expect(last[1]).toBeCloseTo(0.4);
    });
  });

  it("DROPS an empty object from the minimum rather than counting it as zero", async () => {
    // RULE-016 gives an all-negative object a score of 0 too, and the two mean opposite things.
    const fake = fakeClient({
      poll: () =>
        job({
          state: "completed",
          completed: 1,
          cursor: 2,
          results: [
            { source: FRAMES[1]!.key, objectId: 1, mask: MASK, confidence: 0.8 },
            { source: FRAMES[1]!.key, objectId: 2, mask: EMPTY_MASK, confidence: 0 },
          ],
        }),
    });
    const { onScores } = show(fake);

    fireEvent.click(propagate());

    await waitFor(() => {
      const last = onScores.mock.calls.at(-1)?.[0] as Record<number, number>;
      expect(last[1]).toBeCloseTo(0.8);
    });
  });

  it("names the frames that produced no mask at all", async () => {
    // RULE-060 never commits these and they keep their previous status. "The model lost the object
    // here" and "this frame scored badly" look identical on a grey timeline otherwise.
    const fake = fakeClient({
      poll: () =>
        job({
          state: "completed",
          completed: 1,
          cursor: 1,
          results: [
            { source: FRAMES[2]!.key, objectId: 1, mask: EMPTY_MASK, confidence: 0 },
          ],
        }),
    });
    show(fake);

    fireEvent.click(propagate());

    expect(await screen.findByText(/1 frame produced no mask at all/)).toBeTruthy();
  });

  it("shows a failure with the reason, not as a short success", async () => {
    // Legacy's `except Exception: return` makes a run that died on frame 40 of 200 look like a run
    // that was 39 frames long.
    const fake = fakeClient({
      poll: () =>
        job({ state: "failed", completed: 2, cursor: 2, error: "CUDA out of memory" }),
    });
    show(fake);

    fireEvent.click(propagate());

    expect(await screen.findByText(/Failed after 2 frames/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("CUDA out of memory");
  });

  it("surfaces a 410 rather than quietly resuming from a later cursor", async () => {
    // A gap the client cannot see is the failure mode this project keeps finding.
    const fake = fakeClient({
      poll: () => {
        throw new Error("results from cursor 0 are no longer buffered; the earliest held is 15");
      },
    });
    show(fake);

    fireEvent.click(propagate());

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/no longer buffered/),
    );
  });
});

describe("stopping it", () => {
  it("asks the service to cancel and says so while the frame in flight finishes", async () => {
    const fake = fakeClient({
      start: () => job({ state: "running" }),
      poll: () => job({ state: "running", completed: 1, cursor: 1 }),
      cancel: () => job({ state: "running", completed: 1, cancelling: true }),
    });
    show(fake);
    fireEvent.click(propagate());

    const cancel = await screen.findByRole("button", { name: "Cancel" });
    fireEvent.click(cancel);

    await waitFor(() => expect(fake.cancels).toEqual(["job-1"]));
    // "Stopping…", not "stopped": a control that jumped straight to stopped would be lying for
    // the half second the in-flight frame takes.
    expect(await screen.findByRole("button", { name: "Stopping…" })).toBeTruthy();
  });

  it("reports what the cancel KEPT, because that is RULE-063's promise", async () => {
    const stopped = job({
      state: "cancelled",
      completed: 3,
      error: "cancelled after 3 frames; those frames are kept",
    });
    // As the service does: once cancelled, a poll reports the cancelled job too.
    let cancelled = false;
    const fake = fakeClient({
      poll: () => (cancelled ? stopped : job({ state: "running" })),
      cancel: () => {
        cancelled = true;
        return stopped;
      },
    });
    show(fake);
    fireEvent.click(propagate());

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(await screen.findByText(/Stopped after 3 frames/)).toBeTruthy();
    expect(screen.getByText(/those frames are kept/)).toBeTruthy();
  });

  it("says 1 frame, not 1 frames", async () => {
    // A real run on 2026-09-23 read "Stopped after 1 frames".
    const stopped = job({ state: "cancelled", completed: 1, error: "cancelled after 1 frame; that frame is kept" });
    let cancelled = false;
    const fake = fakeClient({
      poll: () => (cancelled ? stopped : job({ state: "running" })),
      cancel: () => {
        cancelled = true;
        return stopped;
      },
    });
    show(fake);
    fireEvent.click(propagate());

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(await screen.findByText(/Stopped after 1 frame\b(?!s)/)).toBeTruthy();
  });

  it("does not treat a cancel as a failure", async () => {
    // The service puts its "what was kept" sentence in `error`, and a control that rendered every
    // non-null `error` as an alert would paint a successful stop red.
    const stopped = job({ state: "cancelled", completed: 3, error: "cancelled after 3 frames; kept" });
    let cancelled = false;
    const fake = fakeClient({
      poll: () => (cancelled ? stopped : job({ state: "running" })),
      cancel: () => {
        cancelled = true;
        return stopped;
      },
    });
    show(fake);
    fireEvent.click(propagate());

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await screen.findByText(/Stopped after 3 frames/);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("collects every frame the service kept, not only those polled before the cancel", async () => {
    /*
     * Found in a real run on 2026-09-23: the service kept 42 frames and the timeline showed 39.
     * The cancel answer is a snapshot -- state, no results -- carrying the job's LATEST cursor, and
     * taking it moved the browser's cursor past frames it had never been sent.
     */
    const result = (n: number) => ({ source: FRAMES[n]!.key, objectId: 1, mask: MASK, confidence: 0.99 });
    let cancelled = false;
    const fake = fakeClient({
      start: () => job({ state: "running" }),
      poll: (_call, cursor) =>
        cancelled
          ? job({
              state: "cancelled",
              completed: 3,
              cursor: 3,
              error: "cancelled after 3 frames; those frames are kept",
              results: cursor <= 1 ? [result(2), result(3)] : [],
            })
          : job({ state: "running", completed: 1, cursor: 1, results: cursor === 0 ? [result(1)] : [] }),
      cancel: () => {
        cancelled = true;
        return job({ state: "running", completed: 3, cursor: 3, cancelling: true });
      },
    });
    const { onScores } = show(fake);
    fireEvent.click(propagate());
    await waitFor(() => expect(fake.polls.length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await screen.findByText(/Stopped after 3 frames/, {}, { timeout: 3000 });
    // Asked from where this browser was, not from the snapshot's cursor.
    expect(fake.polls.at(-1)!.cursor).toBe(1);
    // Every kept frame reached the timeline, the last two included.
    await waitFor(() => expect(Object.keys(onScores.mock.calls.at(-1)![0]).sort()).toEqual(["1", "2", "3"]));
  });

  it("clears a finished job so the panel can start again", async () => {
    const fake = fakeClient({ poll: () => job({ state: "completed", completed: 4, cursor: 4 }) });
    show(fake);
    fireEvent.click(propagate());
    await screen.findByText(/Propagated 4 frames/);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.queryByText(/Propagated 4 frames/)).toBeNull();
    expect(propagate()).toHaveProperty("disabled", false);
  });
});


describe("RULE-056: not losing propagated work without asking", () => {
  /**
   * Legacy's New Timeline wipes references, statuses and unsaved propagated masks without a word,
   * and the current frame is not saved either. Decision 7 is the standing answer to that whole
   * family -- nothing is lost without the user being asked -- and a propagation is the most
   * expensive work in this app to lose: minutes of GPU time with nothing on disk to show for it.
   *
   * Driven through the PANEL rather than the control, because the panel owns the button that
   * would do the throwing away.
   */
  const FOLDER = [
    { key: "frames/f01.png", name: "f01.png", sidecars: {}, annotated: true, sharesSidecarsWith: [] },
    { key: "frames/f02.png", name: "f02.png", sidecars: {}, annotated: false, sharesSidecarsWith: [] },
    { key: "frames/f03.png", name: "f03.png", sidecars: {}, annotated: false, sharesSidecarsWith: [] },
  ];

  const SQUARE: WireSegment = {
    type: "Polygon",
    classId: 0,
    vertices: [[1, 1], [6, 1], [6, 6], [1, 6]],
  };

  function panel(
    confirmDiscard: (message: string) => boolean,
    inPanel = false,
    /** The open image's annotations as the shell hands them down from the store. */
    openAnnotations?: OpenAnnotations,
    /**
     * The rest of the run: the settings the user changed from the defaults, what the reference's
     * file holds, what the propagation carries onto f02, and what a frame opened from the timeline
     * is handed.
     */
    run: {
      readonly values?: Readonly<Record<string, unknown>>;
      readonly segments?: readonly WireSegment[];
      readonly results?: readonly WirePropagationFrame[];
      readonly onOpen?: (key: string, segments?: readonly WireSegment[]) => void;
      readonly onReviewLookup?: (lookup: (key: string) => readonly WireSegment[] | undefined) => void;
      /** The Sequence tab is not the one in use. */
      readonly inactive?: boolean;
      /**
       * The start answers after a task, as a real request does, so React renders in between. The
       * fake's own answer arrives in a microtask, before any render.
       */
      readonly slowStart?: boolean;
      /** The frames the job reports it left out, measured against an 8x8 reference. */
      readonly leftOut?: readonly string[];
    } = {},
  ) {
    /** Every request Propagate sent, as `fakeClient` records them. */
    const started: WirePropagationStart[] = [];
    /** Every request Save All sent, with the image it was for. */
    const saved: { key: string; request: WireSaveRequest }[] = [];
    const client = {
      getSettings: async () => {
        const defaults = defaultSettings();
        return { ...defaults, values: { ...defaults.values, ...run.values } };
      },
      putSettings: async (next: unknown) => next,
      imageMetadata: async () => ({
        width: 8,
        height: 8,
        sourceDepth: 8,
        sourceChannels: 3,
        sourceFormat: "png",
      }),
      loadAnnotations: async (_p: string, key: string) => ({
        kind: "loaded",
        annotations: {
          sourceFormat: "NPZ",
          sourceFile: key,
          revision: "r1",
          segments: run.segments ?? [SQUARE],
          classAliases: {},
          failures: [],
        },
      }),
      // What Skip Labeled reads when Propagate is pressed: the folder as it stands then.
      listImages: async () => ({
        folder: "frames",
        folders: [],
        annotatedCount: 1,
        unrecognized: 0,
        columns: [],
        images: FOLDER,
      }),
      startPropagation: async (request: WirePropagationStart) => {
        started.push(request);
        if (run.slowStart === true) await new Promise((resolve) => setTimeout(resolve, 20));
        return job({ state: "running" });
      },
      propagationState: async () =>
        job({
          state: "completed",
          completed: 1,
          cursor: 1,
          results: run.results ?? [
            { source: "frames/f02.png", objectId: 1, mask: MASK, confidence: 0.999 },
          ],
          ...(run.leftOut === undefined
            ? {}
            : {
                skipped: run.leftOut.map((source) => ({
                  source,
                  reason: "its size 9x9 is not the reference's 8x8",
                })),
                referenceSize: { width: 8, height: 8 },
              }),
        }),
      saveAnnotations: async (_p: string, key: string, request: WireSaveRequest) => {
        saved.push({ key, request });
        return { written: [], stale: [], skippedEmpty: [] };
      },
    } as unknown as ApiClient;

    const tree = (saves?: ReadonlyMap<string, number>, open = openAnnotations) => {
      const timeline = (
        <TimelinePanel
          images={FOLDER as never}
          client={client}
          confirmDiscard={confirmDiscard}
          {...(saves === undefined ? {} : { savedElsewhere: saves })}
          {...(open === undefined ? {} : { openAnnotations: open })}
          {...(run.onOpen === undefined ? {} : { onOpen: run.onOpen })}
          {...(run.onReviewLookup === undefined ? {} : { onReviewLookup: run.onReviewLookup })}
        />
      );
      const placed = run.inactive === true
        ? <SequenceActiveContext.Provider value={false}>{timeline}</SequenceActiveContext.Provider>
        : timeline;
      return (
        <NotificationProvider>
          <NotificationHost />
          <SettingsProvider client={client}>
            <HotkeyProvider bindings={defaultSettings().hotkeys}>
              {inPanel ? <Panel title="Sequence">{placed}</Panel> : placed}
            </HotkeyProvider>
          </SettingsProvider>
        </NotificationProvider>
      );
    };
    const result = render(tree());
    // The ordinary save's counts, as the shell hands them down from the store.
    return {
      withSaves: (saves: ReadonlyMap<string, number>) => result.rerender(tree(saves)),
      /** Another image opened: the shell hands down its annotations and class names instead. */
      withOpen: (open: OpenAnnotations) => result.rerender(tree(undefined, open)),
      started,
      saved,
    };
  }

  /** What the browser does before a tab closes: returns true when the page asked it to ask. */
  function closeTab(): boolean {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  async function propagateAndWait() {
    fireEvent.click(screen.getByText("Build timeline"));
    // Building marks nothing since 2026-09-23, as in legacy: the reference is marked as a user marks it.
    fireEvent.click(screen.getByRole("button", { name: "+ All Labeled" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Timeline").querySelectorAll("button")).toHaveLength(3),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));
    await screen.findByRole("button", { name: /Save 1 frame/ }, { timeout: 3000 });
  }

  /** A mask on an 8x8 frame covering columns and rows `from` to `to`, `to` excluded. */
  function square(from: number, to: number): WireMask {
    const data = new Uint8Array(64);
    for (let y = from; y < to; y += 1) for (let x = from; x < to; x += 1) data[y * 8 + x] = 1;
    return encodeMask({ height: 8, width: 8, data });
  }

  /**
   * The mask tensor the API writes for a save request: NPZ's array, and what every other format is
   * drawn from. Built as the API builds it (api/src/app.ts:817-822, an absent pixelPriority read as
   * off at 1042-1044), by the same library call.
   */
  function writtenTensor(request: WireSaveRequest): MaskTensor {
    const segments = request.segments.map(decodeSegment);
    const classOrder = [
      ...new Set(segments.map((each) => each.classId).filter((id): id is number => id !== null)),
    ].sort((a, b) => a - b);
    return createFinalMaskTensor(segments, request.imageSize, classOrder, {
      enabled: request.pixelPriority?.enabled === true,
      ascending: request.pixelPriority?.ascending !== false,
    });
  }

  /** The classes a written tensor gives the pixel at column x, row y. */
  function classesAt(tensor: MaskTensor, x: number, y: number): number[] {
    const channels = tensor.classOrder.length;
    return tensor.classOrder.filter(
      (_, channel) => tensor.data[(y * tensor.width + x) * channels + channel] === 1,
    );
  }

  it("ASKS before a New timeline throws propagated frames away", async () => {
    const confirm = vi.fn((_message: string) => false);
    panel(confirm);
    await propagateAndWait();

    fireEvent.click(screen.getByText("New timeline"));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toMatch(/1 propagated frame has not been saved/);
  });

  it("keeps the timeline when the answer is no", async () => {
    panel(() => false);
    await propagateAndWait();

    fireEvent.click(screen.getByText("New timeline"));

    // Still a timeline, not the range picker.
    expect(screen.getByLabelText("Timeline")).toBeTruthy();
  });

  it("starts over when the answer is yes", async () => {
    panel(() => true);
    await propagateAndWait();

    fireEvent.click(screen.getByText("New timeline"));

    expect(await screen.findByText("Build timeline")).toBeTruthy();
  });

  it("does NOT ask when there is nothing to lose", async () => {
    // A confirmation that always appears is one people learn to dismiss without reading, which
    // makes it useless on the day it matters.
    const confirm = vi.fn((_message: string) => true);
    panel(confirm);
    fireEvent.click(screen.getByText("Build timeline"));
    // Building marks nothing since 2026-09-23, as in legacy: the reference is marked as a user marks it.
    fireEvent.click(screen.getByRole("button", { name: "+ All Labeled" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Timeline").querySelectorAll("button")).toHaveLength(3),
    );

    fireEvent.click(screen.getByText("New timeline"));

    expect(confirm).not.toHaveBeenCalled();
  });

  /*
   * The two ways the work was lost with no question at all (found 2026-09-23). The close guard
   * looked only at open images, and a panel UNMOUNTED what it held when collapsed -- so closing
   * the tab, or collapsing the Sequence panel for room, threw the whole propagation away.
   */

  it("does not ask on a first run, when there is nothing to lose", async () => {
    const confirm = vi.fn((_message: string) => false);
    panel(confirm);

    await propagateAndWait();

    expect(confirm).not.toHaveBeenCalled();
  });

  it("ASKS before Propagate runs again over unsaved frames, and keeps them on a no", async () => {
    const confirm = vi.fn((_message: string) => false);
    panel(confirm);
    await propagateAndWait();

    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toMatch(/1 propagated frame has not been saved. Propagating again/);
    expect(screen.getByRole("button", { name: /Save 1 frame/ })).toBeTruthy();
  });

  it("leaves a frame the user corrected and saved to them: Save All does not write over it", async () => {
    // Legacy drops a saved frame's stored masks, so its Save All skips it. Here the run kept them,
    // and Save All wrote them over the user's correction (SEQUENCE_PARITY.md SP-02).
    const { withSaves } = panel(() => true);
    const everyFrame = (count: number) => new Map(FOLDER.map((image) => [image.key, count] as const));
    withSaves(everyFrame(1)); // saves made BEFORE the run are not corrections of it
    await propagateAndWait();
    expect(screen.getByRole("button", { name: /Save 1 frame/ })).toBeTruthy();

    withSaves(everyFrame(2)); // the user saves the propagated frame by hand after the run

    await waitFor(() => expect(screen.queryByRole("button", { name: /Save \d+ frames?/ })).toBeNull());
  });

  it("keeps what Save All writes, and asking before losing it, when Clear flags repaints", async () => {
    // Legacy's Clear Flags only repaints: Save All still writes every propagated, unflagged frame
    // (main_window.py:3457-3478). Here it emptied Save All and silenced every guard with it
    // (SEQUENCE_PARITY.md SP-03).
    panel(() => true);
    await propagateAndWait();
    // The flags a user clears are the ones on screen: the run's scores have reached the timeline.
    await screen.findByRole("button", { name: "Frame 2, frames/f02.png, propagated" });

    fireEvent.click(screen.getByRole("button", { name: "Clear flags" }));

    // Still a repaint, as in legacy...
    expect(screen.getByRole("button", { name: "Frame 2, frames/f02.png, pending" })).toBeTruthy();
    // ...and nothing more.
    expect(screen.getByRole("button", { name: /Save 1 frame/ })).toBeTruthy();
    expect(closeTab()).toBe(true);
  });

  it("seeds a reference frame that is OPEN from its unsaved edits, not from its file", async () => {
    // Legacy reads the open frame's segments from memory (main_window.py:3649-3656): draw on a
    // frame, mark it, propagate, with no save between. Read from the file, an edited reference
    // propagated what it held before the edit (SEQUENCE_PARITY.md SP-04). The file still holds
    // SQUARE; on screen the user has redrawn it smaller and not saved.
    const redrawn: WireSegment = {
      type: "Polygon",
      classId: 0,
      vertices: [[2, 2], [4, 2], [4, 4], [2, 4]],
    };
    const { started } = panel(() => true, false, { key: "frames/f01.png", segments: [redrawn] });

    await propagateAndWait();

    // One seed, and it is the square on screen: SQUARE's would be [1, 1, 7, 7].
    expect(started[0]!.objects!.map((each) => each.mask.box)).toEqual([[2, 2, 5, 5]]);
  });

  it("writes each class under the name the OPEN image gave it at Propagate, as legacy does", async () => {
    // Legacy names each seed's class from the open frame's aliases when Propagate is pressed
    // (main_window.py:4277-4280), and Save All writes a frame's classes under those names, and only
    // its own classes (4776, 4787-4799). Here it sent no names, so a class the user called "car"
    // was written as "0" (SEQUENCE_PARITY.md SP-05). The names are the ones on screen, unsaved: the
    // reference's file names nothing.
    const { withOpen, saved } = panel(() => true, false, {
      key: "frames/f01.png",
      segments: [SQUARE],
      classAliases: { "0": "car", "3": "bus" },
    });
    await propagateAndWait();
    // Reviewing the propagated frame puts that frame's names in the store; it has none. The run's
    // names were fixed when it began, as legacy's are.
    withOpen({ key: "frames/f02.png", segments: [], classAliases: {} });

    fireEvent.click(screen.getByRole("button", { name: /Save 1 frame/ }));
    await screen.findByText(/Saved 1 frame/);

    expect(saved.map((each) => each.key)).toEqual(["frames/f02.png"]);
    expect(saved[0]!.request.classAliases).toEqual({ "0": "car" });
  });

  it("writes a class the open image never named under its id, never legacy's \"Class N\"", async () => {
    // Legacy writes "Class 0" here (main_window.py:4278-4280). RULE-082's answer: "Class N" is
    // display text and never belongs in a file.
    const { saved } = panel(() => true, false, {
      key: "frames/f01.png",
      segments: [SQUARE],
      classAliases: {},
    });
    await propagateAndWait();

    fireEvent.click(screen.getByRole("button", { name: /Save 1 frame/ }));
    await screen.findByText(/Saved 1 frame/);

    expect(saved[0]!.request.classAliases).toEqual({});
  });

  it.each([
    { order: "ascending", ascending: true, winner: 0 },
    { order: "descending", ascending: false, winner: 3 },
  ])(
    "gives a pixel two classes share to one of them by pixel priority, $order, as legacy does",
    async ({ ascending, winner }) => {
      // Legacy's Save All is its ordinary save (main_window.py:4813), which with pixel priority on
      // gives a pixel two classes both cover to the lower class id, or descending to the higher
      // (save_export_manager.py:405-410; segment_manager.py:317-373). Here Save All sent no
      // pixelPriority, the API took it as off, and the pixel was written to both classes
      // (SEQUENCE_PARITY.md SP-06).
      const { saved } = panel(() => true, false, undefined, {
        values: { pixel_priority_enabled: true, pixel_priority_ascending: ascending },
        // Class 0 and class 3 on the reference, carried onto f02 overlapping in a 2x2 block.
        segments: [
          { type: "Polygon", classId: 0, vertices: [[1, 1], [4, 1], [4, 4], [1, 4]] },
          { type: "Polygon", classId: 3, vertices: [[3, 3], [6, 3], [6, 6], [3, 6]] },
        ],
        results: [
          { source: "frames/f02.png", objectId: 1, mask: square(1, 5), confidence: 0.999 },
          { source: "frames/f02.png", objectId: 2, mask: square(3, 7), confidence: 0.999 },
        ],
      });
      await propagateAndWait();

      fireEvent.click(screen.getByRole("button", { name: /Save 1 frame/ }));
      await screen.findByText(/Saved 1 frame/);

      const tensor = writtenTensor(saved[0]!.request);
      expect(tensor.classOrder).toEqual([0, 3]);
      // Each pixel both cover goes to one class...
      for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]] as const) {
        expect(classesAt(tensor, x, y), `pixel (${x}, ${y})`).toEqual([winner]);
      }
      // ...and neither loses a pixel it alone covers.
      expect(classesAt(tensor, 1, 1)).toEqual([0]);
      expect(classesAt(tensor, 6, 6)).toEqual([3]);
    },
  );

  /*
   * SP-07. Legacy merges a propagated frame's masks into one "Loaded" segment per class when it
   * opens the frame (main_window.py:3597-3606; segment_manager.py:97-172), so two touching objects
   * of one class are saved as one box. Its Save All merges nothing (4776-4807). Here objects 1 and
   * 2 are class 0 and overlap on f02, and object 3 is class 3.
   */
  const THREE_SEEDS: readonly WireSegment[] = [
    { type: "Polygon", classId: 0, vertices: [[1, 1], [3, 1], [3, 3], [1, 3]] },
    { type: "Polygon", classId: 0, vertices: [[4, 1], [6, 1], [6, 3], [4, 3]] },
    { type: "Polygon", classId: 3, vertices: [[1, 5], [3, 5], [3, 7], [1, 7]] },
  ];
  const THREE_CARRIED: readonly WirePropagationFrame[] = [
    { source: "frames/f02.png", objectId: 1, mask: square(1, 4), confidence: 0.999 },
    { source: "frames/f02.png", objectId: 2, mask: square(3, 6), confidence: 0.999 },
    { source: "frames/f02.png", objectId: 3, mask: square(6, 8), confidence: 0.999 },
  ];

  /** The pixels of two masks on an 8x8 frame, as one mask. */
  function union(a: WireMask, b: WireMask): WireMask {
    const right = decodeMask(b).data;
    return encodeMask({
      height: 8,
      width: 8,
      data: decodeMask(a).data.map((value, pixel) => value | right[pixel]!),
    });
  }

  it("opens a visited propagated frame with ONE segment per class, as legacy does", async () => {
    const onOpen = vi.fn((_key: string, _segments?: readonly WireSegment[]) => {});
    panel(() => true, false, undefined, { segments: THREE_SEEDS, results: THREE_CARRIED, onOpen });
    await propagateAndWait();

    fireEvent.click(await screen.findByRole("button", { name: "Frame 2, frames/f02.png, propagated" }));

    const [key, segments] = onOpen.mock.calls.at(-1)!;
    expect(key).toBe("frames/f02.png");
    // Class 0's two objects as one segment, their union, and class 3's still its own: two, not three.
    expect(segments?.map((each) => [each.type, each.classId])).toEqual([
      ["Loaded", 0],
      ["Loaded", 3],
    ]);
    expect(segments?.[0]?.mask).toEqual(union(square(1, 4), square(3, 6)));
    expect(segments?.[1]?.mask).toEqual(square(6, 8));
  });

  it("still writes one segment per object with Save All after the visit, as legacy does", async () => {
    const { saved } = panel(() => true, false, undefined, {
      segments: THREE_SEEDS,
      results: THREE_CARRIED,
      onOpen: () => {},
    });
    await propagateAndWait();
    fireEvent.click(await screen.findByRole("button", { name: "Frame 2, frames/f02.png, propagated" }));

    fireEvent.click(screen.getByRole("button", { name: /Save 1 frame/ }));
    await screen.findByText(/Saved 1 frame/);

    expect(saved[0]!.request.segments.map((each) => [each.type, each.classId])).toEqual([
      ["AI", 0],
      ["AI", 0],
      ["AI", 3],
    ]);
  });

  it("offers the Save beside the timeline bar, where legacy's Save All is", async () => {
    panel(() => true);
    await propagateAndWait();

    const save = screen.getByRole("button", { name: /Save 1 frame/ });
    // Drawn into the bar's row through a portal: still the propagation control's button.
    expect(save.closest(".timeline__bar-row")).not.toBeNull();
    expect(save.closest(".timeline__bar-row")?.querySelector("[aria-label='Timeline']")).not.toBeNull();
  });

  it("ASKS before Clear throws unsaved frames away, and keeps them on a no", async () => {
    const confirm = vi.fn((_message: string) => false);
    panel(confirm);
    await propagateAndWait();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(confirm.mock.calls[0]![0]).toMatch(/1 propagated frame has not been saved. Clearing/);
    expect(screen.getByRole("button", { name: /Save 1 frame/ })).toBeTruthy();
  });

  it("DISCARDS the run on a yes: nothing left to ask about, the timeline pending, no mask to review", async () => {
    /*
     * Found 2026-09-25: Clear asked and, on a yes, discarded nothing. It emptied the hook's masks
     * while the control's per-frame commits -- what the unsaved count, the review segments and the
     * paint are built from -- survived. The tab still asked on close, frame 2 stayed propagated
     * with its score, and opening it still showed the run's mask.
     *
     * Legacy has no Clear (SEQUENCE_PARITY.md SP-57). Its clear before each new run is the meaning
     * given to this one: masks and scores gone, every frame but a reference or a skipped one
     * pending again (sequence_view_mode.py:143-159).
     */
    const confirm = vi.fn((_message: string) => true);
    const opened: { key: string; segments: readonly WireSegment[] | undefined }[] = [];
    panel(confirm, false, undefined, { onOpen: (key, segments) => opened.push({ key, segments }) });
    await propagateAndWait();
    const propagated = await screen.findByRole("button", { name: "Frame 2, frames/f02.png, propagated" });
    expect(propagated.title).toMatch(/confidence/);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(confirm).toHaveBeenCalledTimes(1);

    const pending = await screen.findByRole("button", { name: "Frame 2, frames/f02.png, pending" });
    expect(pending.title).not.toMatch(/confidence/);
    expect(screen.queryByRole("button", { name: /Save 1 frame/ })).toBeNull();
    expect(closeTab()).toBe(false);

    // Opening the frame shows its file: no run's mask is handed over with it.
    fireEvent.click(pending);
    expect(opened.at(-1)).toEqual({ key: "frames/f02.png", segments: undefined });

    // Nothing is left for New timeline to ask about.
    fireEvent.click(screen.getByText("New timeline"));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("opens a frame Save All wrote from its FILE, not from the run's masks (SP-23)", async () => {
    /*
     * Legacy's mark_frame_saved drops a saved frame's stored masks (sequence_view_mode.py:365-373),
     * so a revisit loads what was written. Here the run kept them after Save All, and the frame
     * reopened with them, marked unsaved -- and asked, or with Auto-Save on wrote it again, on
     * leaving.
     */
    const opened: { key: string; segments: readonly WireSegment[] | undefined }[] = [];
    panel(() => true, false, undefined, { onOpen: (key, segments) => opened.push({ key, segments }) });
    await propagateAndWait();

    fireEvent.click(screen.getByRole("button", { name: /Save 1 frame/ }));
    await screen.findByText(/Saved 1 frame/);
    fireEvent.click(await screen.findByRole("button", { name: "Frame 2, frames/f02.png, saved" }));

    expect(opened.at(-1)).toEqual({ key: "frames/f02.png", segments: undefined });
  });

  it("hands the shell the run's masks for a frame opened from the list or with Left/Right (SP-22)", async () => {
    /*
     * Legacy sends a sequence frame chosen in the file list, or reached with Left/Right, through
     * frame selection, so its propagated masks show (right_panel.py:208, 329-335;
     * main_window.py:1447-1455, 3591-3606). The web opened those from the file. The timeline now
     * hands the shell a lookup for exactly what a click on the frame opens with.
     */
    let lookup: (key: string) => readonly WireSegment[] | undefined = () => undefined;
    panel(() => true, false, undefined, {
      onReviewLookup: (given) => { lookup = given; },
      results: [{ source: "frames/f02.png", objectId: 1, mask: square(2, 5), confidence: 0.999 }],
    });
    await propagateAndWait();

    await waitFor(() => expect(lookup("frames/f02.png")).toHaveLength(1));
    // The reference is the user's own drawing and opens as its file; a stranger is not the run's.
    expect(lookup("frames/f01.png")).toBeUndefined();
    expect(lookup("elsewhere/x.png")).toBeUndefined();
  });

  it("hands the shell nothing while the Sequence tab is not the one in use", async () => {
    // Legacy's other modes have no timeline: the list opens the file there.
    let lookup: (key: string) => readonly WireSegment[] | undefined = () => [];
    panel(() => true, false, undefined, {
      inactive: true,
      onReviewLookup: (given) => { lookup = given; },
      results: [{ source: "frames/f02.png", objectId: 1, mask: square(2, 5), confidence: 0.999 }],
    });
    await propagateAndWait();

    expect(lookup("frames/f02.png")).toBeUndefined();
  });

  it("counts a SECOND run's frames as unsaved, even where the first run's were saved", async () => {
    /*
     * Found in a real browser on 2026-09-23: the set of frames written was never cleared, so once
     * a Save All had written a frame, every later run's mask for it counted as saved -- no Save
     * button to write the new masks, and no question before New timeline, Clear or a closed tab
     * threw them away.
     */
    const confirm = vi.fn((_message: string) => false);
    panel(confirm);
    await propagateAndWait();
    fireEvent.click(screen.getByRole("button", { name: /Save 1 frame/ }));
    await screen.findByText(/Saved 1 frame/);

    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));

    expect(await screen.findByRole("button", { name: /Save 1 frame/ }, { timeout: 3000 })).toBeTruthy();
    fireEvent.click(screen.getByText("New timeline"));
    expect(confirm.mock.calls.at(-1)![0]).toMatch(/1 propagated frame has not been saved/);
  });

  it("paints a second run whose scores are the first run's, rather than leaving its frames pending", async () => {
    /*
     * Found in a real GPU run on 2026-09-26: Propagate, then Propagate again with the same references.
     * The render after the second start re-committed the FIRST run's masks, so the scores handed up
     * never changed, and the timeline, cleared for the new run, was never painted again: its frames
     * showed pending with no confidence, while Save All held them back as committed.
     */
    panel(() => true, false, undefined, { slowStart: true });
    await propagateAndWait();
    const f02 = () => screen.getByLabelText("Timeline").querySelectorAll("button")[1]!;
    await waitFor(() => expect(f02().getAttribute("aria-label")).toMatch(/propagated$/));

    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));
    // The run starts from a cleared timeline...
    await waitFor(() => expect(f02().getAttribute("aria-label")).toMatch(/pending$/));

    // ...and ends painted, with the score it came back with.
    await waitFor(() => expect(f02().getAttribute("aria-label")).toMatch(/propagated$/), { timeout: 3000 });
    expect(f02().getAttribute("title")).toContain("confidence 0.9990");
  });

  it("puts Min Conf and Hist in the propagation row, where legacy's are (SP-47)", async () => {
    // sequence_widget.py:314-406: Range, the checkboxes, Window, Min Conf and Hist, in one row.
    panel(() => true);
    fireEvent.click(screen.getByText("Build timeline"));

    const row = (await screen.findByRole("button", { name: "Hist" })).closest(".timeline__propagation-actions");
    expect(row).not.toBeNull();
    expect(row!.contains(screen.getByLabelText("Minimum confidence"))).toBe(true);
    expect(row!.contains(screen.getByLabelText("Skip labeled"))).toBe(true);
  });

  describe("Min Conf lowered after a run (SP-33)", () => {
    /*
     * Legacy re-flags from its stored results and Save All follows, but its timeline keeps its
     * colours (main_window.py:4718-4723; propagation_manager.py:1254-1268). A frame whose masks went
     * with Keep Flagged Masks off stays red, and Save All has nothing to write for it. The web
     * turned it green, and still wrote nothing.
     */
    const cell = (at: number) => screen.getByLabelText("Timeline").querySelectorAll("button")[at]!;
    const minConf = () => screen.getByLabelText("Minimum confidence") as HTMLInputElement;
    const UNSURE = [{ source: "frames/f02.png", objectId: 1, mask: MASK, confidence: 0.95 }];

    async function propagateUntilDone(keepFlagged = false) {
      fireEvent.click(screen.getByText("Build timeline"));
      fireEvent.click(screen.getByRole("button", { name: "+ All Labeled" }));
      await waitFor(() => expect(cell(0).getAttribute("aria-label")).toMatch(/reference$/));
      if (keepFlagged) fireEvent.click(screen.getByLabelText("Keep flagged masks"));
      fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));
      await screen.findByText("Propagated 1 frame", undefined, { timeout: 3000 });
      await waitFor(() => expect(cell(1).getAttribute("aria-label")).toMatch(/flagged$/));
    }

    it("keeps a frame flagged whose masks were discarded", async () => {
      panel(() => true, false, undefined, { results: UNSURE });
      await propagateUntilDone();

      fireEvent.change(minConf(), { target: { value: "0.9" } });

      await waitFor(() => expect(minConf().value).toBe("0.9"));
      expect(cell(1).getAttribute("aria-label")).toMatch(/flagged$/);
      expect(screen.queryByRole("button", { name: /^Save \d+ frame/ })).toBeNull();
    });

    it("lets a flagged frame whose masks were kept go green, and be saved", async () => {
      // Legacy's Save All then writes it: its engine no longer flags it, and it has its masks.
      panel(() => true, false, undefined, { results: UNSURE });
      await propagateUntilDone(true);

      fireEvent.change(minConf(), { target: { value: "0.9" } });

      await waitFor(() => expect(cell(1).getAttribute("aria-label")).toMatch(/propagated$/));
      expect(await screen.findByRole("button", { name: "Save 1 frame" })).toBeTruthy();
    });
  });

  it("marks the frames the run left out Skipped, brown, and says so as legacy does (SP-25)", async () => {
    // Legacy marks them Skipped and notifies before it propagates (main_window.py:4149-4162;
    // sequence_view_mode.py:586-596). The web left them out silently, and left them pending.
    panel(() => true, false, undefined, { leftOut: ["frames/f03.png"] });
    await propagateAndWait();
    const f03 = () => screen.getByLabelText("Timeline").querySelectorAll("button")[2]!;

    await waitFor(() => expect(f03().getAttribute("aria-label")).toMatch(/skipped$/));
    expect(f03().style.backgroundColor).toBe("rgb(139, 69, 19)");
    expect(
      screen.getByText(
        "1 frames have different dimensions (reference is 8x8) and will be skipped during propagation",
      ),
    ).toBeTruthy();
  });

  it("keeps a left-out frame Skipped through the next run, and says so once per timeline (SP-25)", async () => {
    // Legacy keeps them through each run's reset (sequence_view_mode.py:143-159), and measures, and
    // says so, once until a Build or a Trim (main_window.py:4063, 4149-4162).
    panel(() => true, false, undefined, { leftOut: ["frames/f03.png"], slowStart: true });
    await propagateAndWait();
    const f02 = () => screen.getByLabelText("Timeline").querySelectorAll("button")[1]!;
    const f03 = () => screen.getByLabelText("Timeline").querySelectorAll("button")[2]!;
    await waitFor(() => expect(f03().getAttribute("aria-label")).toMatch(/skipped$/));

    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));
    await waitFor(() => expect(f02().getAttribute("aria-label")).toMatch(/pending$/));
    expect(f03().getAttribute("aria-label")).toMatch(/skipped$/);
    await waitFor(() => expect(f02().getAttribute("aria-label")).toMatch(/propagated$/), { timeout: 3000 });

    expect(f03().getAttribute("aria-label")).toMatch(/skipped$/);
    expect(screen.getAllByText(/have different dimensions/)).toHaveLength(1);
    expect(screen.queryByText(/×2/)).toBeNull();
  });

  it("asks before the TAB closes on propagated frames", async () => {
    panel(() => false);
    await propagateAndWait();

    expect(closeTab()).toBe(true);
  });

  it("lets the tab close without asking when nothing propagated is waiting to be saved", async () => {
    panel(() => true);
    fireEvent.click(screen.getByText("Build timeline"));
    // Building marks nothing since 2026-09-23, as in legacy: the reference is marked as a user marks it.
    fireEvent.click(screen.getByRole("button", { name: "+ All Labeled" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Timeline").querySelectorAll("button")).toHaveLength(3),
    );

    expect(closeTab()).toBe(false);
  });

  it("keeps propagated frames when the Sequence panel is collapsed and opened again", async () => {
    panel(() => false, true);
    await propagateAndWait();
    const header = screen.getByRole("button", { name: /Sequence/ });

    fireEvent.click(header);
    fireEvent.click(header);

    expect(screen.getByRole("button", { name: /Save 1 frame/ })).toBeTruthy();
  });
});
