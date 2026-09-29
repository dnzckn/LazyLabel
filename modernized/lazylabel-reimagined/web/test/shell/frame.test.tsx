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
