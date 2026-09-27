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
import { classColor, type Rgb } from "./classColor.js";
import { tileId, tileRect, tilesInView, topLevel, visibleRegion, type ScreenRect, type TileKey } from "./tiles.js";

export interface AnnotationCanvasProps {
  readonly imageUrl: string;
  readonly width: number;
  readonly height: number;
  readonly segments: readonly WireSegment[];
  /** CSS pixels per image pixel, or null/absent to fit the pane. */
  readonly zoom?: number | null;
  /** 0 hides the overlay, 1 hides the image. Legacy's is 70 of 255: `OVERLAY_OPACITY`. */
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
  /** The segment under the pointer, drawn at legacy's hover alpha. */
  readonly hovered?: WireSegment | null;
  /**
   * The selected segments' indices, highlighted over everything else as legacy's are: on a canvas
   * of their own, over whatever a tool draws.
   */
  readonly selected?: readonly number[];
  /** Edit mode: a selected shape is highlighted in its own colour rather than yellow. */
  readonly editing?: boolean;
  /**
   * Drawn over the picture, in the box that is exactly the picture: the Multi tab's other half
   * draws a linked AI prompt and that image's own preview here, each at legacy's depth
   * (`styles.css`, "THE STACK'S DEPTHS").
   */
  readonly children?: ReactNode;
}

/**
 * Legacy's overlay alpha, 70 of 255, for every kind of annotation alike: a polygon, a circle and a
 * mask (segment_display_manager.py:336-352, 355-376 and 81). It was 0.5 here, twice as opaque.
 * Hovering raises legacy's to 170; this canvas has no hover.
 */
export const OVERLAY_OPACITY = 70 / 255;

/** The segment under the pointer: legacy's hover brush and pixmap, 170 of 255 (segment_display_manager.py:337-346, 81-82). */
export const HOVER_OPACITY = 170 / 255;

/**
 * A selected segment: legacy lays a yellow copy over everything, alpha 180, whatever its class
 * (segment_display_manager.py:510-511, 537-541). In Edit mode a selected shape gets its own colour
 * at 170 instead (505-508). Over everything includes a tool's marks: it has a canvas of its own.
 */
export const SELECTION_OPACITY = 180 / 255;
const SELECTION_YELLOW: Rgb = { r: 255, g: 255, b: 0 };

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

export function AnnotationCanvas({
  imageUrl,
  width,
  height,
  segments,
  zoom,
  opacity = OVERLAY_OPACITY,
  adjustments = NEUTRAL,
  onError,
  tileUrl,
  pane,
  hovered = null,
  selected = NONE_SELECTED,
  editing = false,
  children,
}: AnnotationCanvasProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /*
   * THE ANNOTATIONS HAVE A CANVAS OF THEIR OWN, laid exactly over the picture's. Hover and
   * selection repaint them as the pointer moves, and repainting the picture with them would
   * redraw every tile and re-run the adjustments over every pixel each time.
   */
  const overlayRef = useRef<HTMLCanvasElement>(null);
  /*
   * THE SELECTION HAS A CANVAS OF ITS OWN, because legacy lays its highlights at Z 999 and 1000
   * (segment_display_manager.py:522-542; main_window.py:6259-6281), over the AI preview at 50 or
   * 500 and the vertex handles at 200, which in turn are over the annotations. A tool's marks are
   * drawn between the two canvases (`styles.css`, "THE STACK'S DEPTHS").
   */
  const selectionRef = useRef<HTMLCanvasElement>(null);

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
  const latest = useRef({ width, height, adjustments, onError });
  latest.current = { width, height, adjustments, onError };
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

  /** The picture, from the tiles already here: coarse first, finer over it. */
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
  });

  /** One tile that has just arrived: drawn and adjusted, over its own region only. */
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

  // THE PICTURE: everything that changes it repaints it in full. The annotations are not in it.
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
      // The adjustments reach the pixels a user is judging and never the class colours they are
      // navigating by, which are on the other canvas.
      applyAdjustments(drawingContext, width, height, adjustments, onError);
    };
    image.onerror = () => {
      if (cancelled) return;
      // The annotations are on their own canvas, so they still show over the empty picture.
      drawingContext.clearRect(0, 0, width, height);
      onError?.("the image could not be loaded, so only the annotations are shown");
    };
    image.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [tiled, identity, imageUrl, width, height, adjustments, onError]);

  // THE ANNOTATIONS: repainted whole whenever they or the hover change.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (overlay === null) return;
    // No error reported here: a browser with no 2D context has already been reported by the
    // picture's canvas.
    const context = contextOf(overlay);
    if (context === null) return;
    paintOverlay(context, { width, height, segments, opacity, hovered });
  }, [width, height, segments, opacity, hovered]);

  // THE SELECTION: repainted whole whenever it or the shapes it covers change. After the
  // annotations, so a render that changes both paints them in legacy's order.
  useEffect(() => {
    const canvas = selectionRef.current;
    if (canvas === null) return;
    const context = contextOf(canvas);
    if (context === null) return;
    paintSelection(context, { width, height, segments, selected, editing });
  }, [width, height, segments, selected, editing]);

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
    <div className="annotation-canvas">
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
    {/* Stretched over the picture by CSS, so it is shown at whatever size the picture is. */}
    <canvas
      ref={overlayRef}
      className="annotation-canvas__overlay"
      width={width}
      height={height}
      aria-hidden="true"
    />
    {/* Only while something is selected: a canvas the size of the picture is 200 MB on a
        50-megapixel image, and it would hold nothing. */}
    {selected.length > 0 && (
      <canvas
        ref={selectionRef}
        className="annotation-canvas__selection"
        width={width}
        height={height}
        aria-hidden="true"
      />
    )}
    {children}
    </div>
  );
}

