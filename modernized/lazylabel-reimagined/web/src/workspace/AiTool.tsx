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
 * each viewer's preview that viewer's own segment (ai_segment_manager.py:301-403). The other image
 * is encoded once, after this one, and asked through the same route with its own handle.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { decodeMask, encodeMask, type WireSegment } from "@lazylabel/contracts";

import { AiLayer } from "../canvas/AiLayer.jsx";
import { segmentPixels } from "../canvas/AnnotationCanvas.jsx";
import type { Rgb } from "../canvas/classColor.js";
import { ViewKindContext, type ViewKind } from "../canvas/viewKind.js";
import { filterFragments } from "../tools/fragments.js";
import { SETTLE_MS, prefetchOrder } from "./prefetch.js";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import {
  NOTHING_PLACED,
  NOTHING_TO_ACCEPT,
  NOTHING_TO_ERASE,
  NO_SEGMENTS_TO_ERASE,
  asked,
  type AiPrompt,
} from "../tools/ai.js";
import type { ApiClient, WireSegmentRequest, WireSegmentResponse } from "../api/client.js";
import type { BinaryMask } from "@lazylabel/annotation-formats";
import { epsilonFactorFor, maskToPolygon } from "../tools/autoPolygon.js";
import { PairAiContext, outsideOf, type PairAi } from "../split/pairAi.js";
import { PairPressContext, type HandedPress } from "../split/pairPress.js";
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
  /** The Multi tab draws the preview fainter than the single view does. */
  const view = useContext(ViewKindContext);
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
  /** The prompt that prediction answered: a box's accept says so (ai_segment_manager.py:293-299). */
  const answered = useRef<AiPrompt | null>(null);
  /**
   * Whether that prediction was asked by DRAWING a box, which legacy words as its own when it is
   * ready (main_window.py:2269-2271); a click after a box asks with the box still in the prompt,
   * and legacy's words for it are a point's (ai_segment_manager.py:515). A drawn box is a new one.
   */
  const [drewBox, setDrewBox] = useState(false);
  const lastBox = useRef<AiPrompt["box"]>(null);

  // One encode per image. Cleared when the image changes so a handle cannot outlive its pixels.
  const viewKey = operateOnView === undefined ? "" : JSON.stringify(operateOnView);
  /** Whether this image's encode has answered, either way, since it was asked for. */
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHandle(null);
    setResult(null);
    setEncoding(true);
    setSettled(false);

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
        setSettled(true);
        encoded.current.add(imageKey);
        // Only a COLD encode is worth a message: one on every image would be noise, and the whole
        // point of the cache is that the user does not wait.
        if (!response.cached) notify({ severity: "info", message: "Image ready for AI prompts" });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setEncoding(false);
        setSettled(true);
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
   * THE OTHER IMAGE OF THE PAIR, encoded once, AFTER this one: the click the user is waiting on is
   * answered here first, and on one GPU the two encodes are one queue. Legacy loads each viewer's
   * image into that viewer's own model (sam_multi_view_manager.py:192-252). Its view is its own --
   * the same adjustments, the other half's processing -- as that half is drawn. Unlinked too, since
   * 2026-09-27: a prompt the other image still waits on is asked of it here (below), and a press
   * there finds it ready.
   */
  const otherKey = pair?.other.key ?? null;
  const otherName = pair?.other.name ?? "";
  const otherProcessing = pair === null ? "" : processingParams(pair.other.processing);
  const adjustmentsKey = operateOnView === undefined ? "" : JSON.stringify(operateOnView.adjustments);
  const [otherHandle, setOtherHandle] = useState<string | null>(null);
  const [otherEncoding, setOtherEncoding] = useState(false);
  const [otherSettled, setOtherSettled] = useState(false);
  const ready = handle !== null;

  useEffect(() => {
    setOtherHandle(null);
    setOtherSettled(false);
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
        setOtherSettled(true);
        encoded.current.add(otherKey);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setOtherEncoding(false);
        setOtherSettled(true);
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
        .segment(requestFor(sideHandle, asked(prompt, view)))
        .then((response) => {
          held.answer(side, ticket, response);
        })
        .catch((cause: unknown) => {
          if (!held.answer(side, ticket, null)) return;
          const reason = cause instanceof Error ? cause.message : String(cause);
          notify({ severity: "error", message: "AI prediction failed", detail: `${name}: ${reason}` });
        });
    },
    [client, notify, view],
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

      // An image still being loaded into its model is asked once it is (below), as legacy's Multi
      // view loads a viewer's image first and then predicts (main_window.py:6794-6797). The single
      // view refuses instead, as legacy's does (ai_segment_manager.py:425-427).
      held.queue(held.active, null);
      if (handle === null) {
        held.answer(held.active, held.ask(held.active), null);
        if (encoding) held.queue(held.active, prompt);
        else waiting.add(UNAVAILABLE);
      } else {
        askSide(held, held.active, handle, prompt, imageKey);
      }

      const other = held.other;
      // What is asked must fit: in the Multi tab a box alone, whatever points lie outside.
      const outside = outsideOf(asked(prompt, view), other);
      held.queue(other.side, null);
      if (outside !== null) {
        held.answer(other.side, held.ask(other.side), null);
        notify({ severity: "warning", message: outside });
      } else if (otherHandle === null) {
        held.answer(other.side, held.ask(other.side), null);
        // Its encode starts once this image's has landed, so it waits for this one's too.
        if (otherEncoding || (encoding && handle === null)) held.queue(other.side, prompt);
        else waiting.add(UNAVAILABLE);
      } else {
        askSide(held, other.side, otherHandle, prompt, other.name);
      }

      for (const message of waiting) notify({ severity: "info", message });
    },
    [askSide, encoding, handle, imageKey, notify, otherEncoding, otherHandle, view],
  );

  /**
   * AN UNLINKED PAIR'S PROMPT IS ASKED OF THE IMAGE IT WAS PLACED ON, and of its model alone, as
   * legacy's unlinked click and box go to the active viewer only (main_window.py:6664-6675,
   * 6696-6704; multi_view_coordinator.py:197-206). Placed while that image is still being loaded
   * into its model, it is asked once it is, as a linked prompt is.
   */
  const promptOne = useCallback(
    (held: PairAi, prompt: AiPrompt) => {
      held.queue(held.active, null);
      if (handle !== null) {
        askSide(held, held.active, handle, prompt, imageKey);
        return;
      }
      held.answer(held.active, held.ask(held.active), null);
      if (encoding) held.queue(held.active, prompt);
      else notify({ severity: "info", message: UNAVAILABLE });
    },
    [askSide, encoding, handle, imageKey, notify],
  );

  /*
   * A PROMPT PLACED WHILE THE OTHER IMAGE WAS STILL BEING ENCODED is asked of it once its encode
   * lands. Legacy's linked prediction loads a viewer's image first when it must, then predicts, so
   * both images get a mask (sam_multi_view_manager.py:272-284; main_window.py:6668-6675,
   * 6778-6804). Here the other image answered nothing until 2026-09-27, and Space took one image's
   * mask. Only the latest prompt, and only while it is still that image's: a clear or an accept in
   * the meantime drops it. The pair holds it, so a prompt placed on this half before the view moved
   * here is asked too: unlinked, the image it was placed on is the other one now.
   */
  useEffect(() => {
    if (pair === null || !otherSettled) return;
    const queued = pair.dequeue(pair.other.side);
    if (queued !== null && otherHandle !== null) askSide(pair, pair.other.side, otherHandle, queued, pair.other.name);
  }, [askSide, otherHandle, otherSettled, pair]);

  // The same for THIS image, when the prompt came while it was still being encoded (2026-09-27: a
  // click at once on a fresh pair was drawn in both halves and asked of neither).
  useEffect(() => {
    if (pair === null || !settled) return;
    const queued = pair.dequeue(pair.active);
    if (queued !== null && handle !== null) askSide(pair, pair.active, handle, queued, imageKey);
  }, [askSide, handle, imageKey, pair, settled]);

  const onPrompt = useCallback(
    (prompt: AiPrompt) => {
      if (pair !== null) {
        if (pair.linked) promptBoth(pair, prompt);
        else promptOne(pair, prompt);
        return;
      }

      const boxDrawn = prompt.box !== null && prompt.box !== lastBox.current;
      lastBox.current = prompt.box;

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
        // The Multi tab's box alone, even with one image open there (`asked`).
        .segment(requestFor(handle, asked(prompt, view)))
        .then((response) => {
          // Out of order: a later prompt has already answered, and showing this one would move the
          // preview backwards as the user refines it.
          if (mine !== latest.current) return;
          answered.current = prompt;
          setDrewBox(boxDrawn);
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
    [client, encoding, handle, notify, pair, promptBoth, promptOne, view],
  );

  /**
   * SPACE IN A LINKED PAIR: each image's own prediction becomes that image's own annotation, as
   * legacy's `_accept_multi_view` does for each target viewer (ai_segment_manager.py:301-403): the
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
      /** Smaller pieces each image's polygon left out, said after legacy's words. */
      const pieces: number[] = [];

      for (const side of [held.active, held.other.side]) {
        const answer = results[side];
        if (answer === null) continue;
        predicted = true;
        const filtered = filterFragments(decodeMask(answer.mask), fragmentThreshold);
        if (filtered.kept === 0) continue;
        dropped += filtered.dropped;
        holesFilled ||= filtered.holesFilled;
        if (asEraser) {
          bySide[side] = { type: "AI", classId, mask: encodeMask(filtered.mask) };
        } else {
          const converted = asPolygonIfAsked(filtered.mask, classId, autoPolygon);
          bySide[side] = converted.segment;
          if (converted.dropped > 0) pieces.push(converted.dropped);
        }
      }
      held.clear();

      if (bySide[0] === null && bySide[1] === null) {
        // Legacy's words for each case: a warning when the fragment filter took everything, else its
        // plain message (ai_segment_manager.py:163-165, 399-403).
        if (predicted) notify({ severity: "warning", message: "All segments filtered out by fragment threshold" });
        else notify({ severity: "info", message: asEraser ? NO_SEGMENTS_TO_ERASE : NOTHING_TO_ACCEPT });
        return;
      }

      if (asEraser) {
        if (onEraseEach !== undefined) onEraseEach(bySide);
        else if (bySide[held.active] !== null) onErase(bySide[held.active]!);
      } else {
        if (onAcceptEach !== undefined) onAcceptEach(bySide);
        else if (bySide[held.active] !== null) onAccept(bySide[held.active]!);
        // Legacy's success, counting the images given a segment (ai_segment_manager.py:390-398). It
        // said nothing until 2026-09-27, found on the real stack.
        const saved = bySide.filter((segment) => segment !== null).length;
        notify({ severity: "success", message: `Saved predictions to ${saved} viewer(s)` });
        for (const count of pieces) notify({ severity: "info", message: largestPiece(count) });
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
      if (pair !== null && pair.linked) {
        acceptEach(pair, asEraser);
        return;
      }

      /*
       * UNLINKED IN THE MULTI TAB, the image being edited is accepted alone, into itself, and then
       * BOTH images' prompts and previews go: legacy's `_accept_multi_view` takes the active viewer's
       * preview only and clears every viewer after (ai_segment_manager.py:314-336, 387-388;
       * main_window.py:6901-6920). Otherwise, as the single view accepts.
       */
      const result = pair === null ? current.current : pair.resultsNow()[pair.active];
      /** Whether that prediction answered a box, whose accept legacy words as a success. */
      const fromBox = pair === null && answered.current?.box != null;
      pair?.clear();
      if (result === null) {
        // Legacy's plain message for each (ai_segment_manager.py:123-128, 399-403).
        const nothing = asEraser ? (pair !== null ? NO_SEGMENTS_TO_ERASE : NOTHING_TO_ERASE) : NOTHING_TO_ACCEPT;
        notify({ severity: "info", message: nothing });
        return;
      }

      const filtered = filterFragments(decodeMask(result.mask), fragmentThreshold);

      if (filtered.kept === 0) {
        // Legacy's words (ai_segment_manager.py:163-165): every piece was under the threshold.
        notify({ severity: "warning", message: "All segments filtered out by fragment threshold" });
        setResult(null);
        return;
      }

      // Shift+Space erases with the MASK, Auto-Convert or not, as legacy's does: the conversion is
      // for what is added (ai_segment_manager.py:137-142, 175-180, 241-299). The eraser went through
      // it until 2026-09-27, and the view, which erases with masks only, dropped the polygon.
      if (asEraser) {
        onErase({ type: "AI", classId, mask: encodeMask(filtered.mask) });
      } else {
        const converted = asPolygonIfAsked(filtered.mask, classId, autoPolygon);
        onAccept(converted.segment);
        // Legacy's words, which it said after every accept and the web did not until 2026-09-27,
        // found on the real stack: the Multi tab's success, a box's, or a point prompt's plain one
        // (ai_segment_manager.py:293-299, 390-398). "polygon" when Auto-Convert made one, else
        // "AI", the mask it falls back to as legacy does (main_window.py:1808-1829).
        const kind = converted.segment.type === "Polygon" ? "polygon" : "AI";
        if (pair !== null) notify({ severity: "success", message: "Saved predictions to 1 viewer(s)" });
        else if (fromBox) notify({ severity: "success", message: `AI bounding box segment saved as ${kind}!` });
        else notify({ severity: "info", message: `Segment saved as ${kind}` });
        if (converted.dropped > 0) notify({ severity: "info", message: largestPiece(converted.dropped) });
      }

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

  // A linked pair's prediction is waiting when either image has one; an unlinked pair's, when the
  // image being edited has one, as Space accepts that one alone.
  const waiting =
    pair === null
      ? own !== null
      : pair.linked
        ? pair.results.some((answer) => answer !== null)
        : pair.results[pair.active] !== null;

  /*
   * A PRESS MADE ON THIS HALF OF THE MULTI TAB WHILE THE OTHER WAS EDITED (`split/pairPress.ts`),
   * kept until this image -- and, linked, the other -- has been loaded into its model, then settled
   * as if made here. The view has just moved here, so neither encode has answered yet. Legacy's
   * press waits the same way: its prediction loads the viewer's image first when it must
   * (main_window.py:6794-6797). Kept, not refused as a click on an image being prepared is,
   * because it was made before this half could have said it was loading.
   */
  const handedNow = useContext(PairPressContext);
  const [handed, setHanded] = useState<HandedPress | null>(null);
  useEffect(() => {
    if (handedNow !== null && handedNow.tool === "ai") setHanded(handedNow);
  }, [handedNow]);
  // Unlinked, the press is this image's alone, so only its encode is waited for.
  const canAsk = settled && (pair === null || !pair.linked || handle === null || otherSettled);

  return (
    <>
      <AiLayer
        width={width}
        height={height}
        onPrompt={onPrompt}
        onAccept={accept}
        // Space with nothing placed is legacy's plain message, not a warning (ai_segment_manager.py:
        // 123-128, 399-403); the other refusals are the web's own warnings.
        onRefused={(reason) => notify({ severity: NOTHING_PLACED.has(reason) ? "info" : "warning", message: reason })}
        onClear={onClear}
        preview={result === null ? undefined : <AiPreview result={result} view={view} />}
        {...(handed !== null && canAsk ? { handed } : {})}
      />
      {/* Legacy's status line while the image is encoded (sam_single_view_manager.py:278). */}
      {(encoding || otherEncoding) && (
        <p role="status" className="banner">
          Loading image into AI model...
        </p>
      )}

      {/* RULE-062's message that a prediction is waiting, in legacy's words for each: "Press
          spacebar to accept AI segment suggestion" for a point prompt's (ai_segment_manager.py:
          515), and "AI bounding box preview ready - press Space to confirm!" for a drawn box's
          (main_window.py:2269-2271). The Multi tab says the first for a box and nothing for points
          (main_window.py:6721-6722, 6778-6804); here it says the first for both. Legacy's is a
          three-second status-bar notice; this stays while the prediction waits, because the user
          needs to know one is waiting whichever way they asked for it, and the canvas cannot say
          so where the preview fails to paint. Until 2026-09-27 this comment had legacy's two the
          wrong way round, and a box's preview was given the point's words. */}
      {waiting && (
        <p role="status" className="banner">
          {pair === null && drewBox
            ? "AI bounding box preview ready - press Space to confirm!"
            : "Press spacebar to accept AI segment suggestion"}
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
 * An AI suggestion not yet accepted is legacy's yellow, whatever the class, with no outline: a
 * point prompt's (ai_segment_manager.py:511), a box's (main_window.py:2265) and the Multi tab's
 * (main_window.py:6824).
 */
export const PREVIEW_YELLOW: Rgb = { r: 255, g: 255, b: 0 };

/**
 * Its alpha: `mask_to_pixmap`'s default of 150 in the single view, which the Sequence tab shares
 * (utils.py:5, ai_segment_manager.py:511), and 128 in the Multi tab (main_window.py:6825).
 */
export const PREVIEW_OPACITY: Readonly<Record<ViewKind, number>> = { single: 150 / 255, multi: 128 / 255 };

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
  view,
}: {
  readonly result: WireSegmentResponse;
  /** Which of legacy's views this is drawn in: the Multi tab's preview is fainter. */
  readonly view: ViewKind;
}): ReactNode {
  const drawn = useMemo(() => {
    // The class plays no part: the colour is given.
    const painted = segmentPixels({ type: "AI", classId: 0, mask: result.mask }, PREVIEW_OPACITY[view], PREVIEW_YELLOW);
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
  }, [result.mask, view]);

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
 * on and drew a sliver that approximates to a line wants their annotation, not an error. The
 * caller says which it became, in legacy's words ("Segment saved as AI"), because silently getting
 * a mask when you asked for a polygon is the kind of difference nobody notices until they try to
 * drag a corner. `dropped` is how many smaller pieces the polygon left out, for the caller to say
 * after that.
 */
function asPolygonIfAsked(
  mask: BinaryMask,
  classId: number,
  autoPolygon: { readonly enabled: boolean; readonly resolution: number } | undefined,
): { readonly segment: WireSegment; readonly dropped: number } {
  const asMask: WireSegment = { type: "AI", classId, mask: encodeMask(mask) };
  if (autoPolygon?.enabled !== true) return { segment: asMask, dropped: 0 };

  const converted = maskToPolygon(mask, epsilonFactorFor(autoPolygon.resolution));
  if (converted === null) {
    // At this resolution the shape comes out with fewer than three corners; a higher polygon
    // resolution keeps more. Legacy falls back to the mask the same way (main_window.py:1808-1829),
    // and its accept then says "Segment saved as AI" (ai_segment_manager.py:293-299). This said
    // that as a warning of its own until 2026-09-27; the accept says it now, as legacy does.
    return { segment: asMask, dropped: 0 };
  }

  return { segment: { type: "Polygon", classId, vertices: converted.vertices }, dropped: converted.dropped };
}

/**
 * The web's word on a polygon made from the largest piece of a mask with several. Legacy's
 * behaviour, kept and reported rather than silently improved: it converts the largest contour only.
 * A user whose mask had two islands gets one polygon, and should know which. Said after legacy's
 * accept notice, so it is the one left showing.
 */
function largestPiece(dropped: number): string {
  return `Converted the largest piece, dropping ${dropped} smaller one${dropped === 1 ? "" : "s"}`;
}
