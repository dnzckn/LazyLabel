/**
 * The render cache, and the defect it exists not to have.
 *
 * RULE-030 records a suspected defect in legacy: its cached spectrum is keyed only by the image
 * DIMENSIONS, so it is not invalidated when the rescale or channel-threshold settings upstream of
 * it change. Move a rescale handle and the FFT can answer from the input it had before — an image
 * one edit out of date, on a tool whose entire job is showing what the numbers do.
 *
 * The first three tests here are that defect, written as the behaviour that must NOT happen.
 */

import { describe, expect, it } from "vitest";

import { RenderCache } from "../../src/images/renderCache.js";

const png = (size: number) => ({ bytes: new Uint8Array(size), headers: { "x-image-width": "8" } });

const key = (over: Partial<{ imageKey: string; revision: string; query: string }> = {}) => ({
  imageKey: "frames/a.png",
  revision: "r1",
  query: "",
  ...over,
});

describe("what must not be shared", () => {
  it("does NOT answer a different query from the same image", () => {
    // Legacy's defect, stated as a test. The query holds every processing parameter, so two
    // different queries are two different images and one must never stand in for the other.
    const cache = new RenderCache();
    cache.set(key({ query: "rescaleMin=0&rescaleMax=255" }), png(10));

    expect(cache.get(key({ query: "rescaleMin=50&rescaleMax=200" }))).toBeUndefined();
  });

  it("does not answer an UNPROCESSED request from a processed one", () => {
    // The same image at the same size, which is all legacy's key holds.
    const cache = new RenderCache();
    cache.set(key({ query: "markers_gray=128" }), png(10));

    expect(cache.get(key({ query: "" }))).toBeUndefined();
  });

  it("does not answer from a stale REVISION", () => {
    // A file rewritten under the app -- by the converter, or by the user outside it -- must not
    // come back as the bytes it used to have.
    const cache = new RenderCache();
    cache.set(key({ revision: "r1" }), png(10));

    expect(cache.get(key({ revision: "r2" }))).toBeUndefined();
  });

  it("does not let two images collide through the joining character", () => {
    // Joined on a newline, which a blob key cannot contain and a query string percent-encodes.
    // Joining on something a key COULD hold is how two requests come to share an entry.
    const cache = new RenderCache();
    cache.set(key({ imageKey: "a", query: "b" }), png(10));

    expect(cache.get(key({ imageKey: "a\nb", query: "" }))).toBeUndefined();
  });
});

describe("what it does answer", () => {
  it("returns the bytes AND the headers that described them", () => {
    // One answer, kept together. Rebuilding the headers on a hit means re-deriving the width and
    // depth without the decode that produced them.
    const cache = new RenderCache();
    const stored = { bytes: new Uint8Array([1, 2, 3]), headers: { "x-image-source-depth": "16" } };
    cache.set(key(), stored);

    expect(cache.get(key())).toEqual(stored);
  });
});

describe("the size limit", () => {
  it("is in BYTES, so the cap means something whatever is opened", () => {
    // "Fifty images" is a cap of anywhere between two megabytes and two gigabytes.
    const cache = new RenderCache(100);
    cache.set(key({ query: "a" }), png(60));
    cache.set(key({ query: "b" }), png(60));

    expect(cache.size.bytes).toBeLessThanOrEqual(100);
    expect(cache.get(key({ query: "a" }))).toBeUndefined();
    expect(cache.get(key({ query: "b" }))).toBeDefined();
  });

  it("evicts the least RECENTLY used, not the oldest stored", () => {
    // A user returning to the image they started on should not have paid for the five they looked
    // at since.
    const cache = new RenderCache(100);
    cache.set(key({ query: "a" }), png(40));
    cache.set(key({ query: "b" }), png(40));
    cache.get(key({ query: "a" })); // touched

    cache.set(key({ query: "c" }), png(40));

    expect(cache.get(key({ query: "a" }))).toBeDefined();
    expect(cache.get(key({ query: "b" }))).toBeUndefined();
  });

  it("refuses to cache one render larger than the whole budget", () => {
    // Rather than emptying the cache to hold one thing it is about to evict anyway.
    const cache = new RenderCache(100);
    cache.set(key({ query: "a" }), png(40));

    cache.set(key({ query: "huge" }), png(500));

    expect(cache.get(key({ query: "huge" }))).toBeUndefined();
    expect(cache.get(key({ query: "a" }))).toBeDefined();
  });

  it("replaces an entry without counting it twice", () => {
    const cache = new RenderCache(100);
    cache.set(key(), png(40));
    cache.set(key(), png(40));

    expect(cache.size).toEqual({ entries: 1, bytes: 40 });
  });
});
