/**
 * The fourteen capabilities from `AI_NATIVE_SPEC.md` section 1, and what the WEB APP has built.
 *
 * Same table as the API keeps, answering a different question: what does the browser owe this
 * capability, and does it do it yet. C2 is "built" in the API and still pending here, because
 * loading annotations is only half done until something draws them.
 *
 * `test/acceptance/coverage.test.ts` fails if this table and the acceptance suite disagree.
 */

export type WebStatus = "built" | "pending" | "not-this-service";

export interface Capability {
  readonly id: string;
  readonly summary: string;
  readonly builtIn: string;
  readonly webStatus: WebStatus;
  readonly webPhase?: string;
  readonly missing?: string;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    id: "C1",
    summary: "Open a folder of images and see which already carry annotations",
    builtIn: "P4",
    webStatus: "built",
  },
  {
    id: "C2",
    summary: "Load an image's annotations from the best file present",
    builtIn: "P1 library, P4 wiring",
    webStatus: "built",
  },
  {
    id: "C3",
    summary: "Segment an object by clicking or boxing it with SAM",
    builtIn: "P3, P5",
    webStatus: "built",
  },
  {
    id: "C4",
    summary: "Draw and edit polygons, boxes and circles by hand",
    builtIn: "P5",
    webStatus: "built",
  },
  {
    id: "C5",
    summary: "Erase, merge, split and reclass segments",
    builtIn: "P1 library, P5 interface",
    webStatus: "built",
  },
  {
    id: "C6",
    summary: "Undo and redo editing actions",
    builtIn: "P4, P5",
    webStatus: "built",
  },
  {
    id: "C7",
    summary: "Assign classes and names, and decide which class wins an overlapping pixel",
    builtIn: "P1, P5",
    webStatus: "built",
  },
  {
    id: "C8",
    summary: "Adjust the displayed image, threshold channels, rescale and crop",
    builtIn: "P5",
    webStatus: "built",
  },
  {
    id: "C9",
    summary: "Save annotations in any of the seven formats, choosing which are written",
    builtIn: "P1, P4",
    webStatus: "built",
  },
  {
    id: "C10",
    summary: "Build a timeline from an image sequence and mark reference frames",
    builtIn: "P6",
    webStatus: "built",
  },
  {
    id: "C11",
    summary: "Propagate labels through a sequence and review them by confidence",
    builtIn: "P3, P6",
    webStatus: "pending",
    webPhase: "P6",
    missing: "the propagation controls and the progress socket",
  },
  {
    id: "C12",
    summary: "Convert a dataset from one annotation format to another",
    builtIn: "P1, P4",
    webStatus: "built",
  },
  {
    id: "C13",
    summary: "Keep settings and hotkeys across sessions",
    builtIn: "P2 schema, P4 interface",
    webStatus: "built",
  },
  {
    id: "C14",
    summary: "Compare two images side by side and annotate both together",
    builtIn: "P6, per decision 8",
    webStatus: "pending",
    webPhase: "P6",
    missing:
      "a LINKED operation -- one action applying to both images at the same pixel, as one undo "
      + "entry. Both panes are editable now and each side holds its own segments, crop and undo, "
      + "but every action still goes to one side: the store, the comparison view and the "
      + "linked-operation rules are built, and what is left is the call path that writes both "
      + "sides and records one inverse",
  },
];

export function capability(id: string): Capability {
  const found = CAPABILITIES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no capability ${id} in the spec`);
  return found;
}
