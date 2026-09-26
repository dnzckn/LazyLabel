/**
 * Putting text on the clipboard, as legacy's file list does with `QApplication.clipboard()`
 * (fast_file_manager.py:1691-1704).
 *
 * The browser's clipboard API first. It is missing outside a secure context and can be refused, so
 * where it fails the text is copied the older way, from a selected field. Says whether it worked.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused: fall through to the selection copy.
  }
  return copyBySelection(text);
}

function copyBySelection(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.focus();
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
