/**
 * A modal dialog: the hotkey editor's home, because it did not fit anywhere else.
 *
 * Legacy's hotkey dialog is 800 by 600. The editor first went into the settings panel, a column
 * 254 pixels wide, and its table needed 545 -- measured in the browser on 2026-09-23 -- so it ran
 * across the canvas. A dialog gives it the room legacy gave it.
 *
 * NOT the native `<dialog>`, though it would trap focus for free: jsdom implements neither
 * `showModal` nor `close`, and every test that opens the hotkeys would fail on the call. What the
 * native element provides is done here by hand, and each piece is there for a reason:
 *
 * - Rendered into `document.body`, so the page behind can be made `inert` by its owner without
 *   taking the dialog with it. Inert is what stops Tab from walking out into the page.
 * - Every keystroke inside is kept from the page's hotkey dispatcher. With the editor open, V
 *   pressed on the Close button must not delete the selected segments behind it.
 * - Escape closes -- unless something inside consumed it first, as the key editor does when
 *   Escape cancels a capture. Cancelling one key should not throw away the whole dialog.
 * - Focus moves in on open and returns to whatever opened it on close.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface DialogProps {
  /** Announced as the dialog's name. */
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /**
   * False when the content draws its own Close in a button row of its own. Legacy's hotkey dialog
   * has Reset to Defaults and Close on one row (`hotkey_dialog.py:182-206`). Escape still closes.
   */
  readonly closeButton?: boolean;
  /**
   * True when the dialog makes the page behind it inert ITSELF, for an owner deep in the page that
   * has no hold on the page's root -- the Rescale section's histogram dialog, which legacy opens
   * modal (`main_window.py:2807`, `dialog.exec()`). Everything else in `document.body` goes inert
   * while it is open and comes back as it was when it closes.
   */
  readonly modal?: boolean;
}

export function Dialog({ title, onClose, children, closeButton = true, modal = false }: DialogProps): ReactNode {
  const box = useRef<HTMLDivElement>(null);

  // Read during the FIRST RENDER, not in the effect. The page goes inert in the same commit that
  // mounts this, and inert blurs whatever inside it had focus -- so by the time an effect runs, the
  // button that opened the dialog has already lost focus to the body, and focus "returned" there.
  // Found in the browser on 2026-09-23; jsdom does not implement inert, so no test here could.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  // Declared BEFORE the focus effect, so on close the page is given back before focus returns to the
  // opener in it: an inert element cannot take focus.
  useEffect(() => {
    if (!modal) return undefined;
    const own = box.current?.closest(".dialog-backdrop") ?? null;
    const behind = [...document.body.children].filter((element) => element !== own && !element.hasAttribute("inert"));
    for (const element of behind) element.setAttribute("inert", "");
    return () => {
      for (const element of behind) element.removeAttribute("inert");
    };
  }, [modal]);

  useEffect(() => {
    box.current?.focus();
    return () => opener?.focus();
  }, [opener]);

  return createPortal(
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="dialog"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") onClose();
        }}
      >
        {children}
        {closeButton && (
          <div className="dialog__actions">
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
