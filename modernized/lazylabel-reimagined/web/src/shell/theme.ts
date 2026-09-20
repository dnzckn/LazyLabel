/**
 * Light or dark, and who decides.
 *
 * Legacy carries two full Qt stylesheets, two palettes and a set of re-coloured SVG icons, because
 * Qt has no cascade to lean on. The browser does, so what is left is one question: does the stored
 * preference apply, or does the operating system's?
 *
 * The answer is not simply "the stored one always wins", and the case that decides it is the
 * degraded one. `dark_mode` defaults to true, so a user whose settings database is unreachable
 * would be handed a dark app on a light desktop and no way to change it — the toggle writes to the
 * same store that is down. Falling back to the system preference there is the difference between
 * a degraded session that is usable and one that is merely dark.
 *
 * So: a preference the user actually chose wins; a DEFAULT they never chose yields to the system.
 */

export type Theme = "dark" | "light" | "system";

export interface ThemeInputs {
  /** False while settings are still loading or could not be read at all. */
  readonly settingsAvailable: boolean;
  /** The stored `dark_mode` value, whatever it is. */
  readonly darkMode: unknown;
}

/**
 * Which theme applies.
 *
 * `darkMode` is `unknown` on purpose. It arrives from a settings document that may have been
 * written by hand or by an older version, and a boolean that is actually the string "true" must not
 * be read as truthy-therefore-dark — that is how a settings file gains a value the UI honours and
 * the schema rejects. Anything that is not a real boolean is treated as unset.
 */
export function themeFor({ settingsAvailable, darkMode }: ThemeInputs): Theme {
  if (!settingsAvailable) return "system";
  if (darkMode === true) return "dark";
  if (darkMode === false) return "light";
  return "system";
}

/**
 * Put the answer where CSS can see it.
 *
 * `data-theme` rather than a class, so the stylesheet's `[data-theme="dark"]` rules can beat the
 * `prefers-color-scheme` media query by specificity without `!important`. Removing the attribute
 * hands control back to the media query, which is exactly what "system" means.
 *
 * `color-scheme` is set alongside it, and is not decoration: it is what makes the browser's own
 * furniture — scrollbars, form controls, the canvas behind a transparent page — match. A dark page
 * with light scrollbars is the giveaway that a theme was applied to the author's CSS only.
 */
export function applyTheme(root: HTMLElement, theme: Theme): void {
  if (theme === "system") {
    delete root.dataset["theme"];
    root.style.colorScheme = "light dark";
    return;
  }

  root.dataset["theme"] = theme;
  root.style.colorScheme = theme;
}

/** What the toggle should switch to, given what is showing now. */
export function nextTheme(current: Theme, systemPrefersDark: boolean): "dark" | "light" {
  // From "system", the toggle flips away from whatever the system is currently showing. Flipping to
  // a fixed value instead would make the control do nothing on half of people's machines.
  const showing = current === "system" ? (systemPrefersDark ? "dark" : "light") : current;
  return showing === "dark" ? "light" : "dark";
}
