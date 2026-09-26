# Controls and hotkeys: parity with the PyQt6 app

The owner asked on 2026-09-25 whether the web app now matches the PyQt6 app "in looks and hot keys
... across all tabs". `VISUAL_PARITY.md` covered the LOOK and is done. This file covers what the
controls and keys DO. It is the backlog for that, in priority order, and the record of what was
fixed.

## Priority: sequence mode first (the owner, 2026-09-25)

"Ensure that every feature behaves the same way across the two versions, particularly the
serial/time series mode is the premiere feature that needs to work flawlessly."

So sequence-mode parity comes before everything else here. `SEQUENCE_PARITY.md` is its own
end-to-end audit, judged by what the user sees and what is written to disk. Work that file first,
then return to this one. The recorded decisions at the end of this file conflict with "every feature
behaves the same". Each one was put to the owner on 2026-09-25; until they answer, none is reversed.

## How it was made

Three read-only audits of the source on 2026-09-25 compared the two apps control by control and key
by key: hotkeys, the left side, and the right side with the centre tabs, menus and status bar. They
read `legacy/lazylabel/src/lazylabel` (the frozen snapshot, `2a7d5d8`) and
`modernized/lazylabel-reimagined/web/src`.

- **Verified** means someone has read both sides' code for that item and confirmed it. An item
  marked **reported** comes from the audit only. Verify it before fixing it: an audit misreads
  code sometimes, and two of its claims below turned out wrong in the web's own comments.
- **Recorded decisions** are deliberate differences written down elsewhere. They are listed at the
  end and are not work.
- Every fix gets a test that fails without it, and a check in the Browser pane when a user would
  see the change (`running-the-stack-in-the-browser-pane` memory has how).

Paths: **L** = `legacy/lazylabel/src/lazylabel/`, **W** = `modernized/lazylabel-reimagined/web/src/`.

## Priorities

- **P0**: loses or damages work, or crashes.
- **P1**: a key or control does the wrong thing, or nothing, where legacy does something.
- **P2**: a legacy control is missing on the web.
- **P3**: labels, tooltips, text, order.

## P0

| ID | What | Legacy | Web | Status |
|---|---|---|---|---|
| CP-01 | Enter saved over an image whose annotations could not be read, bypassing the check that disables the Write button. | refuses to save a failed load | `workspace/OpenImageView.tsx` `saveNow` | **done** `28c2f37` |
| CP-02 | Ctrl+H threw a ReferenceError with no timeline; before the Sequence tab first opened, Ctrl+H/Ctrl+P reached the browser's history and print dialogs. | L `ui/main_window.py:5040-5059, 4708-4716` | `sequence/TimelinePanel.tsx`, `shell/CentreTabs.tsx`, `hotkeys/HotkeyProvider.tsx` (`useHotkeyFallback`) | **done** `28c2f37` |
| CP-03 | Ctrl+A selects rows hidden by Filter Class, so Ctrl+A then V (or M) deletes or merges classes the user cannot see. Undo recovers. | selects visible rows only: L `ui/managers/segment_table_manager.py:111-116`; the filter drops hidden rows from the selection: `:154-160` | `workspace/SegmentTable.tsx` | **done** 2026-09-25 |
| CP-04 | A legacy `hotkeys.json` with a conflict imports, and then every settings save fails with 422. The editor does not say which pair conflicts. | n/a | settings-schema `src/importLegacy.ts:76-82`; api `src/app.ts` `putSettings`; `hotkeys/HotkeyEditor.tsx` | **done** 2026-09-25: the API refuses only a conflict a save ADDS, and the hotkey editor names any stored pair |
| CP-05 | Capture-phase key listeners act behind a dialog: Esc, Enter or Ctrl+Z on a dialog button clears AI points or finishes or edits a polygon behind it. | modal dialogs block application shortcuts | `canvas/AiLayer.tsx`, `canvas/PolygonLayer.tsx`, `hotkeys/keyEvent.ts` `isInModal` | **done** 2026-09-25 |

## P1

