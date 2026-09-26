/**
 * The crop panel, over RULE-018 — a P0 rule whose consequence is deleted work.
 *
 * `tools/crop.ts` is tested against the rule card's own worked example; what is tested here is the
 * PANEL: that what it stores is what the rule computes, that a crop is cleared when a new image
 * opens (decision 9), and that it reads as legacy's Border Crop does -- its buttons, its refusals
 * and its one status line (`border_crop_widget.py`).
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import type { ApiClient } from "../../src/api/client.js";
import { CropPanel } from "../../src/workspace/CropPanel.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

function datasetImage(key: string): WireDatasetImage {
  return { key, name: key, sidecars: {}, annotated: false, sharesSidecarsWith: [] };
}

/** Opens images and shows the stored crop, so a test can read what a save would send. */
function Probe(): React.ReactNode {
  const { openImage, crop } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(datasetImage("a.png"))}>
        open a
      </button>
      <button type="button" onClick={() => openImage(datasetImage("b.png"))}>
        open b
      </button>
      <p data-testid="crop">
        {crop === null ? "none" : `${crop.x1},${crop.y1},${crop.x2},${crop.y2}`}
      </p>
    </>
  );
}

function mount(size: { width: number; height: number } = { width: 1000, height: 800 }) {
  const client = {
    imageMetadata: async () => ({ ...size, sourceDepth: 8, sourceFormat: "png" }),
    loadAnnotations: async () => ({ kind: "none" }),
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
  } as unknown as ApiClient;

  return render(
    <WorkspaceProvider client={client} projectId="p">
      <Probe />
      <CropPanel />
    </WorkspaceProvider>,
  );
}

async function openA(): Promise<void> {
  fireEvent.click(screen.getByText("open a"));
  await waitFor(() => expect(screen.getByLabelText("X range")).toBeTruthy());
}

function typeCrop(x: string, y: string): void {
  fireEvent.change(screen.getByLabelText("X range"), { target: { value: x } });
  fireEvent.change(screen.getByLabelText("Y range"), { target: { value: y } });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
}

describe("before an image is open", () => {
  it("shows legacy's controls with nothing to crop against, disabled, saying why in legacy's words", () => {
    // crop_manager.py:118. A line of its own said so until 2026-09-26.
    mount();
    const apply = screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement;
    const draw = screen.getByRole("button", { name: "Draw crop rectangle" }) as HTMLButtonElement;

    expect((screen.getByLabelText("X range") as HTMLInputElement).disabled).toBe(true);
    expect(apply.disabled).toBe(true);
    expect(draw.disabled).toBe(true);
    expect([apply.title, draw.title]).toEqual(["No image loaded", "No image loaded"]);
    expect(document.querySelector(".crop p")).toBeNull();
  });

  it("carries legacy's tooltips once an image is open", async () => {
    // border_crop_widget.py:40, 51, 61, 68, 75.
    mount();
    await openA();

    expect(screen.getByLabelText("X range").closest("label")?.title).toBe("X coordinate range in format start:end");
    expect(screen.getByRole("button", { name: "Apply" }).title).toBe("Apply crop from coordinates");
    expect(screen.getByRole("button", { name: "Draw crop rectangle" }).title).toBe("Draw crop rectangle");
    expect(screen.getByRole("button", { name: "Clear crop" }).title).toBe("Clear crop");
  });
});

