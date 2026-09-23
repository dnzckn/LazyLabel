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
 * THE IMAGE ARRIVES IN TILES when `tileUrl` is given (C8): first the coarsest level, one tile
 * holding the whole picture, then the level matching how large it is drawn, and only the tiles in
 * view. A 50-megapixel TIFF was a 41 MB PNG and a half-second stall before this; fitted to a pane
 * it is now a few hundred kilobytes. The canvas stays the size of the image in pixels, so every
 * drawing layer measures it exactly as before -- only how the pixels get onto it has changed.
 *
 * Colours come from RULE-034, so a dataset looks the way the user's desktop app drew it.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { maskRegion, type WireSegment } from "@lazylabel/contracts";

import { NEUTRAL, adjustImage, isNeutral, type Adjustments } from "../tools/adjustments.js";
import { classColor } from "./classColor.js";
import { tileId, tileRect, tilesInView, topLevel, visibleRegion, type ScreenRect, type TileKey } from "./tiles.js";

export interface AnnotationCanvasProps {
  readonly imageUrl: string;
  readonly width: number;
  readonly height: number;
  readonly segments: readonly WireSegment[];
  /** CSS pixels per image pixel, or null/absent to fit the pane. */
  readonly zoom?: number | null;
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
  /**
   * Where one tile of the image is (C8). Given, the image arrives a tile at a time; absent, whole
   * from `imageUrl`, which is also what a failed tile falls back to.
   */
  readonly tileUrl?: (z: number, x: number, y: number) => string;
  /** The scrolling box the canvas sits in, so only the tiles in view are fetched. */
  readonly pane?: RefObject<HTMLElement | null>;
}

interface Loaded {
  readonly key: TileKey;
  readonly image: HTMLImageElement;
}

/** The 2D context, or null with the reason reported -- in all three of the ways it can be missing. */
function contextOf(
  canvas: HTMLCanvasElement,
  onError?: (reason: string) => void,
): CanvasRenderingContext2D | null {
  // The spec says null; jsdom returns UNDEFINED after logging "not implemented"; a browser with
  // canvas disabled by policy throws. `=== null` catches one of the three, and the other two turn
  // into a TypeError inside the load handler -- a blank view and a stack trace, not a fallback.
  let context: CanvasRenderingContext2D | null | undefined;
  try {
    context = canvas.getContext("2d");
  } catch {
    context = null;
  }
  if (!context) {
    onError?.("this browser did not provide a 2D canvas");
    return null;
  }
  return context;
}

function viewport(): ScreenRect {
  return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };
}

/** Whether a segment's mask box reaches into a region; a segment with no box cannot. */
function reaches(segment: WireSegment, x: number, y: number, width: number, height: number): boolean {
  const box = segment.mask?.box;
  if (box == null) return false;
  return box[0] < x + width && box[2] > x && box[1] < y + height && box[3] > y;
}

