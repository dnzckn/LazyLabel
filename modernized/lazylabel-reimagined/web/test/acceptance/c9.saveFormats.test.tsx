/**
 * C9 — save annotations in any of the seven formats, choosing which are written.
 *
 * The bytes of each format are proven against legacy in the format library, and the write itself
 * is proven on disk in the API's own C9. What is left for the browser is the CHOICE and the
 * REPORTING, and the reporting is where decision 7 lives: a save that wrote less than it looks
 * must say so.
 *
 * The save button is exercised on an image with NO annotation file, deliberately. It used to
 * render only inside the "loaded" branch, so the first image of every new dataset had no way to
 * write anything at all.
 */

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import { chooseTool, drawTriangle, lastSave, openImage, writeButton } from "./harness.jsx";

afterEach(cleanup);

const FORMATS = [
  "NPZ",
  "NPZ_CLASS_MAP",
  "YOLO_DETECTION",
  "YOLO_SEGMENTATION",
  "COCO_JSON",
  "PASCAL_VOC",
  "CREATEML",
];

describe("C9: choosing the formats", () => {
  it("offers all seven", async () => {
    await openImage();

    // By the set of names rather than one lookup each: "NPZ" is a substring of "NPZ_CLASS_MAP",
    // so a per-format regex matches two checkboxes and says nothing useful about either.
    const offered = screen
      .getAllByRole("checkbox")
      .map((box) => box.getAttribute("aria-label") ?? box.parentElement?.textContent ?? "");

    for (const format of FORMATS) {
      expect(
        offered.some((name) => name.includes(format)),
        `${format} is not offered`,
      ).toBe(true);
    }
  });

  it("is reachable on an image that has no annotation file yet", async () => {
    // The first image of every new dataset. The button once lived inside the "loaded" branch, so a
    // user could draw and had no way to write any of it.
    await openImage();

    expect(writeButton()).toBeTruthy();
  });

  it("writes exactly the formats that were chosen", async () => {
    const { saveAnnotations } = await openImage();
    chooseTool("Polygon");
    drawTriangle(10, 10);

    fireEvent.click(writeButton());

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalled());
    expect(lastSave(saveAnnotations)["formats"]).toEqual(
      defaultSettings().values["export_formats"],
    );
  });
});

describe("C9: reporting what happened", () => {
  it("says what was written, by name", async () => {
    await openImage();
    chooseTool("Polygon");
    drawTriangle(10, 10);

    fireEvent.click(writeButton());

    expect(await screen.findByText(/Wrote NPZ, COCO_JSON beside a\.png/)).toBeTruthy();
  });

  it("reports the sidecars it did NOT rewrite, which may now disagree", async () => {
    // Decision 15f: report and offer removal, never delete. A stale Pascal VOC file beside a fresh
    // NPZ is two different answers about the same image, and only one of them is current.
    await openImage();
    chooseTool("Polygon");
    drawTriangle(10, 10);

    fireEvent.click(writeButton());

    expect(await screen.findByText(/a\.xml/)).toBeTruthy();
  });
});
