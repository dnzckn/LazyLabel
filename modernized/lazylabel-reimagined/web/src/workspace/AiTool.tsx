/**
 * The AI tool with its network: encode once, prompt often, accept on Space.
 *
 * `canvas/AiLayer` owns the gesture and `tools/ai` owns the decisions. This owns the two calls and
 * the three things that go wrong around them.
 *
 * THE ENCODE HAPPENS ONCE PER IMAGE, NOT ONCE PER PROMPT. It is the expensive half — seconds for a
 * cold one — and every click after it is a fraction of a second. Doing it per prompt would make
 * the tool unusable while looking like a slow model rather than a wasted call.
 *
 * A PROMPT THAT ARRIVES OUT OF ORDER IS DISCARDED. A user clicking quickly has several requests in
 * flight, and they do not come back in the order they were sent. Showing whichever answered last
 * would put the mask for two points on screen after the mask for three, and the user would see the
 * preview move BACKWARDS as they refined it.
 *
 * A FAILED PROMPT CLEARS THE PREVIEW. Leaving the previous mask up after a failure shows an answer
 * to a question nobody asked — the user's last click is not in it, and they have no way to tell.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { decodeMask, encodeMask, type WireSegment } from "@lazylabel/contracts";

import { AiLayer } from "../canvas/AiLayer.jsx";
import { segmentPixels } from "../canvas/AnnotationCanvas.jsx";
import { filterFragments } from "../tools/fragments.js";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import type { AiPrompt } from "../tools/ai.js";
import type { ApiClient, WireSegmentResponse } from "../api/client.js";

export interface AiToolProps {
  readonly client: ApiClient;
  /** Dataset key of the open image; the service reads the same folder the API does. */
  readonly imageKey: string;
  readonly width: number;
  readonly height: number;
  readonly classId: number;
  /** A manifest model NAME. The service refuses anything not listed. */
  readonly model: string;
  /** RULE-027's threshold, from settings. */
  readonly fragmentThreshold: number;
  readonly onAccept: (segment: WireSegment) => void;
  readonly onErase: (mask: WireSegment) => void;
}

