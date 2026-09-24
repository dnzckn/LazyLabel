# Visual parity: the React app follows the PyQt6 app

**The owner's direction, 2026-09-23:** "you should use the pyqt6 version on main to guide visuals on
react". `main` is commit `2a7d5d8`, the same commit as the read-only worktree `legacy/lazylabel`, so
that worktree is the reference.

This file is the plan. Work through §4 in order, highest impact first. After each item, compare
screenshots of both apps and keep the tests green. It was compiled on 2026-09-23 by reading both
codebases; neither app was run for it.

Paths:
- **L** is `legacy/lazylabel/src/lazylabel/` (its `ui/`, `ui/widgets/`, `ui/managers/`, `utils/` and
  `config/`).
- **W** is `modernized/lazylabel-reimagined/web/`.

## 1. Legacy layout

- **Frame:** no menu bar or toolbar.
  - A horizontal splitter with zero margins holds [left | centre tabs | right], above a 25px status
    bar (main_window.py:662-710; status_bar.py:107). The default window is 1600x900
    (settings.py:17-18).
  - The splitter hint is [250,800,350] (main_window.py:703), but the minimum widths win: left 320,
    right 350 (control_panel.py:178-179; right_panel.py:42; main_window.py:769-770).
  - Only the centre stretches (773-775).
- **Left column** (margins and spacing 8; control_panel.py:185-187), top to bottom:
  - "⋯" pop-out (204-209).
  - "Mode Controls" card: two rows of three 90x28 buttons, AI (1) Poly (2) Box (3) / Circle (4)
    Select (E) Edit (R), then a centred ⌨️ "Hotkeys" button (242-338).
  - A centred bold "Settings" label (216-222).
  - Tabs filling the rest, each tab scrolling (224-234, 373-377):
    - **Global:** AI Model Selection, AI Fragment Filter, AI → Polygon Conversion, Application
      Settings (385-471).
    - **Image:** Border Crop, Rescale (collapsed), Channel Threshold, FFT Threshold (collapsed),
      Annotation Settings, Image Adjustments (499-531).
  - An orange notification line at the bottom (237-240).
- **Centre:** tabs Single | Multi | Sequence (main_window.py:673-691, 3252, 3324).
  - **Single:** the viewer alone, no header, the image fitted to the whole viewport, transparent
    background (677-685; photo_viewer.py:26, 42-54, 176-178).
  - **Multi:** two viewers with bold "Viewer N: …" headers, and a 90px centre column holding an
    80px "Linked" toggle (main_window.py:3069-3119). The right column then shows V1|V2 segment and
    class tables (3136-3250, 5988-5992).
  - **Sequence:** a bold header (3274-3276), the viewer with stretch 1 (3281), a row of
    [timeline | green "Save All" 80-100px] (3286-3307), and the sequence controls in a 200-350px
    scroll box (3310-3321).
- **Right column:** "⋯" (right_panel.py:53-58), then a vertical splitter (68) with four panes, then
  a centred status label (88-90):
  1. The "Open Image Folder" button and the file manager (106-124).
  2. "Filter Class:" dropdown; segment table [Segment ID | Class ID | Alias]; [Merge to Class] and
     [Delete] (126-170).
  3. "Class Order:" label; class table [Alias | Class ID]; [Reassign Class IDs] (172-201).
  4. An empty placeholder (80-83).
- **File manager:**
  - Header row: [Search files… | 30px column menu | Refresh | Hide | Show All]
    (fast_file_manager.py:58, 1143-1213).
  - Striped table: Name 200, each format column 80, Modified 120, Size 80 (1299-1314). The default
    columns are Name, NPZ OHE, YOLO Det, Modified and Size (289-301).
  - ✓ marks (465), and a 26px totals footer (1110).

## 2. Legacy theme

The base is PyQtDarkTheme 2.1.0, embedded in legacy (theme_data.py:1-13; the dark stylesheet is
line 18, the light one line 21). LazyLabel's own stylesheet is layered on top (theme.py:215-359).
Dark is the default (settings.py:55), applied at startup (main.py:65-73) and toggled live
(main_window.py:2121-2136).

