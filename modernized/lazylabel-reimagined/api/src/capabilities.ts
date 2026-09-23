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
    builtIn: "P3, P5",
    apiStatus: "pending",
    apiPhase: "P3",
    missing:
      "the rendered-pixels route, which is what makes Operate On View implementable (RULE-089) and "
      + "waits for the adjustment pipeline in Phase 5. The proxy, the embedding handles and the "
      + "contract with the inference service are built",
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
    apiStatus: "pending",
    apiPhase: "P5",
    missing: "the image pipeline: decode, tile, and render adjusted pixels for the model",
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
    builtIn: "P6",
    apiStatus: "pending",
    apiPhase: "P6",
    missing: "sequence and timeline persistence",
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
    apiStatus: "pending",
    apiPhase: "P6",
    missing:
      "deliberately unmodelled: decision 8 rebuilds the split view from the linked-operation rules, and its per-viewer class-id space is a Phase 6 entry decision",
  },
];

export function capability(id: string): Capability {
  const found = CAPABILITIES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no capability ${id} in the spec`);
  return found;
}
