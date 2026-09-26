/**
 * Phase 6 exit criterion 2, the behaviour half: this app's sequence mode against legacy's own.
 *
 * `inference/tests/goldens/propagation/synthetic-shapes.json` is legacy's MainWindow,
 * SequenceViewMode and PropagationManager, run headless on a clip of moving shapes under four
 * scenarios: its defaults, Keep Flagged Masks on, and Skip Labeled on and off over four labelled
 * frames. For each, it recorded what legacy's window did with the model's answers.
 *
 * For each, this drives the real timeline and propagation control with a fake service that answers
 * with legacy's OWN model output -- every object on every frame, in the order the port's runner
 * produces them, the reference frame included -- and compares, frame by frame:
 *
 * - the timeline after the run, and again after Save All;
 * - the confidence each frame shows;
 * - the masks each frame offers for review;
 * - which frames Save All writes, with which objects and classes.
 *
 * The model's half -- that the port's runner gives legacy's masks and scores in the first place --
 * is `inference/tests/test_propagation_goldens.py`. Together they are the criterion.
 *
 * WHAT THIS FOUND, 2026-09-23. The app had no Keep Flagged Masks, so a flagged frame kept every
 * mask for review where legacy's default discards them; no Skip Labeled, so a re-run and Save All
 * overwrote frames labelled since the timeline was built; and it never showed a written frame as
 * saved. Built, and held here.
 *
 * THE SETUP IS LEGACY'S, exactly: the labelled frames have their sidecars from the start, and the
 * reference is marked by hand -- click frame 8, "+ Add Current" -- because building a timeline
 * marks nothing since 2026-09-23, as legacy's does not. Until then this app marked every annotated
 * frame on build, and this test had to add the labelled frames' sidecars after the build to get
 * legacy's configuration at all.
 */

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient, WirePropagationFrame, WirePropagationJob } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { Timeline, buildRange } from "../sequence/harness.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";

afterEach(cleanup);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_FILE = path.join(
  HERE, "..", "..", "..", "inference", "tests", "goldens", "propagation", "synthetic-shapes.json",
);

interface Scenario {
  readonly keepFlagged: boolean;
  readonly skipLabeled: boolean;
  readonly labeled: readonly number[];
  readonly timeline: readonly string[];
  readonly timelineConfidence: Readonly<Record<string, number>>;
  readonly keptMasks: Readonly<Record<string, readonly number[]>>;
  readonly saveAll: {
    readonly written: readonly {
      readonly frame: number;
      readonly segments: readonly { readonly class: number; readonly object: number }[];
    }[];
    readonly timeline: readonly string[];
  };
}

interface Golden {
  readonly threshold: number;
  readonly height: number;
  readonly width: number;
  readonly frames: readonly string[];
  readonly references: readonly { readonly frame: number; readonly object: number; readonly class: number }[];
  readonly results: readonly {
    readonly frame: number;
    readonly object: number;
    readonly pass: "forward" | "backward";
    readonly confidence: number;
    readonly empty: boolean;
  }[];
  readonly scenarios: Readonly<Record<string, Scenario>>;
}

const GOLDEN = JSON.parse(readFileSync(GOLDEN_FILE, "utf8")) as Golden;
const KEYS = GOLDEN.frames.map((name) => `clip/${name}`);
const REFERENCE = GOLDEN.references[0]!.frame;

/**
 * A mask whose BOX says which object it is, so a saved or reviewed segment can be traced back.
 * The pixels are not the model's -- this layer never looks inside a mask, only at whether it has any.
 */
function maskOf(object: number) {
  return {
    height: GOLDEN.height,
    width: GOLDEN.width,
    box: [object * 4, 0, object * 4 + 2, 2] as [number, number, number, number],
    data: btoa(String.fromCharCode(1).repeat(4)),
  };
}

const EMPTY = { height: GOLDEN.height, width: GOLDEN.width, box: null, data: "" };

function objectOf(box: readonly number[] | null | undefined): number {
  if (!box) throw new Error("a segment with no box");
  return box[0]! / 4;
}