| Token | Dark | Light |
|---|---|---|
| window background | #202124 | #f8f9fa |
| text | #e4e7eb | #4d5157 |
| border, splitter, table header, input background | #3f4042 | #dadce0 (inputs #f8f9fa) |
| accent: button text, focus, slider, selected tab | #8ab4f7 | #1a73e8 |
| selected item | rgba(66,136,242,.40) | rgba(73,144,237,.35) |
| table | #101012 | #ffffff |
| status bar | #2a2b2e | #dfe1e5 |
| tooltip, menu | #2a2b2f | #ffffff |

### Controls

- **Buttons:** transparent, with accent-coloured text, a 1px border, padding 4px 8px and radius 4.
  Hover tints with the accent at about .11; pressed or checked at about .23.
- **Mode buttons:** bold 11px (theme.py:217-222).
  - Checked, dark: fill rgba(92,143,191,.9), 2px border rgba(122,175,212), white text (255-259).
  - Checked, light: fill rgba(46,109,164,.9), border rgba(74,142,194) (310-314).
- **Auto-Convert toggle, when checked:** purple, rgba(123,94,167,.9) dark or rgba(107,63,160,.9)
  light (266-270, 321-325).
- **Positive buttons (Load, Save All):** green rgba(76,175,80,.85) with border rgba(100,200,104,.9)
  and white bold text; rgba(56,142,60,.9) in light (276-288, 331-343).
- **Mode card:** white at .03 with a white .07 border (black .03 and .08 in light), radius 6,
  margins 8, spacing 6 (theme.py:233-236, 291-294, 346-349; control_panel.py:101-102).
- **Collapsible section header:** a fixed 20px strip, white at .04 (.08 on hover) or black .04 in
  light, radius 3. A flat 16px ▼/▶ toggle at 9pt bold, a 10pt bold title and a 4px gap, with
  **no outer border** (control_panel.py:44-76; theme.py:239-242, 297-302).
- **Tabs:** padding 3px. The selected tab has accent text and a 2px accent underline.
- **Slider:** a 4px groove with an accent fill and a round accent handle of about 16px.
- **Inputs:** background #3f4042, radius 4, padding 3px 4px, accent border on focus.
- **Scrollbars:** 14px.

### Type

No application font is set, so the platform default applies (Segoe UI 9pt on Windows).
- Section titles 10pt bold (control_panel.py:58-61, 217-220); card titles 9pt bold (106-109).
- Status text 9pt; the device label 8pt (status_bar.py:123-142).
- Hints 9-11px (sequence_widget.py:150; fragment_threshold_widget.py:61).

### Status bar

- **Far left:** a 36x20 pill toggle. Track #555/#ccc, knob #1a1a2e/#ffd43b, and a moon glyph in
  #ffd43b or a sun in #666 (status_bar.py:20, 56-76).
- **Centre:** the message, in #ffa500 or #c47600. Errors #ff6b6b/#c62828, success #51cf66/#2e7d32,
  warnings #ffd43b/#b8860b (87-95, 121-128).
- **Right:** a permanent label, then "GPU: name" in #51cf66 or "CPU Only" in #888
  (131-143, 234-254).

### Timeline

- **The bar:** one continuous bar, 30-40px tall, with a 5px margin. Background (50,50,50) dark or
  (215,215,220) light, radius 3 (timeline_widget.py:77-78, 233-237, 294-296).
- **Frame colours:** reference #ffc107, saved #00bcd4, propagated #4caf50, suggested #9c27b0,
  flagged #f44336, skipped #8b4513, pending **#646464 dark / #b9b9be light** (31-40, 316).
- **Marks:** 1px separators, only when a frame is at least 4px wide (313-339). The current frame is
  a #2196f3 triangle above the bar (422-451); trim marks are red triangles (380-420).
- **Control row:** below the bar, ◀ − + ▶ … Clear Flags and Sort; 18px tall, bold 11px (516-611).

### Sequence buttons