| ID | What | Legacy | Web | Status |
|---|---|---|---|---|
| CP-10 | Class names could not contain a typed space. The field trimmed on every keystroke, and every keystroke was an undo step. | commits once when editing ends: L `ui/right_panel.py:192, 228-240` | `workspace/ClassTable.tsx` `AliasField` | **done** `28c2f37` |
| CP-11 | Sequence keys (G, N, B, H with and without Shift, Ctrl+H, Ctrl+P) acted on the Single and Multi tabs, because the timeline stays mounted. No notices when nothing to step to. | act only in sequence mode; notices: L `ui/main_window.py:4666-4716, 5150-5168` | `sequence/sequenceActive.ts` | **done** `28c2f37` |
| CP-12 | P toggles Auto-Convert in legacy, with the toast "Auto-Convert AI to Polygon: ON/OFF". On the web it converts the masks already on the image. The schema's description still says "Toggle Auto-Convert…". | L `config/hotkeys.py:97-102`, `ui/main_window.py:1007, 1746-1766` | `workspace/OpenImageView.tsx:191-221` | **done** 2026-09-25: P toggles Auto-Convert with legacy's toast; converting the masks already on an image is a button in the AI → Polygon section, a web extra |
| CP-13 | AI mode does nothing, and says nothing, until a model is chosen, and none is chosen by default. The comment at `OpenImageView.tsx:187-188` promises a message that is not there. | works at once with the default "vit_h", loaded lazily: L `ui/managers/mode_manager.py:26-29`, `config/settings.py:40-41` | `workspace/OpenImageView.tsx:336-338`; settings-schema `schema.ts:54` (`ai_model` "") | **done** 2026-09-25: legacy's default (SAM 1 vit_h, else the first usable model) is chosen once when none is; with none usable, a click in AI mode says so |
| CP-14 | Next/previous image walk the raw listing, not the sorted and searched rows the table shows. So does Multi's "Second image" list and the sequence range pickers. | follows the order on screen: L `utils/fast_file_manager.py:1771-1843, 1971-1999` | `dataset/DatasetBrowser.tsx:106` (`onListed(listing.images)`) vs `:220-222`; `shell/App.tsx:139-153` | **done** 2026-09-25 for next/previous image. Multi's "Second image" list and the sequence range pickers still use the listing order: a sort by size or date would put a timeline's frames out of sequence, so those stay as recorded (VP:307-308). |
| CP-15 | A click on a segment row toggles it. In legacy a click replaces the selection, Ctrl+click toggles, Shift+click extends. `SegmentTable.tsx:124` says "as in legacy". | Qt ExtendedSelection: L `ui/right_panel.py:141-153` | `workspace/SegmentTable.tsx:124-128` | **done** 2026-09-25, with CP-03 |
| CP-16 | Edit mode shows handles only when exactly one shape is selected. Legacy shows them on every selected polygon and circle, 200-vertex cap each. R toggles back, and refuses with "No editable shapes selected!" while keeping the mode. The comment at `OpenImageView.tsx:382-383` says legacy refuses several; it does not. | L `ui/managers/edit_mode_manager.py:95-135`, `ui/managers/mode_manager.py:55-112` | `workspace/OpenImageView.tsx:377-395`, `shell/ModeControls.tsx:51-55` | **verified** |
| CP-17 | No mouse-wheel zoom. Legacy zooms 1.25×/0.8× per notch, synced across viewers (part of RULE-033). | L `ui/photo_viewer.py:180-185` | `workspace/OpenImageView.tsx` | **done** 2026-09-25, single view; linked Multi zoom stays with CP-31 |
| CP-18 | Every hotkey is dead while a `<select>` has focus (Filter Class, Second image, and so on) until focus moves. Legacy's window shortcuts still fire with a combo box focused. | Qt window shortcuts | `hotkeys/keyEvent.ts:132` | **done** 2026-09-25: a focused select keeps Up, Down, Home, End, PageUp and PageDown; every other key is a hotkey |
| CP-19 | Left/Right on a focused tab list switches the tab AND changes the image: the dispatcher ignores `defaultPrevented`. | n/a | `shell/Tabs.tsx:31-45`, `hotkeys/HotkeyProvider.tsx:111-128` | **done** 2026-09-25: the tab list stops the keys it uses. Not by skipping `defaultPrevented` in the dispatcher, which would break Enter's finish-then-save chain |
| CP-20 | C (clear points) works only in the AI tool. Legacy also clears polygon vertices, box, circle and crop drags. | L `ui/managers/keyboard_event_manager.py:241-313` | `canvas/PolygonLayer.tsx`, `canvas/ShapeLayer.tsx`, `canvas/CropLayer.tsx` | **done** 2026-09-25 |
| CP-21 | Mid-draft, Ctrl+Shift+Z removes a point: the raw Ctrl+Z checks ignore Shift. Points can never be redone. | redo re-adds points: L `core/undo_redo_manager.py:106-111` | `canvas/AiLayer.tsx`, `canvas/PolygonLayer.tsx` | **done** 2026-09-25: Ctrl+Y and Ctrl+Shift+Z put back what Ctrl+Z took from a draft, and fall through to the app's redo otherwise |
| CP-22 | Enter does not accept a pending AI preview before saving. | L `ui/managers/keyboard_event_manager.py:187-234` | `canvas/AiLayer.tsx` | **done** 2026-09-25 |
| CP-23 | X swaps with the previous class, and only class-table clicks set it. Legacy toggles the most recently used class on and off; adding a segment counts. | L `ui/main_window.py:2712-2738`, `core/segment_manager.py:42, 409-419` | `workspace/WorkspaceProvider.tsx` `toggleActiveClass`/`toggleRecentClass`, `shell/ModeControls.tsx`, `workspace/ClassTable.tsx` | **done** 2026-09-25, with legacy's notices on X and on a class-table click |
| CP-24 | Z restores the last non-zero fragment value only if Z set it to 0; legacy tracks every slider move. Slider to 0, then Z, gives 100. | L `ui/main_window.py:162-166, 1320-1324` | `workspace/FragmentPanel.tsx` | **done** 2026-09-25 |
| CP-25 | WASD pans 64 px × pan_multiplier; legacy pans 10% of the view × pan_multiplier. `p0Coverage.test.ts:58-59` claims the 10% step is built. | L `ui/managers/viewport_manager.py:60-79` | `workspace/OpenImageView.tsx` | **done** 2026-09-25 |
| CP-26 | A right press adds a negative AI point at once in legacy; on the web a right-drag becomes a box. | L `ui/handlers/single_view_mouse_handler.py:137-139` | `canvas/AiLayer.tsx:75, 109`, `tools/ai.ts:70-101` | reported |
| CP-27 | G adds a reference without legacy's image-size check, so the size-mismatch note can never appear. | L `ui/main_window.py:3887-3908, 3936-3979` | `sequence/TimelinePanel.tsx:511`, `sequence/timeline.ts:354-358` | reported |
| CP-28 | Propagate and Find Archetypes are offered with no AI; Find Archetypes cannot be aborted. | hidden or disabled without AI: L `ui/widgets/sequence_widget.py:274-278, 307-311, 825-835`; a second press aborts: `ui/main_window.py:5044-5055` | `shell/App.tsx:337-339`, `sequence/TimelinePanel.tsx` | reported |
| CP-29 | Rescale: "Reset processing" keeps a preset and is disabled when only a preset is set; the two range sliders can cross. | one dual-handle slider; reset clears presets: L `ui/widgets/rescale_widget.py:155-167, 320-328` | `workspace/ChannelPanel.tsx:115-118, 192-213, 334-342` | reported |
| CP-30 | Crop X/Y fields: Enter does nothing, and a drawn or clamped crop is not written back into them. | L `ui/widgets/border_crop_widget.py:36-54, 101-102`, `ui/managers/crop_manager.py:147-148` | `workspace/CropPanel.tsx` | **done** 2026-09-25, with legacy's placeholder |
| CP-31 | Multi: legacy's navigation, pan, fit, Ctrl+A (linked), V, M, Esc and Space act on both viewers; the web's on the active side only. Linked selection and alias mirroring are missing. | L `ui/managers/viewport_manager.py:45-50, 89-94`, `ui/main_window.py:1649-1742, 6194-6205` | `split/SplitView.tsx` | reported; partly decision 8 |

