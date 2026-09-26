/**
 * What "no paragraphs" means to a test: every run of text a reader meets is short.
 *
 * The owner, 2026-09-26: "on the image settings theres like paragraphs of explanations, remove all
 * this verbosity, have you ever seen a gui with a paragraph there written to it lol, no thats
 * really bad design." Legacy's panels carry short labels and short messages, and put anything
 * longer in a tooltip; so does this app, and these helpers are how the tests hold it to that.
 *
 * A plain module rather than a test file, so the tests that use it do not register its tests twice.
 */

/**
 * The most characters one run of text may have.
 *
 * Legacy's longest line in a panel is the fragment filter's caption, "Filters small AI segments
 * relative to the largest segment" (fragment_threshold_widget.py:60), at 57. Every paragraph the
 * sweep of 2026-09-26 removed was over 100.
 */
export const LIMIT = 60;

/**
 * The runs of text under `root` longer than `LIMIT`, whitespace collapsed.
 *
 * A run is a `<p>` read whole, because one sentence there is often several text nodes; and, for
 * every other element, the text directly inside it. Tooltips are not read: a `title` is where the
 * explanation belongs, as legacy's `setToolTip` is. `allow` names the real messages that may run
 * longer, such as a server's own reason.
 */
export function longTexts(root: Element, allow: readonly RegExp[] = []): string[] {
  const found: string[] = [];
  const check = (text: string): void => {
    const run = text.replace(/\s+/g, " ").trim();
    if (run.length > LIMIT && !allow.some((pattern) => pattern.test(run))) found.push(run);
  };

  for (const paragraph of root.querySelectorAll("p")) check(paragraph.textContent ?? "");
  for (const element of root.querySelectorAll("*")) {
    // Inside a paragraph, it was read whole above.
    if (element.closest("p") !== null) continue;
    check(
      [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join(""),
    );
  }
  return found;
}
