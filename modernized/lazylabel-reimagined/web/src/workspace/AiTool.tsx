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
 *
 * IN A LINKED PAIR EVERY PROMPT IS ASKED OF BOTH IMAGES, each of its own model, and each image
 * shows its own answer: the Multi tab's reason to exist (`split/pairAi.ts`). Legacy asks each
 * target viewer's model about its own image (main_window.py:6645-6720, 6778-6804), and Space makes
 * each viewer's preview that viewer's own segment (ai_segment_manager.py:301-392). The other image
 * is encoded once, after this one, and asked through the same route with its own handle.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { decodeMask, encodeMask, type WireSegment } from "@lazylabel/contracts";

import { AiLayer } from "../canvas/AiLayer.jsx";
import { segmentPixels } from "../canvas/AnnotationCanvas.jsx";
import { filterFragments } from "../tools/fragments.js";
import { SETTLE_MS, prefetchOrder } from "./prefetch.js";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import { NOTHING_TO_ACCEPT, type AiPrompt } from "../tools/ai.js";
import type { ApiClient, WireSegmentRequest, WireSegmentResponse } from "../api/client.js";
import type { BinaryMask } from "@lazylabel/annotation-formats";
import { epsilonFactorFor, maskToPolygon } from "../tools/autoPolygon.js";
import { PairAiContext, outsideOf, type PairAi } from "../split/pairAi.js";
import { processingParams } from "./processing.js";
import type { SideIndex } from "./WorkspaceProvider.jsx";

/** Each image's own annotation from its own prediction, by side; null where there is none. */
export type BySide = readonly [WireSegment | null, WireSegment | null];

/** Legacy's words for a prompt made while the image is loaded into the model, and for no model. */
const UPDATING = "AI model is updating, please wait...";
const UNAVAILABLE = "AI model not available";

export interface AiToolProps {
  readonly client: ApiClient;
  /** Dataset key of the open image; the service reads the same folder the API does. */
  readonly imageKey: string;
  readonly width: number;
  readonly height: number;
  readonly classId: number;
  /** A manifest model NAME. The service refuses anything not listed. */
  readonly model: string;
  /**
   * The folder in the order the user steps through it — RULE-091's prefetch.
   *
   * A cold SAM encode is seconds, and the first click after navigating to the next image is
   * exactly when a user is least willing to wait for one. Empty means no prefetch, which is what
   * a view with no folder behind it should do.
   */
  readonly folderKeys?: readonly string[];
  /** Frames Find Archetypes suggested. They are encoded ahead of the neighbours (RULE-091). */
  readonly archetypes?: readonly string[];
  /** RULE-027's threshold, from settings. */
  readonly fragmentThreshold: number;
  /**
   * Legacy's Auto-Convert: turn an accepted mask into an editable POLYGON.
   *
   * Worth more than the name suggests. A mask is a field of pixels -- you can erase into it, but
   * you cannot drag a corner. A polygon has vertices the edit tool can move, so this is the
   * difference between an AI result you accept or discard and one you can FIX.
   *
   * Off when absent, which is legacy's default: a conversion approximates, and approximating
   * someone's annotation without being asked is the sort of help that loses a boundary they cared
   * about.
   */
  readonly autoPolygon?: { readonly enabled: boolean; readonly resolution: number };
  /**
   * RULE-089: the view to segment THROUGH, or absent for the original file.
   *
   * Absent rather than neutral when the setting is off, because the two are different requests:
   * neutral would still ask the API to render and post an image, and the rule's default is that
   * no image crosses that wire at all.
   *
   * The PROCESSING chain is part of the view, in the pixels route's query form: legacy's rescale,
   * thresholds and FFT replace the image its adjustments apply to, so its Operate On View segments
   * the processed picture. Until 2026-09-23 only the adjustments were sent.
   *
   * Changing it re-encodes, which the rule says too -- the view is part of the embedding cache key,
   * so a different view is a different encoding rather than a stale one.
   */
  readonly operateOnView?: {
    readonly adjustments: Readonly<Record<string, number>>;
    readonly processing: string;
  };
  readonly onAccept: (segment: WireSegment) => void;
  readonly onErase: (mask: WireSegment) => void;
  /**
   * Space in a linked pair: each image's own annotation, from its own prediction, by side. Either
   * may be null -- no prediction there, or all of it under the fragment threshold -- as legacy
   * skips such a viewer and accepts the other (ai_segment_manager.py:321-336). Both carry this
   * image's class; the store files the other image's under the class of the same NAME there.
   */
  readonly onAcceptEach?: (bySide: BySide) => void;
  /** Shift+Space in a linked pair: each image erased with its own prediction's mask, by side. */
  readonly onEraseEach?: (bySide: BySide) => void;
}

