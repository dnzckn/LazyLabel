/**
 * The rescale and channel-threshold panel — RULE-032 and RULE-029's controls.
 *
 * The rules run on the server; this panel asks. So what is tested is what it OFFERS and what it
 * refuses: that a colour image gets no rescale and three channels, a grayscale one gets rescale
 * and a single Gray, and that the marker-spacing limit is enforced before a marker is added rather
 * than by snapping it as legacy does.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import type { ApiClient } from "../../src/api/client.js";
import { ChannelPanel } from "../../src/workspace/ChannelPanel.jsx";
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

/** Shows the query the pixels URL would carry, which is the panel's whole output. */
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

  render(
    <WorkspaceProvider client={client} projectId="p">
      <Probe />
      <ChannelPanel />
    </WorkspaceProvider>,
  );
}

async function open(metadata: { sourceChannels: number; sourceDepth: 8 | 16 }) {
  mount(metadata);
  fireEvent.click(screen.getByText("open"));
  await waitFor(() => expect(screen.getByLabelText("Marker value")).toBeTruthy());
}

const GRAY8 = { sourceChannels: 1, sourceDepth: 8 } as const;
const COLOUR8 = { sourceChannels: 3, sourceDepth: 8 } as const;
const GRAY16 = { sourceChannels: 1, sourceDepth: 16 } as const;

const query = () => screen.getByTestId("query").textContent;

function addMarker(value: string) {
  fireEvent.change(screen.getByLabelText("Marker value"), { target: { value } });
  fireEvent.click(screen.getByText("Add marker"));
}

describe("before an image is open", () => {
  it("has nothing to measure against", () => {
    mount(GRAY8);
    expect(screen.getByText(/need an open image/)).toBeTruthy();
  });
});

describe("what a grayscale source offers", () => {
  it("offers rescale", async () => {
    await open(GRAY8);
    expect(screen.getByLabelText("Rescale low")).toBeTruthy();
  });

  it("offers one Gray channel, so there is no channel to choose", async () => {
    // RULE-029. A select with one option is a control that cannot be used for anything.
    await open(GRAY8);
    expect(screen.queryByLabelText("Channel")).toBeNull();
  });

  it("runs the sliders to 65535 on a 16-bit source", async () => {
    // The reason the chain is on the server: these values do not exist by the time the browser
    // sees the pixels.
    await open(GRAY16);
    expect(screen.getByLabelText("Rescale low").getAttribute("max")).toBe("65535");
  });
});

describe("what a colour source offers", () => {
  it("does NOT offer rescale, and says why", async () => {
    // RULE-032 disables it. Named rather than shown disabled: a greyed slider invites a user to
    // wonder what would enable it.
    await open(COLOUR8);

    expect(screen.queryByLabelText("Rescale low")).toBeNull();
    expect(screen.getByText(/grayscale images only/)).toBeTruthy();
  });

  it("offers three channels to choose between", async () => {
    await open(COLOUR8);
    expect(screen.getByLabelText("Channel")).toBeTruthy();
  });

  it("puts a marker on the channel that was chosen", async () => {
    await open(COLOUR8);

    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "b" } });
    addMarker("128");

    await waitFor(() => expect(query()).toBe("?markers_b=128"));
  });
});

describe("the marker-spacing limit", () => {
  it("refuses a marker too close to one already set, and says so", async () => {
    // Legacy silently SNAPS it to the minimum distance, which moves a band boundary the user did
    // not move. Refusing it with the reason is the difference between a limit and a surprise.
    await open(GRAY8);
    addMarker("50");
    await waitFor(() => expect(query()).toBe("?markers_gray=50"));

    addMarker("55");

    expect(screen.getByRole("alert").textContent).toMatch(/at least 10 apart/);
    expect(query()).toBe("?markers_gray=50");
  });

  it("accepts one exactly the minimum away", async () => {
    await open(GRAY8);
    addMarker("50");
    addMarker("60");

    await waitFor(() => expect(query()).toBe("?markers_gray=50%2C60"));
  });

  it("refuses a marker outside the image's range", async () => {
    await open(GRAY8);

    addMarker("900");

    expect(screen.getByRole("alert").textContent).toMatch(/between 0 and 255/);
  });

  it("refuses something that is not a number at all", async () => {
    await open(GRAY8);

    addMarker("nonsense");

    expect(screen.getByRole("alert").textContent).toMatch(/whole number/);
  });
});

