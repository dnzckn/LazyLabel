/**
 * Open Image Folder in the file panel: the owner's request of 2026-09-29, "when starting the
 * launch.cmd it asked me for a folder for images, why is that a part of the launch? in the gui the
 * user should be able to select a folder to load".
 *
 * Legacy's button sits over the file list, full width, with the tooltip "Open a directory of images"
 * (right_panel.py:112-114, 205). It opens the system's folder dialog; a folder chosen replaces the
 * list, and closing the dialog changes nothing (main_window.py:1431-1438). Here the server shows the
 * dialog (POST /api/folder, `{ choose: true }`), or, where it has no desktop to show one on, the
 * folder's path is typed (`{ path }`).
 *
 * The image open is left first, as a move to another image leaves it -- saved with Auto-Save on
 * Navigate on -- because once the folder has changed its key names a file in the new folder.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import { ApiError, type ApiClient, type FolderChoice, type FolderOpened, type FolderRequest } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { App } from "../../src/shell/App.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";
import { chooseTool, drawTriangle } from "../acceptance/harness.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The canvas is 200x100 at the origin, so a click coordinate IS an image coordinate. */
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };

const FIRST = "C:\\data\\first set";
const SECOND = "C:\\data\\second set";
/** What each folder holds, at its root. */
const FOLDERS: Readonly<Record<string, readonly string[]>> = {
  [FIRST]: ["a.png", "b.png"],
  [SECOND]: ["c.png", "d.png"],
};

const row = (name: string) => ({ key: name, name, sidecars: { NPZ: false }, annotated: false, sharesSidecarsWith: [] });

function mount({
  choice = "dialog",
  root = FIRST,
  folder = async () => ({ datasetRoot: SECOND, cancelled: false }),
  answer = true,
}: {
  choice?: FolderChoice;
  root?: string | null;
  /** What the server does with the request: the dialog's answer, or a refusal. */
  folder?: (request: FolderRequest) => Promise<FolderOpened>;
  /** The answer to a question about unsaved work. */
  answer?: boolean;
} = {}) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ ...RECT, toJSON: () => RECT } as DOMRect);

  let open = root;
  /** What reached the server, in order: the proof the image was saved BEFORE the folder changed. */
  const events: string[] = [];
  const openFolder = vi.fn(async (request: FolderRequest) => {
    events.push(`folder ${JSON.stringify(request)}`);
    const answered = await folder(request);
    if (!answered.cancelled) open = answered.datasetRoot;
    return answered;
  });
  const listImages = vi.fn(async () => {
    events.push(`list ${open}`);
    return {
      folder: "",
      folders: [],
      annotatedCount: 0,
      unrecognized: 0,
      columns: [{ format: "NPZ", suffix: ".npz" }],
      images: (open === null ? [] : FOLDERS[open] ?? []).map(row),
    };
  });
  const confirmNavigation = vi.fn((_summary: string) => answer);

  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    health: async () => ({
      status: "ok",
      dataset: open === null ? "none" : "ok",
      datasetRoot: open,
      folderChoice: choice,
      database: "ok",
      degraded: [],
      ai: { available: false, reason: "none", videoCapable: false, accelerator: "unknown" },
    }),
    listImages,
    loadAnnotations: async (_project: string, key: string) => {
      events.push(`load ${key}`);
      return { kind: "none" };
    },
    imageMetadata: async () => ({ width: 200, height: 100, sourceDepth: 8, sourceChannels: 3, sourceFormat: "png" }),
    models: async () => [],
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/thumbnail",
    saveAnnotations: async (_project: string, key: string) => {
      events.push(`save ${key}`);
      return { written: { NPZ: "rev-1" }, stale: [], skippedEmpty: [] };
    },
    deleteAnnotations: async (_project: string, key: string) => {
      events.push(`delete ${key}`);
      return { deleted: [] };
    },
    openFolder,
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={client} projectId="default" confirmNavigation={confirmNavigation}>
            <App client={client} />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );

  return { events, openFolder, listImages, confirmNavigation };
}

const status = () => screen.getByLabelText("Status").textContent ?? "";
const button = () => screen.getByRole("button", { name: "Open Image Folder" });
const autoSave = () => screen.getByLabelText("Auto-Save on Navigate") as HTMLInputElement;
/** The names the file list shows, in order. */
const listed = () => [...document.querySelectorAll("table.dataset tbody tr")].map((row) => row.getAttribute("data-key"));
/** What reached the server, but the listings, which a save also asks for again. */
const writes = (events: readonly string[]) => events.filter((event) => !event.startsWith("list "));

