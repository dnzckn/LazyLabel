/**
 * The fourteen capabilities from `AI_NATIVE_SPEC.md` section 1, and what this service has built.
 *
 * Phase 2 exit criterion 2 asks that acceptance tests for capabilities not built yet be visible and
 * tagged with the phase that builds them, so nobody mistakes "no test" for "works". This table is
 * the single place that records which is which, and `test/acceptance/coverage.test.ts` fails if the
 * table and the acceptance suite ever disagree — if a capability is marked built with no test, or a
 * pending one quietly loses its placeholder.
 *
 * `apiStatus` is about THIS service only. C3 is "built" in the inference service and irrelevant
 * here until the API proxies it, so what the column means is: what does the API owe this
 * capability, and does it do it yet.
 */

export type ApiStatus =
  /** The API's share of this capability works and is covered by an acceptance test. */
  | "built"
  /** The API owes this capability something that is not built yet. */
  | "pending"
  /** The API owes this capability nothing; it lives entirely in another service or the web app. */
  | "not-this-service";

export interface Capability {
  readonly id: string;
  readonly summary: string;
  /** Phases that build it, verbatim from the spec's "Built in" column. */
  readonly builtIn: string;
  readonly apiStatus: ApiStatus;
  /** For a pending capability, the phase that will build the API's share. */
  readonly apiPhase?: string;
  /** For a pending capability, what specifically is missing. */
  readonly missing?: string;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    id: "C1",
    summary: "Open a folder of images and see which already carry annotations",
    builtIn: "P4",
    apiStatus: "built",
  },
  {
    id: "C2",
    summary: "Load an image's annotations from the best file present",
    builtIn: "P1 library, P4 wiring",
    apiStatus: "built",
  },
  {
    id: "C3",
    summary: "Segment an object by clicking or boxing it with SAM",
    // Read pending until 2026-09-23 for want of "the rendered-pixels route" (RULE-089). It exists --
    // the embedding proxy renders the adjusted picture when adjustments are sent -- and
    // c3.inferenceProxy.test.ts proves it along with the proxy, the handles and the contract.
    builtIn: "P3, P5",
    apiStatus: "built",
  },
  {
    id: "C4",
    summary: "Draw and edit polygons, boxes and circles by hand",
    builtIn: "P5",
    apiStatus: "not-this-service",
  },
  {
    id: "C5",
    summary: "Erase, merge, split and reclass segments",
    builtIn: "P1 library, P5 interface",
    apiStatus: "not-this-service",
  },
  {
    id: "C6",
    summary: "Undo and redo editing actions",
    builtIn: "P4, P5",
    apiStatus: "not-this-service",
  },
  {
    id: "C7",
    summary: "Assign classes and names, and decide which class wins an overlapping pixel",
    builtIn: "P1, P5",
    apiStatus: "not-this-service",
  },
  {
    id: "C8",
    summary: "Adjust the displayed image, threshold channels, rescale and crop",
    builtIn: "P5",
    // Decode, the 16-bit conversion, the processing chain, thumbnails and the rendered pixels for
    // the model (RULE-089) are all built; what the spec's API sketch has and this does not is TILES.
    // Measured 2026-09-23 on a noisy 50-megapixel 16-bit TIFF, the supported working size: one
    // 41 MB PNG, 2.4 s from click to pixels cold, 0.8 s to a painted canvas warm, a 0.5 s decode
    // stall. Enough on a local install; whether a hosted one on a slow link needs tiles is the owner's call.
    apiStatus: "pending",
    apiPhase: "P5",
    missing:
      "tiles (`/images/{imagePath}/tiles/{z}/{x}/{y}` in the spec): not needed at 50 megapixels on a local install, measured; the owner decides for a hosted one",
  },
  {
    id: "C9",
    summary: "Save annotations in any of the seven formats, choosing which are written",
    builtIn: "P1, P4",
    apiStatus: "built",
  },
  {
    id: "C10",
    summary: "Build a timeline from an image sequence and mark reference frames",
    // Read pending until 2026-09-23 for want of "sequence and timeline persistence", which was the
    // architecture's expectation, not a requirement: none of C10's rules (RULE-093, 048, 022, 076,
    // 072, 065, 077) asks for a saved timeline, legacy keeps none between sessions, and the web app
    // rebuilds one from the files, which decision 5 makes the truth. The API's share is the file
    // order (C1), the annotations references are marked from (C2), image sizes for RULE-048, and
    // RULE-022's suggestions, which `c10.archetypeProxy.test.ts` proves through the proxy.
    builtIn: "P6",
    apiStatus: "built",
  },
  {
    id: "C11",
    summary: "Propagate labels through a sequence and review them by confidence",
    // Built, and read as pending until 2026-09-23 while the routes existed: the API proxies the
    // job routes and `c11.propagationProxy.test.ts` proves them. The "progress socket" this once
    // listed was REPLACED by polling, deliberately: the job API returns the frames finished so
    // far on every read, so a client that polls loses nothing a socket would have pushed, and
    // cancelling keeps committed frames either way (RULE-063).
    builtIn: "P3, P6",
    apiStatus: "built",
  },
  {
    id: "C12",
    summary: "Convert a dataset from one annotation format to another",
    builtIn: "P1, P4",
    apiStatus: "built",
  },
  {
    id: "C13",
    summary: "Keep settings and hotkeys across sessions",
    builtIn: "P2 schema, P4 interface",
    apiStatus: "built",
  },
  {
    id: "C14",
    summary: "Compare two images side by side and annotate both together",
    builtIn: "P6, per decision 8",
    // Read pending until 2026-09-23 for a decision taken on 2026-09-20: class ids stay per image
    // (decision 6) and a linked operation matches classes by NAME, resolving each image's own
    // aliases. That happens in the web app (`split/linked.ts`). Each side of the split view is an
    // ordinary open image and saves through C9's per-image route with its own aliases, so the API
    // owes the split view nothing of its own.
    apiStatus: "not-this-service",
  },
];

export function capability(id: string): Capability {
  const found = CAPABILITIES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no capability ${id} in the spec`);
  return found;
}
