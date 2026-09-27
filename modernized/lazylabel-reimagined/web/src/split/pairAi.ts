/**
 * The AI prompt of a linked pair -- what the Multi tab is for.
 *
 * The owner, 2026-09-27: "the point of multi mode is to be able to use AI tool in it and be able to
 * create segments using the same coordinates across both images for prompting the models, yet the
 * contours of the segments can vary slightly".
 *
 * SO WHAT CROSSES BETWEEN THE IMAGES IS THE PROMPT, NOT THE ANSWER. Legacy's linked AI click puts
 * the same point, at the same image pixel, into every target viewer, draws it in each, and asks
 * each viewer's own model about its own image (main_window.py:6645-6675, 6778-6804); a box goes to
 * each the same way (6677-6720). Each viewer shows its own preview, and Space makes each preview
 * that viewer's own segment (ai_segment_manager.py:301-403). Until 2026-09-27 this app copied the
 * accepted MASK into the other image instead, so the two contours were identical by construction
 * and the other image's own pixels never reached a model.
 *
 * ONE PROMPT, TWO ANSWERS. While linked every gesture on either image goes to both, so the two
 * prompts are always the same one, and it is held once; the answers are per image.
 *
 * UNLINKED, EACH IMAGE HAS ITS OWN PROMPT AND ANSWER, since 2026-09-27, as legacy keeps points and
 * a preview per viewer (multi_view_coordinator.py:48-54, 197-206): a gesture goes to the image it is
 * made on and is asked of that image's model alone, the other image's prompt and preview staying in
 * its half. Space accepts the image being edited, and then both prompts go, as legacy clears every
 * viewer after an accept (ai_segment_manager.py:314-336, 387-388; main_window.py:6901-6920). Until
 * then the view's own prompt went with the move to the other half. Unlinking keeps each image's
 * prompt and answer, as legacy's viewers keep theirs; linking two DIFFERENT prompts starts again,
 * as a linked pair has one.
 *
 * HELD BY THE SPLIT VIEW, NOT BY THE VIEW'S TOOL. The interactive view is drawn in whichever half is
 * being edited and remounts when the other is chosen. The prompts and both previews survive that,
 * as legacy's per-viewer points survive a change of active viewer, which changes an index and
 * nothing else (multi_view_coordinator.py:92-103). So does a prompt still waiting for its image's
 * encode, which the view drawn next asks. A different pair, or another tool, starts again.
 */

import { createContext, useCallback, useMemo, useReducer, useRef } from "react";

import type { WireSegmentResponse } from "../api/client.js";
import { EMPTY_PROMPT, type AiPrompt } from "../tools/ai.js";
import type { ImageProcessing } from "../workspace/processing.js";
import type { SideIndex } from "../workspace/WorkspaceProvider.jsx";

/** Each side's own prediction, by side, or null: none asked yet, it failed, or it did not fit. */
export type PairResults = readonly [WireSegmentResponse | null, WireSegmentResponse | null];

/** The image the view is NOT on, as the view's AI tool needs it to ask that image's model. */
export interface PairImage {
  readonly side: SideIndex;
  readonly key: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** Its own processing, for Operate On View: the other half's picture, not this one's. */
  readonly processing: ImageProcessing;
}

export interface PairAi {
  /** The side being edited: the view and its tool are in its half. */
  readonly active: SideIndex;
  readonly other: PairImage;
  /** Whether the pair is linked: one prompt asked of both images, or each image its own. */
  readonly linked: boolean;
  /** The prompt of the image being edited. */
  readonly prompt: AiPrompt;
  /** Each image's prompt, by side. Linked, the pair's one prompt in both. */
  readonly prompts: PairPrompts;
  /** Sets the prompt of the image being edited; linked, of both. */
  readonly setPrompt: (prompt: AiPrompt) => void;
  readonly results: PairResults;
  /** The results as they are now, for a key handler registered before the last render. */
  readonly resultsNow: () => PairResults;
  /** A request is going to one side's model: its ticket, which a later request makes stale. */
  readonly ask: (side: SideIndex) => number;
  /**
   * An answer for one side, or null for none. Kept only if no later request was made for that
   * side, so the preview never moves backwards; returns whether it was kept.
   */
  readonly answer: (side: SideIndex, ticket: number, result: WireSegmentResponse | null) => boolean;
  /**
   * A prompt placed while its image was still being loaded into its model, kept to be asked once
   * that lands -- by whichever view is drawn then, so it outlives the view moving to the other half.
   * Null drops what was kept: a later prompt was asked at once.
   */
  readonly queue: (side: SideIndex, prompt: AiPrompt | null) => void;
  /** The prompt waiting for this side's encode, taken once, and only while it is still its prompt. */
  readonly dequeue: (side: SideIndex) => AiPrompt | null;
  /** Esc, an accept, or anything else that ends the prompt: both images' points and previews go. */
  readonly clear: () => void;
}

/** The pair's AI, while the Multi tab shows a pair and the AI tool is chosen; else null. */
export const PairAiContext = createContext<PairAi | null>(null);

/** What the split view knows when a pair can be prompted. */
export interface Pairing {
  /** Both images' keys and whatever else must start the prompts again when it changes. */
  readonly key: string;
  readonly linked: boolean;
  readonly active: SideIndex;
  readonly other: PairImage;
}