describe("removing and resetting", () => {
  it("removes one marker", async () => {
    await open(GRAY8);
    addMarker("50");
    addMarker("100");
    await waitFor(() => expect(query()).toBe("?markers_gray=50%2C100"));

    fireEvent.click(screen.getByLabelText("Remove Gray marker 50"));

    await waitFor(() => expect(query()).toBe("?markers_gray=100"));
  });

  it("resets everything back to an empty query", async () => {
    await open(GRAY8);
    addMarker("50");
    fireEvent.change(screen.getByLabelText("Rescale low"), { target: { value: "20" } });
    await waitFor(() => expect(query()).toContain("rescaleMin=20"));

    fireEvent.click(screen.getByText("Reset processing"));

    await waitFor(() => expect(query()).toBe(""));
  });
});

describe("a crossed rescale window", () => {
  it("says the image is left alone rather than blanked", async () => {
    await open(GRAY8);

    fireEvent.change(screen.getByLabelText("Rescale high"), { target: { value: "0" } });

    expect(await screen.findByText(/left as it is rather than blanked/)).toBeTruthy();
    // And nothing is asked of the server, because there is nothing it would do.
    expect(query()).toBe("");
  });
});

describe("the frequency cutoff", () => {
  it("is offered whatever the source says it is, because the server decides", async () => {
    // RULE-030 runs on "2-D or exactly equal-channel" images, so a grayscale scan SAVED AS COLOUR
    // qualifies -- and only the server can tell, because the answer is in the pixels rather than
    // in the header. Hiding it for colour would refuse exactly those.
    await open(COLOUR8);

    expect(screen.getByLabelText("Frequency cutoff")).toBeTruthy();
  });

  it("warns a colour image that the filter may do nothing, BEFORE the slider is moved", async () => {
    // A user who sets a cutoff on a real colour photograph gets no change, and without this has no
    // way to tell that from a broken control. Whether the three channels are identical is a fact
    // about the pixels that only the server can see.
    await open(COLOUR8);

    expect(screen.getByText(/come back unchanged/)).toBeTruthy();
  });

  it("does not warn a grayscale image, where it always runs", async () => {
    await open(GRAY8);

    expect(screen.queryByText(/come back unchanged/)).toBeNull();
  });

  it("asks for nothing at zero, which is the filter being off", async () => {
    await open(GRAY8);

    expect(query()).toBe("");
  });

  it("asks for one cutoff, which makes it a high-pass", async () => {
    // Band 0 is weighted 0 and the last 1, so the frequencies BELOW the cutoff are the ones
    // removed -- a single threshold is a high-pass, not a low-pass.
    await open(GRAY8);

    fireEvent.change(screen.getByLabelText("Frequency cutoff"), { target: { value: "1000" } });

    await waitFor(() => expect(query()).toBe("?frequencies=1000"));
  });

  it("says the cutoff as a percentage of the half-diagonal", async () => {
    // 1000 of 10000 is ten percent, which is the unit the rule card states and the one a user can
    // reason about. The raw slider number means nothing on its own.
    await open(GRAY8);

    fireEvent.change(screen.getByLabelText("Frequency cutoff"), { target: { value: "1000" } });

    expect(await screen.findByText(/10.00% of/)).toBeTruthy();
  });

  it("turns off again at zero rather than sending an empty list", async () => {
    await open(GRAY8);
    fireEvent.change(screen.getByLabelText("Frequency cutoff"), { target: { value: "1000" } });
    await waitFor(() => expect(query()).toBe("?frequencies=1000"));

    fireEvent.change(screen.getByLabelText("Frequency cutoff"), { target: { value: "0" } });

    await waitFor(() => expect(query()).toBe(""));
  });

  it("is cleared by the reset", async () => {
    await open(GRAY8);
    fireEvent.change(screen.getByLabelText("Frequency cutoff"), { target: { value: "2500" } });
    await waitFor(() => expect(query()).toContain("frequencies"));

    fireEvent.click(screen.getByText("Reset processing"));

    await waitFor(() => expect(query()).toBe(""));
  });
});
