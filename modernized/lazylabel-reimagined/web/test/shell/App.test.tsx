/**
 * The shell: what it shows, and which failures it treats as blocking.
 *
 * The distinction under test is the failure-mode table's: an unreadable dataset folder stops
 * everything, an unavailable settings database stops nothing. Getting that backwards would either
 * block a user who could be working or let one label into a void.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import { App } from "../../src/shell/App.jsx";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import type { ApiClient } from "../../src/api/client.js";

afterEach(cleanup);

const AI_READY = {
  available: true,
  reason: null,
  videoCapable: true,
  accelerator: "NVIDIA RTX 4090",
};

const HEALTHY = {
  status: "ok",
  dataset: "ok",
  database: "ok",
  degraded: [] as string[],
  ai: AI_READY,
};

function mount(client: Partial<ApiClient>) {
  const full = {
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    health: async () => HEALTHY,
    listImages: async () => ({
      folder: "",
      images: [],
      annotatedCount: 0,
      unrecognized: 0,
      columns: [],
    }),
    imageMetadata: async () => ({ width: 1, height: 1, sourceDepth: 8, sourceFormat: "png" }),
    models: async () => [],
    pixelsUrl: () => "/api/pixels",
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/api/thumbnail",
    ...client,
  } as ApiClient;

  // Same nesting main.tsx uses: notifications outermost, because a failure to LOAD settings is
  // itself something to report.
  return render(
    <NotificationProvider>
      <SettingsProvider client={full}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={full} projectId="default">
            <App client={full} />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
}

describe("the application shell", () => {
  it("renders and reports what it is", async () => {
    mount({});
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("LazyLabel");

    // The health facts moved into the status bar, which reports only what is WRONG -- a line that
    // always reads "dataset: ok" trains the eye to skip where "unreadable" would appear. So what
    // this waits for is the bar having reached the server at all.
    await waitFor(() => expect(screen.getByLabelText("Status").textContent).toMatch(/AI ready/));
  });

  it("blocks with an alert when the dataset folder cannot be read, NAMING it", async () => {
    // The folder is the source of truth, so this is fatal and says so, rather than showing an
    // empty file list that reads as "you have no images".
    //
    // And it names the path, which the failure-mode table asks for and which this did not do. The
    // folder is one the operator configured and only the server knew, so the one person who can
    // fix it was given every word except the useful one.
    mount({
      health: async () => ({
        status: "unavailable",
        dataset: "unreadable",
        datasetRoot: "/datasets/cells_2024",
        database: "ok",
        degraded: [],
        ai: AI_READY,
      }),
    });

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(
        /dataset folder .* cannot be read/i,
      ),
    );
    expect(screen.getByRole("alert").textContent).toContain("/datasets/cells_2024");
  });

  it("still blocks when the server does not say which folder", async () => {
    // An older API sends no path. A banner reading "cannot read undefined" would be worse than one
    // that names nothing, so the sentence simply loses that clause.
    mount({
      health: async () => ({
        status: "unavailable",
        dataset: "unreadable",
        database: "ok",
        degraded: [],
        ai: AI_READY,
      }),
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/dataset folder cannot be read/i);
    expect(alert.textContent).not.toMatch(/undefined/);
  });

  it("warns without blocking when settings are unavailable", async () => {
    mount({
      getSettings: async () => {
        throw new Error("the settings database is locked");
      },
    });

    const banner = await screen.findByRole("status");
    expect(banner.textContent).toMatch(/preferences will not be remembered/i);
    // And it says why that is survivable, which is the fact the user needs.
    expect(banner.textContent).toMatch(/annotations are files/i);

    // Not an alert: nothing is blocked.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the API is unreachable rather than showing an empty page", async () => {
    mount({
      health: async () => {
        throw new Error("connection refused");
      },
    });

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/API could not be reached/i),
    );
  });

  it("lists every capability with its status, and none of them now reads as pending", async () => {
    /*
     * This assertion has been rewritten three times as the table emptied, and each rewrite is the
     * point rather than an inconvenience. It named C4 while drawing was unbuilt, then C11 while
     * propagation was, and now there is nothing left to name.
     *
     * What it guards has never changed: the table must not read as available for something that
     * is not. `coverage.test.ts` keeps the other direction honest -- a capability marked built
     * with no acceptance test behind it fails there.
     */
    mount({});
    await waitFor(() => expect(screen.getByRole("button", { name: /What is built/ })).toBeTruthy());

    // The table lives in a dialog opened from Application Settings, so the reference is out of the
    // way of the work without being gone.
    screen.getByRole("button", { name: /What is built/ }).click();

    await waitFor(() =>
      expect(screen.getByText(/Propagate labels through a sequence/).closest("tr")?.textContent)
        .toMatch(/built/),
    );
    expect(screen.getByText(/Draw and edit polygons/).closest("tr")?.textContent).toMatch(/built/);
    // And not by saying "built" to everything: a row that is this service's business at all says
    // so, and the ones that are not are marked rather than claimed.
    expect(screen.queryByText(/pending/)).toBeNull();
  });

  it("offers every tool panel, with nothing left named as missing", async () => {
    // This assertion has been rewritten twice as the panels landed: first it looked for a "Phase
    // 5" marker, then for a "still to come" line. Both are gone now because there is nothing left
    // in this pane to name -- which is the outcome the marker existed to make visible. What it
    // checks now is that each panel is actually there.
    mount({});
    await waitFor(() => expect(screen.getByLabelText("Tools")).toBeTruthy());

    const tools = screen.getByLabelText("Tools");
    // Legacy's left column: the Mode Controls card, then its sections under Global and Image.
    expect(tools.textContent).toMatch(/Mode Controls/);
    expect(tools.textContent).toMatch(/AI Model Selection/);
    expect(tools.textContent).toMatch(/Image Adjustments/);
    expect(tools.textContent).toMatch(/Border Crop/);
    expect(tools.textContent).not.toMatch(/still to come/);
  });

  it("puts the image in the main landmark and the dataset beside it", async () => {
    mount({});
    await waitFor(() => expect(screen.getByLabelText("Dataset")).toBeTruthy());

    // By role: "Image" also names the left column's Image tab panel.
    expect(screen.getByRole("main", { name: "Image" })).toBeTruthy();
    // And only one: the page wrapper was a second <main> around it, which is invalid and gave a
    // screen reader two regions called main.
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByLabelText("Dataset").textContent).toMatch(/Segments/);
  });

  it("shows the hotkey editor from its button", async () => {
    // It used to have a KEY, and that key was `fit_view`. The binding was honest scaffolding when
    // the dispatcher was new -- the first wire through it, proving the path end to end -- and it
    // became a lie once the reference table began reporting `fit_view` as live. A key listed under
    // that name, with its key beside it, that opens a list of keys instead of fitting the image is
    // worse than one that does nothing: a user presses it once and stops trusting the table.
    mount({});
    await waitFor(() => expect(screen.getByRole("button", { name: "Show hotkeys" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Show hotkeys" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Hotkey Configuration" })).toBeTruthy());
    // Legacy's dialog opens on its first tab, Modes, whose first row is the AI tool's.
    const dialog = within(screen.getByRole("dialog", { name: "Hotkey Configuration" }));
    expect(dialog.getByRole("tab", { selected: true }).textContent).toBe("Modes");
    expect(dialog.getByRole("rowheader", { name: "Sam Mode" })).toBeTruthy();
  });

  it("does NOT open the reference on the fit_view key", async () => {
    // The specific regression. "." fits the image now, and must not do this.
    mount({});
    await waitFor(() => expect(screen.getByRole("button", { name: "Show hotkeys" })).toBeTruthy());

    document.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Period", key: ".", bubbles: true, cancelable: true }),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("heading", { name: "Hotkey Configuration" })).toBeNull();
  });
});