const NONE_SELECTED: readonly number[] = [];

/** What the annotations' canvas shows. */
export interface OverlayState {
  readonly width: number;
  readonly height: number;
  readonly segments: readonly WireSegment[];
  readonly opacity: number;
  readonly hovered: WireSegment | null;
}

/**
 * Paint every annotation as legacy stacks its items: each segment in index order at 70, the one
 * under the pointer at 170 where it lies (segment_display_manager.py:326-383). Legacy's hover
 * changes an item's brush and never its Z value (hoverable_polygon_item.py:27-28), so a hovered
 * segment stays under the AI preview and the vertex handles, as it does here.
 */
export function paintOverlay(context: CanvasRenderingContext2D, state: OverlayState): void {
  context.clearRect(0, 0, state.width, state.height);
  for (const segment of state.segments) {
    drawSegment(context, segment, segment === state.hovered ? HOVER_OPACITY : state.opacity);
  }
}

/** What the selection's canvas shows. */
export interface SelectionState {
  readonly width: number;
  readonly height: number;
  readonly segments: readonly WireSegment[];
  readonly selected: readonly number[];
  readonly editing: boolean;
}

/**
 * Paint the selection, which legacy lays over everything else: a polygon's or circle's highlight
 * at Z 999 and a mask's at 1000 (segment_display_manager.py:513-542).
 */
export function paintSelection(context: CanvasRenderingContext2D, state: SelectionState): void {
  context.clearRect(0, 0, state.width, state.height);
  for (const index of state.selected) {
    const segment = state.segments[index];
    if (segment === undefined) continue;
    const shape = segmentShape(segment);
    if (state.editing && shape !== null) {
      // Edit mode: the shape brightened in its own colour, over its vertex handles as legacy's
      // highlight at Z 999 is over theirs at 200 (segment_display_manager.py:505-508, 522;
      // editable_vertex.py:14).
      drawSegment(context, segment, HOVER_OPACITY);
    } else {
      // Legacy skips a selected MASK in Edit mode, which has no handles. Here Edit is also the
      // tool nothing else is, where legacy would show yellow, so a mask always shows yellow.
      drawSegment(context, segment, SELECTION_OPACITY, SELECTION_YELLOW);
    }
  }
}

/**
 * The index of the topmost segment drawn at an image point, or -1: the one legacy's hover lands
 * on. Later segments are drawn over earlier ones, so the search runs from the end. A mask counts
 * only where its pixels are set, as Qt's pixmap items take their hover shape from their pixels.
 */
export function segmentAt(segments: readonly WireSegment[], x: number, y: number): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (covers(segments[index]!, x, y)) return index;
  }
  return -1;
}

function covers(segment: WireSegment, x: number, y: number): boolean {
  const shape = segmentShape(segment);
  if (shape !== null) {
    if (shape.kind === "circle") return Math.hypot(x - shape.cx, y - shape.cy) <= shape.radius;
    return insidePolygon(shape.points, x, y);
  }

  const box = segment.mask?.box;
  if (box == null) return false;
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < box[0] || px >= box[2] || py < box[1] || py >= box[3]) return false;
  const region = decodedRegion(segment);
  return region !== null && region[(py - box[1]) * (box[2] - box[0]) + (px - box[0])] !== 0;
}