export function AiTool({
  client,
  imageKey,
  width,
  height,
  classId,
  model,
  folderKeys = [],
  archetypes = [],
  fragmentThreshold,
  autoPolygon,
  operateOnView,
  onAccept,
  onErase,
  onAcceptEach,
  onEraseEach,
}: AiToolProps): ReactNode {
  const { notify } = useNotifications();
  const [handle, setHandle] = useState<string | null>(null);
  const [encoding, setEncoding] = useState(false);
  /** The Multi tab's linked pair, whose prompt and answers are held for both images; else null. */
  const pair = useContext(PairAiContext);
  const [own, setResult] = useState<WireSegmentResponse | null>(null);
  /** What this image shows: its own answer, or in a linked pair the pair's answer for it. */
  const result = pair === null ? own : pair.results[pair.active];

  /** Rises with every prompt; an answer with a stale number is thrown away. */
  const latest = useRef(0);

  /**
   * Images this session has had encoded, so the prefetch never asks twice.
   *
   * A ref rather than state: nothing renders from it, and making it state would re-render the
   * whole tool every time a background encode finished.
   */
  const encoded = useRef(new Set<string>());

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
  current.current = own;

  // One encode per image. Cleared when the image changes so a handle cannot outlive its pixels.
  const viewKey = operateOnView === undefined ? "" : JSON.stringify(operateOnView);

  useEffect(() => {
    let cancelled = false;
    setHandle(null);
    setResult(null);
    setEncoding(true);

    client
      .embed({
        image: imageKey,
        model,
        // RULE-089's Operate On View. Sending the view is what makes the API render the picture
        // the user is looking at and post it to the model; omitting it is the rule's default,
        // where the model segments the original file. An empty chain is no processing.
        ...(operateOnView === undefined
          ? {}
          : operateOnView.processing === ""
            ? { adjustments: operateOnView.adjustments }
            : { adjustments: operateOnView.adjustments, processing: operateOnView.processing }),
      })
      .then((response) => {
        if (cancelled) return;
        setHandle(response.handle);
        setEncoding(false);
        encoded.current.add(imageKey);
        // Only a COLD encode is worth a message: one on every image would be noise, and the whole
        // point of the cache is that the user does not wait.
        if (!response.cached) notify({ severity: "info", message: "Image ready for AI prompts" });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setEncoding(false);
        notify({
          severity: "info",
          // Legacy's words and plain 5 s message (sam_single_view_manager.py:346-348), with the
          // service's own reason, unflattened: "AI unavailable" tells a user to give up.
          durationMs: 5_000,
          message: `Error loading AI model: ${cause instanceof Error ? cause.message : String(cause)}`,
        });
      });

    return () => {
      cancelled = true;
    };
    // Keyed on the VALUES, not the object. `operateOnView` is built fresh by the caller on every
    // render, so depending on its identity would re-encode the image continuously -- seconds of
    // model work per keystroke anywhere in the app. Serialising the four numbers means the encode
    // happens when the view actually changes, which is what RULE-089 asks for.
  }, [client, imageKey, model, notify, viewKey]);

  /*
   * THE OTHER IMAGE OF A LINKED PAIR, encoded once, AFTER this one: the click the user is waiting
   * on is answered here first, and on one GPU the two encodes are one queue. Legacy loads each
   * viewer's image into that viewer's own model (sam_multi_view_manager.py:192-252). Its view is
   * its own -- the same adjustments, the other half's processing -- as that half is drawn.
   */
  const otherKey = pair?.other.key ?? null;
  const otherName = pair?.other.name ?? "";
  const otherProcessing = pair === null ? "" : processingParams(pair.other.processing);
  const adjustmentsKey = operateOnView === undefined ? "" : JSON.stringify(operateOnView.adjustments);
  const [otherHandle, setOtherHandle] = useState<string | null>(null);
  const [otherEncoding, setOtherEncoding] = useState(false);
  const ready = handle !== null;

  useEffect(() => {
    setOtherHandle(null);
    if (otherKey === null || !ready) {
      setOtherEncoding(false);
      return undefined;
    }

    let cancelled = false;
    setOtherEncoding(true);
    client
      .embed({
        image: otherKey,
        model,
        ...(operateOnView === undefined
          ? {}
          : otherProcessing === ""
            ? { adjustments: operateOnView.adjustments }
            : { adjustments: operateOnView.adjustments, processing: otherProcessing }),
      })
      .then((response) => {
        if (cancelled) return;
        setOtherHandle(response.handle);
        setOtherEncoding(false);
        encoded.current.add(otherKey);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setOtherEncoding(false);
        notify({
          severity: "error",
          message: `Error loading AI model: ${cause instanceof Error ? cause.message : String(cause)}`,
          detail: otherName,
        });
      });

    return () => {
      cancelled = true;
    };
    // The adjustments by their VALUES, as the encode above keys on them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, model, notify, otherKey, otherName, otherProcessing, ready, adjustmentsKey]);

  /**
   * RULE-091: encode the neighbours before anyone asks for them.
   *
   * Runs AFTER the current image is warm, not alongside it. Racing the prefetch against the encode
   * the user is waiting on would make the thing they asked for slower in order to make a thing
   * they have not asked for faster — and on a single GPU the two are the same queue.
   *
   * One at a time, and re-checked between each: a folder change or a navigation mid-prefetch
   * should abandon what is left rather than finish warming a folder nobody is looking at.
   *
   * FAILURES ARE SILENT HERE, deliberately, and it is the one place in this app where that is
   * right. Nothing was asked for, so nothing was promised; a notification saying an image the user
   * has not opened could not be prepared is noise about a problem they will meet properly, with a
   * real message, if they ever open it.
   */
  useEffect(() => {
    if (handle === null || folderKeys.length === 0) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        for (;;) {
          if (cancelled) return;
          const [next] = prefetchOrder({
            keys: folderKeys,
            current: imageKey,
            archetypes,
            encoded: encoded.current,
          });
          if (next === undefined) return;

          try {
            await client.embed({
              image: next,
              model,
              // The adjustments alone: decision 9 opens every image with no processing, so a
              // neighbour's view, when it is opened, is the adjustments over its own file.
              ...(operateOnView === undefined ? {} : { adjustments: operateOnView.adjustments }),
            });
          } catch {
            // Silent on purpose -- see above. Recorded as done either way, so one unreadable image
            // cannot spin this loop.
          }
          encoded.current.add(next);
        }
      })();
    }, SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `archetypes` and `folderKeys` are read through their JOINED values for the same reason the
    // encode effect keys on the adjustment numbers: a caller building the array fresh each render
    // would restart the prefetch continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, imageKey, model, viewKey, folderKeys.join("\u0000"), archetypes.join("\u0000")]);

  /**
   * One image of a linked pair asked for its own prediction, landing as the pair's answer for it.
   * A failure there shows nothing there, as a legacy viewer whose prediction fails shows nothing
   * new (main_window.py:6798-6804), and says so, naming the image.
   */
  const askSide = useCallback(
    (held: PairAi, side: SideIndex, sideHandle: string, prompt: AiPrompt, name: string) => {
      const ticket = held.ask(side);
      client
        .segment(requestFor(sideHandle, prompt))
        .then((response) => {
          held.answer(side, ticket, response);
        })
        .catch((cause: unknown) => {
          if (!held.answer(side, ticket, null)) return;
          const reason = cause instanceof Error ? cause.message : String(cause);
          notify({ severity: "error", message: "AI prediction failed", detail: `${name}: ${reason}` });
        });
    },
    [client, notify],
  );

  /**
   * THE SAME PROMPT, AT THE SAME PIXELS, ASKED OF EACH IMAGE'S OWN MODEL -- legacy's linked AI
   * click and box (main_window.py:6645-6720). Each image gets its own answer, so the contours
   * follow each image. An image that cannot be asked shows nothing: still encoding, no model, or
   * the prompt outside it (`outsideOf`).
   */
  const promptBoth = useCallback(
    (held: PairAi, prompt: AiPrompt) => {
      const waiting = new Set<string>();

      if (handle === null) {
        held.answer(held.active, held.ask(held.active), null);
        waiting.add(encoding ? UPDATING : UNAVAILABLE);
      } else {
        askSide(held, held.active, handle, prompt, imageKey);
      }

      const other = held.other;
      const outside = outsideOf(prompt, other);
      if (outside !== null) {
        held.answer(other.side, held.ask(other.side), null);
        notify({ severity: "warning", message: outside });
      } else if (otherHandle === null) {
        held.answer(other.side, held.ask(other.side), null);
        waiting.add(otherEncoding ? UPDATING : UNAVAILABLE);
      } else {
        askSide(held, other.side, otherHandle, prompt, other.name);
      }

      for (const message of waiting) notify({ severity: "info", message });
    },
    [askSide, encoding, handle, imageKey, notify, otherEncoding, otherHandle],
  );

  const onPrompt = useCallback(
    (prompt: AiPrompt) => {
      if (pair !== null) {
        promptBoth(pair, prompt);
        return;
      }

      if (handle === null) {
        // A click that lands while the image is still encoding used to be dropped in silence. The
        // banner says the image is being prepared, but a user who clicks anyway -- which is what
        // people do while waiting -- got no mask and no acknowledgement that anything had
        // happened, and could not tell a slow model from a broken one.
        //
        // It is not queued and run later: a mask appearing seconds after a click the user has
        // moved on from is worse than one that never appears. Legacy's words for both
        // (ai_segment_manager.py:425-427; main_window.py:2222).
        notify({ severity: "warning", message: encoding ? UPDATING : UNAVAILABLE, durationMs: 2_000 });
        return;
      }

      latest.current += 1;
      const mine = latest.current;

      client
        .segment(requestFor(handle, prompt))
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
            // Legacy's words (main_window.py:2276), and the service's reason under them.
            message: "AI prediction failed",
            detail: cause instanceof Error ? cause.message : String(cause),
          });
        });
    },
    [client, encoding, handle, notify, pair, promptBoth],
  );

  /**
   * SPACE IN A LINKED PAIR: each image's own prediction becomes that image's own annotation, as
   * legacy's `_accept_multi_view` does for each target viewer (ai_segment_manager.py:301-392): the
   * fragment filter and Auto-Convert apply to each, and an image with nothing left is skipped
   * while the other is kept. Shift+Space erases each image with its own mask (:341-360).
   */
  const acceptEach = useCallback(
    (held: PairAi, asEraser: boolean) => {
      const results = held.resultsNow();
      const bySide: [WireSegment | null, WireSegment | null] = [null, null];
      let predicted = false;
      let dropped = 0;
      let holesFilled = false;

      for (const side of [held.active, held.other.side]) {
        const answer = results[side];
        if (answer === null) continue;
        predicted = true;
        const filtered = filterFragments(decodeMask(answer.mask), fragmentThreshold);
        if (filtered.kept === 0) continue;
        dropped += filtered.dropped;
        holesFilled ||= filtered.holesFilled;
        bySide[side] = asEraser
          ? { type: "AI", classId, mask: encodeMask(filtered.mask) }
          : asPolygonIfAsked(filtered.mask, classId, autoPolygon, notify);
      }
      held.clear();

      if (bySide[0] === null && bySide[1] === null) {
        notify({
          severity: "warning",
          // Legacy's words for each case (ai_segment_manager.py:163-165, 403).
          message: predicted ? "All segments filtered out by fragment threshold" : NOTHING_TO_ACCEPT,
        });
        return;
      }

      if (asEraser) {
        if (onEraseEach !== undefined) onEraseEach(bySide);
        else if (bySide[held.active] !== null) onErase(bySide[held.active]!);
      } else if (onAcceptEach !== undefined) {
        onAcceptEach(bySide);
      } else if (bySide[held.active] !== null) {
        onAccept(bySide[held.active]!);
      }

      if (dropped > 0) {
        notify({ severity: "info", message: `Dropped ${dropped} fragment${dropped === 1 ? "" : "s"}` });
      }
      if (holesFilled) notify({ severity: "warning", message: "Holes inside that mask were filled" });
    },
    [autoPolygon, classId, fragmentThreshold, notify, onAccept, onAcceptEach, onErase, onEraseEach],
  );

  const accept = useCallback(
    (asEraser: boolean) => {
      if (pair !== null) {
        acceptEach(pair, asEraser);
        return;
      }

      const result = current.current;
      if (result === null) {
        // Legacy's plain message (ai_segment_manager.py:128).
        notify({ severity: "info", message: "No AI segment preview to accept" });
        return;
      }

      const filtered = filterFragments(decodeMask(result.mask), fragmentThreshold);

      if (filtered.kept === 0) {
        // Legacy's words (ai_segment_manager.py:163-165): every piece was under the threshold.
        notify({ severity: "warning", message: "All segments filtered out by fragment threshold" });
        setResult(null);
        return;
      }

      const segment = asPolygonIfAsked(filtered.mask, classId, autoPolygon, notify);
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
        // contours, so a ring becomes a disc and interior gaps close; a threshold of 0 keeps them.
        // Legacy changes the shape without saying so. The notice explained all that until the
        // owner asked for messages as short as legacy's (2026-09-26).
        notify({ severity: "warning", message: "Holes inside that mask were filled" });
      }

      setResult(null);
    },
    // No `result`: it is read from the ref above, which is the whole point. Leaving it in would
    // put the stale closure back, one render later.
    [acceptEach, autoPolygon, classId, fragmentThreshold, notify, onAccept, onErase, pair],
  );

  /*
   * ESCAPE TAKES THE PREVIEW WITH THE POINTS, as legacy's does (keyboard_event_manager.py:306-313),
   * and in a linked pair both images' (315-319). It left the mask on screen until 2026-09-27, over
   * a prompt that no longer existed. An answer still in flight is dropped too.
   */
  const onClear = useCallback(() => {
    if (pair !== null) {
      pair.clear();
      return;
    }
    latest.current += 1;
    setResult(null);
  }, [pair]);

  // A linked pair's prediction is waiting when either image has one.
  const waiting = pair === null ? own !== null : pair.results.some((answer) => answer !== null);

  return (
    <>
      <AiLayer
        width={width}
        height={height}
        classId={classId}
        onPrompt={onPrompt}
        onAccept={accept}
        onRefused={(reason) => notify({ severity: "warning", message: reason })}
        onClear={onClear}
        preview={result === null ? undefined : <AiPreview result={result} classId={classId} />}
      />
      {/* Legacy's status line while the image is encoded (sam_single_view_manager.py:278). */}
      {(encoding || otherEncoding) && (
        <p role="status" className="banner">
          Loading image into AI model...
        </p>
      )}

      {/* RULE-062's message, which legacy shows for a box preview and not for a point one. Shown
          for both here, in legacy's words for both (ai_segment_manager.py:515): the user needs to
          know a prediction is waiting whichever way they asked for it, and the canvas cannot say
          so on a machine where the preview fails to paint. */}
      {waiting && (
        <p role="status" className="banner">
          Press spacebar to accept AI segment suggestion
        </p>
      )}
    </>
  );
}

