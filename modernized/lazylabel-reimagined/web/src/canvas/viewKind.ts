/**
 * Which of legacy's two views the canvas is drawn in.
 *
 * Legacy answers the mouse with two different handlers: the single view's
 * (`ui/handlers/single_view_mouse_handler.py`), which its Sequence tab uses too
 * (`ui/main_window.py:1116-1131`), and the Multi tab's own (`ui/main_window.py:5406-5583`). They
 * disagree about the AI tool's gestures, so a layer that follows legacy asks which one it is in.
 *
 * The split view says "multi" around the view it draws in its active half. Everywhere else is
 * "single", the default.
 */

import { createContext } from "react";

export type ViewKind = "single" | "multi";

export const ViewKindContext = createContext<ViewKind>("single");