## P2: legacy controls missing on the web

| ID | What | Legacy | Status |
|---|---|---|---|
| CP-40 | Propagation range spinboxes (start/end, default the whole timeline) | L `ui/widgets/sequence_widget.py:318-331, 673-677` | reported |
| CP-41 | Timeline zoom and pan (◀ − + ▶ and the wheel), drag to scrub, trim triangles. `VISUAL_PARITY.md` marks the timeline done. | L `ui/widgets/timeline_widget.py:380-420, 460-466, 565-594, 640-681` | reported |
| CP-42 | Review buttons: suggested and flagged counts, Prev/Next Suggested, Prev/Next Flagged (enabled only when there is one), Clear Suggested | L `ui/widgets/sequence_widget.py:281-285, 411-464` | reported |
| CP-43 | Trim: file-name labels, Set Left/Right, Clear Trim; Cut/Keep enabled only with both bounds | L `ui/widgets/sequence_widget.py:469-537` | reported |
| CP-44 | Min Conf histogram dialog with a draggable threshold | L `ui/widgets/confidence_histogram_dialog.py:234-297` | reported |
| CP-45 | Rescale histogram dialog: drag min/max, Linear/Log, Contrast Stretch %, Equalize, CLAHE clip and tile, preview, Apply/Cancel | L `ui/widgets/rescale_histogram_dialog.py:340-479` | reported |
| CP-46 | FFT: an enable checkbox, several frequency thresholds, intensity thresholds | L `ui/widgets/fft_threshold_widget.py:165-251` | reported |
| CP-47 | Channel threshold: a per-channel enable checkbox; markers added by double-click, dragged, removed by right-click | L `ui/widgets/channel_threshold_widget.py:241-357` | reported |
| CP-48 | File list: Refresh, Hide, Show All (N); context menu (copy filename(s), copy path(s), hide); multi-select; drag to reorder; double-click opens; sort by any header, the format columns too | L `utils/fast_file_manager.py` (see the audit lines per item) | reported |
| CP-49 | Model controls: Refresh, Load, Unload, "Current: …" | L `ui/widgets/model_selection_widget.py:124-166`, `ui/main_window.py:1204-1305` | reported |
| CP-50 | AI → Polygon: the resolution slider always shown, with "Simple"/"Detailed" ends; Reset to Default. Application Settings: Reset to Default. Annotation Settings: Reset. | L `ui/control_panel.py:421-456`, `ui/widgets/settings_widget.py:104-110`, `ui/widgets/annotation_settings_widget.py:69-106` | reported |
| CP-51 | Type-in boxes beside the fragment, brightness and saturation sliders | legacy edit boxes | recorded as not built (VP:301-302); reconsider |

