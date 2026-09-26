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

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WireMask, WireSegment } from "@lazylabel/contracts";
import { defaultSettings } from "@lazylabel/settings-schema";

import type {
  ApiClient,
  WirePropagationJob,
  WirePropagationStart,
} from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { Panel } from "../../src/shell/Panel.jsx";
import { TimelinePanel } from "../../src/sequence/TimelinePanel.jsx";
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

  const SQUARE = {
    type: "Polygon",
    classId: 0,
    vertices: [[1, 1], [6, 1], [6, 6], [1, 6]],
  };

  function panel(
    confirmDiscard: (message: string) => boolean,
    inPanel = false,
    /** The open image's annotations as the shell hands them down from the store. */
    openAnnotations?: OpenAnnotations,
  ) {
    /** Every request Propagate sent, as `fakeClient` records them. */
    const started: WirePropagationStart[] = [];
    const client = {
      getSettings: async () => defaultSettings(),
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
          segments: [SQUARE],
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
        return job({ state: "running" });
      },
      propagationState: async () =>
        job({
          state: "completed",
          completed: 1,
          cursor: 1,
          results: [{ source: "frames/f02.png", objectId: 1, mask: MASK, confidence: 0.999 }],
        }),
      saveAnnotations: async () => ({ written: [], stale: [], skippedEmpty: [] }),
    } as unknown as ApiClient;

    const tree = (saves?: ReadonlyMap<string, number>) => {
      const timeline = (
        <TimelinePanel
          images={FOLDER as never}
          client={client}
          confirmDiscard={confirmDiscard}
          {...(saves === undefined ? {} : { savedElsewhere: saves })}
          {...(openAnnotations === undefined ? {} : { openAnnotations })}
        />
      );
      return (
        <NotificationProvider>
          <NotificationHost />
          <SettingsProvider client={client}>
            <HotkeyProvider bindings={defaultSettings().hotkeys}>
              {inPanel ? <Panel title="Sequence">{timeline}</Panel> : timeline}
            </HotkeyProvider>
          </SettingsProvider>
        </NotificationProvider>
      );
    };
    const result = render(tree());
    // The ordinary save's counts, as the shell hands them down from the store.
    return {
      withSaves: (saves: ReadonlyMap<string, number>) => result.rerender(tree(saves)),
      started,
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
    fireEvent.click(screen.getByRole("button", { name: "+ All labeled" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Timeline").querySelectorAll("button")).toHaveLength(3),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));
    await screen.findByRole("button", { name: /Save 1 frame/ }, { timeout: 3000 });
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
    fireEvent.click(screen.getByRole("button", { name: "+ All labeled" }));
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

  it("asks before the TAB closes on propagated frames", async () => {
    panel(() => false);
    await propagateAndWait();

    expect(closeTab()).toBe(true);
  });

  it("lets the tab close without asking when nothing propagated is waiting to be saved", async () => {
    panel(() => true);
    fireEvent.click(screen.getByText("Build timeline"));
    // Building marks nothing since 2026-09-23, as in legacy: the reference is marked as a user marks it.
    fireEvent.click(screen.getByRole("button", { name: "+ All labeled" }));
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
