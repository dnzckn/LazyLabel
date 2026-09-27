/**
 * The drawing surface must be exactly the picture.
 *
 * Every drawing layer — polygon, shape, AI, edit, select — is `position: absolute; inset: 0`
 * inside `.canvas-stack`, and turns a click into an image pixel by scaling its OWN rect against
 * the image's pixel size. So anything that makes that box differ from the image silently misplaces
 * every vertex. It is not a rendering nicety; it is the coordinate system.
 *
 * THREE THINGS HAD MADE IT DIFFER, and all were found by measuring a running app rather than here:
 *
 *   - the canvas's `margin: 0.5rem 0 1rem` made the stack 24px taller than the picture, which on a
 *     32x24 image put the y scale out by a factor of two and shifted every point up by 8px;
 *   - the canvas's 1px border sat inside the scaled box, stretching every coordinate by 34/32;
 *   - the AI tool's messages, paragraphs in the stack's flow under the picture, made it 20px
 *     taller while a prediction waited (2026-09-27).
 *
 * NO UNIT TEST COULD HAVE CAUGHT EITHER, and that is the reason this file is a CSS test rather
 * than a rendering one. jsdom does no layout, so the acceptance harness mocks
 * `getBoundingClientRect` on `Element.prototype` and returns ONE rect for every element — which
 * makes the layer and the canvas identical by construction, exactly the thing that was wrong. The
 * invariant has to be asserted where it lives: in the stylesheet.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const STYLES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "styles.css");

let css = "";
beforeAll(async () => {
  css = await readFile(STYLES, "utf-8");
});

/** The declarations of one rule, by exact selector. */
function ruleFor(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `no \`${selector}\` rule; the drawing surface invariant depends on it`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
}

describe("the drawing surface is the image", () => {
  it("strips the canvas's margin inside a stack", () => {
    // A margin on the canvas grows the shrink-wrapping stack without growing the picture, and the
    // layer covers the difference.
    expect(ruleFor(".canvas-stack .canvas")).toMatch(/margin:\s*0\s*;/);
  });

  it("strips the canvas's border inside a stack", () => {
    // `inset: 0` positions against the container's PADDING box, so a border on the CONTAINER is
    // correctly excluded -- but a border on the canvas is inside the box being scaled.
    expect(ruleFor(".canvas-stack .canvas")).toMatch(/border:\s*none\s*;/);
  });

  it("keeps the stack free of padding, which `inset: 0` would include", () => {
    const stack = ruleFor(".canvas-stack");
    expect(stack).not.toMatch(/(^|[\s;])padding\s*:/);
  });

  it("still gives a canvas OUTSIDE a stack its margin and border", () => {
    // The split view's panes draw an AnnotationCanvas with no layer over it, and stripping the
    // frame from every canvas to fix the stack would have taken it from those too.
    const plain = ruleFor(".canvas");
    expect(plain).toMatch(/margin:/);
    expect(plain).toMatch(/border:/);
  });

  it("keeps the AI tool's messages out of the stack's flow", () => {
    // They are paragraphs rendered inside the stack, under the picture. In its flow they grew it by
    // a line, and every layer with it: the preview sat up to 3% below its object, and a correcting
    // click landed as far off (found 2026-09-27 by measuring the running app).
    const banner = ruleFor(".canvas-stack > .banner");
    expect(banner).toMatch(/position:\s*absolute\s*;/);
    expect(banner).toMatch(/top:\s*100%\s*;/);
  });

  it("leaves every drawing layer at inset 0, which is what makes the box the box", () => {
    for (const layer of [".polygon-layer", ".shape-layer", ".ai-layer", ".edit-layer", ".select-layer"]) {
      if (!css.includes(`\n${layer} {`)) continue;
      expect(ruleFor(layer), `${layer} is no longer inset: 0`).toMatch(/inset:\s*0\s*;/);
    }
  });
});
