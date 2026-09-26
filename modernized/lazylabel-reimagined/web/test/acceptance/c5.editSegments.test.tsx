/**
 * C5 — erase, merge, split and reclass segments.
 *
 * Through the shell, because every one of these is a JOIN: the eraser has to reach the rasterizer
 * that decides what a saved annotation covers, merge has to act on the SELECTED segments by
 * position, and a class change has to reach the LIVE aliases rather than the ones the file held.
 * Each of those has been got wrong in this project at least once.
 *
 * "Split" is what erase does: RULE-009 cuts a segment into its remaining 8-connected pieces and
 * discards any of ten pixels or fewer. Legacy has no separate split control either.
 */

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  chooseTool,
  drawTriangle,
  editClassName,
  lastSave,
  openImage,
  selectBoxes,
  writeButton,
} from "./harness.jsx";

afterEach(cleanup);

describe("C5: erasing", () => {
  it("cuts the drawn shape out of the annotations under it", async () => {
    await openImage();
    chooseTool("Poly (2)");
    drawTriangle(10, 10);
    await waitFor(() => expect(selectBoxes()).toHaveLength(1));

    drawTriangle(20, 15, true);

    // What is left comes back as a MASK, because the remaining pieces are no longer an outline
    // anyone drew. That is RULE-009's shape and it is why erase cannot be a vertex operation.
    await waitFor(() => expect(screen.getByLabelText("Dataset").textContent).toMatch(/AI/));
  });

  it("says when there was nothing to erase, rather than looking inert", async () => {
    // Legacy says "No segments to erase". Saying nothing leaves a user wondering whether the
    // gesture registered at all.
    await openImage();
    chooseTool("Poly (2)");

    drawTriangle(10, 10, true);

    expect(await screen.findByText(/No annotations to erase/)).toBeTruthy();
  });
});

describe("C5: merging and deleting", () => {
  it("refuses to merge until two are selected, with legacy's button", async () => {
    // Legacy's "Merge to Class" (right_panel.py:158). It named its target, "Merge into class 0",
    // until the owner asked for legacy's texts on 2026-09-26.
    await openImage();
    chooseTool("Poly (2)");
    drawTriangle(10, 10);
    drawTriangle(100, 10);
    await waitFor(() => expect(selectBoxes()).toHaveLength(2));

    const merge = () => screen.getByRole("button", { name: "Merge to Class" }) as HTMLButtonElement;
    expect(merge().disabled).toBe(true);

    for (const box of selectBoxes()) fireEvent.click(box);

    await waitFor(() => expect(merge().disabled).toBe(false));
  });

  it("deletes the selected annotations, with the count on the status line", async () => {
    await openImage();
    chooseTool("Poly (2)");
    drawTriangle(10, 10);
    drawTriangle(100, 10);
    await waitFor(() => expect(selectBoxes()).toHaveLength(2));

    for (const box of selectBoxes()) fireEvent.click(box);
    await waitFor(() => expect(screen.getByText("2 of 2 selected")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(selectBoxes()).toHaveLength(0));
  });
});

describe("C5: reclassing", () => {
  it("renames a class, and the rename is what a save would write", async () => {
    // The LIVE aliases, not the ones the file held. A rename that only reached the loaded response
    // would be dropped on the next save — a mistake this codebase has made.
    const { saveAnnotations } = await openImage();
    chooseTool("Poly (2)");
    drawTriangle(10, 10);

    const field = await editClassName(0);
    fireEvent.change(field, { target: { value: "stop sign" } });
    fireEvent.blur(field);

    fireEvent.click(writeButton());

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalled());
    expect(lastSave(saveAnnotations)["classAliases"]).toEqual({ "0": "stop sign" });
  });
});
