/**
 * Continuous state: what is open, whether it is saved, and what the server can do.
 *
 * THE SPLIT FROM NOTIFICATIONS IS THE POINT. Legacy's status bar is both things at once — it shows
 * the device and the ready message, and it is also where `show_message`, `show_error_message` and
 * `show_success_message` put transient notices on 5-, 8- and 3-second timers. That is why the most
 * destructive act in the application announces itself in a widget designed to forget: the
 * announcement and the state share a label, so the announcement inherits the label's habits.
 *
 * Here they are two things. Events go to the notification system and the consequential ones stay
 * until dismissed. State lives here and never expires, because state is not an event — an image is
 * either saved or it is not, and a timer has no opinion about that.
 *
 * THE DEVICE IS THE SERVER'S. Legacy asks `torch.cuda.is_available()` in the same process as the
 * window, so its answer is about the machine the user is sitting at. Here the model runs somewhere
 * the user cannot see, which makes the question more worth answering, not less: "why does every
 * click take four seconds" is otherwise unanswerable to the person experiencing it.
 */

import type { ReactNode } from "react";

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
  return (
    <footer className="status-bar" aria-label="Status">
      {/* Far left, where legacy puts it. */}
      {theme !== undefined && (
        <button
          type="button"
          className="theme-toggle"
          onClick={theme.onToggle}
          // The label says what pressing it DOES, not what is currently showing. "Dark mode" on a
          // button is ambiguous about which way it goes, and a screen-reader user cannot glance.
          aria-label={`Switch to ${theme.switchesTo} theme`}
        >
          {theme.switchesTo === "light" ? "☀" : "☾"}
        </button>
      )}

      <span className="status-bar__image">{summarize(image, cropped)}</span>

      <span className="status-bar__spacer" />

      {healthError != null ? (
        <span className="status-bar__item status-bar__item--error">Server unreachable</span>
      ) : health === null ? (
        <span className="status-bar__item">Checking the server…</span>
      ) : (
        <>
          {/* Only mentioned when it is a problem. A status bar that always says "dataset: ok"
              trains the eye to skip the place the word "unreadable" would appear. */}
          {health.dataset !== "ok" && (
            <span className="status-bar__item status-bar__item--error">
              Dataset folder unreadable
            </span>
          )}

          {health.database !== "ok" && (
            <span className="status-bar__item status-bar__item--warning">
              Settings not saved this session
            </span>
          )}

          <span className="status-bar__item">{describeAi(health.ai)}</span>
        </>
      )}
    </footer>
  );
}

/**
 * What the AI half of the status bar says.
 *
 * Three facts, and they fail independently: whether the model can run at all, what it runs on, and
 * whether it can propagate through a sequence. A deployment with SAM 1 only is a working install
 * with no propagation, and saying "AI ready" there would promise a feature that is not coming.
 */
export function describeAi(ai: Health["ai"]): string {
  if (!ai.available) {
    // The reason travels from the inference service through the API to here, unflattened, because
    // "AI unavailable" tells a user to give up and "PyTorch is not installed" tells them what to do.
    return ai.reason ?? "AI tools unavailable";
  }

  const device = ai.accelerator === "unknown" ? "device unknown" : ai.accelerator;
  return ai.videoCapable ? `AI ready on ${device}` : `AI ready on ${device}, no propagation`;
}
