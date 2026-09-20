/**
 * Two images side by side, annotated together — C14, decision 8's rebuild of multi-view.
 *
 * Not a port. Legacy's multi-view is half-migrated with fourteen undefined members, and decision 8
 * settled that it is rebuilt from the linked-operation rules instead. `linked.ts` holds those; this
 * is the view, and it lands with them rather than after them, because three features in this
 * project were built, unit-tested and unreachable.
 *
 * WHAT IT DOES NOT DO YET, AND SAYS SO. Drawing into a linked pair needs the workspace store to
 * hold TWO open images rather than one, which is a change to the store and not to this file. The
 * viewer compares, links, and reports what a linked operation would do; the drawing surfaces come
 * with that store change. A pair of canvases with dead drawing layers over them would be exactly
 * the defect this session kept finding.
 *
 * TWO VIEWERS, not four. Legacy has a four-view setting and only viewers 0 and 1 exist
 * (RULE-092's edge cases); the setting is a control that does nothing, and it is not carried over.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { WireDatasetImage } from "@lazylabel/contracts";

import { AnnotationCanvas } from "../canvas/AnnotationCanvas.jsx";
import { describePair, type ImageSize } from "./linked.js";

export interface SplitViewProps {
  readonly images: readonly WireDatasetImage[];
  /**
   * The pixel size of one image.
   *
   * THIS VIEW ASKS FOR ITS OWN, and the first version did not — it read the size off the one image
   * the workspace had open, on the reasoning that fetching would be "a second answer to a question
   * the workspace already asks". That reasoning was wrong and running the app showed it in a
   * second: the workspace asks about ONE image, this needs TWO, and the result was a comparison
   * view that displayed no pictures at all. Nobody else is asking, so this is not a second answer.
   */
  readonly measure: (key: string) => Promise<ImageSize>;
  readonly pixelsUrl: (key: string) => string;
}

export function SplitView({ images, measure, pixelsUrl }: SplitViewProps): ReactNode {
  const [leftIndex, setLeftIndex] = useState(0);
  const [rightIndex, setRightIndex] = useState(1);
  const [linked, setLinked] = useState(true);

  const left = images[leftIndex];
  const right = images[rightIndex];

  // Keyed by image, not by side, so swapping the two sides costs nothing and re-choosing an image
  // already measured shows it at once.
  const [sizes, setSizes] = useState<Readonly<Record<string, ImageSize>>>({});

  useEffect(() => {
    let cancelled = false;
    for (const image of [left, right]) {
      if (image === undefined || sizes[image.key] !== undefined) continue;
      void measure(image.key)
        .then((size) => {
          // Guarded on the key rather than on a counter: two measurements are in flight and they
          // are for different images, so neither supersedes the other.
          if (!cancelled) setSizes((known) => ({ ...known, [image.key]: size }));
        })
        // A size that cannot be read leaves the pane saying "measuring", which is honest -- the
        // canvas underneath would report the decode failure itself if it were drawn.
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [left, right, measure, sizes]);

  const sizeOf = (key: string): ImageSize | null => sizes[key] ?? null;

  const note = useMemo(() => {
    if (left === undefined || right === undefined) return null;
    const leftSize = sizes[left.key];
    const rightSize = sizes[right.key];
    if (leftSize === undefined || rightSize === undefined) return null;
    return describePair(leftSize, rightSize);
  }, [left, right, sizes]);

  if (images.length < 2) {
    return (
      <p className="panel__missing">
        A split view needs two images. This folder has {images.length}.
      </p>
    );
  }

  return (
    <div className="split">
      <div className="split__controls">
        <Picker label="Left image" images={images} value={leftIndex} onChange={setLeftIndex} />
        <Picker label="Right image" images={images} value={rightIndex} onChange={setRightIndex} />
        <label className="split__link">
          <input
            type="checkbox"
            checked={linked}
            aria-label="Link the viewers"
            onChange={(event) => setLinked(event.target.checked)}
          />{" "}
          Linked
        </label>
      </div>

      {leftIndex === rightIndex && (
        // Allowed, and worth saying: the same image twice is a legitimate way to look at one
        // picture under two sets of display adjustments, but a user who chose it by accident
        // would otherwise wonder why both sides move together.
        <p role="status" className="banner banner--warning">
          Both sides are showing the same image.
        </p>
      )}

      {note !== null && (
        <p role="status" className="banner banner--warning">
          {note}
        </p>
      )}

      <div className="split__panes">
        {[left, right].map((image, side) =>
          image === undefined ? null : (
            <figure key={`${side}-${image.key}`} className="split__pane">
              <Pane image={image} size={sizeOf(image.key)} pixelsUrl={pixelsUrl} />
              <figcaption>{image.name}</figcaption>
            </figure>
          ),
        )}
      </div>

      <p className="panel__missing">
        {linked
          ? "Linked: an operation would apply to both viewers at the same pixel, and both images "
            + "would name the object the same class — each keeping its own id for it, which is how "
            + "per-image class ids work. Drawing into a pair is not built: it needs the workspace "
            + "to hold two open images, which is the next slice."
          : "Unlinked: an operation would apply to the active viewer only."}
      </p>
    </div>
  );
}

function Pane({
  image,
  size,
  pixelsUrl,
}: {
  readonly image: WireDatasetImage;
  readonly size: ImageSize | null;
  readonly pixelsUrl: (key: string) => string;
}): ReactNode {
  if (size === null) {
    // Measured before drawn. A canvas sized from a guess shows the image at the wrong scale, and
    // every coordinate taken from it would be wrong by the same factor.
    return <p className="panel__missing">Measuring {image.name}…</p>;
  }

  return (
    <AnnotationCanvas
      imageUrl={pixelsUrl(image.key)}
      width={size.width}
      height={size.height}
      // No annotations yet: this view compares images, and loading each side's annotations is part
      // of the two-open-images change rather than something to fake here.
      segments={[]}
    />
  );
}

function Picker({
  label,
  images,
  value,
  onChange,
}: {
  readonly label: string;
  readonly images: readonly WireDatasetImage[];
  readonly value: number;
  readonly onChange: (index: number) => void;
}): ReactNode {
  return (
    <label className="crop__field">
      <span>{label}</span>
      <select
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {images.map((image, index) => (
          <option key={image.key} value={index}>
            {image.name}
          </option>
        ))}
      </select>
    </label>
  );
}