## P3: labels, tooltips, text

| ID | What | Status |
|---|---|---|
| CP-60 | Tooltips: nearly every legacy control has one, such as "Switch to Polygon Drawing Mode (2)"; almost no web control does. | reported |
| CP-61 | Export formats read as raw ids with suffixes ("YOLO_DETECTION .txt"); legacy says "YOLO Detection", "NPZ Class Map". | reported |
| CP-62 | Hotkey editor: one flat table of action ids with no category tabs; the "Works" column lists the three mouse gestures as "not yet". No 15 s capture timeout; Tab ends capture; lock keys can be bound; Ctrl+W/T/N and Ctrl+Tab accepted, though a page never receives them. | reported |
| CP-63 | File list columns: "Image" and suffixes in load order, where legacy has Name, NPZ OHE, NPZ CM, YOLO Det, YOLO Seg, COCO, VOC, CreateML, Modified, Size; date and size formats. | reported |
| CP-64 | Status bar: legacy's short-lived messages and "GPU: name" / "CPU Only" / "No AI". | reported; partly recorded (PR:966-968) |
| CP-65 | Labels: Filter Class items "alias: id"; "N/A" for unclassified; "Merge to Class", "Reassign Class IDs", "+ Add Current", "Clear All" disabled with no references, the "Frames: 1, 3 ★" references display; timeline tooltip "Frame i/N, name, Status, Confidence". | reported |
| CP-66 | Platform keys: Qt's "Ctrl" is Cmd on macOS (the web records "Meta"); numpad keys become plain digits; Ctrl+Shift+= does not zoom. | reported |

## Wrong statements to correct when their item is fixed

- `W workspace/OpenImageView.tsx:382-383` says legacy refuses to edit several selected shapes (CP-16).
- `W workspace/SegmentTable.tsx:124` says a row click toggles "as in legacy" (CP-15).
- `PROGRESS.md` says a too-close channel marker snaps where legacy ignores it
  (`L ui/widgets/channel_threshold_widget.py:249-253`, CP-47). Its paragraph on P was corrected
  with CP-12.
- `VISUAL_PARITY.md` marks the timeline done without zoom, scrub or trim marks (CP-41), and says
  the segment row click works "as in legacy" (CP-15).
- `W test/rules/p0Coverage.test.ts:58-59` claimed the 10% pan step was built; corrected with CP-25.

## Recorded decisions (not work)

Pop-out panels (CUTOVER.md "What is lost"); the four-view multi-view setting; auto-save on navigate
(decision 7); Select and Edit not toggling back (PROGRESS.md 1576-1577); Ctrl+Plus/Minus zooming
the image rather than the annotation size (PROGRESS.md 520-521); the crop not carried across images;
the hotkey editor saving each change at once, and clearing the alternate key; Multi's single set of
tables and the active-side-only view (decision 8); the timeline staying mounted, with New timeline
asking first; Min Conf persisted; Browse Models absent (a server has no file picker); the settings
dialog's placement of Operate On View, pixel priority, pan and join.
