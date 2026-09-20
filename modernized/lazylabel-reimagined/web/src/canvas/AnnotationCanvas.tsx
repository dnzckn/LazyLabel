/**
 * Drawing an image with its annotations over it.
 *
 * C2's browser share: Phase 1 reads the files, Phase 4 shows what they contain. There are no tools
 * here — clicking, drawing and editing are Phase 5 — so this is read-only on purpose rather than a
 * half-built editor.
 *
 * MASKS ARRIVE BOUNDED, a box plus the bytes inside it, and they are drawn that way: one
 * `ImageData` the size of the box, not one the size of the image. On a 50-megapixel image with 500
 * objects the difference is 25 GB against a few megabytes, which is the whole reason the wire
 * format is bounded in the first place. Undoing that here would put the cost straight back.
 *
 * Colours come from RULE-034, so a dataset looks the way the user's desktop app drew it.
 */

import { useEffect, useRef, type ReactNode } from "react";

import { base64ToBytes, type WireSegment } from "@lazylabel/contracts";

import { NEUTRAL, adjustImage, isNeutral, type Adjustments } from "../tools/adjustments.js";
import { classColor } from "./classColor.js";

export interface AnnotationCanvasProps {
  readonly imageUrl: string;
  readonly width: number;
  readonly height: number;
  readonly segments: readonly WireSegment[];
  /** 0 hides the overlay, 1 hides the image. Legacy's default is a half-transparent overlay. */
  readonly opacity?: number;
  /**
   * RULE-028's display adjustments, applied to the IMAGE only.
   *
   * The annotations are drawn afterwards and are never adjusted: their colours come from RULE-034
   * and are how a user identifies a class. Darkening the image and darkening the overlay with it
   * would make two classes converge on the same colour, which is the one thing the palette exists
   * to prevent.
   */
  readonly adjustments?: Adjustments;
  readonly onError?: (reason: string) => void;
}

export function AnnotationCanvas({
  imageUrl,
  width,
  height,
  segments,
  opacity = 0.5,
  adjustments = NEUTRAL,
  onError,
}: AnnotationCanvasProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    // Three ways this fails, and only one of them is the documented one. The spec says null; jsdom
    // returns UNDEFINED after logging "not implemented"; a browser with canvas disabled by policy
    // throws. `=== null` catches one of the three, and the other two turn into a TypeError inside
    // the load handler -- which is to say, a blank view and a stack trace rather than a fallback.
    let context: CanvasRenderingContext2D | null | undefined;
    try {
      context = canvas.getContext("2d");
    } catch {
      context = null;
    }
    if (!context) {
      onError?.("this browser did not provide a 2D canvas");
      return;
    }
    const drawingContext = context;

    let cancelled = false;
    const image = new Image();

    image.onload = () => {
      if (cancelled) return;
      drawingContext.clearRect(0, 0, width, height);
      drawingContext.drawImage(image, 0, 0, width, height);
      // Between the image and the overlay, so the adjustments reach the pixels a user is judging
      // and not the class colours they are navigating by.
      applyAdjustments(drawingContext, width, height, adjustments, onError);
      for (const segment of segments) drawSegment(drawingContext, segment, opacity);
    };
    image.onerror = () => {
      if (cancelled) return;
      // The annotations are still worth showing, so the masks are drawn on an empty canvas rather
      // than the whole view failing because one request did.
      drawingContext.clearRect(0, 0, width, height);
      for (const segment of segments) drawSegment(drawingContext, segment, opacity);
      onError?.("the image could not be loaded, so only the annotations are shown");
    };
    image.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl, width, height, segments, opacity, adjustments, onError]);

  return (
    <canvas
      ref={canvasRef}
      className="canvas"
      width={width}
      height={height}
      role="img"
      aria-label={`${segments.length} annotations`}
    />
  );
}

/**
 * Adjust what has been drawn so far, in place.
 *
 * Skipped entirely when the adjustments are neutral, which is the common case: reading a whole
 * image back out of the canvas and writing it again costs four bytes a pixel each way, and doing
 * it on every redraw to change nothing would be felt on a large image.
 *
 * `getImageData` throws on a TAINTED canvas — an image served cross-origin without CORS headers.
 * The app's images come from its own API so this should not happen, but a misconfigured deployment
 * would otherwise blank the whole view. Caught, reported, and the unadjusted image is left: seeing
 * the image without the adjustment is far better than seeing neither.
 *
 * Exported for the same reason `segmentPixels` is: jsdom has no real canvas, so the only way to
 * hold this behaviour in a test is to hand it a context of our own.
 */
export function applyAdjustments(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  adjustments: Adjustments,
  onError?: (reason: string) => void,
): void {
  if (isNeutral(adjustments) || width <= 0 || height <= 0) return;

  try {
    const frame = context.getImageData(0, 0, width, height);
    adjustImage(frame.data, adjustments);
    context.putImageData(frame, 0, 0);
  } catch (cause: unknown) {
    onError?.(
      "the image adjustments could not be applied, so the image is shown unadjusted "
        + `(${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }
}

/**
 * The RGBA pixels for one segment's mask, sized to its bounding box.
 *
 * Pure, and separated from the drawing on purpose: jsdom has no real canvas, so this is the part a
 * test can hold, and the component below is left with nothing but the painting.
 *
 * Returns null when there is nothing to draw — an empty mask, a box with no area, or bytes that do
 * not match the box. A mask that will not decode is skipped rather than allowed to blank the view.
 */
export function segmentPixels(
  segment: WireSegment,
  opacity: number,
): { width: number; height: number; x: number; y: number; data: Uint8ClampedArray } | null {
  const mask = segment.mask;
  if (mask?.box == null) return null;

  const [x0, y0, x1, y1] = mask.box;
  const width = x1 - x0;
  const height = y1 - y0;
  if (width <= 0 || height <= 0) return null;

  let region: Uint8Array;
  try {
    region = base64ToBytes(mask.data);
  } catch {
    return null;
  }
  if (region.length !== width * height) return null;

  const { r, g, b } = classColor(segment.classId);
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255);

  // One buffer the size of the BOX. An image-sized one is what the bounded wire format exists to
  // avoid: 500 objects on a 50-megapixel image would be 25 GB of mostly-zero RGBA.
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < region.length; i += 1) {
    if (region[i] === 0) continue;
    const at = i * 4;
    data[at] = r;
    data[at + 1] = g;
    data[at + 2] = b;
    data[at + 3] = alpha;
  }

  return { width, height, x: x0, y: y0, data };
}

/** Paint one segment's mask in its class colour. */
function drawSegment(
  context: CanvasRenderingContext2D,
  segment: WireSegment,
  opacity: number,
): void {
  const painted = segmentPixels(segment, opacity);
  if (painted === null) return;

  const pixels = context.createImageData(painted.width, painted.height);
  pixels.data.set(painted.data);

  // putImageData ignores globalAlpha and overwrites rather than blending, so the overlay is
  // composited through a scratch canvas instead. Painting it directly would erase the photo
  // wherever a mask is transparent.
  const scratch = document.createElement("canvas");
  scratch.width = painted.width;
  scratch.height = painted.height;
  const scratchContext = scratch.getContext("2d");
  if (scratchContext === null) return;

  scratchContext.putImageData(pixels, 0, 0);
  context.drawImage(scratch, painted.x, painted.y);
}
