/**
 * Warning before the tab closes on unsaved work — RULE-054, and decision 7's last gap.
 *
 * `onClose` was written for this, tested, and asked by nothing: the app registered no
 * `beforeunload` handler at all, so closing a tab with unsaved annotations was silent. Legacy is
 * worse — it loses the last-edited image on exit, and the other half of a multi-view pair, and
 * every propagated sequence frame, without ever naming them — but "less bad than legacy" is not
 * the standard decision 7 sets.
 *
 * WHY IT RENDERS NOTHING. There is no UI here to get wrong; the browser owns the dialog. What this
 * component owns is the decision to raise one, and keeping that in a component rather than the
 * provider means the provider does not grow a dependency on `window`.
 *
 * THE BROWSER WILL NOT SHOW OUR SENTENCE, and that is worth saying out loud rather than
 * discovering. Every current browser replaces the page's message with its own generic wording,
 * because sites abused it. So `onClose`'s carefully specific summary — the image names and the
 * segment counts — cannot reach the user HERE. It is still computed, because it is what decides
 * whether to prompt at all, and it is the same sentence the in-app navigation guard shows where
 * the browser does not override it.
 */

import { useEffect, type ReactNode } from "react";

import { useWorkspace } from "./WorkspaceProvider.jsx";
import { onClose, type ImageState } from "./saveState.js";

export interface CloseGuardProps {
  /**
   * How the handler is registered. Injected only so a test can drive it without a real unload,
   * which jsdom cannot perform.
   */
  readonly register?: (handler: (event: BeforeUnloadEvent) => void) => () => void;
}

const defaultRegister = (handler: (event: BeforeUnloadEvent) => void): (() => void) => {
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
};

export function CloseGuard({ register = defaultRegister }: CloseGuardProps): ReactNode {
  const { imageStates } = useWorkspace();

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent): void => {
      const open = imageStates.filter((state): state is ImageState => state !== null);
      if (onClose(open).kind !== "ask") return;

      /*
       * BOTH, because browsers disagree about which one arms the dialog. `preventDefault` is the
       * modern spec; `returnValue` is what older engines check, and setting it is harmless where
       * it is ignored. Doing only one works until someone opens the app in the other browser.
       */
      event.preventDefault();
      event.returnValue = "";
    };

    return register(handler);
  }, [imageStates, register]);

  return null;
}
