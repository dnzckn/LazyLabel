/**
 * C10 in the browser: asking which frames are worth annotating, and what the answer is used for.
 *
 * Two things, and the second is the one that would otherwise go missing. The suggestions are drawn
 * on the timeline — that is the feature. They are also handed UP, because RULE-091's prefetch
 * encodes the first uncached archetype ahead of the neighbours: a suggestion is where a user
 * JUMPS to, and a jump is the navigation neighbour-prefetching never helps with.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { TimelinePanel } from "../../src/sequence/TimelinePanel.jsx";
import { markSuggested } from "../../src/sequence/timeline.js";
import type { Frame } from "../../src/sequence/timeline.js";

afterEach(cleanup);

function image(name: string, annotated = false): WireDatasetImage {
  return { key: `frames/${name}`, name, sidecars: {}, annotated, sharesSidecarsWith: [] };
}

const FOLDER = [
  image("f01.png"),
  image("f02.png", true),
  image("f03.png"),
  image("f04.png"),
  image("f05.png"),
];

function found(overrides: Record<string, unknown> = {}) {
  return {
    suggested: ["frames/f03.png", "frames/f05.png"],
    budget: 2,
    clusters: 2,
    noise: 0,
    fellShort: false,
    unreadable: [],
    ...overrides,
  };
}

function show(answer: () => unknown) {
  const onArchetypes = vi.fn();
  const findArchetypes = vi.fn(async (_sequence: readonly string[], _model?: string) => answer());
  const client = {
    getSettings: async () => defaultSettings(),
    putSettings: async (next: unknown) => next,
    findArchetypes,
  } as unknown as ApiClient;

  render(
    <NotificationProvider>
      <NotificationHost />
      <SettingsProvider client={client}>
        <HotkeyProvider bindings={defaultSettings().hotkeys}>
          <TimelinePanel images={FOLDER} client={client} onArchetypes={onArchetypes} />
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
  return { onArchetypes, findArchetypes };
}

const cells = () => screen.getByLabelText("Timeline").querySelectorAll("button");

async function build() {
  fireEvent.click(screen.getByText("Build timeline"));
  await waitFor(() => expect(cells()).toHaveLength(5));
}

describe("asking for them", () => {
  it("sends the timeline's frames in order", async () => {
    const { findArchetypes } = show(found);
    await build();

    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));

    await waitFor(() => expect(findArchetypes).toHaveBeenCalledTimes(1));
    expect(findArchetypes.mock.calls[0]![0]).toEqual(FOLDER.map((each) => each.key));
  });

  it("marks the suggested frames on the timeline", async () => {
    show(found);
    await build();

    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));

    await waitFor(() => {
      const labels = [...cells()].map((cell) => cell.getAttribute("aria-label"));
      expect(labels[2]).toContain("suggested");
      expect(labels[4]).toContain("suggested");
    });
  });

  it("hands them UP, so RULE-091's prefetch can prioritise them", async () => {
    // The half that would otherwise go missing. Drawing them is the feature; encoding them ahead
    // of the neighbours is what makes jumping to one feel immediate.
    const { onArchetypes } = show(found);
    await build();

    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));

    await waitFor(() =>
      expect(onArchetypes).toHaveBeenCalledWith(["frames/f03.png", "frames/f05.png"]),
    );
  });

  it("says how many scenes it found", async () => {
    show(found);
    await build();

    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));

    expect(await screen.findByText(/2 frames suggested from 2 scenes/)).toBeTruthy();
  });

  it("explains a SHORT answer rather than leaving it looking broken", async () => {
    // "Here are your twenty frames" against "this sequence is too uniform to find twenty distinct
    // ones". Legacy computes the comparison to pick a progress message and throws it away.
    show(() => found({ suggested: ["frames/f03.png"], budget: 20, fellShort: true, clusters: 1 }));
    await build();

    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));

    expect(await screen.findByText(/1 of 20 suggested/)).toBeTruthy();
    expect(screen.getByText(/only 1 distinct scenes/)).toBeTruthy();
  });

  it("says plainly when there are no scenes at all", async () => {
    show(() => found({ suggested: [], clusters: 0, noise: 5 }));
    await build();

    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));

    expect(await screen.findByText(/too uniform to suggest frames/)).toBeTruthy();
  });

  it("reports a failure with the service's own words", async () => {
    show(() => {
      throw new Error("4 frames is fewer than the 5 this needs to say anything");
    });
    await build();

    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));

    expect(await screen.findByText(/fewer than the 5/)).toBeTruthy();
  });

  it("offers no button at all without an inference client", async () => {
    // A button that answers 503 teaches a user the feature is unreliable; no button says plainly
    // that this deployment has no model.
    render(
      <NotificationProvider>
        <NotificationHost />
        <SettingsProvider client={{ getSettings: async () => defaultSettings() } as never}>
          <HotkeyProvider bindings={defaultSettings().hotkeys}>
            <TimelinePanel images={FOLDER} />
          </HotkeyProvider>
        </SettingsProvider>
      </NotificationProvider>,
    );
    await build();

    expect(screen.queryByRole("button", { name: /Find archetypes/ })).toBeNull();
  });
});

describe("markSuggested", () => {
  const frame = (index: number, state: string, isReference = false) =>
    ({ index, key: `frames/f${index}.png`, state, isReference }) as unknown as Frame;

  it("marks a pending frame", () => {
    const marked = markSuggested([frame(0, "pending")], ["frames/f0.png"]);

    expect(marked[0]!.state).toBe("suggested");
  });

  it("NEVER demotes a reference", () => {
    // A frame the user has annotated is ground truth, and a suggestion is advice about what to do
    // next. Overwriting the first with the second tells someone to redo finished work.
    const marked = markSuggested([frame(0, "reference", true)], ["frames/f0.png"]);

    expect(marked[0]!.state).toBe("reference");
  });

  it.each(["propagated", "saved", "flagged", "skipped"])(
    "leaves a %s frame alone, because that says what HAPPENED to it",
    (state) => {
      const marked = markSuggested([frame(0, state)], ["frames/f0.png"]);

      expect(marked[0]!.state).toBe(state);
    },
  );

  it("leaves frames nobody suggested alone", () => {
    const marked = markSuggested([frame(0, "pending"), frame(1, "pending")], ["frames/f0.png"]);

    expect(marked[1]!.state).toBe("pending");
  });
});
