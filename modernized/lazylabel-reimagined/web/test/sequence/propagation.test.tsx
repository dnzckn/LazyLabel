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

import { defaultSettings } from "@lazylabel/settings-schema";

import type {
  ApiClient,
  WirePropagationJob,
  WirePropagationStart,
} from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { PropagationControl } from "../../src/sequence/PropagationControl.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import type { Frame } from "../../src/sequence/timeline.js";

afterEach(cleanup);

const MASK = { height: 2, width: 2, box: [0, 0, 1, 1], data: "AQE=" };
/** A mask with no pixels: RULE-016 scores it, RULE-060 refuses to commit it. */
const EMPTY_MASK = { height: 2, width: 2, box: [0, 0, -1, -1], data: "" };

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
}): Fake {
  const started: WirePropagationStart[] = [];
  const polls: { id: string; cursor: number }[] = [];
  const cancels: string[] = [];
  let pollCount = 0;

  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (next: unknown) => next,
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
    <SettingsProvider client={fake.client}>
      <HotkeyProvider bindings={defaultSettings().hotkeys}>
        <PropagationControl client={fake.client} frames={frames} onScores={onScores} />
      </HotkeyProvider>
    </SettingsProvider>,
  );
  return { onScores };
}

const propagate = () => screen.getByRole("button", { name: /^Propagate/ });

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
    const fake = fakeClient({
      cancel: () =>
        job({
          state: "cancelled",
          completed: 3,
          error: "cancelled after 3 frames; those frames are kept",
        }),
    });
    show(fake);
    fireEvent.click(propagate());

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(await screen.findByText(/Stopped after 3 frames/)).toBeTruthy();
    expect(screen.getByText(/those frames are kept/)).toBeTruthy();
  });

  it("does not treat a cancel as a failure", async () => {
    // The service puts its "what was kept" sentence in `error`, and a control that rendered every
    // non-null `error` as an alert would paint a successful stop red.
    const fake = fakeClient({
      cancel: () =>
        job({ state: "cancelled", completed: 3, error: "cancelled after 3 frames; kept" }),
    });
    show(fake);
    fireEvent.click(propagate());

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await screen.findByText(/Stopped after 3 frames/);
    expect(screen.queryByRole("alert")).toBeNull();
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