/**
 * What the port's runner yields, in its order: forward from the reference to the last frame, then
 * back from it -- the reference reported once, as the runner reports it, though legacy's engine
 * never does. Whether the app ignores it is part of what is compared.
 */
function portResults(): WirePropagationFrame[] {
  const byFrame = new Map<number, WirePropagationFrame[]>();
  for (const r of GOLDEN.results) {
    const list = byFrame.get(r.frame) ?? [];
    list.push({
      source: KEYS[r.frame]!,
      objectId: r.object,
      mask: r.empty ? EMPTY : maskOf(r.object),
      confidence: r.confidence,
    } as WirePropagationFrame);
    byFrame.set(r.frame, list);
  }
  byFrame.set(
    REFERENCE,
    GOLDEN.references.map((ref) => ({
      source: KEYS[REFERENCE]!,
      objectId: ref.object,
      mask: maskOf(ref.object),
      confidence: 1,
    }) as WirePropagationFrame),
  );
  const order = [
    ...KEYS.map((_, index) => index).filter((index) => index >= REFERENCE),
    ...KEYS.map((_, index) => index).filter((index) => index < REFERENCE).reverse(),
  ];
  return order.flatMap((index) => byFrame.get(index) ?? []);
}

function listing(annotated: ReadonlySet<number>) {
  return {
    folder: "clip",
    folders: [],
    annotatedCount: annotated.size,
    unrecognized: 0,
    columns: [],
    images: KEYS.map((key, index) => ({
      key,
      name: key.slice("clip/".length),
      sidecars: {},
      annotated: annotated.has(index),
      sharesSidecarsWith: [],
    })),
  };
}

/** One square per reference object, in object order -- legacy numbers a frame's segments in order. */
const REFERENCE_SEGMENTS = GOLDEN.references.map((ref, index) => ({
  type: "Polygon",
  classId: ref.class,
  vertices: [
    [10 + index * 40, 10],
    [30 + index * 40, 10],
    [30 + index * 40, 30],
    [10 + index * 40, 30],
  ],
}));

function mount(scenario: Scenario) {
  const saved: { key: string; objects: [number, number][] }[] = [];
  const opened = new Map<string, readonly number[]>();
  const results = portResults();
  const half = Math.ceil(results.length / 2);
  let polls = 0;

  const job = (overrides: Partial<WirePropagationJob>): WirePropagationJob => ({
    id: "golden",
    state: "running",
    completed: 0,
    total: KEYS.length,
    cursor: 0,
    cancelling: false,
    error: null,
    results: [],
    ...overrides,
  });

  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (next: unknown) => next,
    // Asked again when Propagate is pressed, which is when Skip Labeled takes its snapshot.
    listImages: async () => listing(new Set([REFERENCE, ...scenario.labeled])),
    imageMetadata: async () => ({
      width: GOLDEN.width,
      height: GOLDEN.height,
      sourceDepth: 8,
      sourceChannels: 3,
      sourceFormat: "png",
    }),
    loadAnnotations: async (_project: string, key: string) => ({
      kind: "loaded",
      annotations: {
        sourceFormat: "NPZ",
        sourceFile: key,
        revision: "r1",
        segments: key === KEYS[REFERENCE] ? REFERENCE_SEGMENTS : [],
        classAliases: {},
        failures: [],
      },
    }),
    startPropagation: async () => job({}),
    // Two polls, so frames are committed both while the job runs and when it stops.
    propagationState: async () => {
      polls += 1;
      return polls === 1
        ? job({ completed: 12, cursor: half, results: results.slice(0, half) })
        : job({ state: "completed", completed: KEYS.length, cursor: results.length, results: results.slice(half) });
    },
    saveAnnotations: async (
      _project: string,
      key: string,
      request: { segments: { classId: number; mask: { box: number[] } }[] },
    ) => {
      saved.push({ key, objects: request.segments.map((s) => [s.classId, objectOf(s.mask.box)]) });
      return { written: [], stale: [], skippedEmpty: [] };
    },
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <Timeline
            images={listing(new Set([REFERENCE, ...scenario.labeled])).images as never}
            client={client}
            confirmDiscard={() => true}
            onOpen={(key, segments) =>
              opened.set(key, (segments ?? []).map((segment) => objectOf(segment.mask?.box)).sort())
            }
          />
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
  return { saved, opened };
}

