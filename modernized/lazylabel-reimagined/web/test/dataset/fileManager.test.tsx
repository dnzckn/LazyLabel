/**
 * The file list's controls, as legacy's `FastFileManager` has them (utils/fast_file_manager.py;
 * CONTROL_PARITY.md CP-48): a click selects and a double-click opens, Ctrl and Shift select several,
 * any header sorts, Hide and Show All (N), the right-click menu, dragging rows, Refresh, and the
 * format columns read again after a save.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetListing } from "@lazylabel/contracts";

import { defaultSettings } from "@lazylabel/settings-schema";

import { DatasetBrowser } from "../../src/dataset/DatasetBrowser.jsx";
import { OpenImageView } from "../../src/workspace/OpenImageView.jsx";
import { WorkspaceProvider } from "../../src/workspace/WorkspaceProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import type { AnnotationsResult, ApiClient } from "../../src/api/client.js";

const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  cleanup();
  if (clipboard === undefined) delete (navigator as { clipboard?: unknown }).clipboard;
  else Object.defineProperty(navigator, "clipboard", clipboard);
});

const NAMES = ["a.png", "b.png", "c.png", "d.png"];

/** Four images; a and c have an NPZ file, and so does any name in `withNpz`. */
function listing(withNpz: readonly string[] = []): WireDatasetListing {
  const npz = new Set(["a.png", "c.png", ...withNpz]);
  return {
    folder: "frames",
    folders: [],
    columns: [
      { format: "NPZ", suffix: ".npz" },
      { format: "YOLO_DETECTION", suffix: ".txt" },
    ],
    annotatedCount: npz.size,
    unrecognized: 0,
    images: NAMES.map((name) => ({
      key: `frames/${name}`,
      name,
      sidecars: { NPZ: npz.has(name), YOLO_DETECTION: false },
      annotated: npz.has(name),
      sharesSidecarsWith: [],
    })),
  };
}

const LOADED: AnnotationsResult = {
  kind: "loaded",
  annotations: {
    sourceFormat: "NPZ",
    sourceFile: "frames/b.npz",
    revision: "r1",
    segments: [{ type: "Loaded", classId: 1 }],
    classAliases: {},
    rejected: 0,
    failures: [],
  },
};

function show(overrides: Partial<ApiClient> = {}, props: { readonly written?: number } = {}) {
  const loadAnnotations = vi.fn(async (): Promise<AnnotationsResult> => ({ kind: "none" }));
  const listImages = vi.fn(async () => listing());
  const api = {
    listImages,
    loadAnnotations,
    imageMetadata: async () => ({ width: 8, height: 8, sourceDepth: 8, sourceChannels: 3, sourceFormat: "png" }),
    getSettings: async () => defaultSettings(),
    putSettings: async (settings: unknown) => settings,
    saveAnnotations: async () => ({ written: { NPZ: "r2" }, stale: [], skippedEmpty: [] }),
    pixelsUrl: () => "/pixels",
    tileUrl: () => "/tile",
    thumbnailUrl: () => "/thumbnail",
    ...overrides,
  } as unknown as ApiClient;
  const tree = (written?: number) => (
    <NotificationProvider>
      <SettingsProvider client={api}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <WorkspaceProvider client={api} projectId="p1" confirmNavigation={() => true}>
            <DatasetBrowser
              client={api}
              projectId="p1"
              folder="frames"
              root={"E:\\data"}
              {...(written === undefined ? {} : { written })}
            />
            <OpenImageView client={api} projectId="p1" />
          </WorkspaceProvider>
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>
  );
  const view = render(tree(props.written));
  return { loadAnnotations, listImages, rerender: (written: number) => view.rerender(tree(written)) };
}

const name = (text: string) => screen.getByRole("button", { name: text });
const names = () => [...document.querySelectorAll(".dataset tbody th")].map((cell) => cell.textContent);
const selected = () =>
  [...document.querySelectorAll('.dataset tbody tr[aria-selected="true"]')].map((row) => row.querySelector("th")?.textContent);
const header = (title: string) => screen.getByRole("columnheader", { name: title });
const sortBy = (title: string) => fireEvent.click(within(header(title)).getByRole("button"));
const menuItems = () => within(screen.getByRole("menu")).getAllByRole("menuitem").map((item) => item.textContent);