async function openA(): Promise<void> {
  fireEvent.doubleClick(await screen.findByRole("button", { name: "a.png" }));
  await waitFor(() => expect(status()).toMatch(/a\.png — 0 segments, saved/));
}

describe("the button", () => {
  it.each(["dialog", "path"] as const)(
    "is over the file list, with legacy's tooltip, where the folder is chosen by %s",
    async (choice) => {
      mount({ choice });

      await screen.findByRole("button", { name: "a.png" });
      expect(button().title).toBe("Open a directory of images");
      // Before everything else in the panel, as legacy's is above its list.
      const panel = button().closest("section")!;
      expect(panel.firstElementChild?.nextElementSibling).toBe(button());
      expect(button().className).toBe("dataset__open");
    },
  );

  it("is not there where the folder is fixed, as a server deployment's is", async () => {
    mount({ choice: "fixed" });

    await screen.findByRole("button", { name: "a.png" });
    expect(screen.queryByRole("button", { name: "Open Image Folder" })).toBeNull();
  });

  it("is all the panel shows before any folder is open, and nothing is listed or wrong", async () => {
    const { listImages } = mount({ root: null });

    await waitFor(() => expect(button()).toBeTruthy());
    await waitFor(() => expect(screen.queryByRole("searchbox", { name: "Search files" })).toBeNull());
    expect(button().closest("section")?.querySelectorAll("button")).toHaveLength(1);
    // No alert: no folder yet is where LazyLabel starts, not a failure.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(status()).not.toMatch(/unreadable/);
    await waitFor(() => expect(listImages).not.toHaveBeenCalled());
  });
});

describe("choosing a folder with the system's dialog", () => {
  it("saves the image being left, then opens the folder chosen, and the view starts from it", async () => {
    const { events, openFolder, confirmNavigation } = mount();
    await openA();
    chooseTool("Poly (2)");
    drawTriangle(10, 10);
    await waitFor(() => expect(status()).toMatch(/a\.png — 1 segment, unsaved/));

    fireEvent.click(button());

    await waitFor(() => expect(status()).toMatch(/Opened C:\\data\\second set/));
    expect(openFolder).toHaveBeenCalledWith({ choose: true });
    // The save came first, into the folder a.png is in; then the folder; then its list.
    expect(writes(events)).toEqual(["load a.png", "save a.png", 'folder {"choose":true}']);
    expect(confirmNavigation).not.toHaveBeenCalled();
    await waitFor(() => expect(listed()).toEqual(["c.png", "d.png"]));
    expect(events.at(-1)).toBe(`list ${SECOND}`);
    // Nothing of the old folder is left open.
    expect(status()).toMatch(/No image open\./);
    expect(screen.queryByLabelText(/^Select Polygon 1/)).toBeNull();
  });

  it("drops the Sequence timeline, as leaving its tab does, with the folder's own message", async () => {
    mount();
    fireEvent.click(await screen.findByRole("tab", { name: "Sequence" }));
    fireEvent.doubleClick(await screen.findByRole("button", { name: "a.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Set Start" }));
    fireEvent.doubleClick(screen.getByRole("button", { name: "b.png" }));
    await waitFor(() => expect(status()).toMatch(/b\.png — 0 segments, saved/));
    fireEvent.click(screen.getByRole("button", { name: "Set End" }));
    fireEvent.click(screen.getByRole("button", { name: "Build Timeline" }));
    await waitFor(() => expect(screen.getByLabelText("Timeline").querySelectorAll("button")).toHaveLength(2));

    fireEvent.click(button());

    await waitFor(() => expect(status()).toMatch(/Opened C:\\data\\second set/));
    await waitFor(() => expect(screen.queryByLabelText("Timeline")).toBeNull());
    expect(screen.getByText("Timeline Setup")).toBeTruthy();
    expect(screen.getByText(/^Start:/).textContent).toBe("Start: Not set");
    // Its exit notice would have hidden which folder opened.
    expect(status()).not.toMatch(/Timeline cleared/);
    await waitFor(() => expect(listed()).toEqual(["c.png", "d.png"]));
  });

  it("empties the Multi pair, both images of which were in the old folder", async () => {
    mount();
    await openA();
    fireEvent.click(screen.getByRole("tab", { name: "Multi" }));
    const second = () => screen.getByLabelText("Second image") as HTMLSelectElement;
    fireEvent.change(await screen.findByLabelText("Second image"), { target: { value: "b.png" } });
    await waitFor(() => expect(second().value).toBe("b.png"));

    fireEvent.click(button());

    await waitFor(() => expect(status()).toMatch(/Opened C:\\data\\second set/));
    // Legacy's words for the Multi view with nothing open (main_window.py:5942).
    expect(await screen.findByText("Please load an image first")).toBeTruthy();
    expect(screen.queryByLabelText("Second image")).toBeNull();
    expect(status()).toMatch(/No image open\./);
  });

  it("changes nothing when the dialog is closed: the image stays open, the list and the timeline too", async () => {
    const { events, listImages } = mount({ folder: async () => ({ datasetRoot: FIRST, cancelled: true }) });
    await openA();
    // With Auto-Save off, nothing is written on the way either.
    fireEvent.click(autoSave());
    await waitFor(() => expect(autoSave().checked).toBe(false));
    const listings = listImages.mock.calls.length;

    fireEvent.click(button());

    await waitFor(() => expect(events.at(-1)).toBe('folder {"choose":true}'));
    await waitFor(() => expect(button().hasAttribute("disabled")).toBe(false));
    expect(events).toEqual([`list ${FIRST}`, "load a.png", 'folder {"choose":true}']);
    expect(status()).toMatch(/a\.png — 0 segments, saved/);
    expect(status()).not.toMatch(/Opened/);
    expect(listed()).toEqual(["a.png", "b.png"]);
    expect(listImages.mock.calls.length).toBe(listings);
  });

  it("asks nothing of the server when the user keeps unsaved work at the question", async () => {
    // Auto-Save off: leaving the image asks, as a move to another image does, and No keeps it.
    const { openFolder, confirmNavigation } = mount({ answer: false });
    await openA();
    fireEvent.click(autoSave());
    await waitFor(() => expect(autoSave().checked).toBe(false));
    chooseTool("Poly (2)");
    drawTriangle(10, 10);
    await waitFor(() => expect(status()).toMatch(/a\.png — 1 segment, unsaved/));

    fireEvent.click(button());

    await waitFor(() => expect(confirmNavigation).toHaveBeenCalledTimes(1));
    expect(confirmNavigation.mock.calls[0]![0]).toMatch(/Open another folder anyway\?$/);
    await waitFor(() => expect(button().hasAttribute("disabled")).toBe(false));
    expect(openFolder).not.toHaveBeenCalled();
    expect(status()).toMatch(/a\.png — 1 segment, unsaved/);
  });

  it("asks for the path instead when the server could show no dialog", async () => {
    mount({
      folder: async () => {
        throw new ApiError(503, "no_folder_dialog", "no folder dialog could be shown on this computer");
      },
    });
    await screen.findByRole("button", { name: "a.png" });

    fireEvent.click(button());

    expect(await screen.findByRole("textbox", { name: "Folder path" })).toBeTruthy();
    expect(status()).toMatch(/Warning: no folder dialog could be shown on this computer/);
  });
});

