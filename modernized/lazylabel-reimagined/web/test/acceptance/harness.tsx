/**
 * One provider stack for the capability tests that drive the whole shell.
 *
 * A plain module rather than a test file: importing one test file from another registers its tests
 * twice, which `placeheld.ts` records the API package learning the hard way.
 *
 * Every capability test that uses this mounts the REAL `App` with only the HTTP client stubbed,
 * because what these tests claim is that a person can reach the capability. Three features in this
 * project were built, unit-tested and unreachable — the vertex editor, the adjustment sliders and
 * undo/redo — and every component test passed throughout.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import { App } from "../../src/shell/App.jsx";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";
import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";

/** The canvas is 200x100 and sits at the origin, so a click coordinate IS an image coordinate. */
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };

export function mount(loaded: AnnotationsResult = { kind: "none" }) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  } as DOMRect);

  const saveAnnotations = vi.fn(
    async (_project: string, _key: string, _body: Record<string, unknown>) => ({
      written: { NPZ: "r1", COCO_JSON: "r2" },
      // A sidecar in a format that was NOT selected and is still on disk. Decision 15f says report
      // it and offer removal, never delete, so every save here has one to report.
      stale: ["frames/a.xml"],
      skippedEmpty: [] as string[],
    }),
  );
  const putSettings = vi.fn(async (settings: unknown) => settings);

  const client = {
    getSettings: async () => defaultSettings(),
    putSettings,
    health: async () => ({
      status: "ok",
      dataset: "ok",
      database: "ok",
      degraded: [],
      ai: { available: false, reason: "none", videoCapable: false, accelerator: "unknown" },
    }),
    listImages: async () => ({
      folder: "frames",
      folders: [],
      annotatedCount: 0,
      unrecognized: 0,
      columns: [{ format: "NPZ", suffix: ".npz" }],
      images: [
        {
          key: "frames/a.png",
          name: "a.png",
          sidecars: { NPZ: false },
          annotated: false,
          sharesSidecarsWith: [],
        },
      ],
    }),
    loadAnnotations: async () => loaded,
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
            <App client={client} />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );

  return { saveAnnotations, putSettings };
}

export async function openImage(loaded?: AnnotationsResult) {
  const handles = mount(loaded);
  await waitFor(() => expect(screen.getByRole("button", { name: "a.png" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "a.png" }));
  await waitFor(() => expect(screen.getByLabelText("Status").textContent).toMatch(/a\.png/));
  return handles;
}

/** Choose a drawing tool from the shell's picker, the way a user does. */
export function chooseTool(label: string): void {
  fireEvent.click(screen.getByRole("radio", { name: label }));
}

/**
 * Draw a triangle with the polygon tool and close it on Space.
 *
 * Shift on the closing keystroke ERASES with the shape instead of adding it, which is legacy's
 * gesture and is not discoverable from the tool picker.
 */
export function drawTriangle(x: number, y: number, erase = false): void {
  const press = (px: number, py: number) =>
    fireEvent.pointerDown(screen.getByLabelText("Polygon tool"), {
      button: 0,
      clientX: px,
      clientY: py,
    });

  press(x, y);
  press(x + 40, y);
  press(x + 40, y + 30);
  fireEvent.keyDown(document, { key: " ", shiftKey: erase });
}

/** The save button, which exists whenever an image is open — including one with no file yet. */
export const writeButton = (): HTMLElement =>
  screen.getByRole("button", { name: /^Write \d+ format/ });

/** The selection checkboxes in the segment table. */
export const selectBoxes = (): HTMLElement[] => screen.queryAllByRole("checkbox", { name: /^Select / });

/** The body of the last save request, which is what the file would be written from. */
export function lastSave(
  saveAnnotations: ReturnType<typeof vi.fn>,
): Record<string, unknown> {
  return (saveAnnotations.mock.calls.at(-1)?.[2] as Record<string, unknown> | undefined) ?? {};
}
