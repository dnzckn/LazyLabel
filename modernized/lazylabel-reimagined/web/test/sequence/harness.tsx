/**
 * The timeline as the shell holds it, for the tests that render the panel alone.
 *
 * The shell hands the panel the image on screen, `openKey`, which an open changes -- or leaves, when
 * the workspace refuses the open at its question about unsaved work (SP-19). Set Start and Set End
 * take that image, as legacy's take the file on screen (SP-41), so a test puts images on screen as
 * the file list would, with `openInView`, and builds a timeline the way a user does, with
 * `buildRange`.
 *
 * A plain module rather than a test file, so the tests that use it do not register its tests twice.
 * One timeline is mounted at a time: each test file cleans up after every test.
 */

import { act, fireEvent, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";

import { TimelinePanel, type TimelinePanelProps } from "../../src/sequence/TimelinePanel.jsx";

let putOnScreen: (key: string | undefined) => void = () => undefined;
let listed: readonly string[] = [];

/** Put an image on screen, as opening it from the file list does. */
export function openInView(key: string | undefined): void {
  act(() => putOnScreen(key));
}

/**
 * The panel, with the image on screen held as the shell holds it: an open the panel asks for
 * happens, unless `refuse`, and `openKey` is only where it starts.
 */
export function Timeline({
  refuse = false,
  openKey: initial,
  onOpen,
  ...props
}: TimelinePanelProps & { readonly refuse?: boolean }): ReactNode {
  const [openKey, setOpenKey] = useState(initial);
  putOnScreen = setOpenKey;
  listed = (props.rows ?? props.images).map((image) => image.key);
  return (
    <TimelinePanel
      {...props}
      {...(openKey === undefined ? {} : { openKey })}
      // The arguments as they came, so a spy sees what the panel sent.
      onOpen={(...args: Parameters<NonNullable<TimelinePanelProps["onOpen"]>>) => {
        onOpen?.(...args);
        if (!refuse) setOpenKey(args[0]);
      }}
    />
  );
}

/**
 * Legacy's way to a timeline (`sequence_widget.py:142-152`): the first image on screen and Set
 * Start, the last and Set End, then Build Timeline. Positions in the list; the whole list by default.
 */
export function buildRange(first = 0, last?: number): void {
  const keys = listed;
  openInView(keys[first]);
  fireEvent.click(screen.getByRole("button", { name: "Set Start" }));
  openInView(keys[last ?? keys.length - 1]);
  fireEvent.click(screen.getByRole("button", { name: "Set End" }));
  fireEvent.click(screen.getByRole("button", { name: "Build Timeline" }));
}