/** Each side's own prompt, by side. */
export type PairPrompts = readonly [AiPrompt, AiPrompt];

interface Held {
  readonly key: string;
  readonly prompts: PairPrompts;
  readonly results: PairResults;
}

const NO_PROMPTS: PairPrompts = [EMPTY_PROMPT, EMPTY_PROMPT];
const NO_RESULTS: PairResults = [null, null];

/**
 * The pair's prompts and answers, or null when there is no pair to prompt.
 *
 * The truth is a ref, and a render is asked for on every change, so that a promise settling after
 * the view has moved to the other half still lands, and a key handler reads the answer on screen.
 */
export function usePairAi(pairing: Pairing | null): PairAi | null {
  const key = pairing === null ? "" : pairing.key;
  const linked = pairing?.linked ?? true;
  const truth = useRef<Held>({ key, prompts: NO_PROMPTS, results: NO_RESULTS });
  const tickets = useRef<[number, number]>([0, 0]);
  const queued = useRef<[AiPrompt | null, AiPrompt | null]>([null, null]);
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  // Another pair, or none, or two different prompts linked: start again, and let nothing still in
  // flight land on it.
  const [first, second] = truth.current.prompts;
  if (truth.current.key !== key || (linked && first !== second)) {
    truth.current = { key, prompts: NO_PROMPTS, results: NO_RESULTS };
    tickets.current = [tickets.current[0] + 1, tickets.current[1] + 1];
    queued.current = [null, null];
  }
  const held = truth.current;

  // Read when a setter is called, so one kept by a key handler acts on the side edited now.
  const now = useRef({ linked, active: pairing?.active ?? 0 });
  now.current = { linked, active: pairing?.active ?? 0 };

  const put = useCallback((next: Held) => {
    truth.current = next;
    rerender();
  }, []);

  const setPrompt = useCallback(
    (prompt: AiPrompt) => {
      const { linked: bothImages, active } = now.current;
      const [a, b] = truth.current.prompts;
      const prompts: PairPrompts = bothImages ? [prompt, prompt] : active === 0 ? [prompt, b] : [a, prompt];
      if (prompts[0] !== a || prompts[1] !== b) put({ ...truth.current, prompts });
    },
    [put],
  );

  const ask = useCallback((side: SideIndex) => {
    tickets.current[side] += 1;
    return tickets.current[side];
  }, []);

  const answer = useCallback(
    (side: SideIndex, ticket: number, result: WireSegmentResponse | null) => {
      if (tickets.current[side] !== ticket) return false;
      const results: [WireSegmentResponse | null, WireSegmentResponse | null] = [...truth.current.results];
      results[side] = result;
      put({ ...truth.current, results });
      return true;
    },
    [put],
  );

  const queue = useCallback((side: SideIndex, prompt: AiPrompt | null) => {
    queued.current[side] = prompt;
  }, []);

  const dequeue = useCallback((side: SideIndex) => {
    const prompt = queued.current[side];
    queued.current[side] = null;
    return prompt !== null && truth.current.prompts[side] === prompt ? prompt : null;
  }, []);

  const clear = useCallback(() => {
    tickets.current = [tickets.current[0] + 1, tickets.current[1] + 1];
    queued.current = [null, null];
    const current = truth.current;
    if (current.prompts === NO_PROMPTS && current.results === NO_RESULTS) return;
    put({ key: current.key, prompts: NO_PROMPTS, results: NO_RESULTS });
  }, [put]);

  const resultsNow = useCallback(() => truth.current.results, []);

  const active = pairing?.active;
  const other = pairing?.other;
  return useMemo(
    () =>
      active === undefined || other === undefined
        ? null
        : {
            active,
            other,
            linked,
            prompt: held.prompts[active],
            prompts: held.prompts,
            setPrompt,
            results: held.results,
            resultsNow,
            ask,
            answer,
            queue,
            dequeue,
            clear,
          },
    [active, answer, ask, clear, dequeue, held, linked, other, queue, resultsNow, setPrompt],
  );
}

/**
 * Why a prompt cannot be asked of an image this size, or null when every point and the box are in
 * it -- the inference service's own bounds (prompts.py:84-97), checked before asking.
 *
 * THE SAME PIXEL, NOT MOVED. Legacy hands the other viewer's model the same pixel even when it lies
 * outside that image (main_window.py:6664-6675, sam_model.py:217-236), and what SAM makes of a
 * point off the picture is whatever it makes. The service here refuses one, so that image is not
 * asked and shows nothing, as a legacy viewer shows nothing when its prediction fails; the image it
 * fits still is. Clamping would put the prompt somewhere the user did not click (`linked.ts`).
 */
export function outsideOf(
  prompt: AiPrompt,
  image: { readonly name: string; readonly width: number; readonly height: number },
): string | null {
  const outside = `The prompt is outside ${image.name}`;
  for (const point of prompt.points) {
    if (point.x < 0 || point.y < 0 || point.x >= image.width || point.y >= image.height) return outside;
  }
  if (prompt.box !== null) {
    const [a, b] = prompt.box;
    if (
      Math.min(a.x, b.x) < 0
      || Math.min(a.y, b.y) < 0
      || Math.max(a.x, b.x) > image.width
      || Math.max(a.y, b.y) > image.height
    ) {
      return outside;
    }
  }
  return null;
}
