/**
 * No paragraph of explanation in the panels, whatever state they are in.
 *
 * The owner asked on 2026-09-26 for legacy's panels: short labels, legacy's button texts, and
 * explanation in tooltips ("have you ever seen a gui with a paragraph there written to it"). This
 * drives the real shell into every state that used to add a paragraph -- every section open in both
 * of the left column's tabs, a crop in force, a negative brightness, Auto-Convert on, no models --
 * and reads every run of text in the two side columns, the strip under the image and the status
 * bar. Each of them failed it before the sweep: the Image Adjustments, Border Crop, fragment filter
 * and AI → Polygon sections, the Mode Controls card and the model picker all printed one.
 *
 * The Sequence tab is not read here yet: its panel is being rebuilt, and the lead will add it.
 */

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openImage } from "../acceptance/harness.jsx";
import { LIMIT, longTexts } from "../terse.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Open every collapsed section on screen, so what a closed one would say is read too. */
function openEverySection(): void {
  for (const toggle of document.querySelectorAll<HTMLButtonElement>(".panel__toggle[aria-expanded='false']")) {
    fireEvent.click(toggle);
  }
}

/** Where a user reads the app's words: both side columns, the strip under the image, the status bar. */
function everywhereRead(): Element[] {
  return [
    screen.getByRole("complementary", { name: "Tools" }),
    screen.getByRole("complementary", { name: "Dataset" }),
    document.querySelector(".open-image__info")!,
    screen.getByLabelText("Status"),
  ];
}

describe("the panels, as legacy's are", () => {
  it(`hold no run of text over ${LIMIT} characters, in any section or state`, async () => {
    await openImage();

    // Every section of both tabs, as they open.
    fireEvent.click(screen.getByRole("tab", { name: "Global" }));
    openEverySection();
    fireEvent.click(screen.getByRole("tab", { name: "Image" }));
    openEverySection();
    await screen.findByLabelText("Brightness");
    for (const region of everywhereRead()) expect(longTexts(region)).toEqual([]);

    // Then the states that added a paragraph: Auto-Convert on in the Global tab; a crop in force
    // and a negative brightness in the Image tab, each of which added warnings until 2026-09-26.
    fireEvent.click(screen.getByRole("tab", { name: "Global" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Auto-Convert: / }));
    await screen.findByText("Polygon Resolution:");
    fireEvent.click(screen.getByRole("tab", { name: "Image" }));
    fireEvent.change(screen.getByLabelText("X range"), { target: { value: "0:100" } });
    fireEvent.change(screen.getByLabelText("Y range"), { target: { value: "0:50" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("Crop: 0:100, 0:50");
    fireEvent.change(screen.getByLabelText("Brightness"), { target: { value: "-40" } });
    await waitFor(() => expect((screen.getByLabelText("Brightness") as HTMLInputElement).value).toBe("-40"));

    for (const region of everywhereRead()) expect(longTexts(region)).toEqual([]);
  });

  it("still reads a long run as one, so the check itself cannot pass by splitting it", () => {
    // A paragraph built from several JSX expressions is several text nodes, and read one by one
    // each could be short. The check reads a <p> whole.
    const root = document.createElement("div");
    const paragraph = document.createElement("p");
    for (const piece of ["These change what is DISPLAYED, ", "and never the file. ", "Whether they reach the AI is a setting."]) {
      paragraph.append(document.createTextNode(piece));
    }
    root.append(paragraph);

    expect(longTexts(root)).toHaveLength(1);
  });
});