describe("typing the folder's path, where the server has no desktop to show a dialog on", () => {
  it("opens a field for the path, and Open opens that folder", async () => {
    const { openFolder } = mount({
      choice: "path",
      folder: async (request) => ({ datasetRoot: "path" in request ? request.path : null, cancelled: false }),
    });
    await screen.findByRole("button", { name: "a.png" });
    expect(screen.queryByRole("textbox", { name: "Folder path" })).toBeNull();

    fireEvent.click(button());
    fireEvent.change(screen.getByRole("textbox", { name: "Folder path" }), { target: { value: `  ${SECOND} ` } });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => expect(status()).toMatch(/Opened C:\\data\\second set/));
    expect(openFolder).toHaveBeenCalledWith({ path: SECOND });
    await waitFor(() => expect(listed()).toEqual(["c.png", "d.png"]));
    expect(screen.queryByRole("textbox", { name: "Folder path" })).toBeNull();
  });

  it("keeps the path and the list when the server refuses it, and says why", async () => {
    mount({
      choice: "path",
      folder: async () => {
        throw new ApiError(400, "folder_unreadable", "there is no folder at C:\\nope");
      },
    });
    await screen.findByRole("button", { name: "a.png" });

    fireEvent.click(button());
    fireEvent.change(screen.getByRole("textbox", { name: "Folder path" }), { target: { value: "C:\\nope" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "Folder path" }));

    await waitFor(() => expect(status()).toMatch(/Error: Could not open the folder: there is no folder at C:\\nope/));
    expect((screen.getByRole("textbox", { name: "Folder path" }) as HTMLInputElement).value).toBe("C:\\nope");
    expect(listed()).toEqual(["a.png", "b.png"]);
  });
});
