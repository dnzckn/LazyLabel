/**
 * C10 in the browser: asking which frames are worth annotating, and what the answer is used for.
 *
 * Two things, and the second is the one that would otherwise go missing. The suggestions are drawn
 * on the timeline — that is the feature. They are also handed UP, because RULE-091's prefetch
 * encodes the first uncached archetype ahead of the neighbours: a suggestion is where a user
 * JUMPS to, and a jump is the navigation neighbour-prefetching never helps with.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireDatasetImage } from "@lazylabel/contracts";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { Timeline, buildRange } from "./harness.jsx";
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
          <Timeline images={FOLDER} client={client} onArchetypes={onArchetypes} />
        </HotkeyProvider>
      </SettingsProvider>
    </NotificationProvider>,
  );
  return { onArchetypes, findArchetypes };
}

const cells = () => screen.getByLabelText("Timeline").querySelectorAll("button");

async function build() {
  buildRange();
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

  /*
   * Legacy's notices (main_window.py:5061-5148, SEQUENCE_PARITY.md SP-50): fewer than it expects
   * -- 2% of the frames, between 5 and 50 -- is "Only N reference frames identified (expected ~E)";
   * as many is "Found N suggested reference frames"; none, "No diverse reference frames found". The
   * web wrote its own sentences about scenes into the panel.
   */
  it("says how many it found, in legacy's words", async () => {
    show(() => found({ suggested: FOLDER.map((each) => each.key), budget: 5, clusters: 5 }));
    await build();

    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));

    expect(await screen.findByText("Found 5 suggested reference frames")).toBeTruthy();
  });

  it("says when it found fewer than legacy expects", async () => {
    show(found);
    await build();

    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));

    expect(await screen.findByText("Only 2 reference frames identified (expected ~5)")).toBeTruthy();
  });

  it("says when there are none", async () => {
    show(() => found({ suggested: [], clusters: 0, noise: 5 }));
    await build();

    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));

    expect(await screen.findByText("No diverse reference frames found")).toBeTruthy();
  });

  it("reports a failure with the service's own words, as legacy's does", async () => {
    show(() => {
      throw new Error("the embedder is not installed");
    });
    await build();

    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));

    expect(await screen.findByText("Reference analysis failed: the embedder is not installed")).toBeTruthy();
  });

  it("asks for at least five frames before it asks the service, as legacy's does", async () => {
    const { findArchetypes } = show(found);
    buildRange(0, 3);
    await waitFor(() => expect(cells()).toHaveLength(4));

    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));

    expect(await screen.findByText("Need at least 5 frames to find archetypes")).toBeTruthy();
    expect(findArchetypes).not.toHaveBeenCalled();
  });

  it("offers no button at all without an inference client", async () => {
    // A button that answers 503 teaches a user the feature is unreliable; no button says plainly
    // that this deployment has no model.
    render(
      <NotificationProvider>
        <NotificationHost />
        <SettingsProvider client={{ getSettings: async () => defaultSettings() } as never}>
          <HotkeyProvider bindings={defaultSettings().hotkeys}>
            <Timeline images={FOLDER} />
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

describe("suggestions over time (SP-30)", () => {
  /*
   * Legacy clears earlier suggestions before a new Find (main_window.py:5066-5067), and H walks
   * the stored list whatever the frames have become since (sequence_view_mode.py:519-537). The web
   * added to earlier suggestions, and H followed the purple colour, so it lost a suggestion a
   * Propagate repainted pending or one that became a reference.
   */
  it("clears the earlier suggestions when Find runs again", async () => {
    let calls = 0;
    show(() => (calls++ === 0 ? found() : found({ suggested: ["frames/f02.png"] })));
    await build();
    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));
    await waitFor(() => expect(cells()[2]!.getAttribute("aria-label")).toContain("suggested"));

    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));

    await waitFor(() => expect(cells()[1]!.getAttribute("aria-label")).toContain("suggested"));
    expect(cells()[2]!.getAttribute("aria-label")).not.toContain("suggested");
    expect(cells()[4]!.getAttribute("aria-label")).not.toContain("suggested");
  });

  it("H reaches a suggestion that has since become a reference", async () => {
    show(found);
    await build();
    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));
    await waitFor(() => expect(cells()[2]!.getAttribute("aria-label")).toContain("suggested"));
    fireEvent.click(cells()[2]!);
    fireEvent.click(screen.getByText("+ Add Current"));
    await waitFor(() => expect(cells()[2]!.getAttribute("aria-label")).toContain("reference"));
    fireEvent.click(cells()[0]!);

    fireEvent.keyDown(document, { key: "H" });

    await waitFor(() => expect(cells()[2]!.className).toContain("timeline__frame--current"));
  });
});

describe("the Review group's suggestions, and Clear Suggested (SP-45)", () => {
  /*
   * Legacy's "Suggested refs: N", with ← Prev Suggested and Next Suggested →, and Clear Suggested
   * beside Find Archetypes, all enabled only when there are suggestions (sequence_widget.py:281-285,
   * 417-439, 601-608; main_window.py:5150-5181). The web had H and Shift+H and nothing on screen.
   */
  const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
  const suggestedCount = () => screen.getByText(/Suggested refs:/).textContent;

  it("counts the suggestions and steps between them", async () => {
    show(found);
    await build();
    expect(suggestedCount()).toBe("Suggested refs: 0");
    expect(button("Next Suggested →").disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));

    await waitFor(() => expect(suggestedCount()).toBe("Suggested refs: 2"));
    fireEvent.click(button("Next Suggested →"));
    await waitFor(() => expect(cells()[2]!.className).toContain("timeline__frame--current"));
    fireEvent.click(button("Next Suggested →"));
    await waitFor(() => expect(cells()[4]!.className).toContain("timeline__frame--current"));
    fireEvent.click(button("← Prev Suggested"));
    await waitFor(() => expect(cells()[2]!.className).toContain("timeline__frame--current"));
  });

  it("clears them: pending again, the count 0, the buttons disabled", async () => {
    const { onArchetypes } = show(found);
    await build();
    expect(button("Clear Suggested").disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));
    await waitFor(() => expect(button("Clear Suggested").disabled).toBe(false));

    fireEvent.click(button("Clear Suggested"));

    await waitFor(() => expect(suggestedCount()).toBe("Suggested refs: 0"));
    expect([...cells()].some((cell) => cell.getAttribute("aria-label")!.includes("suggested"))).toBe(false);
    expect(button("Clear Suggested").disabled).toBe(true);
    expect(button("← Prev Suggested").disabled).toBe(true);
    expect(onArchetypes).toHaveBeenLastCalledWith([]);
  });
});

describe("aborting (SP-29)", () => {
  it("stops on a second press, in legacy's words, and drops the answer when it comes", async () => {
    // Legacy's button reads Abort while it runs, and a press or Ctrl+H cancels with "Reference
    // analysis cancelled" (sequence_widget.py:579-590; main_window.py:5044-5055). The web disabled it.
    let release: (value: unknown) => void = () => undefined;
    const { findArchetypes } = show(() => new Promise((resolve) => {
      release = resolve;
    }));
    await build();
    fireEvent.click(screen.getByRole("button", { name: /Find archetypes/ }));
    await waitFor(() => expect(findArchetypes).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Abort" }));

    expect(await screen.findByText("Reference analysis cancelled")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Find archetypes/ })).toBeTruthy();
    await act(async () => {
      release(found());
    });
    expect([...cells()].some((cell) => cell.getAttribute("aria-label")!.includes("suggested"))).toBe(false);
  });
});