Solid colours with black bold text (sequence_widget.py:173-202, 268-305, 517-550, 638-640, 745-747):
- Set Start #4CAF50, Set End #F44336, Build Timeline #2196F3, Find Archetypes #9C27B0.
- Propagate #4CAF50, turning to "Starting…" #FFC107, then Abort #F44336.
- Cut and New Timeline #8B4513; Keep #2E7D32.
- Group boxes: border #555/#bbb, title #CCC/#444 (116-127).

### Tables and canvas

- **Segment and class rows** are filled with the class colour, HSV(h,220,220)
  (segment_table_manager.py:149-152, 354-356).
- **The active class row** is bold, with an orange-diamond prefix (right_panel.py:295-314).
- **File list:** striped rows (white at .03); the selected row rgba(100,100,200,.5); bold headers
  (fast_file_manager.py:1069-1086).
- **Canvas:**
  - Shape fill alpha 70, hover 170 (segment_display_manager.py:436-440).
  - Selection is a yellow (255,255,0,180) fill (515).
  - A polygon being drawn has blue points and cyan lines (polygon_drawing_manager.py:97-157).
  - AI points are pure green and red (ai_segment_manager.py:452).

## 3. The React app on 2026-09-23

- **A centred document, not a window.**
  - `.app` is capped at 62rem with 2rem/1rem padding (styles.css:67-71), under an h1 and a subtitle
    (App.tsx:158-161).
  - The column grid is 12-16rem | 1fr | 14-20rem with a 1.5rem gap (styles.css:281-292), which
    leaves the centre about 368px wide.
  - The canvas is capped at 24rem tall and its scroller at 32rem (228-238, 863-866).
  - A filename heading and a metadata line sit above the image (OpenImageView.tsx:297-311).
  - The status bar is in the page flow, not pinned (styles.css:255-264).
- **Left column:** Drawing tools (radio buttons None/Select/Polygon/Box/Circle/AI/Crop/Pan), AI
  tools, Image adjustments, Rescale and thresholds, Crop, Settings (App.tsx:200-256, 414-426).
- **Right column:** dataset browser, Split view, Sequence, Segments, Classes, What is built
  (270-334).
- **Look:**
  - Light palette #fff/#1a1a1a/#d8d8d8 with accent #1a5fb4; dark palette #1c1c1c/#ececec/#3a3a3a
    with accent #78aeff.
  - system-ui at 16px, with controls at .85rem (styles.css:2-49).
  - Buttons take the body text colour (161-169), and panels are bordered cards (294-330).
- **Tables:** segments are [checkbox | Class | Type] and classes [Class | Name | up/down]. There is
  no class filter, and the active class is not shown.
- **File list:** the open row is not highlighted, because nothing styles its `aria-selected`.
- **Timeline:** wrapping 14x22 buttons with 2px gaps, the current frame only a text-colour border,
  and pending at (128,128,128) (timeline.ts:90).

## 4. Gaps, highest impact first

1. **Full-window frame.**
   - Drop the 62rem cap, the padding, and the visible h1 and subtitle. Keep the h1 visually hidden,
     because App.test.tsx:76 asserts it.
   - `.app` becomes 100vh: the workspace, then a 25px status bar.
   - Columns 320px | 1fr | 350px, each scrolling on its own (main_window.py:662-703, 769-775).
   - Files: styles.css `.app` and `.workspace`, App.tsx:158-161.
2. **The image fills the centre pane.**
   - Fit to the pane, not to 24rem.
   - Move the filename and metadata into the status bar's right label (photo_viewer.py:42-54;
     status_bar.py:131-136).
   - Files: styles.css:228-238, 863-866; OpenImageView.tsx:297-311.
3. **Centre tabs Single | Multi | Sequence.**
   - Move SplitView and TimelinePanel out of the right column (App.tsx:272-302) and lay them out as
     in §1 (main_window.py:3069-3119, 3263-3321).
   - Tests that open "Sequence" as a button need updating: c10.sequenceTimeline.test.tsx:95-96 and
     c11.propagate.test.tsx:155-156.
4. **Palette.**
   - Use the §2 table for both modes, adding tokens for inputs, tables, the status bar and
     selection.
   - Keep the `data-theme` mechanism in theme.ts. File: styles.css:2-49.
