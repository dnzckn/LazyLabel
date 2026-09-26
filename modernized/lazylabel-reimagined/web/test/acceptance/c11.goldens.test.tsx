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
 * `synthetic-shapes-streaming.json` is the same done with the clip drawn on to 34 frames and a
 * Stream window of 10, so legacy ran four windows forward and two back (RULE-026). The port keeps
 * each frame's answer from the FIRST window that covers it, and the fake service answers that way.
 * Where legacy's record differs from that, the difference is SEQUENCE_PARITY.md SP-36's and is
 * named below, not tolerated in general. SP-09's frames -- 0-2, which legacy's second backward
 * window never answers and the port does -- get no answer here, as they got none from legacy: the
 * port's answers for them are `inference/tests/test_propagation_streaming_golden.py`'s to check.
 *
 * The model's half -- that the port's runner gives legacy's masks and scores in the first place --
 * is `inference/tests/test_propagation_goldens.py` and its streaming twin. Together they are the
 * criterion.
 *
 * WHAT THIS FOUND, 2026-09-23. The app had no Keep Flagged Masks, so a flagged frame kept every
 * mask for review where legacy's default discards them; no Skip Labeled, so a re-run and Save All
 * overwrote frames labelled since the timeline was built; and it never showed a written frame as
 * saved. Built, and held here.
 *
 * THE SETUP IS LEGACY'S, exactly: the labelled frames have their sidecars from the start, and the
 * reference is marked by hand -- click its frame, "+ Add Current" -- because building a timeline
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
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { Timeline, buildRange } from "../sequence/harness.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";

afterEach(cleanup);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDENS = path.join(HERE, "..", "..", "..", "inference", "tests", "goldens", "propagation");

interface Scenario {
  readonly keepFlagged: boolean;
  readonly skipLabeled: boolean;
  readonly labeled: readonly number[];
  readonly timeline: readonly string[];
  readonly timelineConfidence: Readonly<Record<string, number>>;
  readonly keptMasks: Readonly<Record<string, readonly number[]>>;
  /** What legacy's status bar said through the run, the last when it finished. */
  readonly propagationNotices: readonly string[];
  readonly saveAll: {
    readonly written: readonly {
      readonly frame: number;
      readonly segments: readonly { readonly class: number; readonly object: number }[];
    }[];
    readonly timeline: readonly string[];
    /** What legacy said as Save All started and when it had written. */
    readonly notices: readonly string[];
  };
  /** Streaming only: frames legacy's engine handed its window from more than one window. */
  readonly redelivered?: Readonly<Record<string, readonly { readonly walk: number; readonly kind: string }[]>>;
  /** Streaming only: which window's answer each kept mask is, by frame and object. */
  readonly keptFrom?: Readonly<Record<string, Readonly<Record<string, readonly number[]>>>>;
}

interface Result {
  readonly frame: number;
  readonly object: number;
  readonly pass: "forward" | "backward";
  readonly confidence: number;
  readonly empty: boolean;
  /** Streaming only: the window, numbered from 1 in the order legacy walked them. */
  readonly window?: number;
}

interface Golden {
  readonly threshold: number;
  readonly height: number;
  readonly width: number;
  readonly frames: readonly string[];
  readonly references: readonly { readonly frame: number; readonly object: number; readonly class: number }[];
  readonly results: readonly Result[];
  readonly scenarios: Readonly<Record<string, Scenario>>;
  readonly streaming?: boolean;
  /** Each staging legacy made, as timeline frames in staged order: its outside references first. */
  readonly stagings?: readonly { readonly frames: readonly number[] }[];
  readonly walks?: readonly { readonly staging: number; readonly reverse: boolean }[];
}

function load(name: string): Golden {
  return JSON.parse(readFileSync(path.join(GOLDENS, `${name}.json`), "utf8")) as Golden;
}

