/**
 * Saving after switching images, and after the view remounts.
 *
 * Two pieces of state belong to ONE image: the revision its write is conditional on, and the
 * outcome of the last write. The button held both as `useState`, so neither was re-derived when a
 * different image opened — which looked like two quiet defects. A carried-over revision
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
 *
 * THE REVISION MOVED TO THE STORE on 2026-09-24, per side, beside `dirty`. The button remounts
 * whenever the view moves between the centre tabs, and when the other side of a pair is made
 * active and then this one again; each remount re-read the LOAD's revision, so the next save was
 * refused as a conflict with the app's own previous write.
 */

import { useState } from "react";
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

/**
 * An image whose NPZ sidecar is at a known revision, which is what a conditional write cites.
 *
 * With one segment, so a save WRITES: with none it deletes the image's files, as legacy's save does
 * (RULE-083, `emptySave.test.tsx`), and a deletion cites no revision.
 */
function at(revision: string): AnnotationsResult {
  return {
    kind: "loaded",
    annotations: {
      segments: [{ type: "Polygon", classId: 0, vertices: [[1, 1], [9, 1], [9, 9]] }],
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
  const { openImage, openImageOn, setActiveSide, addSegment, imageState } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImageOn(1, datasetImage("frames/b.png"))}>
        pair with b
      </button>
      <button type="button" onClick={() => setActiveSide(0)}>edit left</button>
      <button type="button" onClick={() => setActiveSide(1)}>edit right</button>
      <button
        type="button"
        onClick={() => addSegment({ type: "Polygon", classId: 0, vertices: [[1, 1]] } as never)}
      >
        draw
      </button>
      <p data-testid="dirty">{imageState?.dirty === true ? "unsaved" : "saved"}</p>
      {["frames/a.png", "frames/b.png"].map((key) => (
        <button key={key} type="button" onClick={() => openImage(datasetImage(key))}>
          go {key}
        </button>
      ))}
    </>
  );
}

/** The view, with a button that mounts a fresh one, as moving it to another tab does. */
function Remountable({ client }: { readonly client: ApiClient }): React.ReactNode {
  const [generation, setGeneration] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setGeneration((g) => g + 1)}>
        remount the view
      </button>
      <OpenImageView key={generation} client={client} projectId="default" />
    </>
  );
}

/** The images whose annotations were asked for, in order: an open is under way once its key is here. */
let loaded: string[] = [];

function mount() {
  loaded = [];
  const saveAnnotations = vi.fn(async (_project: string, _key: string, _body: unknown) => ({
    written: { NPZ: "after-write" },
    stale: [] as string[],
    skippedEmpty: [] as string[],
  }));

  // Each image is at its OWN revision. Sending one where the other belongs is the whole point.
  const revisions: Record<string, string> = { "frames/a.png": "rev-A", "frames/b.png": "rev-B" };

  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    loadAnnotations: async (_project: string, key: string) => {
      loaded.push(key);
      return at(revisions[key]!);
    },
    imageMetadata: async () => ({
      width: 200,
      height: 100,
      sourceDepth: 8,
      sourceChannels: 3,
      sourceFormat: "png",
    }),
    models: async () => [],
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/thumbnail",
    saveAnnotations,
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={client} projectId="default">
            <Opener />
            <Remountable client={client} />
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
  // The open waits for the leaving save of the image before, changed or not, so the button on
  // screen is that image's until this one's annotations are asked for.
  await waitFor(() => expect(loaded.at(-1)).toBe(key));
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

    // Three: leaving a.png saved it again, unchanged, as legacy's leaving save does.
    await waitFor(() => expect(saveAnnotations).toHaveBeenCalledTimes(3));
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

describe("saving again after the view remounts", () => {
  it("cites the revision the last save produced, not the load's", async () => {
    const { saveAnnotations } = mount();
    await open("frames/a.png");
    fireEvent.click(writeButton());
    await waitFor(() => expect(saveAnnotations).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/^Wrote /)).toBeTruthy());

    fireEvent.click(screen.getByText("remount the view"));
    fireEvent.click(writeButton());

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalledTimes(2));
    const body = saveAnnotations.mock.calls.at(-1)![2] as Record<string, unknown>;
    // "rev-A" here is a conflict with the file this app wrote a moment ago.
    expect(body["expectedRevisions"]).toEqual({ NPZ: "after-write" });
  });

  it("keeps each side's revision when the other side is edited in between", async () => {
    const { saveAnnotations } = mount();
    await open("frames/a.png");
    fireEvent.click(writeButton());
    await waitFor(() => expect(saveAnnotations).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/^Wrote /)).toBeTruthy());

    fireEvent.click(screen.getByText("pair with b"));
    fireEvent.click(screen.getByText("edit right"));
    await waitFor(() => expect(screen.getByText("b.png")).toBeTruthy());
    fireEvent.click(screen.getByText("edit left"));
    await waitFor(() => expect(screen.getByText("a.png")).toBeTruthy());
    fireEvent.click(writeButton());

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalledTimes(2));
    const body = saveAnnotations.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(body["expectedRevisions"]).toEqual({ NPZ: "after-write" });
  });
});

describe("after a save succeeds", () => {
  it("stops calling the image unsaved", async () => {
    // `markSaved` existed on the store, had its own test, was exposed on the context -- and had no
    // caller anywhere in the app. So `dirty` never cleared once anything was drawn, and the status
    // bar read "unsaved" for the rest of the session. That is the one thing a user checks before
    // closing a tab, and it is the defect family this project has now found nine of: a function
    // that works, is tested, and nothing calls.
    const { saveAnnotations } = mount();
    await open("frames/a.png");
    fireEvent.click(screen.getByText("draw"));
    await waitFor(() => expect(screen.getByTestId("dirty").textContent).toBe("unsaved"));

    fireEvent.click(writeButton());

    await waitFor(() => expect(saveAnnotations).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("dirty").textContent).toBe("saved"));
  });

  it("stays unsaved when the write was REFUSED", async () => {
    // The other half, and the one that would hurt: telling a user their work is safe after a save
    // that wrote nothing is worse than never clearing the flag at all.
    const { saveAnnotations } = mount();
    saveAnnotations.mockRejectedValue(new Error("the disk is full"));
    await open("frames/a.png");
    fireEvent.click(screen.getByText("draw"));

    fireEvent.click(writeButton());

    await waitFor(() => expect(screen.getByText(/Nothing was written/)).toBeTruthy());
    expect(screen.getByTestId("dirty").textContent).toBe("unsaved");
  });
});