5. **Density and buttons.**
   - A 12px base (about 9pt) and 13px bold section titles.
   - Buttons get accent text, padding 4px 8px, radius 4, and accent tints for hover and checked.
   - Add mode, accent and positive button classes from theme.py:215-359. File: styles.css:161-169.
6. **Left column.**
   - A Mode Controls card: a 3x2 grid of 90x28 toggles with legacy's labels, then Hotkeys.
   - A "Settings" label, then Global and Image tabs with legacy's section names and order
     (control_panel.py:204-338, 385-531).
   - Keep the radio semantics by styling the inputs as buttons.
   - The labels change, so test/acceptance/harness.tsx:111 and test/hotkeys/wired.test.tsx:69 need
     updating.
   - Crop moves into Border Crop (control_panel.py:500). Pan and None have no legacy button.
7. **Right column.**
   - In order: file list, segments, then classes (right_panel.py:106-201).
   - Segments: "Filter Class:", columns Segment ID/Class ID/Alias, whole rows in the class colour,
     and Merge to Class/Delete.
   - Classes: "Class Order:", columns Alias/Class ID, rows in the class colour, the active class in
     bold, and Reassign Class IDs.
   - Take "What is built" out of the working UI; App.test.tsx:167-171 needs updating.
8. **Section chrome.**
   - A 20px strip header: the text colour at .04, .08 on hover, radius 3, and no card border.
   - Only the Mode card has a border, radius 6. Files: Panel.tsx, styles.css:294-330.
9. **Status bar.**
   - Pinned at 25px on the legacy background.
   - A pill toggle that keeps its "Switch to …" label, and the device name in green when on the GPU
     (status_bar.py:20-76, 87-143, 234-254).
10. **Timeline.**
    - One gapless 30-40px bar on the §2 background, with a #2196f3 current-frame triangle.
    - A zoom/pan/Clear Flags/Sort row below it.
    - Pending #646464 dark / #b9b9be light.
    - Keep the per-frame aria-labels. Files: styles.css:566-592, timeline.ts:85-93,
      TimelinePanel.tsx:409-443.
11. **File list.** A search box, striped rows, the open row highlighted in rgba(100,100,200,.5), bold
    headers, ✓ marks, and a totals footer.
12. **Slider rows.** A right-aligned 80px label, a 45px editable value, then the slider
    (adjustments_widget.py:41-61). Files: AdjustmentsPanel.tsx:151-153, styles.css:460-477.
13. **Sequence buttons** in the §2 colours. Files: PropagationControl.tsx, TimelinePanel.tsx:445-470.
14. **Canvas.**
    - A yellow selection fill instead of a dashed outline in the class colour.
    - Cyan lines and blue points for a polygon being drawn.
    - Pure green and red AI points.
    - Files: SelectLayer.tsx:97-113, PolygonLayer.tsx:209-237, AiLayer.tsx:245.

## Visual but tied to Qt: do not copy literally

- **Splitter snap-to-collapse and the "⋯" pop-out windows.** Double-click-to-expand is dead code in
  legacy (control_panel.py:680-688).
- **The empty fourth right-hand pane**, and doubled headings where a collapsible section wraps a
  group box of the same name.
- **The active-class emoji**, which legacy writes into the alias text itself. Use a CSS marker
  instead.
- **`secondaryButton` and `negativeButton`**: these style names have no stylesheet rule anywhere,
  so Unload renders as a plain button.
- **Desktop-only controls:** Open Image Folder, Browse Models, and the theme icon files.
- **Status messages that expire on a timer.** React sends events to notifications instead, so take
  only the colours.
- **Fixed pixel sizes.** Treat 90px, 320px and 350px as defaults, and keep React's single-column
  layout for narrow screens.

## The owner's answers, 2026-09-23

- **Default theme:** follow the OS, as React does now (theme.ts:34-39). Adopt legacy's colours,
  not its dark default: when there is no saved preference, the system's light/dark setting decides.
- **Multi-view:** two views are enough. Restyle the existing split view as legacy's Multi tab (two
  viewers with bold headers and the Linked toggle between them). Do not build the 4-view layout.
