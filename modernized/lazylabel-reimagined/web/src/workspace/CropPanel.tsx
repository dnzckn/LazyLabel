/**
 * The typed crop panel — RULE-018, a P0 rule.
 *
 * The arithmetic is in `tools/crop.ts` and reproduces legacy exactly, including the off-by-one that
 * puts the last row and column of an image permanently outside any crop. This is the control over
 * it, laid out and worded as legacy's Border Crop is (`border_crop_widget.py:28-94`): an X and a Y
 * field, a draw button, a clear button, Apply, and one status line under them.
 *
 * A CROP IS DESTRUCTIVE, and this panel used to say so at length: how many pixels the next save
 * would blank, that the exported files keep the full image size, and that even the largest crop
 * leaves the last row and column out. Those were the paragraphs the owner asked to be rid of on
 * 2026-09-26. What still says a crop is in force is the status line here, as legacy's does, and
 * the status bar's "cropped on save", which legacy has no equivalent of.
 *
 * X and Y stay SEPARATE text fields in "from:to" form, because that is the shape a user's muscle
 * memory and any pasted value are in. They are parsed with no range validation and clamped
 * afterwards, which is legacy's order and is why "-10:1200" is legal input rather than an error.
 */

import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";

import { cropFrom, parseRange, type ImageSize } from "../tools/crop.js";
import { useWorkspace } from "./WorkspaceProvider.jsx";

/**
 * Why the typed ranges were refused, in legacy's words and legacy's order
 * (`border_crop_widget.py:110-139`): an empty field first, then X's format, then Y's, then numbers.
 * It names one field at a time, as legacy does.
 */
function refusalFor(x: string, y: string): string {
  if (x.trim() === "" || y.trim() === "") return "Enter both X and Y coordinates";
  if (x.trim().split(":").length !== 2) return "Invalid X format. Use start:end";
  if (y.trim().split(":").length !== 2) return "Invalid Y format. Use start:end";
  return "Invalid coordinates. Use numbers only.";
}

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
      setError(refusalFor(x, y));
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

  // Legacy's panel is there with or without an image; here its controls wait for one to measure
  // the crop against, disabled with legacy's refusal for that case as their tooltip
  // (crop_manager.py:118). They said so in a line of their own until 2026-09-26.
  const noImage = size === null;
  const why = (tooltip: string): string => (noImage ? "No image loaded" : tooltip);

  return (
    <div className="crop">
      <label className="crop__row" title="X coordinate range in format start:end">
        <span>X:</span>
        <input
          type="text"
          value={x}
          placeholder="start:end (e.g., 20:460)"
          aria-label="X range"
          disabled={noImage}
          onChange={(event) => setX(event.target.value)}
          onKeyDown={applyOnEnter}
        />
      </label>
      <label className="crop__row" title="Y coordinate range in format start:end">
        <span>Y:</span>
        <input
          type="text"
          value={y}
          placeholder="start:end (e.g., 20:460)"
          aria-label="Y range"
          disabled={noImage}
          onChange={(event) => setY(event.target.value)}
          onKeyDown={applyOnEnter}
        />
      </label>

      <div className="crop__buttons">
        {/* Drawing a crop is chosen here, as legacy's Border Crop section offers it
            (control_panel.py:500), rather than among the annotation modes: a crop decides which
            pixels reach the FILE (RULE-018), and it is not an annotation. */}
        <button
          type="button"
          className="crop__icon"
          aria-pressed={activeTool === "crop"}
          aria-label="Draw crop rectangle"
          title={why("Draw crop rectangle")}
          disabled={noImage}
          onClick={() => setActiveTool(activeTool === "crop" ? "none" : "crop")}
        >
          ⬚
        </button>
        <button
          type="button"
          className="crop__icon"
          aria-label="Clear crop"
          title="Clear crop"
          disabled={crop === null}
          onClick={clear}
        >
          ✕
        </button>
        <button type="button" title={why("Apply crop from coordinates")} disabled={noImage} onClick={apply}>
          Apply
        </button>
      </div>

      {/* Legacy's one status line: a refusal, or the crop in force (border_crop_widget.py:136). */}
      {error !== null ? (
        <p role="alert" className="crop__status crop__status--error">
          {error}
        </p>
      ) : (
        crop !== null && (
          <p role="status" className="crop__status">
            Crop: {crop.x1}:{crop.x2}, {crop.y1}:{crop.y2}
          </p>
        )
      )}
    </div>
  );
}
