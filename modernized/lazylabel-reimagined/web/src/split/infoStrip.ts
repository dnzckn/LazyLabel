/**
 * Where the view puts its strip -- the image's name, size, Write button and what its load found --
 * in the Multi tab: under BOTH halves, not under the half being edited.
 *
 * Legacy's two viewers are alike: a bold "Viewer N: name" line over a viewer, and nothing under it
 * (main_window.py:3078-3098). Changing the viewer being edited changes an index and nothing on
 * screen moves (multi_view_coordinator.py:92-103). The strip used to sit under the view in the half
 * being edited only, so that half's picture had a strip's height less than the other's: the two
 * pictures were out of line, and making the other half the one edited moved both under the pointer.
 * Out of the halves, they stay alike whichever is edited.
 *
 * The split view gives the element here; the view draws its strip into it, and in its own column
 * everywhere else (null).
 */

import { createContext } from "react";

export const InfoStripContext = createContext<HTMLElement | null>(null);
