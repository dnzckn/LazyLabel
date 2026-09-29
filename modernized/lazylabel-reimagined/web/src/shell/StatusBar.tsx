/**
 * Legacy's messages, and continuous state: what is open, whether it is saved, what the server can do.
 *
 * MESSAGES SHOW HERE, as in legacy: its NotificationManager puts every message in the status bar's
 * centre label on a 3, 5 or 8 second timer, blank at rest (L ui/managers/notification_manager.py:
 * 11-74; L ui/widgets/status_bar.py:119-128, 159-232). The web showed them in a stack of banners of
 * its own until CP-64. The summary of the open image sits right of it, in legacy's permanent label
 * (130-136), which legacy never writes to.
 *
 * THE DEVICE IS THE SERVER'S. Legacy asks `torch.cuda.is_available()` in the same process as the
 * window, so its answer is about the machine the user is sitting at. Here the model runs somewhere
 * the user cannot see, which makes the question more worth answering, not less: "why does every
 * click take four seconds" is otherwise unanswerable to the person experiencing it.
 */

import type { ReactNode } from "react";

import { NotificationHost, useOptionalNotifications } from "../notifications/NotificationProvider.jsx";
import { summarize, type ImageState } from "../workspace/saveState.js";

export interface Health {
  readonly dataset: string;
  readonly database: string;
  readonly ai: {
    readonly available: boolean;
    readonly reason: string | null;
    readonly videoCapable: boolean;
    readonly accelerator: string;
  };
}

export interface StatusBarProps {
  readonly image: ImageState | null;
  /**
   * Whether a crop is in force on the open image.
   *
   * Here rather than only in the Crop panel because it is continuous state with a destructive
   * consequence — a crop blanks everything outside it on save, and the exported files keep their
   * full size so nothing about them looks cropped afterwards. The panel starts collapsed.
   */
  readonly cropped?: boolean;
  /** Null while health is still being fetched. */
  readonly health: Health | null;
  /**
   * Why the health check failed, when it did.
   *
   * Separate from `health: null` because the two look identical from here and mean opposite
   * things. Without it the bar reads "Checking the server…" forever after a failure -- which is
   * not merely unhelpful, it is a lie that gets more wrong the longer it is shown.
   */
  readonly healthError?: string | null;
  /**
   * What pressing the toggle would switch to, and how to do it. Omitted where there is nothing to
   * change.
   *
   * The TARGET rather than the current theme, because "system" has no answer to "what does this
   * button do" without knowing the operating system's preference — and that belongs with the
   * theme logic, not in a status bar.
   */
  readonly theme?: { readonly switchesTo: "dark" | "light"; readonly onToggle: () => void };
}

export function StatusBar({
  image,
  cropped = false,
  health,
  healthError,
  theme,
}: StatusBarProps): ReactNode {
  const ai = health === null ? null : describeAi(health.ai);
  const message = useOptionalNotifications()?.current ?? null;
  return (
    <footer className="status-bar" aria-label="Status">
      {/* Far left, where legacy puts it, and drawn as legacy's pill: the knob shows the theme IN
          FORCE (a moon on the right when dark), which is what a glance at a switch reads. */}
      {theme !== undefined && (
        <button
          type="button"
          className={`theme-toggle theme-toggle--${theme.switchesTo === "light" ? "dark" : "light"}`}
          onClick={theme.onToggle}
          // The label says what pressing it DOES, not what is currently showing. "Dark mode" on a
          // button is ambiguous about which way it goes, and a screen-reader user cannot glance.
          aria-label={`Switch to ${theme.switchesTo} theme`}
        >
          <span className="theme-toggle__knob" aria-hidden="true">
            {theme.switchesTo === "light" ? "☾" : "☀"}
          </span>
        </button>
      )}

      {/* Beside the toggle, the credit legacy's window title carries, "LazyLabel by Deniz N. Cakan
          (version ...)" (main_window.py:648); the browser tab keeps the page's own title. The
          owner, 2026-09-29: "next to the night / day toggle it should say LazyLabel by Deniz N.
          Cakan". */}
      <span className="status-bar__credit">LazyLabel by Deniz N. Cakan</span>

      {/* Legacy's message label: stretched, centred, blank at rest (status_bar.py:119-128). */}
      <span className="status-bar__messages">{message !== null && <NotificationHost />}</span>

      {/* The open image in legacy's permanent label (130-136): green once saved, orange while there
          is unsaved work. */}
      <span className={`status-bar__image${imageTone(image)}`}>{summarize(image, cropped)}</span>

      {healthError != null ? (
        <span className="status-bar__item status-bar__item--error">Server unreachable</span>
      ) : health === null || ai === null ? (
        <span className="status-bar__item">Checking the server…</span>
      ) : (
        <>
          {/* Only mentioned when it is a problem. A status bar that always says "dataset: ok"
              trains the eye to skip the place the word "unreadable" would appear. No folder open
              yet ("none") is not one: the file panel offers Open Image Folder. */}
          {health.dataset === "unreadable" && (
            <span className="status-bar__item status-bar__item--error">
              Dataset folder unreadable
            </span>
          )}

          {health.database !== "ok" && (
            <span className="status-bar__item status-bar__item--warning">
              Settings not saved this session
            </span>
          )}

          {/* Legacy's device label: green on a GPU, grey without one (status_bar.py:234-254). */}
          <span
            className={`status-bar__item status-bar__device${health.ai.available ? " status-bar__item--good" : ""}`}
            {...(ai.title === undefined ? {} : { title: ai.title })}
          >
            {ai.label}
          </span>
        </>
      )}
    </footer>
  );
}

/** The summary's colour: none with no image, then failed, unsaved or saved. */
function imageTone(image: ImageState | null): string {
  if (image === null) return "";
  if (image.provenance === "failed") return " status-bar__image--failed";
  return image.dirty ? " status-bar__image--unsaved" : " status-bar__image--saved";
}

/**
 * What the AI half of the status bar says: legacy's device label, and a tooltip for what it leaves
 * out.
 *
 * The label is one of legacy's three, "GPU: name", "CPU Only" or "No AI" (status_bar.py:234-254),
 * with "Device unknown" for a server that could not ask PyTorch, which legacy never meets. Three
 * facts fail independently here -- whether the model can run at all, what it runs on, and whether it
 * can propagate through a sequence -- so the two the label does not carry are its tooltip:
 *
 * - The reason the tools are off travels from the inference service through the API unflattened,
 *   because "No AI" tells a user to give up and "PyTorch is not installed" tells them what to do.
 *   Legacy says so when an AI action is tried; this said it in the bar until 2026-09-26.
 * - A deployment with SAM 1 only is a working install with no propagation, and a bare device label
 *   there would promise a feature that is not coming.
 */
export function describeAi(ai: Health["ai"]): { readonly label: string; readonly title?: string } {
  if (!ai.available) return { label: "No AI", title: ai.reason ?? "AI tools unavailable" };

  // The service reports a GPU's own name, or "GPU" when the device gave none (availability.py).
  const label =
    ai.accelerator === "unknown"
      ? "Device unknown"
      : ai.accelerator === "CPU"
        ? "CPU Only"
        : ai.accelerator === "GPU"
          ? "GPU"
          : `GPU: ${ai.accelerator}`;
  return ai.videoCapable ? { label } : { label, title: "Propagation unavailable" };
}
