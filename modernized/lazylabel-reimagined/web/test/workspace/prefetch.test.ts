/**
 * RULE-091's prefetch order — which image is encoded before anyone asks for it.
 *
 * The cache was built and keyed properly and nothing ever warmed it, so the first click after
 * navigating still paid for a cold encode. That is the half of the rule that makes RULE-074's
 * latency budget achievable, and the ORDER is the part worth pinning: it is not "the nearest
 * images", it is the first uncached archetype and then N+1, N+2, N-1.
 */

import { describe, expect, it } from "vitest";

import { CACHE_SIZE, RETRY_MS, SETTLE_MS, prefetchOrder } from "../../src/workspace/prefetch.js";

const KEYS = Array.from({ length: 10 }, (_, index) => `frames/f${String(index).padStart(2, "0")}.png`);

function order(overrides: Partial<Parameters<typeof prefetchOrder>[0]> = {}) {
  return prefetchOrder({
    keys: KEYS,
    current: KEYS[5]!,
    encoded: new Set<string>(),
    ...overrides,
  });
}

describe("the order", () => {
  it("is next, next-but-one, then previous", () => {
    // Forward first because stepping forward is the common motion, and N+2 before N-1 because
    // someone who has just moved forward is more likely to keep going than turn back.
    expect(order()).toEqual([KEYS[6], KEYS[7], KEYS[4]]);
  });

  it("puts the first uncached ARCHETYPE ahead of the neighbours", () => {
    // Archetypes are the frames the app itself suggested annotating, so they are the ones a user
    // jumps to -- and a jump is the navigation a prefetch of neighbours alone never helps with.
    expect(order({ archetypes: [KEYS[9]] })).toEqual([KEYS[9], KEYS[6], KEYS[7], KEYS[4]]);
  });

  it("takes only the FIRST uncached archetype, not all of them", () => {
    // The cache holds ten. Encoding every suggested frame would evict the neighbours this same
    // list is about to ask for, leaving stepping through the sequence slower than before.
    expect(order({ archetypes: [KEYS[8], KEYS[9], KEYS[0]] })).toEqual([
      KEYS[8],
      KEYS[6],
      KEYS[7],
      KEYS[4],
    ]);
  });

  it("skips an archetype that is already encoded and takes the next one", () => {
    expect(order({ archetypes: [KEYS[8], KEYS[9]], encoded: new Set([KEYS[8]]) })[0]).toBe(KEYS[9]);
  });
});

describe("what it refuses to encode", () => {
  it("never the current image, which the normal path is already encoding", () => {
    expect(order()).not.toContain(KEYS[5]);
    expect(order({ archetypes: [KEYS[5]] })).not.toContain(KEYS[5]);
  });

  it("nothing already encoded this session", () => {
    // A prefetch that re-encodes what is already warm is pure cost.
    expect(order({ encoded: new Set([KEYS[6], KEYS[4]]) })).toEqual([KEYS[7]]);
  });

  it("nothing twice, when an archetype is also a neighbour", () => {
    expect(order({ archetypes: [KEYS[6]] })).toEqual([KEYS[6], KEYS[7], KEYS[4]]);
  });

  it("an archetype that is not in this folder", () => {
    // Find Archetypes ran over a sequence; the user may since have opened a different folder.
    expect(order({ archetypes: ["elsewhere/x.png"] })).toEqual([KEYS[6], KEYS[7], KEYS[4]]);
  });
});

describe("at the edges of the folder", () => {
  it("has no next at the end, and still offers the previous", () => {
    expect(order({ current: KEYS[9] })).toEqual([KEYS[8]]);
  });

  it("has no previous at the start", () => {
    expect(order({ current: KEYS[0] })).toEqual([KEYS[1], KEYS[2]]);
  });

  it("offers nothing for a single-image folder", () => {
    expect(order({ keys: [KEYS[0]!], current: KEYS[0] })).toEqual([]);
  });

  it("offers only archetypes when the current image is not in the list", () => {
    // The folder changed under it. Prefetching neighbours of an image that is not there would be
    // prefetching neighbours of position -1, which is the first two images of the new folder.
    expect(order({ current: "elsewhere/x.png" })).toEqual([]);
    expect(order({ current: "elsewhere/x.png", archetypes: [KEYS[3]] })).toEqual([KEYS[3]]);
  });
});

describe("the timings", () => {
  it("are legacy's, and are exported so a deployment can change them", () => {
    // RULE-091's answer is explicit that these are "defaults to measure in Phase 3 against the
    // 150 ms p95 budget, not constants to port unexamined". They were tuned against a desktop GPU.
    expect(SETTLE_MS).toBe(200);
    expect(RETRY_MS).toBe(500);
  });

  it("never asks for more than the cache can hold", () => {
    // Otherwise the prefetch evicts its own earlier entries before they are used.
    expect(order({ archetypes: [KEYS[9]] }).length).toBeLessThanOrEqual(CACHE_SIZE);
  });
});
