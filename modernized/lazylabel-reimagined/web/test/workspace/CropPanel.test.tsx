/**
 * The crop panel, over RULE-018 — a P0 rule whose consequence is deleted work.
 *
 * `tools/crop.ts` is tested against the rule card's own worked example; what is tested here is the
 * PANEL: that what it stores is what the rule computes, that a crop is cleared when a new image
 * opens (decision 9), and that the destructive consequence is on screen before anyone presses save.
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
  fireEvent.click(screen.getByText("Apply crop"));
}

describe("before an image is open", () => {
  it("offers nothing to crop against", () => {
    mount();
    expect(screen.getByText(/needs an open image/)).toBeTruthy();
    expect(screen.queryByLabelText("X range")).toBeNull();
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

  it("says how many pixels the save will blank", async () => {
    // The whole point of the panel. Legacy blanks them with no warning and nothing in the exported
    // file records that a crop was involved.
    mount();
    await openA();

    typeCrop("0:500", "0:400");

    // 1000x800 minus the 500x400 kept region.
    expect(screen.getByText(/600,000 pixels/)).toBeTruthy();
  });

  it("warns that the file keeps its full size", async () => {
    mount();
    await openA();

    typeCrop("0:500", "0:400");

    expect(screen.getByText(/keep the full image size/)).toBeTruthy();
  });

  it("names the largest possible crop as still excluding the far edge", async () => {
    // 0:999 by 0:799 looks like the whole image and is not: the kept region is exclusive of the
    // far edge, so the last row and column are outside any crop. RULE-018's title says so.
    mount();
    await openA();

    typeCrop("0:999", "0:799");

    expect(screen.getByText(/last row and column are still outside/)).toBeTruthy();
    expect(screen.getByText(/1,799 pixels/)).toBeTruthy();
  });

  it("swaps a reversed range rather than refusing it", async () => {
    mount();
    await openA();

    typeCrop("700:50", "700:50");

    expect(screen.getByTestId("crop").textContent).toBe("50,50,700,700");
  });
});

describe("refusing what is not a range", () => {
  it("names WHICH field was wrong", async () => {
    // Two fields and one message means a user retypes both.
    mount();
    await openA();

    typeCrop("0:500", "nonsense");

    expect(screen.getByRole("alert").textContent).toContain("Y must be");
    expect(screen.getByTestId("crop").textContent).toBe("none");
  });

  it("names both when both are wrong", async () => {
    mount();
    await openA();

    typeCrop("nonsense", "also nonsense");

    expect(screen.getByRole("alert").textContent).toContain("X and Y must be");
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
  it("goes back to exporting the whole image", async () => {
    mount();
    await openA();
    typeCrop("0:500", "0:400");

    fireEvent.click(screen.getByText("Remove crop"));

    expect(screen.getByTestId("crop").textContent).toBe("none");
    expect(screen.getByText(/whole image is exported/)).toBeTruthy();
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