export function AiTool({
  client,
  imageKey,
  width,
  height,
  classId,
  model,
  fragmentThreshold,
  onAccept,
  onErase,
}: AiToolProps): ReactNode {
  const { notify } = useNotifications();
  const [handle, setHandle] = useState<string | null>(null);
  const [encoding, setEncoding] = useState(false);
  const [result, setResult] = useState<WireSegmentResponse | null>(null);

  /** Rises with every prompt; an answer with a stale number is thrown away. */
  const latest = useRef(0);

  /*
   * THE PREDICTION, READ THROUGH A REF SO ACCEPTING IT CANNOT USE A STALE ONE.
   *
   * Space is handled by a `document` listener that `AiLayer` registers in an effect. Effects run
   * AFTER the commit, so there is a window in which the preview is on screen and the listener
   * still closes over the render where there was no prediction -- and a Space in that window was
   * answered with "No AI segment preview to accept", over a preview the user was looking at.
   *
   * The window is short in a browser and the test suite hit it about one run in ten, which is
   * roughly what "as fast as a person can press a key after seeing something appear" looks like.
   * Reading the current value instead of the captured one closes it whenever the listener was
   * registered.
   */
  const current = useRef<WireSegmentResponse | null>(null);
  current.current = result;

  // One encode per image. Cleared when the image changes so a handle cannot outlive its pixels.
  useEffect(() => {
    let cancelled = false;
    setHandle(null);
    setResult(null);
    setEncoding(true);

    client
      .embed({ image: imageKey, model })
      .then((response) => {
        if (cancelled) return;
        setHandle(response.handle);
        setEncoding(false);
        // Only a COLD encode is worth a message: one on every image would be noise, and the whole
        // point of the cache is that the user does not wait.
        if (!response.cached) notify({ severity: "info", message: "Image ready for AI prompts" });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setEncoding(false);
        notify({
          severity: "error",
          message: "The AI tools could not prepare this image",
          // The service's own reason, unflattened: "AI unavailable" tells a user to give up.
          detail: cause instanceof Error ? cause.message : String(cause),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [client, imageKey, model, notify]);

  const onPrompt = useCallback(
    (prompt: AiPrompt) => {
      if (handle === null) {
        // A click that lands while the image is still encoding used to be dropped in silence. The
        // banner says the image is being prepared, but a user who clicks anyway -- which is what
        // people do while waiting -- got no mask and no acknowledgement that anything had
        // happened, and could not tell a slow model from a broken one.
        //
        // It is not queued and run later: a mask appearing seconds after a click the user has
        // moved on from is worse than one that never appears.
        notify({
          severity: "info",
          message: encoding
            ? "Still preparing this image, so that click was not sent"
            : "This image is not ready for AI prompts, so that click was not sent",
        });
        return;
      }

      latest.current += 1;
      const mine = latest.current;

      client
        .segment({
          handle,
          ...(prompt.points.length > 0 ? { points: prompt.points.map((p) => ({ ...p })) } : {}),
          ...(prompt.box === null
            ? {}
            : {
                box: [
                  Math.min(prompt.box[0].x, prompt.box[1].x),
                  Math.min(prompt.box[0].y, prompt.box[1].y),
                  Math.max(prompt.box[0].x, prompt.box[1].x),
                  Math.max(prompt.box[0].y, prompt.box[1].y),
                ] as const,
              }),
        })
        .then((response) => {
          // Out of order: a later prompt has already answered, and showing this one would move the
          // preview backwards as the user refines it.
          if (mine !== latest.current) return;
          setResult(response);
        })
        .catch((cause: unknown) => {
          if (mine !== latest.current) return;
          // Cleared, not left: the previous mask is an answer to a question nobody asked.
          setResult(null);
          notify({
            severity: "error",
            message: "That prompt could not be run",
            detail: cause instanceof Error ? cause.message : String(cause),
          });
        });
    },
    [client, encoding, handle, notify],
  );

  const accept = useCallback(
    (asEraser: boolean) => {
      const result = current.current;
      if (result === null) {
        notify({ severity: "warning", message: "No AI segment preview to accept" });
        return;
      }

      const filtered = filterFragments(decodeMask(result.mask), fragmentThreshold);

      if (filtered.kept === 0) {
        notify({
          severity: "warning",
          message: "Nothing was accepted",
          detail: `Every piece of that mask was below the ${fragmentThreshold}% fragment threshold.`,
        });
        setResult(null);
        return;
      }

      const segment: WireSegment = { type: "AI", classId, mask: encodeMask(filtered.mask) };
      if (asEraser) onErase(segment);
      else onAccept(segment);

      if (filtered.dropped > 0) {
        notify({
          severity: "info",
          message: `Dropped ${filtered.dropped} fragment${filtered.dropped === 1 ? "" : "s"}`,
        });
      }

      if (filtered.holesFilled) {
        // RULE-027's recorded defect: above zero, the kept pieces are redrawn as filled outer
        // contours, so a ring becomes a disc. Legacy changes the shape without saying so.
        notify({
          severity: "warning",
          message: "Holes inside that mask were filled",
          detail:
            "The fragment filter redraws what it keeps as solid outlines, so interior gaps close. "
            + "Set the fragment threshold to 0 to keep them.",
        });
      }

      setResult(null);
    },
    // No `result`: it is read from the ref above, which is the whole point. Leaving it in would
    // put the stale closure back, one render later.
    [classId, fragmentThreshold, notify, onAccept, onErase],
  );

  return (
    <>
      <AiLayer
        width={width}
        height={height}
        classId={classId}
        onPrompt={onPrompt}
        onAccept={accept}
        onRefused={(reason) => notify({ severity: "warning", message: reason })}
        preview={result === null ? undefined : <Preview result={result} classId={classId} />}
      />
      {encoding && (
        <p role="status" className="banner">
          Preparing this image for the AI tools…
        </p>
      )}

      {/* RULE-062's message, which legacy shows for a box preview and not for a point one. Shown
          for both here: the user needs to know a prediction is waiting whichever way they asked
          for it, and the canvas cannot say so on a machine where the preview fails to paint. */}
      {result !== null && (
        <p role="status" className="banner">
          AI preview ready — press Space to accept it
        </p>
      )}
    </>
  );
}

/**
 * The pending mask, drawn as an image over the canvas.
 *
 * Reuses `segmentPixels`, the canvas's own decoder, so a preview and the committed annotation
 * cannot disagree about which pixels the mask covers.
 *
 * Memoized on the mask, because painting and encoding it is real work and a parent re-render --
 * of which there is one per pointermove while a box is being drawn -- must not redo it.
 */
function Preview({
  result,
  classId,
}: {
  readonly result: WireSegmentResponse;
  readonly classId: number;
}): ReactNode {
  const drawn = useMemo(() => {
    const painted = segmentPixels({ type: "AI", classId, mask: result.mask }, 0.6);
    if (painted === null) return null;

    const canvas = document.createElement("canvas");
    canvas.width = painted.width;
    canvas.height = painted.height;
    const context = canvas.getContext("2d");
    if (context === null) return null;

    const pixels = context.createImageData(painted.width, painted.height);
    pixels.data.set(painted.data);
    context.putImageData(pixels, 0, 0);

    try {
      return { href: canvas.toDataURL(), ...painted };
    } catch {
      // jsdom and a tainted canvas both land here. A preview that cannot be drawn is a preview
      // that is not shown, not an exception thrown at the user mid-gesture.
      return null;
    }
  }, [classId, result.mask]);

  if (drawn === null) return null;

  return (
    <image
      data-testid="ai-preview"
      href={drawn.href}
      x={drawn.x}
      y={drawn.y}
      width={drawn.width}
      height={drawn.height}
    />
  );
}
