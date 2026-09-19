/**
 * Which files belong to an image, and the collision decision 15e told us to keep and to report.
 */

import { describe, expect, it } from "vitest";

import {
  IMAGE_EXTENSIONS,
  isImageKey,
  isSidecarKey,
  sidecarCollisions,
  sidecarKeysFor,
} from "../../src/annotations/sidecars.js";

describe("sidecar naming", () => {
  it("names every format's file from the image's base name", () => {
    const keys = sidecarKeysFor("frames/frame_012.png");

    expect(Object.fromEntries(keys)).toEqual({
      NPZ: "frames/frame_012.npz",
      NPZ_CLASS_MAP: "frames/frame_012_CM.npz",
      YOLO_DETECTION: "frames/frame_012.txt",
      YOLO_SEGMENTATION: "frames/frame_012_seg.txt",
      COCO_JSON: "frames/frame_012_coco.json",
      PASCAL_VOC: "frames/frame_012.xml",
      CREATEML: "frames/frame_012_createml.json",
    });
  });

  it("returns the formats in load-priority order", () => {
    expect([...sidecarKeysFor("a.png").keys()]).toEqual([
      "NPZ",
      "YOLO_SEGMENTATION",
      "COCO_JSON",
      "NPZ_CLASS_MAP",
      "PASCAL_VOC",
      "CREATEML",
      "YOLO_DETECTION",
    ]);
  });

  it("strips only the last extension, as Python's splitext does", () => {
    expect(sidecarKeysFor("a/b.tar.png").get("YOLO_DETECTION")).toBe("a/b.tar.txt");
    expect(sidecarKeysFor("a/b").get("YOLO_DETECTION")).toBe("a/b.txt");
    // A dot in a directory name is not an extension.
    expect(sidecarKeysFor("v1.2/frame").get("YOLO_DETECTION")).toBe("v1.2/frame.txt");
  });
});

describe("recognizing images and sidecars", () => {
  it("accepts the eight image extensions decision 9 settles on", () => {
    for (const extension of IMAGE_EXTENSIONS) {
      expect(isImageKey(`frames/a${extension}`), extension).toBe(true);
      expect(isImageKey(`frames/a${extension.toUpperCase()}`), extension).toBe(true);
    }
    expect(IMAGE_EXTENSIONS).toContain(".webp"); // legacy's file manager rejected these...
    expect(IMAGE_EXTENSIONS).toContain(".gif"); // ...while its sequence worker accepted them
  });

  it("does not mistake a sidecar for an image", () => {
    expect(isImageKey("frames/a_coco.json")).toBe(false);
    expect(isImageKey("frames/a.npz")).toBe(false);
  });

  it("recognizes _seg.txt as a sidecar, not merely .txt", () => {
    expect(isSidecarKey("frames/a_seg.txt")).toBe(true);
    expect(isSidecarKey("frames/a.txt")).toBe(true);
    expect(isSidecarKey("frames/a.png")).toBe(false);
  });
});

describe("base-name collisions (decision 15e)", () => {
  it("finds images in one folder that would share every sidecar", () => {
    const collisions = sidecarCollisions([
      "frames/frame_012.png",
      "frames/frame_012.jpg",
      "frames/frame_013.png",
    ]);

    // Annotating one of these silently overwrites the other's work. Legacy never noticed; the save
    // response names it so a user can see it before it costs them a day.
    expect([...collisions.keys()]).toEqual(["frames/frame_012"]);
    expect(collisions.get("frames/frame_012")).toEqual(["frames/frame_012.jpg", "frames/frame_012.png"]);
  });

  it("is quiet about an ordinary folder", () => {
    expect(sidecarCollisions(["a.png", "b.png", "c.jpg"]).size).toBe(0);
  });

  it("does not treat the same base name in different folders as a collision", () => {
    expect(sidecarCollisions(["one/a.png", "two/a.jpg"]).size).toBe(0);
  });

  it("ignores files that are not images", () => {
    expect(sidecarCollisions(["a.png", "a.txt", "a.npz"]).size).toBe(0);
  });
});
