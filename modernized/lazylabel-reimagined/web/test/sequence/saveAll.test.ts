/**
 * Writing a propagation's results — RULE-082, and RULE-060's last clause.
 *
 * RULE-082 is the eligibility itself: Save All exports each frame the engine lists as propagated
 * and NOT flagged, using its stored masks and each object's reference class.
 *
 * "Save All never writes a flagged frame", including the ones Keep Flagged Masks held on to. Those
 * masks are for REVIEW, and writing them would put the model's unsure guesses on disk under the
 * user's name. `saveableFrames` had said so since it was written and nothing had ever asked it.
 */

import { describe, expect, it, vi } from "vitest";

import type { ApiClient, WirePropagationFrame } from "../../src/api/client.js";
import { plannedSave, saveAll } from "../../src/sequence/saveAll.js";
import type { Frame } from "../../src/sequence/timeline.js";

const MASK = { height: 4, width: 4, box: [1, 1, 3, 3], data: "AQEBAQ==" };
const EMPTY = { height: 4, width: 4, box: null, data: "" };

function frame(index: number, state: string, isReference = false): Frame {
  return {
    index,
    key: `frames/f${String(index).padStart(2, "0")}.png`,
    state,
    isReference,
  } as unknown as Frame;
}

function result(objectId = 1, mask: unknown = MASK): WirePropagationFrame {
  return { source: "ignored", objectId, mask, confidence: 0.9 } as WirePropagationFrame;
}

/**
 * Propagated results by IMAGE KEY, the way the store holds them.
 *
 * Written as frame INDICES here because that is how a test reads, and converted through the same
 * naming `frame()` uses -- so the conversion is in one place rather than in every case. By key,
 * not by position, because RULE-077's Trim moves every position after the cut and a
 * position-keyed store would re-attribute every mask to the wrong picture.
 */
function masks(entries: Record<number, WirePropagationFrame[]>) {
  return new Map(
    Object.entries(entries).map(([index, value]) => [frame(Number(index), "pending").key, value]),
  );
}

function fakeClient(onSave?: (key: string, body: unknown) => void) {
  const saved: { key: string; body: unknown }[] = [];
  const client = {
    saveAnnotations: async (_project: string, key: string, body: unknown) => {
      onSave?.(key, body);
      saved.push({ key, body });
      return { written: { NPZ: "r1" }, stale: [], unsupported: [] };
    },
  } as unknown as ApiClient;
  return { client, saved };
}

function run(
  frames: readonly Frame[],
  held: Map<number, WirePropagationFrame[]>,
  extra: Partial<Parameters<typeof saveAll>[0]> = {},
) {
  const fake = fakeClient();
  return {
    fake,
    promise: saveAll({
      client: fake.client,
      projectId: "default",
      frames,
      masks: held,
      classes: { 1: 7 },
      formats: ["NPZ"],
      ...extra,
    }),
  };
}

describe("which frames RULE-060 will write", () => {
  it("writes a propagated frame", async () => {
    const frames = [frame(0, "reference", true), frame(1, "propagated")];

    const { fake, promise } = run(frames, masks({ 1: [result()] }));
    const outcome = await promise;

    expect(outcome.written).toEqual(["frames/f01.png"]);
    expect(fake.saved).toHaveLength(1);
  });

  it("NEVER writes a flagged frame, and says why", async () => {
    // The rule's whole point: a flagged mask is the model's unsure guess, and writing it puts that
    // guess on disk under the user's name.
    const frames = [frame(0, "reference", true), frame(1, "flagged")];

    const { fake, promise } = run(frames, masks({ 1: [result()] }));
    const outcome = await promise;

    expect(fake.saved).toHaveLength(0);
    expect(outcome.withheld[0]!.reason).toContain("flagged");
  });

  it("does not write a skipped or a pending frame either", async () => {
    const frames = [frame(0, "skipped"), frame(1, "pending")];

    const { fake, promise } = run(frames, masks({ 0: [result()], 1: [result()] }));
    await promise;

    expect(fake.saved).toHaveLength(0);
  });

  it("does NOT rewrite a reference frame", async () => {
    // It is the user's own drawing and already on disk. Writing the propagation's seed result back
    // would replace what someone drew with the model's reconstruction of it.
    const frames = [frame(0, "reference", true)];

    const { fake, promise } = run(frames, masks({ 0: [result()] }));
    const outcome = await promise;

    expect(fake.saved).toHaveLength(0);
    // Not "withheld" either -- it is not a refusal, it is already saved.
    expect(outcome.withheld).toHaveLength(0);
  });

  it("holds back a frame the propagation produced nothing for", async () => {
    const frames = [frame(0, "reference", true), frame(1, "propagated")];

    const { promise } = run(frames, masks({}));
    const outcome = await promise;

    expect(outcome.withheld[0]!.reason).toContain("produced nothing");
  });

  it("plannedSave answers the same question without writing anything", async () => {
    // What the button counts before it is pressed. A count that disagreed with what the save then
    // did would be the worst kind of wrong.
    const frames = [frame(0, "reference", true), frame(1, "propagated"), frame(2, "flagged")];

    const planned = plannedSave(frames, masks({ 1: [result()], 2: [result()] }));

    expect(planned.writable.map((each) => each.index)).toEqual([1]);
    expect(planned.withheld.map((each) => each.key)).toEqual(["frames/f02.png"]);
  });
});

