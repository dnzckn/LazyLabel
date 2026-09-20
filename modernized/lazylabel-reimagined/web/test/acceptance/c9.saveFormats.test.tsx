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

import { ApiError } from "../../src/api/client.js";
import { chooseTool, drawTriangle, lastSave, mount, openImage, writeButton } from "./harness.jsx";

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
  it("does not offer to overwrite until something has been refused", async () => {
    // A standing "save anyway" is a setting somebody turns on once and forgets, which is the
    // opposite of the explicit act decision 7 asks for.
    await openImage();

    expect(screen.queryByRole("button", { name: /Save anyway/ })).toBeNull();
  });

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

describe("C9: a file that changed underneath", () => {
  it("says what happened and that NOTHING was written", async () => {
    /*
     * The case the cutover plan makes likely rather than exotic: the desktop app stays installed
     * and reads the same folder, so a user can have both open on one image. Before saves became
     * conditional, whichever wrote last won and the other's work was gone with nothing said.
     *
     * "Conflict" on its own sends someone looking for a bug. What they need is that the file moved
     * under them, that their work is still on screen, and what to do next.
     */
    const { saveAnnotations } = mount();
    // REJECTED, not thrown synchronously: `saveAnnotations` is async, so the real client always
    // hands back a promise and the component's `.catch` is what sees a 409.
    // The REAL shape the API sends, trailing clause and all: an earlier version of this test used
    // a tidier message and so passed while the live banner read "nothing was written" three times.
    (saveAnnotations as unknown as { mockRejectedValue: (v: unknown) => void }).mockRejectedValue(
      new ApiError(
        409,
        "revision_conflict",
        "frames/a.npz changed since it was read (expected aaa, found bbb); nothing was written",
        { key: "frames/a.npz" },
      ),
    );

    await openImageWithThatClient();
    chooseTool("Polygon");
    drawTriangle(10, 10);

    fireEvent.click(writeButton());

    // By TEXT, not by role: jsdom has no 2D canvas, so the canvas reports its own failure as an
    // alert too, and `getByRole("alert")` would find whichever came first.
    const shown = await screen.findByText(/Nothing was written/);
    expect(shown.textContent).toMatch(/frames\/a\.npz changed since you loaded it/);
    expect(shown.textContent).toMatch(/desktop app, another tab, or a script/);
    expect(shown.textContent).toMatch(/Nothing here was lost/);
    // The advice must not contradict the reassurance. The first version said the work was safe and
    // then told the user to reload, which calls `openImage` and clears the segments -- discarding
    // exactly what it had promised. There is no force-overwrite yet, so the instruction has to be
    // the one that KEEPS the work.
    expect(shown.textContent).toMatch(/WOULD replace them/);
    expect(shown.textContent).not.toMatch(/^.*Reload the image to see/);

    // The recovery, offered only AFTER a refusal: an unconditional write is the thing the
    // conditional write exists to prevent, so it is a deliberate second press rather than a retry
    // that happens on its own or a setting somebody turns on once and forgets.
    const anyway = screen.getByRole("button", { name: /Save anyway/ });
    expect(anyway).toBeTruthy();

    (saveAnnotations as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      written: { NPZ: "r9" },
      stale: [],
      skippedEmpty: [],
    });
    fireEvent.click(anyway);

    await waitFor(() => expect(screen.getByText(/Wrote NPZ beside/)).toBeTruthy());
    // UNCONDITIONAL: no expected revisions, which is what "overwrite what is there now" means.
    expect(lastSave(saveAnnotations)["expectedRevisions"]).toEqual({});

    // SAID ONCE, which is the whole reason this message is written rather than appended to the
    // server's. Concatenating put it on screen three times, and only running it showed that.
    expect(shown.textContent?.match(/[Nn]othing was written/g) ?? []).toHaveLength(1);
    // And the revision hashes are dropped: they belong in a log, not in front of someone who would
    // have to compare two base64 strings to learn nothing.
    expect(shown.textContent).not.toMatch(/expected aaa/);
  });
});

/** The harness mounts and opens in one step; this reuses the mount already made above. */
async function openImageWithThatClient(): Promise<void> {
  await waitFor(() => expect(screen.getByRole("button", { name: "a.png" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "a.png" }));
  await waitFor(() => expect(screen.getByLabelText("Status").textContent).toMatch(/a\.png/));
}
