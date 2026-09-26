/**
 * Legacy's Auto-Convert, its P key, and the web's button for converting masks after the fact.
 *
 * P is legacy's "Toggle Auto-Convert AI to Polygon" (hotkeys.py:97-102, main_window.py:1764-1766),
 * with the toast "Auto-Convert AI to Polygon: ON/OFF" (main_window.py:1746-1753). Until 2026-09-25
 * the web's P converted the masks already on the image instead: a different action under legacy's
 * key (`CONTROL_PARITY.md` CP-12). That conversion is now the button this file also tests.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";

import { encodeMask, type WireDatasetImage, type WireSegment } from "@lazylabel/contracts";
import { defaultSettings, type StoredSettings } from "@lazylabel/settings-schema";

import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider, useSettings } from "../../src/settings/SettingsProvider.jsx";
import { AutoPolygonPanel, useAutoConvertKey } from "../../src/workspace/AutoPolygonPanel.jsx";
import { WorkspaceProvider, useWorkspace } from "../../src/workspace/WorkspaceProvider.jsx";

afterEach(cleanup);

const IMAGE: WireDatasetImage = { key: "a.png", name: "a.png", sidecars: {}, annotated: true, sharesSidecarsWith: [] };

/** A mask of `rects` ([x0, y0, x1, y1), end-exclusive) on a 20x20 image. */
function mask(classId: number, ...rects: readonly (readonly [number, number, number, number])[]): WireSegment {
  const data = new Uint8Array(20 * 20);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) data[y * 20 + x] = 1;
  }
  return { type: "AI", classId, mask: encodeMask({ height: 20, width: 20, data }) } as WireSegment;
}

function Shell({ children }: { readonly children: ReactNode }): ReactNode {
  const { settings } = useSettings();
  return <HotkeyProvider bindings={settings.hotkeys}>{children}</HotkeyProvider>;
}

function Key(): ReactNode {
  useAutoConvertKey();
  return null;
}

function Probe(): ReactNode {
  const { openImage, segments } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => openImage(IMAGE)}>open</button>
      <p data-testid="types">{segments.map((segment) => segment.type).join(",")}</p>
    </>
  );
}

function mount(segments: readonly WireSegment[] = []) {
  const saved: StoredSettings[] = [];
  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (next: StoredSettings) => {
      saved.push(next);
      return next;
    },
    imageMetadata: async () => ({ width: 20, height: 20, sourceDepth: 8, sourceFormat: "png" }),
    loadAnnotations: async (): Promise<AnnotationsResult> =>
      ({
        kind: "loaded",
        annotations: { segments, classAliases: {}, failures: [], rejected: 0, sourceFile: "a.npz", sourceFormat: "NPZ" },
      }) as unknown as AnnotationsResult,
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <NotificationHost />
      <SettingsProvider client={client}>
        <Shell>
          <WorkspaceProvider client={client} projectId="p1">
            <Key />
            <Probe />
            <AutoPolygonPanel />
          </WorkspaceProvider>
        </Shell>
      </SettingsProvider>
    </NotificationProvider>,
  );
  return { saved };
}

const pressP = () => fireEvent.keyDown(document, { key: "p", code: "KeyP" });

describe("P, legacy's Toggle Auto-Convert AI to Polygon", () => {
  it("turns Auto-Convert on and says so, and off again on the next press", async () => {
    const { saved } = mount();
    await screen.findByRole("checkbox", { name: "Convert AI masks to polygons" });

    pressP();
    await waitFor(() => expect(saved.at(-1)?.values["auto_polygon_enabled"]).toBe(true));
    expect(await screen.findByText("Auto-Convert AI to Polygon: ON")).toBeTruthy();

    pressP();
    await waitFor(() => expect(saved.at(-1)?.values["auto_polygon_enabled"]).toBe(false));
    expect(await screen.findByText("Auto-Convert AI to Polygon: OFF")).toBeTruthy();
  });

  it("does not convert the masks already on the image, which it used to", async () => {
    mount([mask(1, [2, 2, 12, 12])]);
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(screen.getByTestId("types").textContent).toBe("AI"));

    pressP();

    await screen.findByText("Auto-Convert AI to Polygon: ON");
    expect(screen.getByTestId("types").textContent).toBe("AI");
  });

  it("says which way it went when the box is clicked too, as legacy's button does", async () => {
    mount();

    fireEvent.click(await screen.findByRole("checkbox", { name: "Convert AI masks to polygons" }));

    expect(await screen.findByText("Auto-Convert AI to Polygon: ON")).toBeTruthy();
  });
});

describe("converting the masks already on the image", () => {
  const button = () => screen.getByRole("button", { name: "Convert this image's masks to polygons" }) as HTMLButtonElement;

  it("turns each mask into a polygon, in one step", async () => {
    mount([mask(1, [2, 2, 12, 12]), mask(2, [14, 14, 19, 19])]);
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(button().disabled).toBe(false));

    fireEvent.click(button());

    await waitFor(() => expect(screen.getByTestId("types").textContent).toBe("Polygon,Polygon"));
  });

  it("is unavailable with no masks to convert", async () => {
    mount();

    expect(button().disabled).toBe(true);
  });

  it("says so when none of the masks can become a polygon, and leaves them as masks", async () => {
    // A one-pixel-wide sliver approximates to a line, which is no polygon.
    mount([mask(1, [5, 2, 6, 18])]);
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(button().disabled).toBe(false));

    fireEvent.click(button());

    expect(await screen.findByText("No masks on this image could become polygons")).toBeTruthy();
    expect(screen.getByTestId("types").textContent).toBe("AI");
  });
});
