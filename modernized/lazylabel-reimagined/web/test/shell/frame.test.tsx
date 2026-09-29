/**
 * The window's frame, as the stylesheet draws it: what the owner found wrong on 2026-09-29.
 *
 * - "i'm able to scroll the whole app going off into gray space on the browser". The visually
 *   hidden labels are positioned absolutely, and with no positioned ancestor they were placed
 *   against the page itself, at their place in a pane's content, where no pane clipped them: with
 *   86 images listed, the segment table's hidden "Selected" sat 1,500 pixels below the window and
 *   the page grew to hold it (measured in headless Chromium: 2,463 pixels of page in a 900-pixel
 *   window).
 * - "double clicking on the image ... makes me select the under the image text". Legacy's window
 *   selects no label's text; only a field's.
 * - The right-hand column as legacy's splitter: the stylesheet's half of `Splitter.tsx`.
 *
 * jsdom lays nothing out, so these read the stylesheet: loaded into the document where jsdom can
 * say which element positions which, and read as text for the rules themselves.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { Workspace } from "../../src/shell/Panel.jsx";

const STYLES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "styles.css");

let css = "";
// Removed again afterwards: other files may share this document.
let sheet: HTMLStyleElement | null = null;
beforeAll(async () => {
  // As one line ending, whichever the checkout gave the file.
  css = (await readFile(STYLES, "utf-8")).replace(/\r\n/g, "\n");
  sheet = document.createElement("style");
  sheet.textContent = css;
  document.head.appendChild(sheet);
});
afterAll(() => sheet?.remove());
afterEach(cleanup);

/** The declarations of one top-level rule, by exact selector. */
function ruleFor(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `no \`${selector}\` rule`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
}

/** Every style rule in the sheet, those inside media queries too. */
function styleRules(): CSSStyleRule[] {
  const found: CSSStyleRule[] = [];
  const walk = (rules: CSSRuleList): void => {
    for (const rule of rules) {
      if ("cssRules" in rule && !("selectorText" in rule)) walk((rule as CSSMediaRule).cssRules);
      else if ("selectorText" in rule) found.push(rule as CSSStyleRule);
    }
  };
  walk(sheet!.sheet!.cssRules);
  return found;
}

/**
 * The element an absolutely positioned box is placed against: its nearest positioned ancestor.
 * jsdom reports a position no rule sets as "", not "static".
 */
function containingBlock(element: Element): Element | null {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const { position } = getComputedStyle(node);
    if (position !== "" && position !== "static") return node;
  }
  return null;
}

describe("the page never scrolls", () => {
  it("places what is absolutely positioned in a pane against that pane, which clips it", () => {
    render(
      <Workspace
        left={<p><span className="visually-hidden">left</span></p>}
        centre={<p><span className="visually-hidden">centre</span></p>}
        right={
          <table>
            <thead>
              <tr>
                <th><span className="visually-hidden">Selected</span></th>
              </tr>
            </thead>
          </table>
        }
      />,
    );

    for (const [name, pane] of [["left", "Tools"], ["centre", "Image"], ["Selected", "Dataset"]] as const) {
      const hidden = [...document.querySelectorAll(".visually-hidden")].find((span) => span.textContent === name)!;
      expect(getComputedStyle(hidden).position).toBe("absolute");
      expect(containingBlock(hidden)?.getAttribute("aria-label")).toBe(pane);
    }
    expect(ruleFor(".workspace > *")).toMatch(/overflow:\s*auto;/);
  });

  it("clips the frame itself, positioned, to the window", () => {
    const app = ruleFor(".app");
    expect(app).toMatch(/position:\s*relative;/);
    expect(app).toMatch(/height:\s*100vh;/);
    expect(app).toMatch(/overflow:\s*hidden;/);
  });
});

describe("no text is selected outside a field", () => {
  it("says so once, on the body, and gives fields their text back", () => {
    const setting = styleRules().filter(
      (rule) => rule.style.getPropertyValue("user-select") !== "" || rule.style.getPropertyValue("-webkit-user-select") !== "",
    );

    expect(
      setting.map((rule) => [rule.selectorText.replace(/\s+/g, " "), rule.style.getPropertyValue("user-select")]),
    ).toEqual([
      ["body", "none"],
      ['input, textarea, [contenteditable]:not([contenteditable="false"])', "text"],
    ]);
    for (const rule of setting) {
      expect(rule.style.getPropertyValue("-webkit-user-select")).toBe(rule.style.getPropertyValue("user-select"));
    }
  });
});

describe("the right-hand column's splitter", () => {
  it("fills the pane, which no longer scrolls at a size the sections fit in", () => {
    expect(ruleFor(".workspace__right")).toMatch(/display:\s*flex;[\s\S]*flex-direction:\s*column;/);
    const splitter = ruleFor(".splitter");
    expect(splitter).toMatch(/flex:\s*1;/);
    expect(splitter).toMatch(/min-height:\s*0;/);
  });

  it("gives each section its share as its flex-grow factor, down to its minimum", () => {
    const section = ruleFor(".splitter__section");
    expect(section).toMatch(/flex:\s*var\(--share\)\s+1\s+0px;/);
    expect(section).toMatch(/min-height:\s*var\(--min\);/);
  });

  it("draws a closed section at its header's height, giving up its share", () => {
    const closed = ruleFor(".splitter__section--collapsed");
    expect(closed).toMatch(/flex:\s*none;/);
    expect(closed).toMatch(/min-height:\s*0;/);
    // After the section's own rule, so it wins.
    expect(css.indexOf("\n.splitter__section--collapsed {")).toBeGreaterThan(css.indexOf("\n.splitter__section {"));
  });

  it("scrolls each list inside its section, with the header and the totals held in view", () => {
    const lists = ruleFor(".dataset__scroll,\n.segments__scroll,\n.classes__scroll");
    expect(lists).toMatch(/flex:\s*1 1 0px;/);
    expect(lists).toMatch(/overflow:\s*auto;/);
    expect(ruleFor(".dataset__scroll thead th,\n.segments__scroll thead th,\n.classes__scroll thead th")).toMatch(
      /position:\s*sticky;[\s\S]*top:\s*0;/,
    );
    expect(ruleFor(".dataset__scroll tfoot th,\n.dataset__scroll tfoot td")).toMatch(/position:\s*sticky;[\s\S]*bottom:\s*0;/);
  });

  it("draws the divider as legacy's handle: 9 pixels, a bar 3 in from each side, the accent under the pointer", () => {
    expect(ruleFor(".splitter__handle")).toMatch(/height:\s*9px;[\s\S]*cursor:\s*row-resize;/);
    const bar = ruleFor(".splitter__handle::before");
    expect(bar).toMatch(/inset:\s*1px 3px;/);
    expect(bar).toMatch(/background:\s*var\(--rule\);/);
    expect(css).toMatch(/\.splitter__handle--dragging::before \{\s*background:\s*var\(--accent\);/);
  });

  it("goes back to one page-long column on a narrow screen, with nothing to divide", () => {
    const narrow = css.slice(css.indexOf("@media (max-width: 60rem)"));
    expect(narrow).toMatch(/\.splitter__handle \{\s*display:\s*none;/);
    expect(narrow).toMatch(/\.splitter,\n\s*\.splitter__section,[\s\S]*?display:\s*block;/);
  });
});
