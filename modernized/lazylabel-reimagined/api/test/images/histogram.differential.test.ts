/**
 * The histogram route gives the Rescale dialog what legacy's is given, level for level.
 *
 * Legacy's Hist button builds its dialog on the rescale widget's image — the file read at its own
 * depth, reduced to its first channel when RULE-024 calls it gray, cut to the crop when there is one
 * (`main_window.py:2786-2804`; `rescale_widget.py:420-430`). Everything the dialog shows and
 * computes is a function of how many pixels sit at each level of that region, so the route sends
 * exactly that, and `legacy-rescale-presets.json` holds legacy's region for each case, counted.
 *
 * With `clahe`, the counts are of what legacy's own `_build_clahe_lut_image` makes of the region:
 * the dialog's orange preview (`rescale_histogram_dialog.py:547-564`), 16-bit included.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp, type App } from "../../src/app.js";
import { MemoryBlobStore } from "../../src/adapters/memoryBlobStore.js";
import { SqliteMetadataStore } from "../../src/adapters/sqliteMetadataStore.js";
import { jsonBody, request } from "../helpers/request.js";

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "goldens",
  "legacy-rescale-presets.json",
);

interface HistogramCase {
  readonly image: string;
  readonly crop: readonly number[] | null;
  readonly clahe: readonly [number, number] | null;
  readonly depth: 8 | 16;
  readonly pixels: number;
  readonly min: number;
  readonly max: number;
  readonly levels: readonly (readonly [number, number])[];
}

const golden = JSON.parse(await readFile(FIXTURE, "utf8")) as {
  readonly images: Readonly<Record<string, string>>;
  readonly histograms: readonly HistogramCase[];
};

describe("the histogram route", () => {
  let app: App;
  let metadata: SqliteMetadataStore;

  beforeEach(async () => {
    const store = new MemoryBlobStore();
    metadata = new SqliteMetadataStore(":memory:");
    app = createApp({ blobStore: store, metadataStore: metadata });
    for (const [name, png] of Object.entries(golden.images)) {
      await store.writeAtomic(`frames/${name}.png`, new Uint8Array(Buffer.from(png, "base64")));
    }
  });

  afterEach(() => metadata.close());

  /** A GET of the route, the query given as the browser writes it. */
  const ask = (image: string, query: string) =>
    app.handle(
      request("GET", `/projects/p1/images/frames/${image}.png/histogram`, {
        query: Object.fromEntries(new URLSearchParams(query)),
      }),
    );

  it("the golden file covers 8- and 16-bit, a near-gray colour file, crops and CLAHE", () => {
    expect(new Set(golden.histograms.map((h) => h.depth))).toEqual(new Set([8, 16]));
    expect(golden.histograms.some((h) => h.image === "neargray8")).toBe(true);
    expect(golden.histograms.some((h) => h.crop !== null && h.clahe !== null)).toBe(true);
    expect(golden.histograms.some((h) => h.depth === 16 && h.clahe !== null)).toBe(true);
  });

  for (const expected of golden.histograms) {
    const query = [
      expected.crop === null ? null : `crop=${expected.crop.join(",")}`,
      expected.clahe === null ? null : `clahe=${expected.clahe[0]}:${expected.clahe[1]}`,
    ]
      .filter((part) => part !== null)
      .join("&");

    it(`${expected.image}${query === "" ? "" : ` with ${query}`}: legacy's region, counted`, async () => {
      const response = await ask(expected.image, query);

      expect(response.status).toBe(200);
      const body = jsonBody(response);
      expect({ depth: body.depth, pixels: body.pixels, min: body.min, max: body.max }).toEqual({
        depth: expected.depth,
        pixels: expected.pixels,
        min: expected.min,
        max: expected.max,
      });
      expect(body.levels).toEqual(expected.levels);
    });
  }

  it("refuses a colour image with legacy's notice", async () => {
    // The Hist button is disabled for colour; the handler behind it says this (main_window.py:2789-2792).
    const response = await ask("rgb8", "");

    expect(response.status).toBe(409);
    expect(jsonBody(response).message).toBe("No grayscale image loaded for histogram");
  });

  it("refuses a CLAHE request outside the dialog's ranges rather than clamping it", async () => {
    // Clip 0.5 to 40, Tile 2 to 32 (rescale_histogram_dialog.py:428-444).
    expect((await ask("gray8", "clahe=0.1:8")).status).toBe(400);
    expect((await ask("gray8", "clahe=2:33")).status).toBe(400);
    expect((await ask("gray8", "clahe=2")).status).toBe(400);
  });
});
