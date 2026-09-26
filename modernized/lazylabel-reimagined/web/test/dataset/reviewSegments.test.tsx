/**
 * A timeline frame chosen in the file list opens with the run's masks (SEQUENCE_PARITY.md SP-22).
 *
 * Legacy sends a sequence frame picked in its list through frame selection, so the propagated masks
 * show (right_panel.py:208; main_window.py:1447-1455, 3591-3606). The web's list opened the file.
 * The shell hands the list the timeline's lookup; this checks the list uses it.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WireDatasetListing, WireSegment } from "@lazylabel/contracts";
import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { DatasetBrowser } from "../../src/dataset/DatasetBrowser.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

const SQUARE: WireSegment = { type: "Polygon", classId: 1, vertices: [[1, 1], [5, 1], [5, 5], [1, 5]] };

const LISTING = {
  folder: "frames",
  folders: [],
  images: ["f01.png", "f02.png"].map((name) => ({
    key: `frames/${name}`,
    name,
    sidecars: { NPZ: false },
    annotated: false,
    sharesSidecarsWith: [],
  })),
  annotatedCount: 0,
  unrecognized: 0,
  columns: [{ format: "NPZ", suffix: ".npz" }],
} as unknown as WireDatasetListing;

function Count(): React.ReactNode {
  const { segments, open } = useWorkspace();
  return <p data-testid="opened">{open === null ? "none" : `${open.image.key}:${segments.length}`}</p>;
}

function show(reviewSegments: (key: string) => readonly WireSegment[] | undefined) {
  const api = {
    listImages: async () => LISTING,
    loadAnnotations: async () => ({ kind: "none" }),
    imageMetadata: async () => ({ width: 8, height: 8, sourceDepth: 8, sourceChannels: 3, sourceFormat: "png" }),
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/thumbnail",
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={api}>
        <WorkspaceProvider client={api} projectId="p1" confirmNavigation={() => true}>
          <DatasetBrowser client={api} projectId="p1" folder="frames" reviewSegments={reviewSegments} />
          <Count />
        </WorkspaceProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
}

describe("opening a timeline frame from the file list", () => {
  it("shows the run's masks for it, not its file", async () => {
    show((key) => (key === "frames/f02.png" ? [SQUARE] : undefined));

    fireEvent.doubleClick(await screen.findByRole("button", { name: "f02.png" }));

    await waitFor(() => expect(screen.getByTestId("opened").textContent).toBe("frames/f02.png:1"));
  });

  it("opens the file for anything the timeline has no masks for", async () => {
    show(() => undefined);

    fireEvent.doubleClick(await screen.findByRole("button", { name: "f01.png" }));

    await waitFor(() => expect(screen.getByTestId("opened").textContent).toBe("frames/f01.png:0"));
  });
});