async function ready() {
  await waitFor(() => expect(names()).toEqual(NAMES));
}

describe("choosing rows", () => {
  it("selects a row on a click and opens it only on a double-click", async () => {
    // fast_file_manager.py:1088-1089: "double-click to load, single-click for selection only".
    const { loadAnnotations } = show();
    await ready();

    fireEvent.click(name("b.png"));
    expect(selected()).toEqual(["b.png"]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loadAnnotations).not.toHaveBeenCalled();

    fireEvent.doubleClick(name("b.png"));
    await waitFor(() => expect(loadAnnotations).toHaveBeenCalledWith("p1", "frames/b.png", [8, 8]));
    expect(selected()).toEqual(["b.png"]);
  });

  it("adds rows with Ctrl and a run with Shift, as legacy's table does", async () => {
    // ExtendedSelection with whole rows (fast_file_manager.py:1025-1026).
    show();
    await ready();

    fireEvent.click(name("a.png"));
    fireEvent.click(name("c.png"), { ctrlKey: true });
    expect(selected()).toEqual(["a.png", "c.png"]);

    fireEvent.click(name("d.png"), { shiftKey: true });
    expect(selected()).toEqual(["a.png", "c.png", "d.png"]);

    fireEvent.click(name("c.png"), { ctrlKey: true });
    expect(selected()).toEqual(["a.png", "d.png"]);

    fireEvent.click(name("b.png"));
    expect(selected()).toEqual(["b.png"]);
  });
});

describe("sorting by a header", () => {
  it("sorts by any column, a format column too, and turns it around on a second click", async () => {
    // setSortingEnabled and the proxy's lessThan (fast_file_manager.py:1055-1057, 867-880).
    show();
    await ready();
    expect(header("Name").getAttribute("aria-sort")).toBe("ascending");

    sortBy("NPZ OHE");
    expect(names()).toEqual(["b.png", "d.png", "a.png", "c.png"]);
    expect(header("NPZ OHE").getAttribute("aria-sort")).toBe("ascending");
    expect(header("Name").getAttribute("aria-sort")).toBeNull();

    sortBy("NPZ OHE");
    expect(names()).toEqual(["a.png", "c.png", "b.png", "d.png"]);
    expect(header("NPZ OHE").getAttribute("aria-sort")).toBe("descending");

    sortBy("Name");
    expect(names()).toEqual(NAMES);
    sortBy("Name");
    expect(names()).toEqual([...NAMES].reverse());
  });
});

describe("hiding rows", () => {
  it("takes the selected rows out of the list, and Show All (N) brings them back", async () => {
    // fast_file_manager.py:1196-1209, 1708-1727. Nothing is deleted: the footer still counts them.
    show();
    await ready();
    expect(screen.queryByRole("button", { name: /^Show All/ })).toBeNull();

    fireEvent.click(name("a.png"));
    fireEvent.click(name("c.png"), { ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));

    expect(names()).toEqual(["b.png", "d.png"]);
    expect(selected()).toEqual([]);
    expect(screen.getByRole("button", { name: "Show All (2)" })).toBeTruthy();
    expect(screen.getByText("4 images in frames")).toBeTruthy();

    fireEvent.click(name("d.png"));
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    fireEvent.click(screen.getByRole("button", { name: "Show All (3)" }));

    expect(names()).toEqual(NAMES);
    expect(screen.queryByRole("button", { name: /^Show All/ })).toBeNull();
  });

  it("hides nothing with nothing selected", async () => {
    show();
    await ready();

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));

    expect(names()).toEqual(NAMES);
  });
});

