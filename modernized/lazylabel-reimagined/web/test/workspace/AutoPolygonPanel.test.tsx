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
/** Legacy's checkable "Auto-Convert: OFF" button (control_panel.py:406-418). */
const toggleButton = () => screen.findByRole("button", { name: /^Auto-Convert: (ON|OFF)$/ });

describe("the section, in legacy's words", () => {
  it("is legacy's toggle button, which says its state, with legacy's tooltip", async () => {
    mount();
    const toggle = await toggleButton();

    expect(toggle.textContent).toBe("Auto-Convert: OFF");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.title).toBe(
      "When enabled, AI segments are automatically converted to polygons\n"
        + "when you accept them (Spacebar). Toggle with P key.",
    );
  });

  it("shows the resolution between legacy's Simple and Detailed, on or off, and no paragraph", async () => {
    mount();
    // Shown while it is off too, as legacy's is (control_panel.py:421-448, CP-50).
    await toggleButton();
    expect(await screen.findByRole("slider", { name: "Polygon resolution" })).toBeTruthy();
    fireEvent.click(await toggleButton());

    const slider = await screen.findByRole("slider", { name: "Polygon resolution" });
    expect(screen.getByText("Polygon Resolution:")).toBeTruthy();
    expect(slider.closest("label")?.textContent).toBe("SimpleDetailed");
    expect(slider.closest("label")?.title).toBe(
      "Adjust how closely the polygon follows the AI mask.\nSimple = fewer points, Detailed = more points.",
    );
    expect(screen.getByRole("button", { name: "Auto-Convert: ON" }).getAttribute("aria-pressed")).toBe("true");
    expect([...document.querySelectorAll("p")].map((p) => p.textContent)).not.toContainEqual(
      expect.stringMatching(/accepted AI mask/),
    );
  });
});

describe("Reset to Default, legacy's section reset (CP-50)", () => {
  it("turns Auto-Convert off and puts the resolution back to 80", async () => {
    // control_panel.py:929-939: OFF, slider at 80, whatever they were.
    const { saved } = mount();
    fireEvent.click(await toggleButton());
    fireEvent.change(await screen.findByRole("slider", { name: "Polygon resolution" }), { target: { value: "30" } });
    await waitFor(() => expect(saved.at(-1)?.values["polygon_resolution"]).toBe(30));

    fireEvent.click(screen.getByRole("button", { name: "Reset to Default" }));

    await waitFor(() =>
      expect(saved.at(-1)?.values).toMatchObject({ auto_polygon_enabled: false, polygon_resolution: 80 }),
    );
    expect((await toggleButton()).textContent).toBe("Auto-Convert: OFF");
    expect(screen.getByRole("button", { name: "Reset to Default" }).title).toBe("Reset auto-polygon settings to defaults");
  });
});

describe("P, legacy's Toggle Auto-Convert AI to Polygon", () => {
  it("turns Auto-Convert on and says so, and off again on the next press", async () => {
    const { saved } = mount();
    await toggleButton();

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

  it("says which way it went when the button is clicked too, as legacy's button does", async () => {
    mount();

    fireEvent.click(await toggleButton());

    expect(await screen.findByText("Auto-Convert AI to Polygon: ON")).toBeTruthy();
  });
});

describe("converting the masks already on the image", () => {
  const button = () => screen.getByRole("button", { name: "Convert Masks" }) as HTMLButtonElement;

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
