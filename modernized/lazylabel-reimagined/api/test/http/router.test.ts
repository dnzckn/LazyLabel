/**
 * Route matching, including the rest-segment form the annotation routes need.
 *
 * An image key is several path segments and sits in the MIDDLE of its route
 * (`/projects/{id}/images/{imagePath}/annotations`), which is the case a naive splat gets wrong.
 */

import { describe, expect, it } from "vitest";

import { matchRoute } from "../../src/http/router.js";

const ANNOTATIONS = "/projects/:projectId/images/*imagePath/annotations";

describe("matchRoute", () => {
  it("matches a single-segment image key", () => {
    expect(matchRoute(ANNOTATIONS, "/projects/p1/images/a.png/annotations")?.params).toEqual({
      projectId: "p1",
      imagePath: "a.png",
    });
  });

  it("matches a deep image key and keeps its separators", () => {
    expect(
      matchRoute(ANNOTATIONS, "/projects/p1/images/sequences/run_4/frame_012.png/annotations")?.params,
    ).toEqual({ projectId: "p1", imagePath: "sequences/run_4/frame_012.png" });
  });

  it("requires the literal tail after the rest segment", () => {
    expect(matchRoute(ANNOTATIONS, "/projects/p1/images/a.png")).toBeNull();
    expect(matchRoute(ANNOTATIONS, "/projects/p1/images/a.png/something-else")).toBeNull();
  });

  it("requires at least one segment for the rest parameter", () => {
    expect(matchRoute(ANNOTATIONS, "/projects/p1/images/annotations")).toBeNull();
  });

  it("percent-decodes each segment exactly once", () => {
    // Decoding twice is how "%252e%252e" becomes ".." one layer after the check that would catch it.
    expect(matchRoute(ANNOTATIONS, "/projects/p1/images/a%20b%2Ec.png/annotations")?.params["imagePath"]).toBe(
      "a b.c.png",
    );
    expect(matchRoute(ANNOTATIONS, "/projects/p1/images/%252e%252e/annotations")?.params["imagePath"]).toBe(
      "%2e%2e",
    );
  });

  it("leaves a malformed escape as written rather than guessing", () => {
    expect(matchRoute(ANNOTATIONS, "/projects/p1/images/%zz.png/annotations")?.params["imagePath"]).toBe(
      "%zz.png",
    );
  });

  it("matches fixed routes and rejects near misses", () => {
    expect(matchRoute("/health", "/health")?.params).toEqual({});
    expect(matchRoute("/health", "/health/deep")).toBeNull();
    expect(matchRoute("/users/me/settings", "/users/me/settings")?.params).toEqual({});
    expect(matchRoute("/users/me/settings", "/users/you/settings")).toBeNull();
  });

  it("ignores leading and trailing slashes", () => {
    expect(matchRoute("/health", "/health/")).not.toBeNull();
    expect(matchRoute("/health", "health")).not.toBeNull();
  });

  it("does not let an empty segment satisfy a parameter", () => {
    expect(matchRoute("/projects/:projectId/x", "/projects//x")).toBeNull();
  });
});