describe("the right-click menu", () => {
  it("copies one row's name and path, and hides it", async () => {
    // fast_file_manager.py:1657-1706. A right-click on a row not selected selects it alone.
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    show();
    await ready();
    fireEvent.click(name("a.png"));

    fireEvent.contextMenu(name("b.png"));
    expect(selected()).toEqual(["b.png"]);
    expect(menuItems()).toEqual(["Copy filename", "Copy path", "Hide file"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy filename" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("b.png"));
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.contextMenu(name("b.png"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy path" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("E:\\data\\frames\\b.png"));

    fireEvent.contextMenu(name("b.png"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Hide file" }));
    expect(names()).toEqual(["a.png", "c.png", "d.png"]);
  });

  it("acts on every selected row: names as a JSON list, paths one per line", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    show();
    await ready();
    fireEvent.click(name("c.png"));
    fireEvent.click(name("a.png"), { ctrlKey: true });

    fireEvent.contextMenu(name("a.png"));
    expect(menuItems()).toEqual(["Copy 2 filenames", "Copy 2 paths", "Hide 2 files"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy 2 filenames" }));
    // In the order they were chosen, as Qt lists a selection.
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('["c.png", "a.png"]'));

    fireEvent.contextMenu(name("a.png"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy 2 paths" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("E:\\data\\frames\\c.png\nE:\\data\\frames\\a.png"));

    fireEvent.contextMenu(name("a.png"));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(selected()).toEqual(["a.png", "c.png"]);
  });
});

describe("dragging rows", () => {
  it("puts the dragged rows before the row they are dropped on, until a header is clicked", async () => {
    // fast_file_manager.py:1034-1039, 1615-1655.
    show();
    await ready();
    const transfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    const row = (text: string) => name(text).closest("tr")!;

    fireEvent.dragStart(row("d.png"), { dataTransfer: transfer });
    fireEvent.dragOver(row("b.png"), { dataTransfer: transfer });
    fireEvent.drop(row("b.png"), { dataTransfer: transfer });

    expect(names()).toEqual(["a.png", "d.png", "b.png", "c.png"]);
    expect(selected()).toEqual(["d.png"]);
    expect(transfer.setData).toHaveBeenCalledWith("application/x-lazylabel-file-rows", "frames/d.png");

    // Two selected rows, dropped below the last row.
    fireEvent.click(name("a.png"));
    fireEvent.click(name("b.png"), { ctrlKey: true });
    fireEvent.dragStart(row("b.png"), { dataTransfer: transfer });
    fireEvent.drop(document.querySelector(".dataset tfoot th")!, { dataTransfer: transfer });
    expect(names()).toEqual(["d.png", "c.png", "a.png", "b.png"]);

    // Name was sorted ascending, so its header turns it around, out of the dragged order.
    sortBy("Name");
    expect(names()).toEqual([...NAMES].reverse());
  });
});

describe("Refresh", () => {
  it("reads the folder again and shows every hidden row, keeping the search", async () => {
    // fast_file_manager.py:1190-1194, 1215-1224, 1266-1269.
    const { listImages } = show();
    await ready();
    fireEvent.click(name("a.png"));
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    fireEvent.change(screen.getByLabelText("Search files"), { target: { value: ".png" } });
    expect(names()).toEqual(["b.png", "c.png", "d.png"]);
    const before = listImages.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(listImages.mock.calls.length).toBe(before + 1));
    await ready();
    expect((screen.getByLabelText("Search files") as HTMLInputElement).value).toBe(".png");
    expect(screen.queryByRole("button", { name: /^Show All/ })).toBeNull();
  });
});

describe("the format columns after a write", () => {
  it("reads the folder's files again after the open image is saved", async () => {
    // Legacy re-checks a saved image's files (fast_file_manager.py:611-645). The ticks went stale.
    let saved = false;
    const listImages = vi.fn(async () => listing(saved ? ["b.png"] : []));
    show({
      listImages,
      loadAnnotations: async () => LOADED,
      saveAnnotations: async () => {
        saved = true;
        return { written: { NPZ: "r2", YOLO_DETECTION: "r3" }, stale: [], skippedEmpty: [] };
      },
    } as never);
    await ready();
    const npzOf = (text: string) => name(text).closest("tr")!.querySelectorAll("td")[0]!.textContent;
    expect(npzOf("b.png")).toBe("");

    fireEvent.doubleClick(name("b.png"));
    await waitFor(() => expect(screen.getByText(/1 objects, read from/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /^Write/ }));

    await waitFor(() => expect(npzOf("b.png")).toBe("✓"));
    expect(listImages).toHaveBeenCalledTimes(2);
    expect(selected()).toEqual(["b.png"]);
  });

  it("reads them again when told files were written elsewhere, as Save All writes them", async () => {
    // Legacy's batchUpdateFileStatus after Save All (fast_file_manager.py:1385-1393).
    const { listImages, rerender } = show({}, { written: 0 });
    await ready();
    expect(listImages).toHaveBeenCalledTimes(1);

    rerender(1);

    await waitFor(() => expect(listImages).toHaveBeenCalledTimes(2));
  });
});
