/**
 * The sequence timeline on screen.
 *
 * `timeline.test.ts` proves the rules. This proves a person can reach them — which is the gap that
 * hid the vertex editor in this project for weeks: built, unit-tested, and never rendered by
 * anything, so every test passed while the feature did not exist.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { TimelinePanel } from "../../src/sequence/TimelinePanel.jsx";
import { SequenceActiveContext } from "../../src/sequence/sequenceActive.js";

/**
 * Min Conf is a PERSISTED setting, so the panel needs the settings context above it.
 *
 * `saved` records what was written, which is how the tests below can tell "the control moved" from
 * "the number was remembered" -- two different claims that a local `useState` would have made
 * look identical.
 */
function withSettings(node: React.ReactNode, saved: Record<string, unknown> = {}) {
  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (next: { values: Record<string, unknown> }) => {
      Object.assign(saved, next.values);
      return next;
    },
  } as unknown as ApiClient;
  // The frame-navigation keys are registered by this panel, and `useHotkey` throws without a
  // provider by design -- a hook that works without one hides a missing wire.
  return (
    <SettingsProvider client={client}>
      <NotificationProvider>
        <NotificationHost />
        <HotkeyProvider bindings={defaultSettings().hotkeys}>{node}</HotkeyProvider>
      </NotificationProvider>
    </SettingsProvider>
  );
}

afterEach(cleanup);

function image(name: string, annotated = false): WireDatasetImage {
  return { key: `frames/${name}`, name, sidecars: {}, annotated, sharesSidecarsWith: [] };
}

const FOLDER = [
  image("f01.png"),
  image("f02.png", true),
  image("f03.png"),
  image("f04.png"),
  image("f05.png", true),
];

function show(images: readonly WireDatasetImage[] = FOLDER) {
  const onOpen = vi.fn();
  render(withSettings(<TimelinePanel images={images} onOpen={onOpen} />));
  return { onOpen };
}

/**
 * The shell's side of opening a frame: `openKey` follows an open that happens, and stays where it
 * was when the workspace refuses one -- a Cancel at its question about unsaved work.
 */
function Shell({
  initial,
  refuse = false,
  onOpen,
  onStatus,
}: {
  readonly initial?: string;
  readonly refuse?: boolean;
  readonly onOpen: (key: string) => void;
  readonly onStatus?: (status: string) => void;
}) {
  const [openKey, setOpenKey] = useState(initial);
  return (
    <TimelinePanel
      images={FOLDER}
      {...(openKey === undefined ? {} : { openKey })}
      {...(onStatus === undefined ? {} : { onStatus })}
      onOpen={(key) => {
        onOpen(key);
        if (!refuse) setOpenKey(key);
      }}
    />
  );
}

function showShell(options: { readonly initial?: string; readonly refuse?: boolean } = {}) {
  const onOpen = vi.fn();
  const onStatus = vi.fn();
  render(withSettings(<Shell {...options} onOpen={onOpen} onStatus={onStatus} />));
  return { onOpen, onStatus };
}

/**
 * Build a timeline and, unless told not to, mark its annotated frames with "+ All labeled".
 *
 * Building marks nothing since 2026-09-23, as in legacy, so a test about using references has to
 * make some -- and "+ All labeled" is how a user gets the setup these tests were written against.
 */
function build(from?: string, to?: string, { references = true } = {}) {
  if (from !== undefined) {
    fireEvent.change(screen.getByLabelText("First frame"), { target: { value: from } });
  }
  if (to !== undefined) {
    fireEvent.change(screen.getByLabelText("Last frame"), { target: { value: to } });
  }
  fireEvent.click(screen.getByText("Build timeline"));
  if (references) fireEvent.click(screen.getByRole("button", { name: "+ All labeled" }));
}

const cells = () => screen.getByLabelText("Timeline").querySelectorAll("button");

/** Press the key an action is bound to by default. */
const pressKey = (action: string) =>
  fireEvent.keyDown(document, { key: defaultSettings().hotkeys[action]!.primary });

describe("a built timeline is a fixed list of files (SP-21)", () => {
  it("keeps its frames when the browser lists another folder", async () => {
    // Legacy's timeline is the paths it was built from (sequence_view_mode.py:123-126). The web's was
    // rebuilt from whichever folder the browser listed, at the old positions.
    const { rerender } = render(withSettings(<TimelinePanel images={FOLDER} />));
    build("1", "3", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(3));
    const before = [...cells()].map((cell) => cell.getAttribute("aria-label"));

    const elsewhere = ["x1.png", "x2.png", "x3.png", "x4.png", "x5.png"].map((name) => ({
      ...image(name),
      key: `other/${name}`,
    }));
    rerender(withSettings(<TimelinePanel images={elsewhere} />));

    expect([...cells()].map((cell) => cell.getAttribute("aria-label"))).toEqual(before);
    expect(before[0]).toContain("frames/f02.png");
  });
});

describe("+ All labeled (SP-26)", () => {
  it("asks the dataset at the click, so what was labelled since the folder opened counts", async () => {
    // Legacy probes the disk at the click (main_window.py:3966). The panel used the listing from when
    // the folder opened, which no save refreshes.
    const client = {
      listImages: async () => ({
        folder: "frames",
        folders: [],
        annotatedCount: 2,
        unrecognized: 0,
        columns: [],
        images: FOLDER.map((each) => ({ ...each, annotated: each.name === "f02.png" || each.name === "f04.png" })),
      }),
    } as unknown as ApiClient;
    render(withSettings(<TimelinePanel images={FOLDER} client={client} />));
    build("0", "4", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(5));

    fireEvent.click(screen.getByRole("button", { name: "+ All labeled" }));

    await waitFor(() => expect(cells()[3]!.getAttribute("aria-label")).toContain("reference"));
    expect(cells()[1]!.getAttribute("aria-label")).toContain("reference");
    expect(cells()[4]!.getAttribute("aria-label")).not.toContain("reference");
  });
});

