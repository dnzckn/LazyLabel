/**
 * C13, the settings a user sets: legacy's, where legacy shows them, and honoured once set there.
 *
 * The owner, 2026-09-29: "i dont see any of the pixel priority settings, ensure all the settings
 * that were in pyqt6 are implemented and avilable here too". Operate On View, pixel priority, Pan
 * and Join were in a Settings dialog then, and the annotation size a row under Image Adjustments.
 * Each is driven here in the section legacy has it, through the real shell, and followed to what it
 * changes: the save's pixel priority, the polygon's join, the pan step, the size of what is drawn.
 * Operate On View's is in `c3.aiSegment.test.tsx`, which has the AI service this shell's stub has
 * not; the streaming Window's in `sequence/propagation.test.tsx`, beside Propagate.
 */

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chooseTool, drawTriangle, lastSave, openImage, writeButton } from "./harness.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A section of the left column, on its tab, by its title. */
function section(tab: "Global" | "Image", title: string): HTMLElement {
  fireEvent.click(screen.getByRole("tab", { name: tab }));
  return screen.getByRole("button", { name: title }).closest("section")!;
}

/** The section titles a tab shows, in order. */
function titles(tab: "Global" | "Image"): string[] {
  fireEvent.click(screen.getByRole("tab", { name: tab }));
  return [...screen.getByRole("tabpanel", { name: tab }).querySelectorAll(".panel__toggle")].map(
    (toggle) => toggle.textContent!.replace(/^[▼▶]/, "").trim(),
  );
}

/** The values the last settings save sent. */
function lastPut(putSettings: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return (putSettings.mock.calls.at(-1)?.[0] as { values: Record<string, unknown> } | undefined)?.values ?? {};
}

/** Type into a slider row's box and finish, as legacy's editingFinished does on Enter. */
function typeInto(region: HTMLElement, name: string, text: string): void {
  const box = within(region).getByRole("textbox", { name: `${name}, typed` });
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
}

/** A press on the polygon tool at an image pixel: the canvas is the image's size, at the origin. */
function press(x: number, y: number): void {
  fireEvent.pointerDown(screen.getByLabelText("Polygon tool"), { button: 0, clientX: x, clientY: y });
}

describe("each setting where legacy shows it", () => {
  it("has legacy's sections, in its order, on both tabs", async () => {
    // control_panel.py:384-471 and 499-531. Annotation Settings was missing from the Image tab.
    await openImage();

    expect(titles("Global")).toEqual([
      "AI Model Selection",
      "AI Fragment Filter",
      "AI → Polygon Conversion",
      "Application Settings",
    ]);
    expect(titles("Image")).toEqual([
      "Border Crop",
      "Rescale",
      "Channel Threshold",
      "FFT Threshold",
      "Annotation Settings",
      "Image Adjustments",
    ]);
  });

  it("puts Operate On View and pixel priority in Application Settings, and Size, Pan and Join in Annotation Settings", async () => {
    await openImage();

    const application = section("Global", "Application Settings");
    for (const label of ["Auto-Save on Navigate", "Operate On View", "Enable Pixel Priority", "Ascending", "Descending"]) {
      expect(within(application).getByLabelText(label), label).toBeTruthy();
    }
    const annotation = section("Image", "Annotation Settings");
    for (const name of ["Annotation size", "Pan speed", "Join threshold"]) {
      expect(within(annotation).getByRole("slider", { name }), name).toBeTruthy();
    }
    expect(within(annotation).getByRole("button", { name: "Reset Annotation Settings" })).toBeTruthy();
  });

  it("keeps no setting in a dialog: the Edit settings button is gone", async () => {
    await openImage();

    expect(screen.queryByRole("button", { name: "Edit settings" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("each is honoured once set there", () => {
  it("pixel priority, from Application Settings, reaches the save (RULE-012)", async () => {
    const { saveAnnotations, putSettings } = await openImage();
    const group = section("Global", "Application Settings");

    fireEvent.click(within(group).getByLabelText("Enable Pixel Priority"));
    const descending = within(group).getByLabelText("Descending") as HTMLInputElement;
    await waitFor(() => expect(descending.disabled).toBe(false));
    fireEvent.click(descending);
    await waitFor(() =>
      expect(lastPut(putSettings)).toMatchObject({ pixel_priority_enabled: true, pixel_priority_ascending: false }),
    );

    chooseTool("Poly (2)");
    drawTriangle(10, 10);
    fireEvent.click(writeButton());

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalled());
    expect(lastSave(saveAnnotations)["pixelPriority"]).toEqual({ enabled: true, ascending: false });
  });

  it("Join, from Annotation Settings, closes a polygon from that far away", async () => {
    // Legacy closes on `distance_squared < threshold ** 2`. The fourth press is sqrt(40), about
    // 6.3 pixels, from the first: a vertex at the default 2, the close at 10.
    const { putSettings } = await openImage();
    typeInto(section("Image", "Annotation Settings"), "Join threshold", "10");
    await waitFor(() => expect(lastPut(putSettings)["polygon_join_threshold"]).toBe(10));

    chooseTool("Poly (2)");
    press(10, 10);
    press(60, 10);
    press(60, 40);
    press(16, 12);

    expect(await screen.findByRole("button", { name: "Draw new annotations as class 0" })).toBeTruthy();
  });

  it("the same presses at the default Join leave the polygon open", async () => {
    await openImage();

    chooseTool("Poly (2)");
    press(10, 10);
    press(60, 10);
    press(60, 40);
    press(16, 12);

    await waitFor(() => expect(screen.getByTestId("vertex-3")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Draw new annotations as class 0" })).toBeNull();
  });

  it("Pan, from Annotation Settings, scales the step the pan keys move the image by", async () => {
    // A tenth of the pane a press times the pan speed (viewport_manager.py:60-79): 180 pixels of a
    // 900-pixel pane at 2.0, where the default moves 90.
    const { putSettings } = await openImage();
    fireEvent.change(within(section("Image", "Annotation Settings")).getByRole("slider", { name: "Pan speed" }), {
      target: { value: "20" },
    });
    await waitFor(() => expect(lastPut(putSettings)["pan_multiplier"]).toBe(2));

    // Sized as jsdom cannot lay it out, with its scroll recorded.
    const pane = screen.getByRole("main", { name: "Image" }).querySelector(".canvas-scroll") as HTMLElement;
    Object.defineProperty(pane, "clientWidth", { configurable: true, value: 900 });
    Object.defineProperty(pane, "clientHeight", { configurable: true, value: 600 });
    const scrollBy = vi.fn();
    pane.scrollBy = scrollBy as unknown as typeof pane.scrollBy;

    fireEvent.keyDown(document, { key: "D", code: "KeyD" });

    expect(scrollBy).toHaveBeenCalledWith({ left: 180, top: 0, behavior: "auto" });
  });

  it("Size, from Annotation Settings, sizes what is drawn over the image", async () => {
    // A vertex dot is point_radius x the size, in image pixels, as legacy's (main_window.py:516-523):
    // 0.6 at 2.0, where the default draws 0.3.
    const { putSettings } = await openImage();
    typeInto(section("Image", "Annotation Settings"), "Annotation size", "2.0");
    await waitFor(() => expect(lastPut(putSettings)["annotation_size_multiplier"]).toBe(2));

    chooseTool("Poly (2)");
    press(10, 10);

    await waitFor(() => expect(Number(screen.getByTestId("vertex-0").getAttribute("rx"))).toBeCloseTo(0.6, 10));
  });
});