/**
 * SP-36, where this app keeps what legacy does not. Legacy's engine only knows a frame is done
 * when it STORED an object for it (`propagation_manager.py:1054, 1083-1085`), so a frame an earlier
 * window only flagged is handed to the window again by the next window, and committed on top: its
 * masks merged in, its score the lower of the two (`main_window.py:4537-4569`,
 * `sequence_view_mode.py:290-322`). The port keeps each frame's first answer (RULE-026 as its card
 * states it: "overlap frames keep the earlier window's results").
 *
 * On the streaming golden that is frame 25 in the defaults scenario: window 2 flagged the disc
 * (0.9724) and found the square gone, window 3 came back with a "square" (0.9963) -- 96% of it the
 * purple distractor rectangle, as the square left the picture at frame 20 -- and legacy keeps that
 * mask for review on a frame it still flags, with Keep Flagged Masks off. Here the frame offers
 * nothing, as a flagged frame with Keep Flagged Masks off does. Legacy's engine also counts the
 * frame as propagated, so its notice says 28 frames where this app's says 27. The timeline, the
 * scores and what Save All writes are the same. The owner is to rule on it.
 */
const SP36: Readonly<Record<string, Readonly<Record<string, { readonly frames: readonly number[]; readonly propagated: number }>>>> = {
  "synthetic-shapes-streaming": { defaults: { frames: [25], propagated: 27 } },
};

/** Legacy's record for a scenario, with SP-36's differences where the golden has them. */
function expected(name: string, scenarioName: string, scenario: Scenario): Scenario {
  const difference = SP36[name]?.[scenarioName];
  if (difference === undefined) return scenario;
  const keptMasks = Object.fromEntries(
    Object.entries(scenario.keptMasks).filter(([frame]) => !difference.frames.includes(Number(frame))),
  );
  const notices = [...scenario.propagationNotices];
  notices[notices.length - 1] = notices.at(-1)!.replace(
    /^Propagation complete: \d+ frames/,
    `Propagation complete: ${difference.propagated} frames`,
  );
  return { ...scenario, keptMasks, propagationNotices: notices };
}

