/**
 * The typed crop panel — RULE-018, a P0 rule.
 *
 * The arithmetic is in `tools/crop.ts` and reproduces legacy exactly, including the off-by-one that
 * puts the last row and column of an image permanently outside any crop. This is the control over
 * it, and it carries the one thing legacy's does not: A CROP IS DESTRUCTIVE AND THE PANEL SAYS SO
 * BEFORE IT IS APPLIED.
 *
 * Legacy's panel is two text boxes and an Apply button. The crop it sets then sits there silently
 * across image changes, and the next save blanks every annotation outside it — no prompt, no
 * indication, and nothing in the exported file to say a crop was ever involved. The count of
 * pixels it will blank is shown here for exactly that reason: it is the smallest thing that turns
 * "Apply" from a shrug into a decision.
 *
 * X and Y stay SEPARATE text fields in "from:to" form, because that is the shape a user's muscle
 * memory and any pasted value are in. They are parsed with no range validation and clamped
 * afterwards, which is legacy's order and is why "-10:1200" is legal input rather than an error.
 */

import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";

import { cropFrom, excludedPixels, isWholeImage, parseRange, type ImageSize } from "../tools/crop.js";
import { useWorkspace } from "./WorkspaceProvider.jsx";

export function CropPanel(): ReactNode {
  const { open, crop, setCrop, activeTool, setActiveTool } = useWorkspace();
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [error, setError] = useState<string | null>(null);

  const metadata = open?.metadata ?? null;
  const size: ImageSize | null =
    metadata === null ? null : { width: metadata.width, height: metadata.height };

  const apply = useCallback(() => {
    if (size === null) return;

    const xs = parseRange(x);
    const ys = parseRange(y);
    if (xs === null || ys === null) {
      // Which one, not just "invalid". With two fields and one message a user retypes both.
      const bad = [xs === null ? "X" : null, ys === null ? "Y" : null].filter(Boolean).join(" and ");
      setError(`${bad} must be two whole numbers separated by a colon, like 50:700.`);
      return;
    }

    setError(null);
    setCrop(cropFrom({ x: xs.from, y: ys.from }, { x: xs.to, y: ys.to }, size));
  }, [setCrop, size, x, y]);

  const clear = useCallback(() => {
    setCrop(null);
    setError(null);
  }, [setCrop]);

  /*
   * THE FIELDS SHOW THE CROP IN FORCE, as legacy's do: a crop drawn on the image, or typed and then
   * clamped to it, is written back into them (crop_manager.py:147-148). They kept whatever was typed
   * last, so after drawing a crop they described a different rectangle from the one on screen
   * (`CONTROL_PARITY.md` CP-30). Removing the crop empties them.
   */
  useEffect(() => {
    setX(crop === null ? "" : `${crop.x1}:${crop.x2}`);
    setY(crop === null ? "" : `${crop.y1}:${crop.y2}`);
  }, [crop]);

  // Enter in either field applies, as legacy's returnPressed does (border_crop_widget.py:101-102).
  const applyOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") apply();
  };

  if (size === null) {
    return <p className="panel__missing">A crop needs an open image to measure against.</p>;
  }

  return (
    <div className="crop">
      {/* Drawing a crop is chosen here, as legacy's Border Crop section offers it
          (control_panel.py:500), rather than among the annotation modes: a crop decides which
          pixels reach the FILE (RULE-018), and it is not an annotation. */}
      <button
        type="button"
        aria-pressed={activeTool === "crop"}
        onClick={() => setActiveTool(activeTool === "crop" ? "none" : "crop")}
      >
        Draw crop
      </button>

      <label className="crop__field">
        <span>X range</span>
        <input
          type="text"
          value={x}
          placeholder="start:end (e.g., 20:460)"
          aria-label="X range"
          onChange={(event) => setX(event.target.value)}
          onKeyDown={applyOnEnter}
        />
      </label>
      <label className="crop__field">
        <span>Y range</span>
        <input
          type="text"
          value={y}
          placeholder="start:end (e.g., 20:460)"
          aria-label="Y range"
          onChange={(event) => setY(event.target.value)}
          onKeyDown={applyOnEnter}
        />
      </label>

      <button type="button" onClick={apply}>
        Apply crop
      </button>

      {error !== null && (
        <p role="alert" className="banner banner--error">
          {error}
        </p>
      )}

      {crop === null ? (
        <p role="status">No crop. The whole image is exported.</p>
      ) : (
        <>
          <p role="status">
            Cropped to X {crop.x1}:{crop.x2}, Y {crop.y1}:{crop.y2}.
          </p>
          {/* The warning legacy never gives. Saving with a crop in force does not narrow the
              exported file -- it keeps the full size and BLANKS what falls outside, so annotations
              out there are gone from the file and cannot be recovered from it. */}
          <p role="status" className="banner banner--warning">
            Saving will blank {excludedPixels(crop, size).toLocaleString()} pixels outside this
            rectangle. The exported files keep the full image size; anything annotated out there is
            not in them.
          </p>
          {isWholeImage(crop, size) && (
            // Worth saying, because the numbers look like the whole image and are not: the far
            // edge is excluded, so this still blanks the last row and column.
            <p role="status">
              That is the largest crop this image allows. The last row and column are still outside
              it — a crop can never include them.
            </p>
          )}
          <button type="button" onClick={clear}>
            Remove crop
          </button>
        </>
      )}
    </div>
  );
}
