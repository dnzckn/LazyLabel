/**
 * The FFT Threshold section — RULE-030's cutoff, asked of the server.
 *
 * Grayscale only, as legacy's widget is (`fft_threshold_widget.py:277-317`), and grayscale is the
 * pixels' answer (RULE-024) carried in the metadata — so a colour image is told so in legacy's
 * words rather than offered a slider the server would ignore.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import type { ApiClient } from "../../src/api/client.js";
import { FrequencyPanel } from "../../src/workspace/FrequencyPanel.jsx";
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

function mount(sourceChannels: number) {
  const client = {
    imageMetadata: async () => ({ width: 40, height: 20, sourceFormat: "png", sourceDepth: 8, sourceChannels }),
    loadAnnotations: async () => ({ kind: "none" }),
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
  } as unknown as ApiClient;

  render(
    <WorkspaceProvider client={client} projectId="p">
      <Probe />
      <FrequencyPanel />
    </WorkspaceProvider>,
  );
}

async function open(sourceChannels: number) {
  mount(sourceChannels);
  fireEvent.click(screen.getByText("open"));
  await waitFor(() => expect(screen.queryByText("Load a single channel (grayscale) image")).toBeNull());
}

const query = () => screen.getByTestId("query").textContent;

describe("what it says, in legacy's words", () => {
  it("asks for a grayscale image before one is open", () => {
    mount(1);
    expect(screen.getByText("Load a single channel (grayscale) image")).toBeTruthy();
  });

  it("refuses a colour image, with no slider", async () => {
    await open(3);

    expect(screen.getByText("❌ Multi-channel color image - not supported")).toBeTruthy();
    expect(screen.queryByLabelText("Frequency cutoff")).toBeNull();
  });

  it("offers the cutoff on a grayscale image", async () => {
    await open(1);

    expect(screen.getByText("✓ Grayscale image - FFT processing available")).toBeTruthy();
    expect(screen.getByLabelText("Frequency cutoff")).toBeTruthy();
  });
});

describe("what it asks the server for", () => {
  it("asks for nothing at zero, which is the filter being off", async () => {
    await open(1);
    expect(query()).toBe("");
  });

  it("asks for one cutoff, which makes it a high-pass", async () => {
    await open(1);

    fireEvent.change(screen.getByLabelText("Frequency cutoff"), { target: { value: "1000" } });

    await waitFor(() => expect(query()).toBe("?frequencies=1000"));
  });

  it("turns off again at zero rather than sending an empty list", async () => {
    await open(1);
    fireEvent.change(screen.getByLabelText("Frequency cutoff"), { target: { value: "1000" } });
    await waitFor(() => expect(query()).toBe("?frequencies=1000"));

    fireEvent.change(screen.getByLabelText("Frequency cutoff"), { target: { value: "0" } });

    await waitFor(() => expect(query()).toBe(""));
  });
});
