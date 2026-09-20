/**
 * Saving after switching images.
 *
 * The save button holds two pieces of state that belong to ONE image: the revision its write is
 * conditional on, and the outcome of the last write. Both are `useState`, so neither is re-derived
 * when a different image opens — which looked like two quiet defects. A carried-over revision
 * would refuse a save that should succeed and blame a file that did not change; a carried-over
 * success message would tell the user their work is on disk under the name of an image it was
 * never written to.
 *
 * NEITHER HAPPENS, AND THE REASON IS WORTH WRITING DOWN because it is not the one you would guess.
 * The button renders behind `metadata !== null`, and opening an image clears the whole side before
 * fetching — so the button unmounts for as long as the metadata is in flight, and comes back with
 * fresh state. The safety rests on a loading gap.
 *
 * That is too thin a thread for a conditional write to hang from: anyone removing the flicker by
 * keeping the previous metadata on screen while the next loads would break all three of these and
 * have no reason to suspect it. The call site now states it with `key={image.key}` instead, and
 * these tests hold it there.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { defaultSettings } from "@lazylabel/settings-schema";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { OpenImageView } from "../../src/workspace/OpenImageView.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

function datasetImage(key: string): WireDatasetImage {
  return { key, name: key.split("/").pop()!, sidecars: {}, annotated: false, sharesSidecarsWith: [] };
}

/** An image whose NPZ sidecar is at a known revision, which is what a conditional write cites. */
function at(revision: string): AnnotationsResult {
  return {
    kind: "loaded",
    annotations: {
      segments: [],
      classAliases: { "0": "car" },
      failures: [],
      rejected: 0,
      sourceFile: "frames/x.npz",
      sourceFormat: "NPZ",
      revision,
    },
  } as unknown as AnnotationsResult;
}

function Opener(): React.ReactNode {
  const { openImage } = useWorkspace();
  return (
    <>
      {["frames/a.png", "frames/b.png"].map((key) => (
        <button key={key} type="button" onClick={() => openImage(datasetImage(key))}>
          go {key}
        </button>
      ))}
    </>
  );
}

function mount() {
  const saveAnnotations = vi.fn(async () => ({
    written: { NPZ: "after-write" },
    stale: [] as string[],
    skippedEmpty: [] as string[],
  }));

  // Each image is at its OWN revision. Sending one where the other belongs is the whole point.
  const revisions: Record<string, string> = { "frames/a.png": "rev-A", "frames/b.png": "rev-B" };

  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    loadAnnotations: async (_project: string, key: string) => at(revisions[key]!),
    imageMetadata: async () => ({
      width: 200,
      height: 100,
      sourceDepth: 8,
      sourceChannels: 3,
      sourceFormat: "png",
    }),
    models: async () => [],
    pixelsUrl: () => "/pixels",
    thumbnailUrl: () => "/thumbnail",
    saveAnnotations,
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={client} projectId="default">
            <Opener />
            <OpenImageView client={client} projectId="default" />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );

  return { saveAnnotations };
}

const writeButton = () => screen.getByRole("button", { name: /^Write \d+ format/ });

async function open(key: string): Promise<void> {
  fireEvent.click(screen.getByText(`go ${key}`));
  await waitFor(() => expect(writeButton()).toBeTruthy());
}

describe("saving after switching images", () => {
  it("cites the NEW image's revision, not the one before it", async () => {
    const { saveAnnotations } = mount();
    await open("frames/a.png");
    await open("frames/b.png");

    fireEvent.click(writeButton());

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalled());
    const body = saveAnnotations.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(body["expectedRevisions"]).toEqual({ NPZ: "rev-B" });
  });

  it("cites the new image's revision even after a save on the previous one", async () => {
    // The harder case: a successful write replaces the held revision with the one it produced, so
    // after saving A the button is holding a revision that belongs to A's file and nothing else.
    const { saveAnnotations } = mount();
    await open("frames/a.png");
    fireEvent.click(writeButton());
    await waitFor(() => expect(saveAnnotations).toHaveBeenCalledTimes(1));

    await open("frames/b.png");
    fireEvent.click(writeButton());

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalledTimes(2));
    const body = saveAnnotations.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(body["expectedRevisions"]).toEqual({ NPZ: "rev-B" });
  });

  it("does not carry a success message onto the next image", async () => {
    // "Wrote NPZ beside b.png" for a write that only ever touched a.png. A user who reads it and
    // moves on has lost the work, and been told it was safe.
    const { saveAnnotations } = mount();
    await open("frames/a.png");
    fireEvent.click(writeButton());
    await waitFor(() => expect(saveAnnotations).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/^Wrote /)).toBeTruthy());

    await open("frames/b.png");

    expect(screen.queryByText(/^Wrote /)).toBeNull();
  });
});