describe("applying a crop", () => {
  it("stores the rule card's worked example", async () => {
    // "-10:1200" and "50:700" on a 1000x800 image is (0, 50, 999, 700). Values outside the image
    // are legal input and clamp afterwards, which is legacy's order.
    mount();
    await openA();

    typeCrop("-10:1200", "50:700");

    expect(screen.getByTestId("crop").textContent).toBe("0,50,999,700");
  });

  it("shows the crop in force on its status line, in legacy's words", async () => {
    // border_crop_widget.py:136, 147. The paragraphs that counted the pixels a save would blank
    // went on 2026-09-26; the status bar still says "cropped on save".
    mount();
    await openA();

    typeCrop("0:500", "0:400");

    expect(screen.getByRole("status").textContent).toBe("Crop: 0:500, 0:400");
  });

  it("swaps a reversed range rather than refusing it", async () => {
    mount();
    await openA();

    typeCrop("700:50", "700:50");

    expect(screen.getByTestId("crop").textContent).toBe("50,50,700,700");
  });

  it("applies on Enter in either field, as legacy's returnPressed does", async () => {
    // CONTROL_PARITY.md CP-30: Enter did nothing; only the button applied.
    mount();
    await openA();
    fireEvent.change(screen.getByLabelText("X range"), { target: { value: "0:500" } });
    fireEvent.change(screen.getByLabelText("Y range"), { target: { value: "0:400" } });

    fireEvent.keyDown(screen.getByLabelText("Y range"), { key: "Enter" });

    expect(screen.getByTestId("crop").textContent).toBe("0,0,500,400");
  });

  it("writes the crop in force back into the fields, clamped as it was stored", async () => {
    // Legacy writes a drawn or clamped crop back (crop_manager.py:147-148); the fields kept the
    // typed text, so after a clamp or a drawn crop they described another rectangle.
    mount();
    await openA();

    typeCrop("-10:1200", "50:700");

    expect((screen.getByLabelText("X range") as HTMLInputElement).value).toBe("0:999");
    expect((screen.getByLabelText("Y range") as HTMLInputElement).value).toBe("50:700");
  });
});

describe("refusing what is not a range, in legacy's words", () => {
  it("names WHICH field was wrong", async () => {
    // border_crop_widget.py:116-125.
    mount();
    await openA();

    typeCrop("0:500", "nonsense");

    expect(screen.getByRole("alert").textContent).toBe("Invalid Y format. Use start:end");
    expect(screen.getByTestId("crop").textContent).toBe("none");
  });

  it("names X first when both are wrong, as legacy checks X first", async () => {
    mount();
    await openA();

    typeCrop("nonsense", "also nonsense");

    expect(screen.getByRole("alert").textContent).toBe("Invalid X format. Use start:end");
  });

  it("asks for both fields when one is empty, and for numbers when a half is not one", async () => {
    // border_crop_widget.py:110-111, 138-139.
    mount();
    await openA();

    typeCrop("0:500", "");
    expect(screen.getByRole("alert").textContent).toBe("Enter both X and Y coordinates");

    typeCrop("0:500", "a:b");
    expect(screen.getByRole("alert").textContent).toBe("Invalid coordinates. Use numbers only.");
  });

  it("leaves an existing crop alone when the new input is rejected", async () => {
    // A rejected edit must not silently remove the crop that was in force -- that would be a
    // typing mistake quietly changing what the next save writes.
    mount();
    await openA();
    typeCrop("0:500", "0:400");

    typeCrop("0:500", "rubbish");

    expect(screen.getByTestId("crop").textContent).toBe("0,0,500,400");
  });
});

describe("removing a crop", () => {
  it("goes back to exporting the whole image, from legacy's clear button", async () => {
    mount();
    await openA();
    typeCrop("0:500", "0:400");

    fireEvent.click(screen.getByRole("button", { name: "Clear crop" }));

    expect(screen.getByTestId("crop").textContent).toBe("none");
    expect(screen.queryByRole("status")).toBeNull();
    expect((screen.getByRole("button", { name: "Clear crop" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("decision 9: a crop does not carry over", () => {
  it("is cleared when another image opens", async () => {
    // Legacy KEEPS it. A crop set on a wide image and forgotten blanks most of the next, narrow
    // one on its first save, and nobody is told.
    mount();
    await openA();
    typeCrop("0:500", "0:400");
    expect(screen.getByTestId("crop").textContent).toBe("0,0,500,400");

    fireEvent.click(screen.getByText("open b"));

    await waitFor(() => expect(screen.getByTestId("crop").textContent).toBe("none"));
  });
});