describe("the theme", () => {
  // The document outlives cleanup(), so a theme left behind would leak into the next test.
  afterEach(() => {
    delete document.documentElement.dataset["theme"];
  });

  it("applies the stored preference to the document", async () => {
    mount({});

    // Waited for rather than asserted straight away: the attribute is absent BEFORE settings load
    // too, so a bare assertion here would pass on the state this test exists to distinguish from.
    await waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("dark"));
  });

  it("falls back to the system when settings could not be read", async () => {
    // The case the design turns on: honouring the default here would hand someone a dark app on a
    // light desktop with no way out, because the toggle writes to the store that is down.
    mount({ getSettings: async () => { throw new Error("the database is locked"); } });

    // Wait for the app to KNOW settings failed, so "no attribute" means the fallback rather than
    // "settings have not loaded yet" -- which looks identical.
    await waitFor(() => expect(screen.getByText(/Settings are unavailable/)).toBeTruthy());
    expect(document.documentElement.dataset["theme"]).toBeUndefined();
  });

  it("writes the new preference when toggled, rather than only changing the screen", async () => {
    // A theme that resets on reload is a theme the user has to set every session.
    const saved: unknown[] = [];
    mount({ putSettings: async (settings: unknown) => { saved.push(settings); return settings as never; } });
    await waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("dark"));

    screen.getByRole("button", { name: /Switch to light theme/ }).click();

    await waitFor(() => expect(saved).toHaveLength(1));
    expect((saved[0] as { values: Record<string, unknown> }).values["dark_mode"]).toBe(false);
  });
});

describe("next and previous image (CONTROL_PARITY.md CP-14)", () => {
  const image = (name: string) => ({ key: name, name, sidecars: {}, annotated: false, sharesSidecarsWith: [] });

  it("move through the rows as the list SHOWS them, sorted, as legacy's do", async () => {
    // Sorted Z-A, the row below b.png is a.png. The key stepped through the raw listing (a, b, c)
    // and opened c.png, the row ABOVE.
    const opened: string[] = [];
    mount({
      getSettings: async () => {
        const base = defaultSettings();
        return { ...base, values: { ...base.values, file_manager_sort_order: 1 } };
      },
      listImages: async () => ({
        folder: "",
        folders: [],
        images: [image("a.png"), image("b.png"), image("c.png")],
        annotatedCount: 0,
        unrecognized: 0,
        columns: [],
      }),
      loadAnnotations: async (_project: string, key: string) => {
        opened.push(key);
        return { kind: "none" };
      },
    } as unknown as Partial<ApiClient>);

    await waitFor(() =>
      expect([...document.querySelectorAll(".dataset tbody tr")].map((row) => row.textContent?.slice(0, 5))).toEqual([
        "c.png",
        "b.png",
        "a.png",
      ]),
    );
    fireEvent.click(screen.getByRole("button", { name: "b.png" }));
    await waitFor(() => expect(opened).toEqual(["b.png"]));

    fireEvent.keyDown(document, { key: "ArrowRight", code: "ArrowRight" });

    await waitFor(() => expect(opened).toEqual(["b.png", "a.png"]));
  });
});
