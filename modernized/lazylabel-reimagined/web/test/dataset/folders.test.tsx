/**
 * Walking a dataset that has subfolders.
 *
 * RULE-051 makes the listing non-recursive, which is legacy's behaviour and is deliberate: making
 * it recursive would change which images a dataset contains. Non-recursive WITHOUT navigation is
 * something else though — a dead end. A dataset whose images live under `frames/` is the ordinary
 * layout, and it showed an empty root with nowhere to go.
 *
 * Found by running the app, not by a test. Every test here had stubbed the listing for one folder,
 * so nothing had ever asked what happens when the images are somewhere else.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetListing } from "@lazylabel/contracts";

import type { ApiClient } from "../../src/api/client.js";
import { DatasetBrowser } from "../../src/dataset/DatasetBrowser.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";
import { defaultSettings } from "@lazylabel/settings-schema";

afterEach(cleanup);

const COLUMNS = [{ format: "NPZ", suffix: ".npz" }];

/** A dataset with images two levels down, which is the shape that exposed the dead end. */
const TREE: Readonly<Record<string, { folders: string[]; images: string[] }>> = {
  "": { folders: ["frames", "spare"], images: [] },
  frames: { folders: ["day1"], images: ["a.png"] },
  "frames/day1": { folders: [], images: ["b.png"] },
  spare: { folders: [], images: [] },
};

function listingFor(folder: string): WireDatasetListing {
  const node = TREE[folder] ?? { folders: [], images: [] };
  return {
    folder,
    folders: node.folders,
    images: node.images.map((name) => ({
      key: folder === "" ? name : `${folder}/${name}`,
      name,
      sidecars: { NPZ: false },
      annotated: false,
      sharesSidecarsWith: [],
    })),
    annotatedCount: 0,
    unrecognized: 0,
    columns: COLUMNS,
  } as unknown as WireDatasetListing;
}

function show(overrides: Partial<ApiClient> = {}) {
  const listImages = vi.fn(async (_project: string, folder = "") => listingFor(folder));
  const api = {
    listImages,
    loadAnnotations: async () => ({ kind: "none" }),
    imageMetadata: async () => ({ width: 8, height: 8, sourceDepth: 8, sourceChannels: 3, sourceFormat: "png" }),
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    pixelsUrl: () => "/pixels",
    thumbnailUrl: () => "/thumbnail",
    ...overrides,
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={api}>
        <WorkspaceProvider client={api} projectId="p1">
          <DatasetBrowser client={api} projectId="p1" />
        </WorkspaceProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );

  return { listImages };
}

describe("a dataset whose images are not at the root", () => {
  it("names the folders below, rather than looking empty", async () => {
    show();

    expect(await screen.findByText("frames/")).toBeTruthy();
    expect(screen.getByText("spare/")).toBeTruthy();
  });

  it("says there are folders below rather than 'no images LazyLabel can open'", async () => {
    // The root of a real dataset holds only folders. Reporting that as no openable images reads as
    // a failure -- the wrong dataset, an unsupported format -- rather than as a place to go
    // through.
    show();

    expect(await screen.findByText(/There are folders below it/)).toBeTruthy();
  });

  it("goes down into one and lists its images", async () => {
    const { listImages } = show();

    fireEvent.click(await screen.findByText("frames/"));

    await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());
    expect(listImages).toHaveBeenCalledWith("p1", "frames");
  });

  it("goes down two levels, joining the path as it goes", async () => {
    const { listImages } = show();

    fireEvent.click(await screen.findByText("frames/"));
    fireEvent.click(await screen.findByText("day1/"));

    await waitFor(() => expect(listImages).toHaveBeenCalledWith("p1", "frames/day1"));
    expect(await screen.findByText("b.png")).toBeTruthy();
  });

  it("comes back up through the breadcrumb", async () => {
    const { listImages } = show();
    fireEvent.click(await screen.findByText("frames/"));
    fireEvent.click(await screen.findByText("day1/"));
    await waitFor(() => expect(screen.getByText("b.png")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "frames" }));

    await waitFor(() => expect(listImages).toHaveBeenLastCalledWith("p1", "frames"));
    expect(await screen.findByText("a.png")).toBeTruthy();
  });

  it("comes all the way back to the dataset root", async () => {
    const { listImages } = show();
    fireEvent.click(await screen.findByText("frames/"));
    await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Dataset" }));

    await waitFor(() => expect(listImages).toHaveBeenLastCalledWith("p1", ""));
  });

  it("does not offer the folder it is already in as somewhere to go", async () => {
    // The last crumb is where you are. A button that reloads the page you are on is a button that
    // does nothing, and a user who presses it learns nothing from the fact that nothing happened.
    show();
    fireEvent.click(await screen.findByText("frames/"));
    await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());

    expect((screen.getByRole("button", { name: "frames" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Dataset" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows an empty folder as empty, without inventing folders below it", async () => {
    show();

    fireEvent.click(await screen.findByText("spare/"));

    expect(await screen.findByText(/no images LazyLabel can open/)).toBeTruthy();
  });
});

describe("a server that does not send the field", () => {
  it("keeps working, with no navigation", async () => {
    // It arrives over the wire, so it can be absent. Reading `.length` off an absent field blanks
    // the whole pane with a TypeError; degrading to what the app did before it existed does not.
    show({
      listImages: async () => {
        const { folders: _dropped, ...rest } = listingFor("");
        return { ...rest, images: [] } as unknown as WireDatasetListing;
      },
    });

    expect(await screen.findByText(/no images LazyLabel can open/)).toBeTruthy();
  });
});