/** The segment request for a prompt: its points, and its box with the corners ordered. */
function requestFor(handle: string, prompt: AiPrompt): WireSegmentRequest {
  return {
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
  };
}

/**
 * The pending mask, drawn as an image over the canvas.
 *
 * Reuses `segmentPixels`, the canvas's own decoder, so a preview and the committed annotation
 * cannot disagree about which pixels the mask covers.
 *
 * Memoized on the mask, because painting and encoding it is real work and a parent re-render --
 * of which there is one per pointermove while a box is being drawn -- must not redo it.
 *
 * Exported for the Multi tab, whose other half draws its own image's answer to a linked prompt.
 * The group is there whenever a mask is, painted or not.
 */
export function AiPreview({
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

  return (
    <g data-testid="ai-mask">
      {drawn !== null && (
        <image
          data-testid="ai-preview"
          href={drawn.href}
          x={drawn.x}
          y={drawn.y}
          width={drawn.width}
          height={drawn.height}
        />
      )}
    </g>
  );
}

/**
 * The segment an accepted mask becomes: a polygon when Auto-Convert asks for one, else the mask.
 *
 * Falls back to the MASK rather than refusing when the conversion cannot produce a polygon. A
 * setting is a preference about form, not a condition on the work: a user who turned Auto-Convert
 * on and drew a sliver that approximates to a line wants their annotation, not an error. It says
 * so, because silently getting a mask when you asked for a polygon is the kind of difference
 * nobody notices until they try to drag a corner.
 */
function asPolygonIfAsked(
  mask: BinaryMask,
  classId: number,
  autoPolygon: { readonly enabled: boolean; readonly resolution: number } | undefined,
  notify: (notification: { severity: "info" | "warning"; message: string; detail?: string }) => void,
): WireSegment {
  const asMask: WireSegment = { type: "AI", classId, mask: encodeMask(mask) };
  if (autoPolygon?.enabled !== true) return asMask;

  const converted = maskToPolygon(mask, epsilonFactorFor(autoPolygon.resolution));
  if (converted === null) {
    // At this resolution the shape comes out with fewer than three corners; a higher polygon
    // resolution keeps more. Legacy falls back to the mask the same way (main_window.py:1808-1829)
    // and says "Segment saved as AI" (ai_segment_manager.py:297-299).
    notify({ severity: "warning", message: "Segment saved as AI" });
    return asMask;
  }

  if (converted.dropped > 0) {
    // Legacy's behaviour, kept and reported rather than silently improved: it converts the largest
    // contour only. A user whose mask had two islands gets one polygon, and should know which.
    notify({
      severity: "info",
      message: `Converted the largest piece, dropping ${converted.dropped} smaller one${
        converted.dropped === 1 ? "" : "s"
      }`,
    });
  }

  return { type: "Polygon", classId, vertices: converted.vertices };
}