export function AnnotationCanvas({
  imageUrl,
  width,
  height,
  segments,
  zoom,
  opacity = 0.5,
  adjustments = NEUTRAL,
  onError,
  tileUrl,
  pane,
}: AnnotationCanvasProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /*
   * THE TILE STATE. Refs rather than state because tiles arrive between renders and are drawn
   * straight onto the canvas; putting them in state would re-render the whole view per tile.
   *
   * `identity` is tile 0/0/0's URL -- the image and its processing in one string -- because the
   * `tileUrl` function a parent passes is a new function on every render, and a view that
   * restarted its tiles whenever its parent rendered would never finish loading.
   */
  const identity = tileUrl?.(0, 0, 0) ?? null;
  const tileUrlRef = useRef(tileUrl);
  tileUrlRef.current = tileUrl;
  const paneRef = useRef(pane);
  paneRef.current = pane;
  const loaded = useRef(new Map<string, Loaded>());
  const pending = useRef(new Set<string>());
  /** The finest level drawn so far: a coarser tile arriving after it needs a repaint, not a draw. */
  const finest = useRef(Number.POSITIVE_INFINITY);
  const latest = useRef({ width, height, segments, opacity, adjustments, onError });
  latest.current = { width, height, segments, opacity, adjustments, onError };
  /** Set by the first tile that fails: this image is then loaded whole, as it was before tiles. */
  const [whole, setWhole] = useState(false);

  // A new image or processing is a new pyramid. Declared before the painting effect, so the store
  // is empty by the time that effect runs for the new image.
  const [shownIdentity, setShownIdentity] = useState(identity);
  if (shownIdentity !== identity) {
    setShownIdentity(identity);
    setWhole(false);
  }
  useEffect(() => {
    loaded.current = new Map();
    pending.current = new Set();
    finest.current = Number.POSITIVE_INFINITY;
  }, [identity]);

  const tiled = identity !== null && !whole;

  /** Everything, from the tiles already here: coarse first, finer over it, then the overlay. */
  const paintAll = useRef((context: CanvasRenderingContext2D) => {
    const now = latest.current;
    context.clearRect(0, 0, now.width, now.height);
    const tiles = [...loaded.current.values()].sort((a, b) => b.key.z - a.key.z);
    for (const { key, image } of tiles) {
      const at = tileRect(key, image.naturalWidth, image.naturalHeight);
      context.drawImage(image, at.x, at.y, at.width, at.height);
    }
    finest.current = tiles.length === 0 ? Number.POSITIVE_INFINITY : tiles[tiles.length - 1]!.key.z;
    applyAdjustments(context, now.width, now.height, now.adjustments, now.onError);
    for (const segment of now.segments) drawSegment(context, segment, now.opacity);
  });

  /** One tile that has just arrived: drawn, adjusted, and the overlay redrawn over it alone. */
  const drawTile = useRef((context: CanvasRenderingContext2D, key: TileKey, image: HTMLImageElement) => {
    if (key.z > finest.current) {
      // Coarser than what is already there: drawn directly it would paint blur over detail.
      paintAll.current(context);
      return;
    }
    finest.current = key.z;
    const now = latest.current;
    const at = tileRect(key, image.naturalWidth, image.naturalHeight);
    const x = at.x;
    const y = at.y;
    const w = Math.min(at.width, now.width - x);
    const h = Math.min(at.height, now.height - y);
    if (w <= 0 || h <= 0) return;

    context.drawImage(image, at.x, at.y, at.width, at.height);
    applyAdjustments(context, w, h, now.adjustments, now.onError, { x, y });
    // The overlay, redrawn over this region only. The tile has just replaced every pixel in it,
    // overlay included, so drawing the masks again here blends them exactly once.
    context.save();
    context.beginPath();
    context.rect(x, y, w, h);
    context.clip();
    for (const segment of now.segments) {
      if (reaches(segment, x, y, w, h)) drawSegment(context, segment, now.opacity);
    }
    context.restore();
  });

  /** Ask for whatever the current view needs and does not have. */
  const requestTiles = useRef(() => {
    const canvas = canvasRef.current;
    const url = tileUrlRef.current;
    if (canvas === null || url === undefined) return;
    const now = latest.current;
    const wanted: TileKey[] = [{ z: topLevel(now.width, now.height), x: 0, y: 0 }];
    const drawn = canvas.getBoundingClientRect();
    const scroller = paneRef.current?.current ?? null;
    const view = visibleRegion(drawn, scroller?.getBoundingClientRect() ?? viewport(), now.width, now.height);
    if (view !== null) {
      const scale = (drawn.width / now.width) * (window.devicePixelRatio || 1);
      wanted.push(...tilesInView(now.width, now.height, view, scale));
    }

    const store = loaded.current;
    for (const key of wanted) {
      const id = tileId(key);
      if (store.has(id) || pending.current.has(id)) continue;
      pending.current.add(id);
      const image = new Image();
      image.onload = () => {
        // A tile for an image no longer shown: the store it belonged to has been replaced.
        if (loaded.current !== store) return;
        pending.current.delete(id);
        store.set(id, { key, image });
        const context = canvasRef.current === null ? null : contextOf(canvasRef.current);
        if (context !== null) drawTile.current(context, key, image);
      };
      image.onerror = () => {
        if (loaded.current !== store) return;
        pending.current.delete(id);
        // One failed tile and the image is loaded whole, as it was before tiles existed: a view
        // with a hole in it is worse than a slower one.
        setWhole(true);
      };
      image.src = url(key.z, key.x, key.y);
    }
  });

  // THE PAINTING: everything that changes what is drawn repaints in full.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const context = contextOf(canvas, onError);
    if (context === null) return;
    const drawingContext = context;

    if (tiled) {
      paintAll.current(drawingContext);
      requestTiles.current();
      return;
    }

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
  }, [tiled, identity, imageUrl, width, height, segments, opacity, adjustments, onError]);

  // WHAT IS IN VIEW CHANGES as the pane scrolls, the window resizes or the zoom redraws the canvas
  // at another size; each asks for the tiles the new view needs, once per animation frame at most.
  useEffect(() => {
    if (!tiled) return;
    let frame = 0;
    const schedule = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        requestTiles.current();
      });
    };
    const scroller = pane?.current ?? null;
    scroller?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (canvasRef.current !== null) observer?.observe(canvasRef.current);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      scroller?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, [tiled, identity, pane]);

  return (
    <canvas
      ref={canvasRef}
      className="canvas"
      width={width}
      height={height}
      /*
       * ZOOM IS AN EXPLICIT DISPLAYED SIZE, overriding the fit. The `width`/`height` attributes
       * above are the image's own pixels and never change; this is how many CSS pixels they are
       * drawn across.
       *
       * Every drawing layer derives its scale from `getBoundingClientRect`, so none of them has to
       * know this exists -- which only works because the drawing surface is exactly the image. It
       * was not, until the coordinate defect was found, and a zoom on top of that would have
       * multiplied the error.
       */
      {...(zoom === null || zoom === undefined
        ? {}
        : {
            style: {
              width: `${width * zoom}px`,
              height: `${height * zoom}px`,
              maxWidth: "none",
              maxHeight: "none",
            },
          })}
      role="img"
      aria-label={`${segments.length} ${segments.length === 1 ? "annotation" : "annotations"}`}
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
  /** Only this part of the canvas: where one tile has just been drawn. The whole canvas if absent. */
  region: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): void {
  if (isNeutral(adjustments) || width <= 0 || height <= 0) return;

  try {
    const frame = context.getImageData(region.x, region.y, width, height);
    adjustImage(frame.data, adjustments);
    context.putImageData(frame, region.x, region.y);
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
    region = maskRegion(mask);
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
