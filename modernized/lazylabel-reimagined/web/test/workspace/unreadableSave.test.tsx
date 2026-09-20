/**
 * The save button for an image whose annotations could not be READ.
 *
 * Decision 7's central case, and the hole `canSave` was written to close before being called by
 * nothing. The image loads, its PIXELS are fine, and the segment list is empty because the read
 * failed — so pressing Write puts an empty annotation file over a damaged one that might still
 * have been recoverable. The write is unconditional there too, because a failed load returns no
 * revision to make it conditional on.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { OpenImageView } from "../../src/workspace/OpenImageView.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

const IMAGE: WireDatasetImage = {
  key: "frames/a.png",
  name: "a.png",
  sidecars: {},
  annotated: true,
  sharesSidecarsWith: [],
};

function Opener(): React.ReactNode {
  const { openImage } = useWorkspace();
  return (
    <button type="button" onClick={() => openImage(IMAGE)}>
      open
    </button>
  );
}

function mount(result: AnnotationsResult) {
  const saveAnnotations = vi.fn(async () => ({
    written: { NPZ: "r1" },
    stale: [] as string[],
    skippedEmpty: [] as string[],
  }));
  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (next: unknown) => next,
    loadAnnotations: async () => result,
    imageMetadata: async () => ({
      width: 40,
      height: 20,
      sourceDepth: 8,
      sourceChannels: 3,
      sourceFormat: "png",
    }),
    models: async () => [],
    pixelsUrl: () => "/pixels",
    saveAnnotations,
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={client} projectId="p1" confirmNavigation={() => true}>
            <Opener />
            <OpenImageView client={client} projectId="p1" />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
  return { saveAnnotations };
}

const unreadable = { kind: "unreadable", reason: "the npz is truncated" } as unknown as AnnotationsResult;
const empty = { kind: "none" } as unknown as AnnotationsResult;

const writeButton = () => screen.getByRole("button", { name: /^Write \d+ format/ }) as HTMLButtonElement;

async function open(): Promise<void> {
  fireEvent.click(screen.getByText("open"));
  await waitFor(() => expect(writeButton()).toBeTruthy());
}

describe("an image whose annotations could not be read", () => {
  it("DISABLES the write button", async () => {
    mount(unreadable);
    await open();

    expect(writeButton().disabled).toBe(true);
  });

  it("says why, rather than hiding the button", async () => {
    // A missing button is indistinguishable from a bug; a disabled one that says why is an
    // explanation, and it names the thing that would be lost.
    mount(unreadable);
    await open();

    expect(screen.getByText(/could not be read, so nothing can be written over them/)).toBeTruthy();
    expect(screen.getByText(/replace a damaged file with an empty one/)).toBeTruthy();
  });

  it("writes nothing even if the button is pressed", async () => {
    const { saveAnnotations } = mount(unreadable);
    await open();

    fireEvent.click(writeButton());

    expect(saveAnnotations).not.toHaveBeenCalled();
  });
});

describe("an image with no annotation file at all", () => {
  it("is still writable, because there is nothing to lose", async () => {
    // The distinction `provenance` exists for: "no file" and "could not read the file" both have
    // zero segments, and only one of them is dangerous to write over. Getting this wrong the other
    // way would take the save button away from the first image of every new dataset.
    const { saveAnnotations } = mount(empty);
    await open();

    expect(writeButton().disabled).toBe(false);

    fireEvent.click(writeButton());
    await waitFor(() => expect(saveAnnotations).toHaveBeenCalled());
  });
});