describe("reference sizes (SP-24)", () => {
  /*
   * The first reference fixes the size (main_window.py:3887-3908, 3934-3980;
   * sequence_view_mode.py:232-237). G refuses another size; + All Before and + All Labeled leave
   * such frames out and say how many. Nothing was checked, so a reference of another size seeded
   * nothing when the run began, silently.
   */
  function sized() {
    return {
      imageMetadata: async (_project: string, key: string) =>
        key === "frames/f04.png" ? { width: 8, height: 6 } : { width: 8, height: 8 },
      listImages: async () => ({
        images: FOLDER.map((each) => ({ ...each, annotated: each.name === "f02.png" || each.name === "f04.png" })),
      }),
    } as unknown as ApiClient;
  }

  it("refuses G on a frame of another size, in legacy's words", async () => {
    render(withSettings(<TimelinePanel images={FOLDER} client={sized()} />));
    build("0", "4", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(5));
    fireEvent.click(cells()[1]!); // f02
    fireEvent.click(screen.getByText("Mark as reference"));
    expect(await screen.findByText("Added frame 2 as reference")).toBeTruthy();

    fireEvent.click(cells()[3]!); // f04, 8x6
    fireEvent.click(screen.getByText("Mark as reference"));

    expect(await screen.findByText("Cannot add reference: image is 8x6 but reference requires 8x8")).toBeTruthy();
    expect(cells()[3]!.getAttribute("aria-label")).not.toContain("reference");
  });

  it("leaves a frame of another size out of + All labeled, and says how many", async () => {
    render(withSettings(<TimelinePanel images={FOLDER} client={sized()} />));
    build("0", "4", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(5));

    fireEvent.click(screen.getByRole("button", { name: "+ All labeled" }));

    expect(
      await screen.findByText("Added 1 labeled frames as references (1 skipped: dimension mismatch)"),
    ).toBeTruthy();
    expect(cells()[1]!.getAttribute("aria-label")).toContain("reference");
    expect(cells()[3]!.getAttribute("aria-label")).not.toContain("reference");
  });
});

