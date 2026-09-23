/**
 * Erasing — RULE-009, and the only P0 rule among the drawing tools.
 *
 * An erase removes the erase shape's pixels from every annotation it overlaps, splits what is left
 * into 8-connected pieces, and keeps only the pieces LARGER than 10 pixels. Each survivor becomes
 * a new mask segment of the same class, appended at the end of the list; the original is removed.
 *
 * THREE CONSEQUENCES THAT LOOK LIKE BUGS AND ARE THE RULE.
 *
 *   1. An erased polygon or circle STOPS BEING EDITABLE. Its remainder is a mask, so the vertices
 *      are gone and there is nothing left to drag. A user who erases a corner off a polygon cannot
 *      then adjust its points.
 *   2. THE ORDER CHANGES. Survivors are appended, so an erased annotation moves to the end of the
 *      list. Selection is by position, so a selection made before an erase means something else
 *      after it.
 *   3. A REMAINDER MADE ENTIRELY OF SLIVERS DISAPPEARS. If every piece is 10 pixels or fewer, the
 *      original is still removed and nothing replaces it. That is real data loss with a
 *      ten-pixel threshold behind it, and it is legacy's behaviour, so `removed` reports it
 *      rather than leaving the caller to notice a count went down.
 */

import { encodeMask, maskRegion, type WireSegment } from "@lazylabel/contracts";
import { rasterizeSegment, type BinaryMask } from "@lazylabel/annotation-formats";

/** `_split_mask_into_components`' threshold: strictly MORE than ten pixels survives. */
export const MINIMUM_PIECE_PIXELS = 10;

export interface EraseResult {
  readonly segments: readonly WireSegment[];
  /** Indices in the ORIGINAL list that the erase touched. */
  readonly erased: readonly number[];
  /** Original indices whose remainder was entirely slivers, so nothing replaced them. */
  readonly vanished: readonly number[];
}

/**
 * Apply an erase mask to every overlapping annotation.
 *
 * `eraseMask` is a full-image binary mask — the rasterized erase shape. Segments are rasterized
 * the same way they are for export (`rasterizeSegment`), so what the eraser cuts is exactly what
 * would have been saved.
 */
export function erase(
  segments: readonly WireSegment[],
  eraseMask: BinaryMask,
  image: { readonly width: number; readonly height: number },
): EraseResult {
  const kept: WireSegment[] = [];
  const appended: WireSegment[] = [];
  const erased: number[] = [];
  const vanished: number[] = [];

  segments.forEach((segment, index) => {
    const mask = maskOf(segment, image);
    if (mask === null) {
      kept.push(segment);
      return;
    }

    let overlaps = false;
    const remainder = new Uint8Array(mask.data.length);
    for (let i = 0; i < mask.data.length; i += 1) {
      const set = mask.data[i] !== 0;
      if (!set) continue;
      if (eraseMask.data[i] !== 0) overlaps = true;
      else remainder[i] = 1;
    }

    if (!overlaps) {
      kept.push(segment);
      return;
    }

    erased.push(index);

    const pieces = components(remainder, mask.width, mask.height);
    const survivors = pieces.filter((piece) => piece.pixels > MINIMUM_PIECE_PIXELS);

    if (survivors.length === 0) {
      // Either every pixel was erased, or everything left is a sliver. Both remove the annotation.
      vanished.push(index);
      return;
    }

    for (const piece of survivors) {
      appended.push({
        // The remainder is a mask, so the type changes and the vertices are gone. This is where a
        // polygon stops being editable.
        type: "AI",
        classId: segment.classId,
        mask: encodeMask({ height: mask.height, width: mask.width, data: piece.data }),
      });
    }
  });

  return { segments: [...kept, ...appended], erased, vanished };
}

/** The pixels an annotation covers, rasterized the way export rasterizes it. */
function maskOf(
  segment: WireSegment,
  image: { readonly width: number; readonly height: number },
): BinaryMask | null {
  if (segment.type === "Polygon" || segment.type === "Circle") {
    if (segment.vertices === undefined) return null;
    return rasterizeSegment(
      { type: segment.type, classId: segment.classId, vertices: segment.vertices },
      image.height,
      image.width,
    );
  }

  const wire = segment.mask;
  if (wire?.box == null) return null;

  // Expanded from its bounded region, because the erase mask is full-image and the two have to be
  // indexed together.
  const [x0, y0, x1, y1] = wire.box;
  const regionWidth = x1 - x0;
  const data = new Uint8Array(image.width * image.height);
  let region: Uint8Array;
  try {
    region = maskRegion(wire);
  } catch {
    return null;
  }
  if (region.length !== regionWidth * (y1 - y0)) return null;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (region[(y - y0) * regionWidth + (x - x0)] !== 0) data[y * image.width + x] = 1;
    }
  }
  return { height: image.height, width: image.width, data };
}

interface Piece {
  readonly data: Uint8Array;
  readonly pixels: number;
}

/**
 * 8-connected components, labelled in raster-scan order of first appearance.
 *
 * The ORDER matters, not just the grouping: survivors are appended in label order, so a different
 * labelling would put the same pieces in a different place in the segment list — and selection is
 * by position. `cv2.connectedComponents` numbers labels by first encounter scanning top to bottom,
 * left to right, which is what this reproduces.
 *
 * Iterative rather than recursive: a component can be millions of pixels, and a recursive flood
 * fill would exhaust the stack on exactly the large masks this feature is for.
 */
function components(data: Uint8Array, width: number, height: number): readonly Piece[] {
  const labels = new Int32Array(data.length);
  const pieces: Piece[] = [];
  const stack: number[] = [];

  for (let start = 0; start < data.length; start += 1) {
    if (data[start] === 0 || labels[start] !== 0) continue;

    const label = pieces.length + 1;
    const piece = new Uint8Array(data.length);
    let pixels = 0;

    labels[start] = label;
    stack.push(start);

    while (stack.length > 0) {
      const at = stack.pop()!;
      piece[at] = 1;
      pixels += 1;

      const x = at % width;
      const y = (at - x) / width;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbour = ny * width + nx;
          if (data[neighbour] === 0 || labels[neighbour] !== 0) continue;
          labels[neighbour] = label;
          stack.push(neighbour);
        }
      }
    }

    pieces.push({ data: piece, pixels });
  }

  return pieces;
}