function replay(golden: Golden) {
  const keys = golden.frames.map((name) => `clip/${name}`);
  const reference = golden.references[0]!.frame;

  /**
   * A mask whose BOX says which object it is, so a saved or reviewed segment can be traced back.
   * The pixels are not the model's -- this layer never looks inside a mask, only at whether it has any.
   */
  const maskOf = (object: number) => ({
    height: golden.height,
    width: golden.width,
    box: [object * 4, 0, object * 4 + 2, 2] as [number, number, number, number],
    data: btoa(String.fromCharCode(1).repeat(4)),
  });
  const empty = { height: golden.height, width: golden.width, box: null, data: "" };

  const wire = (r: Result) =>
    ({
      source: keys[r.frame]!,
      objectId: r.object,
      mask: r.empty ? empty : maskOf(r.object),
      confidence: r.confidence,
    }) as WirePropagationFrame;
  // The reference reported once, as the runner reports it, though legacy's engine never does.
  const referenceAnswers = golden.references.map(
    (ref) =>
      ({
        source: keys[reference]!,
        objectId: ref.object,
        mask: maskOf(ref.object),
        confidence: 1,
      }) as WirePropagationFrame,
  );

  /**
   * What the port's runner yields, in its order. In one state: forward from the reference to the
   * last frame, then back from it. Streaming: window by window as legacy walked them, forward
   * windows first, each frame answered once, by the first window that covers it.
   */
  function portResults(): WirePropagationFrame[] {
    if (golden.streaming !== true) {
      const byFrame = new Map<number, WirePropagationFrame[]>();
      for (const r of golden.results) byFrame.set(r.frame, [...(byFrame.get(r.frame) ?? []), wire(r)]);
      byFrame.set(reference, referenceAnswers);
      const order = [
        ...keys.map((_, index) => index).filter((index) => index >= reference),
        ...keys.map((_, index) => index).filter((index) => index < reference).reverse(),
      ];
      return order.flatMap((index) => byFrame.get(index) ?? []);
    }

    const answered = new Set<number>();
    const out: WirePropagationFrame[] = [];
    golden.walks!.forEach((walk, index) => {
      const staged = golden.stagings![walk.staging]!.frames;
      // The window's own frames: the run of consecutive frames the staging ends with. The
      // references staged from outside the window come before it.
      let first = staged.length - 1;
      while (first > 0 && staged[first - 1] === staged[first]! - 1) first -= 1;
      const own = staged.slice(first);
      for (const frame of walk.reverse ? [...own].reverse() : own) {
        if (answered.has(frame)) continue;
        answered.add(frame);
        if (frame === reference) {
          out.push(...referenceAnswers);
          continue;
        }
        out.push(...golden.results.filter((r) => r.window === index + 1 && r.frame === frame).map(wire));
      }
    });
    return out;
  }

  function listing(annotated: ReadonlySet<number>) {
    return {
      folder: "clip",
      folders: [],
      annotatedCount: annotated.size,
      unrecognized: 0,
      columns: [],
      images: keys.map((key, index) => ({
        key,
        name: key.slice("clip/".length),
        sidecars: {},
        annotated: annotated.has(index),
        sharesSidecarsWith: [],
      })),
    };
  }

  /** One square per reference object, in object order -- legacy numbers a frame's segments in order. */
  const referenceSegments = golden.references.map((ref, index) => ({
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
      total: keys.length,
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
      listImages: async () => listing(new Set([reference, ...scenario.labeled])),
      imageMetadata: async () => ({
        width: golden.width,
        height: golden.height,
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
          segments: key === keys[reference] ? referenceSegments : [],
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
          : job({ state: "completed", completed: keys.length, cursor: results.length, results: results.slice(half) });
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
        <NotificationHost />
        <SettingsProvider client={client}>
          <HotkeyProvider bindings={defaultSettings().hotkeys}>
            <Timeline
              images={listing(new Set([reference, ...scenario.labeled])).images as never}
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

  async function propagate(scenario: Scenario) {
    await screen.findByRole("button", { name: "Set Start" });
    buildRange();
    await waitFor(() => expect(cells()).toHaveLength(keys.length));
    // The reference, marked as a user marks it: open the frame, then "+ Add Current".
    fireEvent.click(cells()[reference]!);
    fireEvent.click(screen.getByRole("button", { name: "+ Add Current" }));

    const controls = screen.getByRole("button", { name: /^Propagate/ }).closest("fieldset")!;
    if (scenario.keepFlagged) fireEvent.click(within(controls).getByLabelText("Keep Flagged Masks"));
    if (!scenario.skipLabeled) fireEvent.click(within(controls).getByLabelText("Skip Labeled"));

    fireEvent.click(screen.getByRole("button", { name: /^Propagate/ }));
    // The run is over when the app says what legacy said then, word for word (SP-50).
    await screen.findByText(scenario.propagationNotices.at(-1)!, undefined, { timeout: 5000 });
  }

  return { keys, reference, mount, propagate };
}

function objectOf(box: readonly number[] | null | undefined): number {
  if (!box) throw new Error("a segment with no box");
  return box[0]! / 4;
}

const cells = () => [...screen.getByLabelText("Timeline").querySelectorAll("button")];
const roles = () => cells().map((cell) => cell.getAttribute("aria-label")!.split(", ").at(-1));
const confidences = () =>
  Object.fromEntries(
    cells().flatMap((cell, index) => {
      const shown = /Confidence: ([0-9.]+)$/.exec(cell.getAttribute("title") ?? "");
      return shown ? [[String(index), Number(shown[1])]] : [];
    }),
  );

/** A whole propagation and review per test, in jsdom: seconds, not the default five. */
const PER_TEST = 60_000;

for (const name of ["synthetic-shapes", "synthetic-shapes-streaming"]) {
  const golden = load(name);
  const { keys, reference, mount, propagate } = replay(golden);

  describe.each(Object.entries(golden.scenarios))(`the ${name} golden, scenario %s`, (scenarioName, recorded) => {
    const scenario = expected(name, scenarioName, recorded);

    it("shows every frame as legacy's timeline did", async () => {
      mount(scenario);
      await propagate(scenario);

      await waitFor(() => expect(roles()).toEqual(scenario.timeline));
    }, PER_TEST);

    it("shows the confidence legacy showed, and none where it showed none", async () => {
      mount(scenario);
      await propagate(scenario);

      const shown = Object.fromEntries(
        Object.entries(scenario.timelineConfidence).map(([frame, score]) => [
          frame,
          Number(score.toFixed(4)),
        ]),
      );
      await waitFor(() => expect(confidences()).toEqual(shown));
    }, PER_TEST);

    it("offers the masks legacy kept for review, and no others", async () => {
      const { opened } = mount(scenario);
      await propagate(scenario);
      await waitFor(() => expect(roles()).toEqual(scenario.timeline));

      for (const [index, cell] of cells().entries()) {
        if (index === reference) continue;
        fireEvent.click(cell);
      }

      const offered = Object.fromEntries(
        [...opened].filter(([, objects]) => objects.length > 0)
          .map(([key, objects]) => [String(keys.indexOf(key)), objects]),
      );
      expect(offered).toEqual(scenario.keptMasks);
    }, PER_TEST);

    it("writes exactly the frames legacy's Save All wrote, with the same objects and classes", async () => {
      const { saved } = mount(scenario);
      await propagate(scenario);
      // As a user would: the job says it is done a render before the timeline has flagged its
      // last frames, and a Save pressed in between writes only what was already settled.
      await waitFor(() => expect(roles()).toEqual(scenario.timeline));

      fireEvent.click(await screen.findByRole("button", { name: "Save All" }));
      // Written one frame at a time, as the real client does, so give it the time the writes take.
      await waitFor(() => expect(saved).toHaveLength(scenario.saveAll.written.length), {
        timeout: 20_000,
      });

      expect(
        saved.map(({ key, objects }) => ({
          frame: keys.indexOf(key),
          segments: objects.map(([cls, object]) => ({ class: cls, object })),
        })),
      ).toEqual(
        scenario.saveAll.written.map(({ frame, segments }) => ({
          frame,
          segments: segments.map(({ class: cls, object }) => ({ class: cls, object })),
        })),
      );
      await waitFor(() => expect(roles()).toEqual(scenario.saveAll.timeline));
      // And says what legacy said, word for word: its engine's count first, the frames written after.
      for (const notice of scenario.saveAll.notices) expect(await screen.findByText(notice)).toBeTruthy();
    }, PER_TEST);
  });
}

describe("SP-36 on the streaming golden, as legacy recorded it", () => {
  const golden = load("synthetic-shapes-streaming");
  const recorded = golden.scenarios["defaults"]!;

  it("hands frame 25 to its window twice, and keeps the later window's mask on a frame it flags", () => {
    // What the SP36 table above answers for. Should a recapture lose it, the table would be
    // excusing a difference that is no longer there.
    expect(recorded.keepFlagged).toBe(false);
    expect(recorded.redelivered?.["25"]?.map((entry) => [entry.walk, entry.kind])).toEqual([
      [2, "flagged"],
      [3, "mask"],
    ]);
    expect(recorded.timeline[25]).toBe("flagged");
    expect(recorded.keptMasks["25"]).toEqual([2]);
    expect(recorded.keptFrom?.["25"]).toEqual({ "2": [3] });
    expect(recorded.propagationNotices.at(-1)).toMatch(/^Propagation complete: 28 frames, 1 flagged\./);
    expect(recorded.saveAll.written.map((write) => write.frame)).not.toContain(25);
  });

  it("is the only frame any scenario hands over twice", () => {
    const twice = Object.entries(golden.scenarios).flatMap(([name, scenario]) =>
      Object.keys(scenario.redelivered ?? {}).map((frame) => `${name}:${frame}`),
    );
    expect(twice).toEqual(["defaults:25"]);
  });
});