describe("with no AI (SP-31)", () => {
  /*
   * Legacy hides its Reference Frames, Propagation and Review groups without its AI packages, and
   * Ctrl+P and Ctrl+H show the install hint; Trim and New Timeline stay (sequence_widget.py:274-278,
   * 307-311, 825-835; main_window.py:4020-4022, 4710-4712, 5041-5043). The web offered everything,
   * and failures appeared after the click.
   */
  const client = { listImages: async () => ({ images: [] }) } as unknown as ApiClient;
  const NO_AI = { available: false, videoCapable: false, reason: "the inference service could not be reached" };

  it("hides what cannot work, keeps Trim and New timeline, and says why on Ctrl+P and Ctrl+H", async () => {
    render(withSettings(<TimelinePanel images={FOLDER} client={client} ai={NO_AI} />));
    build("0", "4", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(5));

    for (const name of [/^Propagate/, /Find archetypes/, /Mark as reference/, /\+ All labeled/, /Next Flagged/, /Prev Suggested/, /Clear Suggested/, /Clear flags/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.getByText("Cut")).toBeTruthy();
    expect(screen.getByText("New timeline")).toBeTruthy();

    fireEvent.keyDown(document, { key: "p", ctrlKey: true });
    expect(await screen.findByText(/AI features require the inference service/)).toBeTruthy();
  });

  it("keeps Find Archetypes when the service is up but no model can propagate", async () => {
    render(
      withSettings(
        <TimelinePanel images={FOLDER} client={client} ai={{ available: true, videoCapable: false, reason: null }} />,
      ),
    );
    build("0", "4", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(5));

    expect(screen.queryByRole("button", { name: /^Propagate/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Find archetypes/ })).toBeTruthy();
  });
});

describe("the header (SP-19)", () => {
  it("names an image opened from outside the timeline instead of a frame that is not on screen", async () => {
    const onStatus = vi.fn();
    render(withSettings(<TimelinePanel images={FOLDER} onStatus={onStatus} openKey="frames/f05.png" />));
    build("0", "2", { references: false });

    await waitFor(() => expect(onStatus).toHaveBeenLastCalledWith("f05.png -- not in the timeline"));
  });
});

describe("the cursor moves when the frame opens (SP-19)", () => {
  /*
   * Legacy's navigation always completes, so the frame on screen is always the current one
   * (main_window.py:3414-3434). The web moved the cursor before the open, which the workspace can
   * refuse: with Auto-Save on Navigate off it asks about unsaved work, and a Cancel there left the
   * cursor on a frame that was not on screen, for the header, G and the trim bounds to act on.
   */
  const current = () => [...cells()].findIndex((cell) => cell.className.includes("timeline__frame--current"));

  it("stays on the frame on screen when the open is refused", async () => {
    const { onOpen, onStatus } = showShell({ initial: "frames/f01.png", refuse: true });
    build("0", "4", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(5));

    fireEvent.click(cells()[2]!);

    expect(onOpen).toHaveBeenLastCalledWith("frames/f03.png");
    expect(current()).toBe(0);
    expect(onStatus).toHaveBeenLastCalledWith("f01.png (1/5)");
  });

  it("marks the frame on screen with G, not the one whose open was refused", async () => {
    showShell({ initial: "frames/f01.png", refuse: true });
    build("0", "4", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(5));
    fireEvent.click(cells()[2]!);

    fireEvent.click(screen.getByText("Mark as reference"));

    await waitFor(() => expect(cells()[0]!.getAttribute("aria-label")).toMatch(/reference$/));
    expect(cells()[2]!.getAttribute("aria-label")).toMatch(/pending$/);
  });

  it("stays put when a key's open is refused too", async () => {
    showShell({ initial: "frames/f01.png", refuse: true });
    build("0", "4");
    await waitFor(() => expect(cells()[1]!.getAttribute("aria-label")).toMatch(/reference$/));

    pressKey("next_reference_frame");

    expect(current()).toBe(0);
  });

  it("moves with the open when it happens", async () => {
    const { onStatus } = showShell({ initial: "frames/f01.png" });
    build("0", "4", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(5));

    fireEvent.click(cells()[2]!);

    await waitFor(() => expect(current()).toBe(2));
    expect(onStatus).toHaveBeenLastCalledWith("f03.png (3/5)");
  });
});

describe("building the timeline (SP-18)", () => {
  it("opens the first frame and says how many frames it holds, as legacy's Build does", async () => {
    // Legacy loads frame 1 and notifies "Timeline built: N frames" (main_window.py:4992-4996). The
    // web moved the cursor and opened nothing, so the view could show an image outside the timeline
    // while the header named frame 1.
    const { onOpen } = show();
    build("1", "3", { references: false });

    await waitFor(() => expect(cells()).toHaveLength(3));
    expect(onOpen).toHaveBeenCalledWith("frames/f02.png");
    expect(await screen.findByText("Timeline built: 3 frames")).toBeTruthy();
  });
});

describe("before a timeline exists", () => {
  it("says a sequence needs a folder", () => {
    show([]);
    expect(screen.getByText(/built from a folder of images/)).toBeTruthy();
  });

  it("offers the frames by NAME, not by number", () => {
    // A user picks "from this one to that one" by looking at them. Indices would be faster to
    // implement and would make the user count.
    show();
    expect(screen.getByLabelText("First frame")).toBeTruthy();
    expect(screen.getAllByText("f03.png").length).toBeGreaterThan(0);
  });
});

describe("building one", () => {
  it("makes a cell per frame in the range", async () => {
    show();

    build("1", "3");

    await waitFor(() => expect(cells()).toHaveLength(3));
  });

  it("marks NO frame a reference until the user does, as legacy does not", async () => {
    // The owner's call, 2026-09-23. This used to mark every annotated frame on build, which made a
    // rebuilt timeline seed from every frame an earlier Save All wrote.
    show();

    build("0", "4", { references: false });

    await waitFor(() => expect(cells()).toHaveLength(5));
    const named = [...cells()].map((c) => c.getAttribute("aria-label"));
    expect(named.filter((label) => label?.includes("reference"))).toHaveLength(0);
  });

  it("marks the annotated frames when the user asks for all labeled ones", async () => {
    show();

    build("0", "4");

    await waitFor(() => expect(cells()).toHaveLength(5));
    const named = [...cells()].map((c) => c.getAttribute("aria-label"));
    expect(named[1]).toContain("reference");
    expect(named[4]).toContain("reference");
    expect(named[0]).toContain("pending");
  });

  it("names every cell as well as colouring it", async () => {
    // Colour is how the timeline is read at a glance and it is the only thing legacy offers. A
    // screen reader gets nothing from it, and neither does anyone who cannot separate the red
    // from the brown.
    show();
    build("0", "1");

    await waitFor(() => expect(cells()).toHaveLength(2));
    expect(cells()[0]!.getAttribute("aria-label")).toBe("Frame 1, frames/f01.png, pending");
  });

  it("paints a pending frame in the theme's grey, and the others in legacy's one colour", async () => {
    // Legacy's pending is #646464 dark and #b9b9be light (timeline_widget.py:316); the stylesheet
    // holds both, so the cell names the token rather than a colour.
    show();
    build("0", "1");

    await waitFor(() => expect(cells()).toHaveLength(2));
    const pending = [...cells()].find((cell) => cell.getAttribute("aria-label")?.endsWith("pending"))!;
    const reference = [...cells()].find((cell) => cell.getAttribute("aria-label")?.endsWith("reference"))!;
    expect(pending.getAttribute("style")).toContain("var(--frame-pending)");
    expect(reference.style.backgroundColor).toBe("rgb(255, 193, 7)");
  });

  it("reports legacy's header for the frame in view: its name, its place and its score", async () => {
    const onStatus = vi.fn();
    render(withSettings(<TimelinePanel images={FOLDER} onStatus={onStatus} />));
    expect(onStatus).toHaveBeenLastCalledWith("No sequence loaded");

    build("0", "2");
    await waitFor(() => expect(cells()).toHaveLength(3));
    expect(onStatus).toHaveBeenLastCalledWith("f01.png (1/3)");

    fireEvent.click(cells()[2]!);
    expect(onStatus).toHaveBeenLastCalledWith("f03.png (3/3)");
  });

  it("follows the image the view shows, when it is one of the timeline's frames", async () => {
    // Legacy moves its timeline to a file opened from the list when the file is in the sequence,
    // so the header, the marker and the picture never disagree.
    const onStatus = vi.fn();
    render(
      withSettings(<TimelinePanel images={FOLDER} onStatus={onStatus} openKey="frames/f03.png" />),
    );

    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    expect(onStatus).toHaveBeenLastCalledWith("f03.png (3/5)");
    expect(cells()[2]!.className).toContain("timeline__frame--current");
  });

  it("counts the frames and the references", async () => {
    show();

    build("0", "4");

    expect(await screen.findByText(/5 frames, 2 references/)).toBeTruthy();
  });
});

describe("using it", () => {
  it("opens the frame that was clicked", async () => {
    const { onOpen } = show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    fireEvent.click(cells()[2]!);

    // The second argument is RULE-090's propagated masks, and there are none until a
    // propagation has run -- so an ordinary click opens the file, which is the rule's "else".
    expect(onOpen).toHaveBeenCalledWith("frames/f03.png", undefined);
  });

  it("jumps to the next reference, and opens it", async () => {
    const { onOpen } = show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    pressKey("next_reference_frame");

    expect(onOpen).toHaveBeenCalledWith("frames/f02.png", undefined);
  });

  it("offers Next Flagged only when a frame is flagged, as legacy does", async () => {
    // Nothing is flagged without propagation, so Next Flagged has nowhere to go: legacy disables
    // it (sequence_widget.py:663-665) rather than let it move to a frame it did not find.
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    expect((screen.getByRole("button", { name: "Next Flagged →" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the order Sort took, when a frame's status changes after it (SP-28)", async () => {
    // Legacy computes the order once, when Sort is pressed (timeline_widget.py:109-120). The web
    // recomputed it on every render, so frames jumped under the pointer as statuses changed.
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));
    fireEvent.click(screen.getByText("Sort"));
    await waitFor(() => expect(cells()[0]!.getAttribute("aria-label")).toContain("frames/f02.png"));
    const order = () => [...cells()].map((cell) => cell.getAttribute("aria-label")!.split(", ")[1]);
    expect(order()).toEqual(["frames/f02.png", "frames/f05.png", "frames/f01.png", "frames/f03.png", "frames/f04.png"]);

    fireEvent.click(cells()[3]!); // f03
    fireEvent.click(screen.getByText("Mark as reference"));

    await waitFor(() => expect(cells()[3]!.getAttribute("aria-label")).toContain("reference"));
    expect(order()).toEqual(["frames/f02.png", "frames/f05.png", "frames/f01.png", "frames/f03.png", "frames/f04.png"]);
  });

  it("sorts references first, and unsorts again", async () => {
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    fireEvent.click(screen.getByText("Sort"));

    await waitFor(() =>
      expect(cells()[0]!.getAttribute("aria-label")).toContain("frames/f02.png"),
    );

    fireEvent.click(screen.getByText("Unsort"));

    await waitFor(() =>
      expect(cells()[0]!.getAttribute("aria-label")).toContain("frames/f01.png"),
    );
  });

  it("starts a NEW timeline unsorted and with no trim bounds, as legacy's reset does (SP-35)", async () => {
    // Legacy clears the sort, the trim bounds and the suggestions (sequence_widget.py:770-794). The
    // web carried them into the next timeline, where Cut and Keep used the old bounds.
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));
    fireEvent.click(screen.getByText("Sort"));
    await waitFor(() => expect(cells()[0]!.getAttribute("aria-label")).toContain("frames/f02.png"));
    fireEvent.click(cells()[1]!);
    fireEvent.click(screen.getByText("Set Left"));
    fireEvent.click(cells()[2]!);
    fireEvent.click(screen.getByText("Set Right"));

    fireEvent.click(screen.getByText("New timeline"));
    build("0", "4", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(5));

    expect(cells()[0]!.getAttribute("aria-label")).toContain("frames/f01.png");
    expect(screen.getByText("Sort")).toBeTruthy();
    expect(screen.getByText(/^Left:/).textContent).toBe("Left: Not set");
    expect((screen.getByRole("button", { name: "Cut" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("goes back to the range picker on New timeline", async () => {
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    fireEvent.click(screen.getByText("New timeline"));

    expect(await screen.findByText("Build timeline")).toBeTruthy();
  });
});

describe("with no inference service", () => {
  it("offers no propagation control at all, rather than one that answers 503", async () => {
    // This harness renders the panel without a client, which is a deployment with no model. The
    // control is absent rather than present-and-failing: a button that replies 503 teaches a user
    // the feature is unreliable, where no button says plainly that this deployment has no model.
    show();
    build("0", "4");

    await waitFor(() => expect(cells()).toHaveLength(5));
    expect(screen.queryByText(/^Propagate/)).toBeNull();
  });

  it("says how far agreement with legacy has been shown, and where it stops", async () => {
    // Frame for frame on the synthetic-shapes golden since 2026-09-23; not past one streaming
    // window, which no golden covers. Silence about that would be read as confidence.
    show();
    build("0", "4");

    await waitFor(() => expect(cells()).toHaveLength(5));
    expect(screen.getByText(/agrees with legacy frame for frame/)).toBeTruthy();
    expect(screen.getByText(/longer than the streaming window/)).toBeTruthy();
  });
});

describe("the confidence histogram", () => {
  /** Frames 0..4 of the folder, with propagation scores on three of them. */
  function withScores(scores: Record<number, number>) {
    const saved: Record<string, unknown> = {};
    render(withSettings(<TimelinePanel images={FOLDER} scores={scores} />, saved));
    fireEvent.click(screen.getByText("Build timeline"));
    // f02 is a reference in these tests, marked the way a user marks it since building stopped doing so.
    fireEvent.click(screen.getByRole("button", { name: "+ All labeled" }));
    return saved;
  }

  const threshold = () => screen.getByLabelText("Minimum confidence") as HTMLInputElement;
  const setThreshold = (value: number) =>
    fireEvent.change(threshold(), { target: { value: String(value) } });

  const hist = () => fireEvent.click(screen.getByRole("button", { name: "Hist" }));
  const dialog = () => screen.queryByRole("dialog", { name: "Confidence Score Distribution" });
  const chart = () => dialog()!.querySelector("svg")!;
  /** The chart as a browser lays it out: 580 pixels wide, as its viewBox is, from the left edge. */
  const laidOut = () => {
    chart().getBoundingClientRect = () =>
      ({ left: 0, width: 580, top: 0, height: 300, right: 580, bottom: 300, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  };
  /** Where the gold line is, in the chart's pixels. */
  const lineX = () => Number(dialog()!.querySelector(".confidence__threshold")!.getAttribute("x1"));

  it("offers Min Conf at 0.99 as soon as there is a timeline, before any score exists", () => {
    // REACHABLE before the data is, which is the point of building it now. A histogram nobody can
    // open until the model lands is a histogram nobody has ever run.
    withScores({});

    expect(threshold().value).toBe("0.99");
  });

  it("says there are no scores, in legacy's words, rather than opening an empty histogram (SP-47)", async () => {
    // main_window.py:4729-4732.
    withScores({});

    hist();

    expect(await screen.findByText("No confidence scores available yet")).toBeTruthy();
    expect(dialog()).toBeNull();
  });

  it("opens legacy's histogram on Hist, and counts which side of the threshold the scores fall (SP-47)", () => {
    // confidence_histogram_dialog.py:214-224, 264-297. The web drew an always-visible chart.
    withScores({ 0: 0.95, 1: 0.97, 2: 0.995 });
    expect(dialog()).toBeNull();

    hist();

    expect(dialog()).toBeTruthy();
    expect(screen.getByText("3 frames with confidence scores")).toBeTruthy();
    expect(screen.getByText("Below: 2 (67%)")).toBeTruthy();
    expect(screen.getByText("Above: 1 (33%)")).toBeTruthy();
    expect(screen.getByText("Threshold: 0.9900")).toBeTruthy();
  });

  it("starts the axis below the lowest score, not at zero", () => {
    // RULE-035. Propagation scores cluster just under 1 and a 0-to-1 axis is one spike.
    withScores({ 0: 0.95, 1: 0.97, 2: 0.995 });
    hist();

    const ticks = [...chart().querySelectorAll("text")].map((text) => text.textContent);
    expect(ticks).toContain("0.93");
    expect(ticks).toContain("1.00");
    expect(ticks).not.toContain("0.92");
  });

  it("colours a bar green from the bin holding the threshold up, red below it, as legacy does (SP-47)", () => {
    // confidence_histogram_dialog.py:128-141: 0.989 is below 0.99 but in its bin, so green.
    withScores({ 0: 0.95, 2: 0.989 });
    hist();

    expect(chart().querySelectorAll(".confidence__bar--below")).toHaveLength(1);
    expect(chart().querySelectorAll(".confidence__bar--above")).toHaveLength(1);
    expect(chart().querySelector(".confidence__bar--above")!.getAttribute("fill")).toBe("rgb(76 175 80)");
  });

  it("drags the gold line, and Apply makes it Min Conf (SP-47)", async () => {
    // confidence_histogram_dialog.py:234-261; main_window.py:4736-4739.
    const saved = withScores({ 0: 0.95, 1: 0.97, 2: 0.995 });
    hist();
    laidOut();

    fireEvent.mouseDown(chart(), { button: 0, clientX: lineX() + 3 });
    fireEvent.mouseMove(window, { clientX: 50 }); // the plot's left edge: the view's low end, 0.93
    fireEvent.mouseUp(window);

    expect(screen.getByText(/^Threshold: /).textContent).toBe("Threshold: 0.9300");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(dialog()).toBeNull();
    await waitFor(() => expect(threshold().value).toBe("0.93"));
    expect(saved["propagation_confidence_threshold"]).toBe(0.93);
  });

  it("moves nothing on a press away from the line, and Close keeps Min Conf (SP-47)", () => {
    withScores({ 0: 0.95, 1: 0.97, 2: 0.995 });
    hist();
    laidOut();

    fireEvent.mouseDown(chart(), { button: 0, clientX: lineX() - 30 });
    fireEvent.mouseMove(window, { clientX: 50 });
    fireEvent.mouseUp(window);
    expect(screen.getByText(/^Threshold: /).textContent).toBe("Threshold: 0.9900");

    fireEvent.mouseDown(chart(), { button: 0, clientX: lineX() });
    fireEvent.mouseMove(window, { clientX: 50 });
    fireEvent.mouseUp(window);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(dialog()).toBeNull();
    expect(threshold().value).toBe("0.99");
  });

  it("MOVES THE TIMELINE when the threshold changes, not just the counts", () => {
    // The legacy defect: Min Conf recomputes the set Save All uses and leaves the colours alone,
    // so the user reviews one set of frames and ships another.
    withScores({ 0: 0.95, 1: 0.97, 2: 0.995 });
    const flaggedCount = () =>
      [...cells()].filter((cell) => (cell.getAttribute("title") ?? "").includes("flagged")).length;

    // Two of the three scored frames move. The third is f02.png, which already had annotations
    // and is therefore a REFERENCE -- ground truth the user drew, which a number changing must
    // not turn into something the app says needs review.
    setThreshold(1);
    expect(flaggedCount()).toBe(2);

    setThreshold(0.9);
    expect(flaggedCount()).toBe(0);
  });

  it("never flags a reference frame, however low its score", () => {
    withScores({ 1: 0.1 });
    const referenceCell = [...cells()].find((cell) =>
      (cell.getAttribute("title") ?? "").includes("reference"),
    );

    setThreshold(1);

    expect(referenceCell?.getAttribute("title")).not.toContain("flagged");
  });

  it("clamps a threshold outside [0, 1]", async () => {
    withScores({ 0: 0.95 });

    setThreshold(5);

    // Awaited, because the value comes back through the SETTINGS rather than from panel state --
    // which is the point: Min Conf decides which frames get saved, so it has to survive a reload.
    await waitFor(() => expect(threshold().value).toBe("1"));
  });

  it("REMEMBERS the threshold, because it decides what gets saved", async () => {
    // A stored setting nothing reads is a control that lies about having remembered anything.
    // `propagation_confidence_threshold` had no reader at all until this panel gained one.
    const saved = withScores({ 0: 0.95 });

    setThreshold(0.8);

    await waitFor(() => expect(saved["propagation_confidence_threshold"]).toBe(0.8));
  });

  it("starts at RULE-060's 0.99, which is legacy's default", async () => {
    // It was 0.5 in the schema, which nothing chose on purpose. 0.5 is not a milder setting:
    // propagation scores cluster just under 1, so almost nothing is ever flagged and the user
    // reviews nothing.
    withScores({});

    await waitFor(() => expect(threshold().value).toBe("0.99"));
  });
});

describe("zoom, pan and scrub (SP-43)", () => {
  /*
   * Legacy's ◀ − + ▶ zoom from 1x to 30x in steps of 1.5 and pan by a quarter of what is shown, the
   * wheel pans by a tenth while zoomed, and a drag across the bar opens each frame it passes
   * (timeline_widget.py:132-148, 453-469, 565-595, 638-695). The web had a cell per frame, a click,
   * and nothing else, so on a long sequence most frames could not be hit.
   */
  const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
  const onBar = () => [...cells()].map((cell) => cell.getAttribute("aria-label")!.split(", ")[1]!.slice(7));
  const MANY = Array.from({ length: 20 }, (_, i) => image(`g${String(i + 1).padStart(2, "0")}.png`));
  const names = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => `g${String(from + i).padStart(2, "0")}.png`);

  it("shows every frame at 1x, where only zooming in is offered", async () => {
    show(MANY);
    build("0", "19", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(20));

    expect(button("Zoom in timeline").disabled).toBe(false);
    expect(button("Zoom out timeline").disabled).toBe(true);
    expect(button("Pan left").disabled).toBe(true);
    expect(button("Pan right").disabled).toBe(true);
  });

  it("zooms in around the current frame as legacy centres it, and pans a quarter at a time", async () => {
    show(MANY);
    build("0", "19", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(20));
    fireEvent.click(cells()[10]!);

    fireEvent.click(button("Zoom in timeline")); // 1.5x: 13 frames, centred on the 20 shown before
    expect(onBar()).toEqual(names(1, 13));
    fireEvent.click(button("Zoom in timeline")); // 2.25x: 8 frames, centred on the 13 shown before
    expect(onBar()).toEqual(names(5, 12));

    fireEvent.click(button("Pan right"));
    expect(onBar()).toEqual(names(7, 14));
    fireEvent.click(button("Pan left"));
    expect(onBar()).toEqual(names(5, 12));
  });

  it("pans with the wheel only while zoomed, a tenth at a time", async () => {
    show(MANY);
    build("0", "19", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(20));
    const zoomable = screen.getByLabelText("Timeline").closest(".timeline__zoomable")!;

    // Unzoomed, the wheel is the page's.
    expect(fireEvent.wheel(zoomable, { deltaY: 100 })).toBe(true);
    expect(cells()).toHaveLength(20);

    fireEvent.click(button("Zoom in timeline"));
    expect(fireEvent.wheel(zoomable, { deltaY: 100 })).toBe(false);
    expect(onBar()).toEqual(names(2, 14));
    fireEvent.wheel(zoomable, { deltaY: -100 });
    expect(onBar()).toEqual(names(1, 13));
  });

  it("zooms to 30x and no further, and back out to every frame", async () => {
    show(MANY);
    build("0", "19", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(20));

    for (let i = 0; i < 9; i += 1) fireEvent.click(button("Zoom in timeline"));
    expect(button("Zoom in timeline").disabled).toBe(true);
    expect(cells()).toHaveLength(1);

    for (let i = 0; i < 9; i += 1) fireEvent.click(button("Zoom out timeline"));
    expect(button("Zoom out timeline").disabled).toBe(true);
    expect(onBar()).toEqual(names(1, 20));
  });

  it("opens each frame a drag across the bar passes, once, as legacy's scrub does", async () => {
    const { onOpen } = show();
    build("0", "4", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(5));
    const bar = screen.getByLabelText("Timeline");
    bar.getBoundingClientRect = () =>
      ({ left: 0, width: 500, top: 0, height: 34, right: 500, bottom: 34, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    onOpen.mockClear();

    fireEvent.mouseDown(bar, { button: 0, clientX: 250 });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 260 });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 450 });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 900 });
    fireEvent.mouseUp(window);
    fireEvent.mouseMove(window, { buttons: 0, clientX: 50 });

    expect(onOpen.mock.calls.map((call) => call[0])).toEqual(["frames/f03.png", "frames/f05.png"]);
  });

  it("does not open a pressed frame a second time on the click that follows", async () => {
    const { onOpen } = show();
    build("0", "4", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(5));
    const bar = screen.getByLabelText("Timeline");
    bar.getBoundingClientRect = () =>
      ({ left: 0, width: 500, top: 0, height: 34, right: 500, bottom: 34, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    onOpen.mockClear();

    fireEvent.mouseDown(bar, { button: 0, clientX: 150 });
    fireEvent.mouseUp(window);
    fireEvent.click(cells()[1]!, { detail: 1 });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("the Review group (SP-45)", () => {
  /*
   * Legacy's Review group: "Flagged frames: N" with ← Prev Flagged and Next Flagged →, enabled only
   * when there is one (sequence_widget.py:441-464, 649-665). The web had a "Next flagged" button,
   * always enabled, and no count and no Prev.
   */
  const current = () => [...cells()].findIndex((cell) => cell.className.includes("timeline__frame--current"));
  const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

  function flagTwo() {
    render(withSettings(<TimelinePanel images={FOLDER} scores={{ 0: 0.95, 2: 0.97, 3: 0.995 }} />));
    build("0", "4");
    fireEvent.change(screen.getByLabelText("Minimum confidence"), { target: { value: "0.98" } });
  }

  it("counts the flagged frames and enables their buttons", async () => {
    flagTwo();

    await waitFor(() => expect(screen.getByText(/Flagged frames:/).textContent).toBe("Flagged frames: 2"));
    expect(button("← Prev Flagged").disabled).toBe(false);
    expect(button("Next Flagged →").disabled).toBe(false);
    expect(button("Next Flagged →").title).toBe("Go to next flagged frame (N)");
  });

  it("steps to the next and the previous flagged frame", async () => {
    flagTwo();
    await waitFor(() => expect(button("Next Flagged →").disabled).toBe(false));

    fireEvent.click(button("Next Flagged →"));
    await waitFor(() => expect(current()).toBe(2));

    fireEvent.click(button("← Prev Flagged"));
    await waitFor(() => expect(current()).toBe(0));
  });

  it("says 0 and disables both with nothing flagged", async () => {
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    expect(screen.getByText(/Flagged frames:/).textContent).toBe("Flagged frames: 0");
    expect(button("← Prev Flagged").disabled).toBe(true);
  });
});

describe("the frame keys", () => {
  const key = (action: string) => defaultSettings().hotkeys[action]!.primary;
  const press = (action: string) => fireEvent.keyDown(document, { key: key(action) });

  /** Which cell the timeline calls current, by its title. */
  const current = () =>
    [...cells()].find((cell) => cell.className.includes("--current"))?.getAttribute("title");

  it("jumps to the next REFERENCE frame", async () => {
    // f02 and f05 are the annotated ones, so they are the references. Starting at f01, the key
    // should land on f02 without the user clicking anything.
    show();
    build();
    await waitFor(() => expect(cells().length).toBeGreaterThan(0));

    press("next_reference_frame");

    await waitFor(() => expect(current()).toContain("f02.png"));
  });

  it("goes backwards too, and wraps as legacy does", async () => {
    // Wrapping is the part worth pinning: from the first reference, previous goes to the LAST.
    show();
    build();
    await waitFor(() => expect(cells().length).toBeGreaterThan(0));
    press("next_reference_frame");
    await waitFor(() => expect(current()).toContain("f02.png"));

    press("prev_reference_frame");

    await waitFor(() => expect(current()).toContain("f05.png"));
  });

  it("stays put when there is no frame of that kind, and says so as legacy does", async () => {
    // No frame is flagged until propagation runs, and a key that throws on an empty timeline is a
    // key nobody presses twice. Legacy's notice is "No more flagged frames" (main_window.py:4673).
    show();
    build();
    await waitFor(() => expect(cells().length).toBeGreaterThan(0));
    const before = current();

    press("next_flagged_frame");

    expect(current()).toBe(before);
    expect(await screen.findByText("No more flagged frames")).toBeTruthy();
  });

  it("answers Find Archetypes with legacy's 'Build a timeline first' before one exists", async () => {
    // Its handler called a function declared below the early return, so with no timeline built
    // the key threw a ReferenceError instead.
    show();

    press("find_archetypes");

    expect(await screen.findByText("Build a timeline first")).toBeTruthy();
  });

  it("does nothing while its tab is not the one showing", async () => {
    // The panel stays mounted on the other tabs; its keys must not act there.
    render(
      withSettings(
        <SequenceActiveContext.Provider value={false}>
          <TimelinePanel images={FOLDER} />
        </SequenceActiveContext.Provider>,
      ),
    );
    build();
    await waitFor(() => expect(cells().length).toBeGreaterThan(0));
    const before = current();

    press("next_reference_frame");
    press("find_archetypes");

    expect(current()).toBe(before);
    // Find Archetypes says where it works instead, as the shell's fallback does.
    expect(await screen.findByText("Find Archetypes works on the Sequence tab")).toBeTruthy();
    expect(screen.queryByText("Build a timeline first")).toBeNull();
  });
});


describe("trimming the timeline — RULE-077", () => {
  /** Sets both bounds from a cell, since the controls take them from the current frame. */
  function boundsFrom(first: number, second: number) {
    fireEvent.click(cells()[first]!);
    fireEvent.click(screen.getByText("Set Left"));
    fireEvent.click(cells()[second]!);
    fireEvent.click(screen.getByText("Set Right"));
  }
  const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

  it("names the bounds by file and marks them on the bar, as legacy's Trim group does (SP-44)", async () => {
    // Legacy's Left and Right labels show the file names, and red triangles mark the bounds on the
    // bar (sequence_widget.py:475-490; main_window.py:5185-5207; timeline_widget.py:380-420). The web
    // showed "bounds 2 to 3", and nothing on the bar.
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));
    expect(screen.getByText(/^Left:/).textContent).toBe("Left: Not set");

    boundsFrom(1, 3);

    expect(screen.getByText(/^Left:/).textContent).toBe("Left: f02.png");
    expect(screen.getByText(/^Right:/).textContent).toBe("Right: f04.png");
    expect(cells()[1]!.className).toContain("timeline__frame--trim-left");
    expect(cells()[3]!.className).toContain("timeline__frame--trim-right");
  });

  it("offers Cut and Keep only with both bounds, and Clear Trim with either, as legacy does (SP-44)", async () => {
    // sequence_widget.py:934-940. The web's were always enabled and refused with a note.
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));
    expect([button("Clear Trim").disabled, button("Cut").disabled, button("Keep").disabled]).toEqual([true, true, true]);

    fireEvent.click(cells()[1]!);
    fireEvent.click(screen.getByText("Set Left"));
    expect([button("Clear Trim").disabled, button("Cut").disabled, button("Keep").disabled]).toEqual([false, true, true]);

    fireEvent.click(cells()[3]!);
    fireEvent.click(screen.getByText("Set Right"));
    expect([button("Cut").disabled, button("Keep").disabled]).toEqual([false, false]);
  });

  it("clears both bounds and their markers with Clear Trim (SP-44)", async () => {
    // main_window.py:5338-5344; sequence_widget.py:921-932.
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));
    boundsFrom(1, 3);

    fireEvent.click(button("Clear Trim"));

    expect(screen.getByText(/^Right:/).textContent).toBe("Right: Not set");
    expect([...cells()].some((cell) => cell.className.includes("--trim-"))).toBe(false);
    expect(button("Cut").disabled).toBe(true);
    expect(cells()).toHaveLength(5);
  });

  it("cuts what is between the markers ON SCREEN when the timeline is sorted (SP-27)", async () => {
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));
    fireEvent.click(screen.getByText("Sort"));
    // On screen: f02, f05 (references), then f01, f03, f04.
    await waitFor(() => expect(cells()[0]!.getAttribute("aria-label")).toContain("frames/f02.png"));
    boundsFrom(0, 2); // f02 .. f01 as shown

    fireEvent.click(screen.getByText("Cut"));

    await waitFor(() => expect(cells()).toHaveLength(2));
    const left = [...cells()].map((cell) => cell.getAttribute("aria-label")!.split(", ")[1]);
    expect(left.sort()).toEqual(["frames/f03.png", "frames/f04.png"]);
  });

  it("opens the nearest kept frame when the open one is cut (SP-19)", async () => {
    // Legacy selects the nearest kept frame after a trim (main_window.py:5290-5291). The web moved
    // the cursor and left the cut frame on screen.
    const { onOpen } = showShell({ initial: "frames/f02.png" });
    build("0", "4", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(5));
    boundsFrom(1, 2); // opens f02, then f03, as the bounds are set from the frame on screen
    onOpen.mockClear();

    fireEvent.click(screen.getByText("Cut"));

    await waitFor(() => expect(cells()).toHaveLength(3));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(["frames/f01.png", "frames/f04.png"]).toContain(onOpen.mock.calls[0]![0]);
  });

  it("leaves an open frame that survives the trim alone, edits and all (SP-14)", async () => {
    const { onOpen } = showShell({ initial: "frames/f05.png" });
    build("0", "4", { references: false });
    await waitFor(() => expect(cells()).toHaveLength(5));
    boundsFrom(1, 2);
    fireEvent.click(cells()[4]!); // f05 open again, outside the bounds
    onOpen.mockClear();

    fireEvent.click(screen.getByText("Cut"));

    await waitFor(() => expect(cells()).toHaveLength(3));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("cuts the frames between the bounds and says how many", async () => {
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    boundsFrom(1, 2);
    fireEvent.click(screen.getByText("Cut"));

    await waitFor(() => expect(cells()).toHaveLength(3));
    expect(screen.getByText(/Removed 2 frames from the timeline/)).toBeTruthy();
  });

  it("says plainly that no files were touched", async () => {
    // The single most important thing about this control. A user reading "removed" about a list of
    // their own images has every reason to think something was deleted.
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    boundsFrom(1, 2);
    fireEvent.click(screen.getByText("Cut"));

    expect(await screen.findByText(/No files were touched/)).toBeTruthy();
  });

  it("keeps only what is inside the bounds", async () => {
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    boundsFrom(1, 3);
    fireEvent.click(screen.getByText("Keep"));

    await waitFor(() => expect(cells()).toHaveLength(3));
    expect(cells()[0]!.getAttribute("aria-label")).toContain("frames/f02.png");
  });

  it("refuses to empty the timeline", async () => {
    // An empty timeline has no range picker in it, so the only way back would be to rebuild.
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    boundsFrom(0, 4);
    fireEvent.click(screen.getByText("Cut"));

    expect(await screen.findByText(/Cannot remove all frames/)).toBeTruthy();
    expect(cells()).toHaveLength(5);
  });

  it("keeps a reference frame's role through a trim", async () => {
    // "Remaining frames keep their status, score, masks and reference data." Losing a reference
    // would silently change what the next propagation carries from.
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));

    // f02 and f05 are the annotated ones in FOLDER, so both are references.
    boundsFrom(2, 3);
    fireEvent.click(screen.getByText("Cut"));

    await waitFor(() => expect(cells()).toHaveLength(3));
    const labels = [...cells()].map((cell) => cell.getAttribute("aria-label"));
    expect(labels.filter((label) => label?.includes("reference"))).toHaveLength(2);
  });
});

describe("legacy's other reference buttons (sequence_widget.py:228-253)", () => {
  const roles = () => [...cells()].map((cell) => cell.getAttribute("aria-label")!.split(", ").at(-1));

  it("Clear references leaves no frame a reference", async () => {
    show();
    build("0", "4");
    await waitFor(() => expect(roles().filter((role) => role === "reference")).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: "Clear references" }));

    expect(roles().filter((role) => role === "reference")).toHaveLength(0);
  });

  it("+ All labeled makes every annotated frame a reference again", async () => {
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));
    fireEvent.click(screen.getByRole("button", { name: "Clear references" }));

    fireEvent.click(screen.getByRole("button", { name: "+ All labeled" }));

    expect(roles()).toEqual(["pending", "reference", "pending", "pending", "reference"]);
  });

  it("+ All before makes every frame left of the current one a reference", async () => {
    show();
    build("0", "4");
    await waitFor(() => expect(cells()).toHaveLength(5));
    fireEvent.click(screen.getByRole("button", { name: "Clear references" }));
    fireEvent.click(cells()[3]!);

    fireEvent.click(screen.getByRole("button", { name: "+ All before" }));

    expect(roles()).toEqual(["reference", "reference", "reference", "pending", "pending"]);
  });
});