const cells = () => [...screen.getByLabelText("Timeline").querySelectorAll("button")];
const roles = () => cells().map((cell) => cell.getAttribute("aria-label")!.split(", ").at(-1));
const confidences = () =>
  Object.fromEntries(
    cells().flatMap((cell, index) => {
      const shown = /confidence ([0-9.]+)$/.exec(cell.getAttribute("title") ?? "");
      return shown ? [[String(index), Number(shown[1])]] : [];
    }),
  );

async function propagate(scenario: Scenario) {
  await screen.findByRole("button", { name: "Set Start" });
  buildRange();
  await waitFor(() => expect(cells()).toHaveLength(KEYS.length));
  // The reference, marked as a user marks it: open the frame, then "+ Add Current".
  fireEvent.click(cells()[REFERENCE]!);
  fireEvent.click(screen.getByRole("button", { name: "+ Add Current" }));

  const controls = screen.getByRole("button", { name: /^Propagate/ }).closest("div")!;
  if (scenario.keepFlagged) fireEvent.click(within(controls).getByLabelText("Keep flagged masks"));
  if (!scenario.skipLabeled) fireEvent.click(within(controls).getByLabelText("Skip labeled"));

  fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));
  await screen.findByText(`Propagated ${KEYS.length} frames`, undefined, { timeout: 5000 });
}

/** A whole propagation and review per test, in jsdom: seconds, not the default five. */
const PER_TEST = 60_000;

describe.each(Object.entries(GOLDEN.scenarios))(
  "the synthetic-shapes golden, scenario %s",
  (_name, scenario) => {
    it("shows every frame as legacy's timeline did", async () => {
      mount(scenario);
      await propagate(scenario);

      await waitFor(() => expect(roles()).toEqual(scenario.timeline));
    }, PER_TEST);

    it("shows the confidence legacy showed, and none where it showed none", async () => {
      mount(scenario);
      await propagate(scenario);

      const expected = Object.fromEntries(
        Object.entries(scenario.timelineConfidence).map(([frame, score]) => [
          frame,
          Number(score.toFixed(4)),
        ]),
      );
      await waitFor(() => expect(confidences()).toEqual(expected));
    }, PER_TEST);

    it("offers the masks legacy kept for review, and no others", async () => {
      const { opened } = mount(scenario);
      await propagate(scenario);
      await waitFor(() => expect(roles()).toEqual(scenario.timeline));

      for (const [index, cell] of cells().entries()) {
        if (index === REFERENCE) continue;
        fireEvent.click(cell);
      }

      const offered = Object.fromEntries(
        [...opened].filter(([, objects]) => objects.length > 0)
          .map(([key, objects]) => [String(KEYS.indexOf(key)), objects]),
      );
      expect(offered).toEqual(scenario.keptMasks);
    }, PER_TEST);

    it("writes exactly the frames legacy's Save All wrote, with the same objects and classes", async () => {
      const { saved } = mount(scenario);
      await propagate(scenario);
      // As a user would: the job says it is done a render before the timeline has flagged its
      // last frames, and a Save pressed in between writes only what was already settled.
      await waitFor(() => expect(roles()).toEqual(scenario.timeline));

      fireEvent.click(await screen.findByRole("button", { name: /^Save \d+ frame/ }));
      // Written one frame at a time, as the real client does, so give it the time 21 writes take.
      await waitFor(() => expect(saved).toHaveLength(scenario.saveAll.written.length), {
        timeout: 20_000,
      });

      expect(
        saved.map(({ key, objects }) => ({
          frame: KEYS.indexOf(key),
          segments: objects.map(([cls, object]) => ({ class: cls, object })),
        })),
      ).toEqual(
        scenario.saveAll.written.map(({ frame, segments }) => ({
          frame,
          segments: segments.map(({ class: cls, object }) => ({ class: cls, object })),
        })),
      );
      await waitFor(() => expect(roles()).toEqual(scenario.saveAll.timeline));
    }, PER_TEST);
  },
);
