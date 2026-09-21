/**
 * Closing the tab on unsaved work — RULE-054, and the last silent path decision 7 left.
 *
 * `onClose` was written for this, tested, and asked by nothing: no `beforeunload` handler existed,
 * so closing a tab with unsaved annotations said nothing at all. The reach guard reported the
 * function as called, because a comment mentioned it by name.
 *
 * jsdom cannot perform a real unload, so the registration is injected and the handler driven
 * directly. What is under test is the DECISION and the two properties that arm the dialog — not
 * the browser's rendering of it, which no page controls.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { CloseGuard } from "../../src/workspace/CloseGuard.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

const IMAGE = {
  key: "frames/f01.png",
  name: "f01.png",
  sidecars: {},
  annotated: false,
  sharesSidecarsWith: [],
};

function client(): ApiClient {
  return {
    getSettings: async () => defaultSettings(),
    putSettings: async (next: unknown) => next,
    imageMetadata: async () => ({
      width: 8,
      height: 8,
      sourceDepth: 8,
      sourceChannels: 3,
      sourceFormat: "png",
    }),
    loadAnnotations: async () => ({ kind: "none" }),
    pixelsUrl: () => "/pixels",
    thumbnailUrl: () => "/thumbnail",
  } as unknown as ApiClient;
}

/**
 * Renders the guard with a button that opens an image and draws on it.
 *
 * Through the workspace's own API rather than by faking its state: what `onClose` is asked about
 * is whatever the real provider considers dirty, and a hand-built state object would be a second
 * opinion about that -- which is exactly the kind of agreement that quietly stops holding.
 */
function mount() {
  let handler: ((event: BeforeUnloadEvent) => void) | null = null;
  const unregister = vi.fn();
  const api = client();

  function Driver(): ReactNode {
    const { openImage, addSegment } = useWorkspace();
    return (
      <>
        <button type="button" onClick={() => void openImage(IMAGE as never)}>
          open
        </button>
        <button
          type="button"
          onClick={() =>
            addSegment({ type: "Polygon", classId: 0, vertices: [[1, 1], [4, 1], [4, 4]] } as never)
          }
        >
          draw
        </button>
      </>
    );
  }

  render(
    <NotificationProvider>
      <SettingsProvider client={api}>
        <WorkspaceProvider client={api} projectId="default">
          <Driver />
          <CloseGuard
            register={(candidate) => {
              handler = candidate;
              return unregister;
            }}
          />
        </WorkspaceProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );

  return {
    fire(): { prevented: boolean; returnValue: unknown } {
      let prevented = false;
      const event = {
        preventDefault: () => {
          prevented = true;
        },
        returnValue: undefined as unknown,
      };
      handler?.(event as unknown as BeforeUnloadEvent);
      return { prevented, returnValue: event.returnValue };
    },
    unregister,
  };
}

async function openAndDraw(): Promise<void> {
  fireEvent.click(screen.getByText("open"));
  await waitFor(() => expect(screen.getByText("draw")).toBeTruthy());
  fireEvent.click(screen.getByText("draw"));
}

describe("closing the tab", () => {
  it("registers a handler at all, which is the whole gap", () => {
    // The app had none. Everything below this line was unreachable.
    const { fire } = mount();

    expect(() => fire()).not.toThrow();
  });

  it("lets the tab close when nothing is unsaved", () => {
    // A prompt on every close is one people learn to click through, which would make it useless on
    // the day it mattered.
    const { fire } = mount();

    const { prevented, returnValue } = fire();

    expect(prevented).toBe(false);
    expect(returnValue).toBeUndefined();
  });

  it("STOPS the close when an image has unsaved work", async () => {
    // The point of the whole component. Legacy loses the last-edited image on exit and never names
    // it; decision 7 says nothing is lost without the user being asked.
    const { fire } = mount();
    await openAndDraw();

    const { prevented, returnValue } = fire();

    // Both, because browsers disagree about which one arms the dialog: preventDefault is the
    // modern spec and returnValue is what older engines check.
    expect(prevented).toBe(true);
    expect(returnValue).toBe("");
  });

  it("removes the handler when it unmounts", () => {
    // Otherwise a remounted app stacks handlers, and each one arms the dialog again.
    const { unregister } = mount();

    cleanup();

    expect(unregister).toHaveBeenCalled();
  });
});
