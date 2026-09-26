/**
 * The Rescale section — RULE-032's window and RULE-031's presets, asked of the server.
 *
 * What is tested is what it OFFERS and what it asks for: a grayscale image gets the window and the
 * presets, a colour one gets legacy's one-line refusal, and Reset clears the window and any
 * preset, as legacy's does (`rescale_widget.py:320-328`). No paragraphs: what it says is legacy's
 * own info line.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import type { ApiClient } from "../../src/api/client.js";
import { RescalePanel } from "../../src/workspace/RescalePanel.jsx";
import { processingQuery } from "../../src/workspace/processing.js";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

const IMAGE: WireDatasetImage = {
  key: "a.png",
  name: "a.png",
  sidecars: {},
  annotated: false,
  sharesSidecarsWith: [],
};

function Probe(): React.ReactNode {
  const { openImage, processing } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(IMAGE)}>open</button>
      <p data-testid="query">{processingQuery(processing)}</p>
    </>
  );
}

function mount(metadata: { sourceChannels: number; sourceDepth: 8 | 16 }) {
  const client = {
    imageMetadata: async () => ({ width: 40, height: 20, sourceFormat: "png", ...metadata }),
    loadAnnotations: async () => ({ kind: "none" }),
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
  } as unknown as ApiClient;

  return render(
    <WorkspaceProvider client={client} projectId="p">
      <Probe />
      <RescalePanel />
    </WorkspaceProvider>,
  );
}

async function open(metadata: { sourceChannels: number; sourceDepth: 8 | 16 }) {
  const view = mount(metadata);
  fireEvent.click(screen.getByText("open"));
  await waitFor(() => expect(screen.queryByText("Load a grayscale image to enable")).toBeNull());
  return view;
}

const GRAY8 = { sourceChannels: 1, sourceDepth: 8 } as const;
const COLOUR8 = { sourceChannels: 3, sourceDepth: 8 } as const;
const GRAY16 = { sourceChannels: 1, sourceDepth: 16 } as const;

const query = () => screen.getByTestId("query").textContent;

describe("what it says, in legacy's words", () => {
  it("asks for a grayscale image before one is open", () => {
    mount(GRAY8);
    expect(screen.getByText("Load a grayscale image to enable")).toBeTruthy();
  });

  it("names a colour image as legacy does, with no controls", async () => {
    // RULE-032 disables rescale for colour; legacy's info line says so (rescale_widget.py:276-281).
    await open(COLOUR8);

    expect(screen.getByText("RGB image — rescale disabled")).toBeTruthy();
    expect(screen.queryByLabelText("Rescale low")).toBeNull();
  });

  it("gives a grayscale image the window and legacy's range line, and no paragraphs", async () => {
    const { container } = await open(GRAY8);
    const rescale = container.querySelector(".rescale")!;

    expect(screen.getByLabelText("Rescale low")).toBeTruthy();
    // Exactly legacy's string, double spaces and all (rescale_widget.py:285-287).
    expect(rescale.querySelector(".processing__info")?.textContent).toBe(
      "Range: 0–255  |  Drag handles to rescale",
    );
    expect(rescale.querySelectorAll("p, [role=alert], [role=status]")).toHaveLength(0);
  });

  it("runs the window to 65535 on a 16-bit image", async () => {
    const { container } = await open(GRAY16);

    expect(screen.getByLabelText("Rescale low").getAttribute("max")).toBe("65535");
    expect(container.querySelector(".rescale .processing__info")?.textContent).toBe(
      "Range: 0–65535  |  Drag handles to rescale",
    );
  });
});

describe("what it asks the server for", () => {
  it("puts the window on the query", async () => {
    await open(GRAY8);

    fireEvent.change(screen.getByLabelText("Rescale low"), { target: { value: "20" } });

    await waitFor(() => expect(query()).toBe("?rescaleMin=20&rescaleMax=255"));
  });

  it("asks for nothing when the handles cross, rather than blanking the image", async () => {
    await open(GRAY8);

    fireEvent.change(screen.getByLabelText("Rescale high"), { target: { value: "0" } });

    expect(query()).toBe("");
  });

  it("puts a preset on the query, and dragging the window clears it (RULE-031)", async () => {
    await open(GRAY8);

    fireEvent.click(screen.getByLabelText("Equalize"));
    await waitFor(() => expect(query()).toBe("?preset=equalize"));

    fireEvent.change(screen.getByLabelText("Rescale low"), { target: { value: "30" } });
    await waitFor(() => expect(query()).toBe("?rescaleMin=30&rescaleMax=255"));
  });

  it("resets the window AND a preset, with legacy's tooltip", async () => {
    await open(GRAY8);
    fireEvent.click(screen.getByLabelText("CLAHE"));
    await waitFor(() => expect(query()).toContain("preset=clahe"));

    const reset = screen.getByRole("button", { name: "Reset" });
    expect(reset.getAttribute("title")).toBe("Reset rescale to full range");
    fireEvent.click(reset);

    await waitFor(() => expect(query()).toBe(""));
  });
});
