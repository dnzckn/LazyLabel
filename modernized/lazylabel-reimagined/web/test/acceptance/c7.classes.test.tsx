/**
 * C7 — assign classes and names, and decide which class wins an overlapping pixel.
 *
 * Two halves that live in different places, which is why it is worth testing here and not in the
 * class table alone:
 *
 *   - The names are the browser's, and they have to reach the save as they now stand.
 *   - Which class wins an overlapping pixel is the SERVER's (RULE-012's pixel priority), applied
 *     when the mask tensor is built — as is the channel ORDER, which RULE-014 fixes at ascending
 *     class id. The browser does not get a vote on either, and must not appear to: a request that
 *     could name a different order would change which channel each class occupies in every
 *     exported file.
 */

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { chooseTool, drawTriangle, editClassName, lastSave, openImage, writeButton } from "./harness.jsx";

afterEach(cleanup);

describe("C7: classes and names", () => {
  it("gives a new annotation the next free class id", async () => {
    // Zero on an empty image, which is why LazyLabel datasets are zero-based.
    await openImage();
    chooseTool("Poly (2)");

    drawTriangle(10, 10);

    expect(await screen.findByRole("button", { name: "Draw new annotations as class 0" })).toBeTruthy();
  });

  it("names a class, and the name reaches the save", async () => {
    const { saveAnnotations } = await openImage();
    chooseTool("Poly (2)");
    drawTriangle(10, 10);

    const field = await editClassName(0);
    fireEvent.change(field, { target: { value: "car" } });
    fireEvent.blur(field);
    fireEvent.click(writeButton());

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalled());
    expect(lastSave(saveAnnotations)["classAliases"]).toEqual({ "0": "car" });
  });

  it("CLEARS a name rather than storing an empty one", async () => {
    // A blank alias would export as "" where the id belongs, which looks like a name and is not.
    // Legacy stores the blank.
    const { saveAnnotations } = await openImage();
    chooseTool("Poly (2)");
    drawTriangle(10, 10);

    const field = await editClassName(0);
    fireEvent.change(field, { target: { value: "car" } });
    fireEvent.blur(field);
    const again = await editClassName(0);
    fireEvent.change(again, { target: { value: "" } });
    fireEvent.blur(again);

    fireEvent.click(writeButton());

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalled());
    expect(lastSave(saveAnnotations)["classAliases"]).toEqual({});
  });

  it("sends the PIXEL PRIORITY, which decides who wins an overlap (RULE-012)", async () => {
    // The API has accepted this since Phase 2 and the client never sent it, so both settings did
    // nothing: a user whose imported legacy settings turned pixel priority on got masks resolved
    // the other way, and the difference is invisible until an overlap actually occurs.
    //
    // Sent explicitly rather than omitted, for the same reason as the crop: a field the client
    // leaves out is a decision it has silently handed to the server's default.
    const { saveAnnotations } = await openImage();
    chooseTool("Poly (2)");
    drawTriangle(10, 10);

    fireEvent.click(writeButton());

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalled());
    expect(lastSave(saveAnnotations)["pixelPriority"]).toEqual({
      enabled: false,
      ascending: true,
    });
  });

  it("does NOT send a channel order on the wire", async () => {
    // RULE-014: the saved channel order is ascending class id, derived on the server from the
    // segments present. It is a content rule, so the client does not get to state it — and the
    // way to be sure of that is that the field is not in the request at all.
    const { saveAnnotations } = await openImage();
    chooseTool("Poly (2)");
    drawTriangle(10, 10);

    fireEvent.click(writeButton());

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalled());
    expect(Object.keys(lastSave(saveAnnotations))).not.toContain("classOrder");
  });
});