describe("what gets written", () => {
  it("carries the class from the annotation that seeded the object", async () => {
    // SAM 2 tracks an object and has no idea what it is. A propagated mask saved without a class
    // lands on disk as an unclassified shape, which RULE-012 cannot order and no exporter names.
    const frames = [frame(0, "reference", true), frame(1, "propagated")];

    const { fake, promise } = run(frames, masks({ 1: [result(1)] }), { classes: { 1: 7 } });
    await promise;

    const body = fake.saved[0]!.body as { segments: { classId: number }[] };
    expect(body.segments[0]!.classId).toBe(7);
  });

  it("writes one segment per tracked object on the frame", async () => {
    const frames = [frame(0, "reference", true), frame(1, "propagated")];

    const { fake, promise } = run(frames, masks({ 1: [result(1), result(2)] }), {
      classes: { 1: 7, 2: 9 },
    });
    await promise;

    const body = fake.saved[0]!.body as { segments: { classId: number }[] };
    expect(body.segments.map((each) => each.classId)).toEqual([7, 9]);
  });

  it("drops an object that covered no pixels rather than writing an empty shape", async () => {
    // A segment with no area reads as an annotation in the file and is not one.
    const frames = [frame(0, "reference", true), frame(1, "propagated")];

    const { fake, promise } = run(frames, masks({ 1: [result(1), result(2, EMPTY)] }));
    await promise;

    const body = fake.saved[0]!.body as { segments: unknown[] };
    expect(body.segments).toHaveLength(1);
  });

  it("reports a frame whose every mask was empty rather than writing it", async () => {
    const frames = [frame(0, "reference", true), frame(1, "propagated")];

    const { fake, promise } = run(frames, masks({ 1: [result(1, EMPTY)] }));
    const outcome = await promise;

    expect(fake.saved).toHaveLength(0);
    expect(outcome.failed[0]!.reason).toContain("every propagated mask");
  });

  it("writes the formats the user chose rather than a default", async () => {
    // Decision 7: an explicit act writes, and it writes what was asked for.
    const frames = [frame(0, "reference", true), frame(1, "propagated")];

    const { fake, promise } = run(frames, masks({ 1: [result()] }), {
      formats: ["NPZ", "YOLO_SEGMENTATION"],
    });
    await promise;

    expect((fake.saved[0]!.body as { formats: string[] }).formats).toEqual([
      "NPZ",
      "YOLO_SEGMENTATION",
    ]);
  });
});

describe("when a write fails", () => {
  it("carries on and reports the failure per frame", async () => {
    // Stopping at the first conflict over 600 frames leaves the user with no idea which half was
    // written. Swallowing it would be worse.
    const frames = [frame(0, "reference", true), frame(1, "propagated"), frame(2, "propagated")];
    const client = {
      saveAnnotations: vi.fn(async (_project: string, key: string) => {
        if (key.endsWith("f01.png")) throw new Error("the file changed on disk");
        return { written: { NPZ: "r1" }, stale: [], unsupported: [] };
      }),
    } as unknown as ApiClient;

    const outcome = await saveAll({
      client,
      projectId: "default",
      frames,
      masks: masks({ 1: [result()], 2: [result()] }),
      classes: {},
      formats: ["NPZ"],
    });

    expect(outcome.written).toEqual(["frames/f02.png"]);
    expect(outcome.failed[0]!.reason).toContain("changed on disk");
  });

  it("reports progress as it goes, so a long save does not look hung", async () => {
    const frames = [
      frame(0, "reference", true),
      frame(1, "propagated"),
      frame(2, "propagated"),
      frame(3, "propagated"),
    ];
    const seen: string[] = [];

    const { promise } = run(frames, masks({ 1: [result()], 2: [result()], 3: [result()] }), {
      onProgress: (done, total) => seen.push(`${done}/${total}`),
    });
    await promise;

    expect(seen).toEqual(["1/3", "2/3", "3/3"]);
  });
});
