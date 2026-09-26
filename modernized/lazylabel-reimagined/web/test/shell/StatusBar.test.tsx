/**
 * The status bar, and the line it draws against the notification system.
 *
 * Legacy's status bar is both the state display and the place transient messages go, on 3-, 5- and
 * 8-second timers. The split is the design here, so the tests check both halves of it: that state
 * is shown and never expires, and that the things which used to be status-bar messages are not.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StatusBar, describeAi, type Health } from "../../src/shell/StatusBar.jsx";
import type { ImageState } from "../../src/workspace/saveState.js";

afterEach(cleanup);

function health(overrides: Partial<Health> = {}): Health {
  return {
    dataset: "ok",
    database: "ok",
    ai: { available: true, reason: null, videoCapable: true, accelerator: "NVIDIA RTX 4090" },
    ...overrides,
  };
}

function image(overrides: Partial<ImageState> = {}): ImageState {
  return { key: "img_005.png", provenance: "loaded", dirty: false, segmentCount: 4, ...overrides };
}

function bar(props: Partial<StatusBarProps> = {}) {
  // `??` would be wrong here: null is a MEANINGFUL value for both of these (nothing open, health
  // not yet known), and `??` would quietly replace an explicit null with the default.
  render(
    <StatusBar
      image={props.image === undefined ? null : props.image}
      health={props.health === undefined ? health() : props.health}
      healthError={props.healthError ?? null}
    />,
  );
}

type StatusBarProps = Parameters<typeof StatusBar>[0];

function text(): string {
  return screen.getByLabelText("Status").textContent ?? "";
}

describe("what is open", () => {
  it("says when nothing is", () => {
    bar();
    expect(text()).toContain("No image open");
  });

  it("names the image and whether it is saved", () => {
    bar({ image: image() });
    expect(text()).toContain("img_005.png — 4 segments, saved.");
  });

  it("says unsaved when it is", () => {
    bar({ image: image({ dirty: true }) });
    expect(text()).toContain("4 segments, unsaved.");
  });

  it("says zero out loud", () => {
    // Exactly the state a user needs to see before a save writes empty files over an image that
    // had annotations. Smoothing it to "no segments" makes the dangerous case read as the boring one.
    bar({ image: image({ dirty: true, segmentCount: 0 }) });
    expect(text()).toContain("0 segments, unsaved.");
  });

  it("reads correctly for one segment", () => {
    bar({ image: image({ segmentCount: 1 }) });
    expect(text()).toContain("1 segment, saved.");
  });

  it("says an image could not be read instead of reporting it as empty", () => {
    bar({ image: image({ provenance: "failed", segmentCount: 0 }) });
    expect(text()).toContain("could not be read");
    expect(text()).not.toContain("0 segments");
  });
});

describe("the server", () => {
  it("says so while it is still finding out", () => {
    bar({ health: null });
    expect(text()).toContain("Checking the server");
  });

  it("stops saying it is checking once the check has failed", () => {
    // Found by looking at the running app rather than by a test: with only `health: null` to go
    // on, a failed check is indistinguishable from one still in flight, and the bar reads
    // "Checking the server…" forever -- a claim that gets more wrong the longer it is shown.
    bar({ health: null, healthError: "the API answered 500" });

    expect(text()).toContain("Server unreachable");
    expect(text()).not.toContain("Checking the server");
  });

  it("names the device the model runs on, in legacy's words", () => {
    // Legacy asks the machine the window is on. Here the model is on a server the user cannot see,
    // which is why "why is every click slow" is otherwise unanswerable to them.
    // status_bar.py:241.
    bar();
    expect(text()).toContain("GPU: NVIDIA RTX 4090");
  });

  it("stays quiet about the things that are fine", () => {
    // A bar that always reads "dataset: ok" trains the eye to skip the place "unreadable" appears.
    bar();
    expect(text()).not.toContain("Dataset folder");
    expect(text()).not.toContain("Settings");
  });

  it("says when the dataset folder cannot be read", () => {
    bar({ health: health({ dataset: "unreadable" }) });
    expect(text()).toContain("Dataset folder unreadable");
  });

  it("says when settings are unavailable, without implying annotation work stopped", () => {
    bar({ health: health({ database: "unavailable" }) });
    expect(text()).toContain("Settings not saved this session");
  });
});

describe("what the AI line says", () => {
  // Legacy's three labels (status_bar.py:234-254), with what they leave out in the tooltip.
  it("says No AI when the tools are off, with the reason in its tooltip", () => {
    // "No AI" tells a user to give up; "PyTorch is not installed" tells them what to do.
    expect(
      describeAi({
        available: false,
        reason: "PyTorch is not installed. Install the AI extra: pip install lazylabel-inference[ai]",
        videoCapable: false,
        accelerator: "unknown",
      }),
    ).toEqual({
      label: "No AI",
      title: "PyTorch is not installed. Install the AI extra: pip install lazylabel-inference[ai]",
    });
  });

  it("puts the reason on the bar's tooltip, not in the bar", () => {
    bar({
      health: health({
        ai: { available: false, reason: "PyTorch is not installed", videoCapable: false, accelerator: "unknown" },
      }),
    });
    expect(text()).toContain("No AI");
    expect(text()).not.toContain("PyTorch");
    expect(screen.getByText("No AI").title).toBe("PyTorch is not installed");
  });

  it("falls back to a plain statement when no reason came back", () => {
    expect(
      describeAi({ available: false, reason: null, videoCapable: false, accelerator: "unknown" }).title,
    ).toBe("AI tools unavailable");
  });

  it("says CPU Only on a CPU, and that propagation is missing rather than promising it", () => {
    // A deployment with SAM 1 checkpoints only is a working install with no propagation. A device
    // label on its own would promise a feature that is never going to appear.
    expect(
      describeAi({ available: true, reason: null, videoCapable: false, accelerator: "CPU" }),
    ).toEqual({ label: "CPU Only", title: "Propagation unavailable" });
  });

  it("says the device is unknown rather than guessing", () => {
    expect(
      describeAi({ available: true, reason: null, videoCapable: true, accelerator: "unknown" }),
    ).toEqual({ label: "Device unknown" });
  });

  it("does not say GPU twice for a device that gave no name", () => {
    expect(describeAi({ available: true, reason: null, videoCapable: true, accelerator: "GPU" })).toEqual({
      label: "GPU",
    });
  });
});