/** Even-odd, the rule the polygon is filled by. */
function insidePolygon(points: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A mask's bytes, decoded once per segment: the store replaces a segment rather than editing it. */
const regions = new WeakMap<WireSegment, Uint8Array | null>();

function decodedRegion(segment: WireSegment): Uint8Array | null {
  if (regions.has(segment)) return regions.get(segment)!;
  let region: Uint8Array | null = null;
  try {
    if (segment.mask !== undefined) region = maskRegion(segment.mask);
  } catch {
    region = null;
  }
  regions.set(segment, region);
  return region;
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
  color: Rgb = classColor(segment.classId),
): { width: number; height: number; x: number; y: number; data: Uint8ClampedArray } | null {
  const mask = segment.mask;
  if (mask?.box == null) return null;

  const [x0, y0, x1, y1] = mask.box;
  const width = x1 - x0;
  const height = y1 - y0;
  if (width <= 0 || height <= 0) return null;

  const region = decodedRegion(segment);
  if (region === null || region.length !== width * height) return null;

  const { r, g, b } = color;
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

/** What a Polygon or Circle segment is drawn as, instead of a mask. */
export type SegmentShape =
  | { readonly kind: "polygon"; readonly points: readonly (readonly [number, number])[] }
  | { readonly kind: "circle"; readonly cx: number; readonly cy: number; readonly radius: number };

/**
 * The outline a segment is drawn as, or null when it is drawn from its mask.
 *
 * Legacy's order (segment_display_manager.py:333-383): a Polygon with vertices is its outline,
 * filled; a Circle with vertices is the circle around its first vertex through its second
 * (hoverable_ellipse_item.py:66-73); only then is a mask drawn. A Circle with one vertex draws
 * nothing, not its mask, as legacy's empty rectangle does.
 *
 * Until 2026-09-26 only masks were drawn, so every polygon, box and circle a user drew, and every AI
 * mask the auto-polygon setting converted, went into the lists and never onto the image.
 */
export function segmentShape(segment: WireSegment): SegmentShape | null {
  const vertices = segment.vertices;
  if (vertices === undefined || vertices.length === 0) return null;
  if (segment.type === "Polygon") return { kind: "polygon", points: vertices };
  if (segment.type !== "Circle") return null;

  const [cx, cy] = vertices[0]!;
  const rim = vertices[1];
  const radius = rim === undefined ? 0 : Math.hypot(rim[0] - cx, rim[1] - cy);
  return { kind: "circle", cx, cy, radius };
}

/**
 * Fill a shape, with no outline, as legacy's transparent pen draws it.
 *
 * Even-odd, which is Qt's default for a polygon item, so a polygon that crosses itself leaves the
 * same holes in both apps.
 */
export function fillShape(
  context: Pick<CanvasRenderingContext2D, "save" | "restore" | "beginPath" | "moveTo" | "lineTo" | "closePath" | "arc" | "fill"> & { fillStyle: CanvasRenderingContext2D["fillStyle"] },
  shape: SegmentShape,
  color: Rgb,
  opacity: number,
): void {
  const { r, g, b } = color;
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255) / 255;

  context.save();
  context.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  context.beginPath();
  if (shape.kind === "circle") {
    context.arc(shape.cx, shape.cy, shape.radius, 0, 2 * Math.PI);
  } else {
    shape.points.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
    context.closePath();
  }
  context.fill("evenodd");
  context.restore();
}

/** Paint one segment, in its class colour unless told otherwise: its outline if it has one, else its mask. */
function drawSegment(
  context: CanvasRenderingContext2D,
  segment: WireSegment,
  opacity: number,
  color: Rgb = classColor(segment.classId),
): void {
  const shape = segmentShape(segment);
  if (shape !== null) {
    fillShape(context, shape, color, opacity);
    return;
  }

  const painted = paintedMask(context, segment, opacity, color);
  if (painted !== null) context.drawImage(painted.canvas, painted.x, painted.y);
}

/**
 * A mask coloured and ready to draw, kept per segment and style: hovering repaints every mask, and
 * building each one's pixels again on every pointer move would be felt with many on screen.
 */
const paintedMasks = new WeakMap<WireSegment, Map<string, { canvas: HTMLCanvasElement; x: number; y: number } | null>>();

function paintedMask(
  context: CanvasRenderingContext2D,
  segment: WireSegment,
  opacity: number,
  color: Rgb,
): { canvas: HTMLCanvasElement; x: number; y: number } | null {
  const style = `${color.r},${color.g},${color.b},${Math.round(Math.max(0, Math.min(1, opacity)) * 255)}`;
  let styles = paintedMasks.get(segment);
  if (styles === undefined) {
    styles = new Map();
    paintedMasks.set(segment, styles);
  }
  const kept = styles.get(style);
  if (kept !== undefined) return kept;

  const painted = segmentPixels(segment, opacity, color);
  let made: { canvas: HTMLCanvasElement; x: number; y: number } | null = null;
  if (painted !== null) {
    const pixels = context.createImageData(painted.width, painted.height);
    pixels.data.set(painted.data);

    // putImageData ignores globalAlpha and overwrites rather than blending, so the overlay is
    // composited through a scratch canvas instead. Painting it directly would erase whatever is
    // under a transparent pixel.
    const scratch = document.createElement("canvas");
    scratch.width = painted.width;
    scratch.height = painted.height;
    const scratchContext = scratch.getContext("2d");
    if (scratchContext) {
      scratchContext.putImageData(pixels, 0, 0);
      made = { canvas: scratch, x: painted.x, y: painted.y };
    }
  }
  styles.set(style, made);
  return made;
}
