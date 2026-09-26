# Sequence mode: behaviour parity with the PyQt6 app

The owner, 2026-09-25: "ensure that every feature behaves the same way across the two versions,
particularly the serial/time series mode is the premiere feature that needs to work flawlessly".
`CONTROL_PARITY.md` asked which controls exist and what the keys do. This file asks, step by step,
what a user sees and does in sequence mode, and what ends up in the files, in the PyQt6 app and in
the React/Node rewrite.

## How it was made

- Compared on 2026-09-25 by reading both sides' code. Nothing was run. Legacy is the read-only
  worktree `legacy/lazylabel` (snapshot `2a7d5d8`). The rewrite is `modernized/lazylabel-reimagined`
  on `main-web`: web app, API and inference service.
- Every claim cites file:line on both sides. A claim that would need a model, a GPU or a browser to
  confirm, and was not run, says **unverified**.
- Steps walked: entering and leaving the tab; choosing the range; building; the timeline widget;
  references; Find Archetypes; propagation; review; saving; trim; New Timeline; the header; the
  hotkeys; no AI; restarts.
- Paths: **L** `legacy/lazylabel/src/lazylabel/`; **W** `modernized/lazylabel-reimagined/web/src/`;
  **WT** `.../web/test/`; **A** `.../api/src/`; **I** `.../inference/src/lazylabel_inference/`;
  **IT** `.../inference/tests/`. Docs in `analysis/lazylabel/`: **BR** `BUSINESS_RULES.md`, **CP**
  `CONTROL_PARITY.md`, **VP** `VISUAL_PARITY.md`, **PR** `PROGRESS.md`, **MB**
  `MODERNIZATION_BRIEF.md`.

**Severities.**
- **S0**: what is written to disk differs, or one app loses work the other keeps. Direction does not
  matter: an S0 where the web is the safer app is still a difference, and the "Recorded" column says
  whether it was chosen.
- **S1**: the same action behaves differently.
- **S2**: a legacy control or indication is missing.
- **S3**: text, labels, colours.

**Recorded** is "yes" with doc:line when a decision document settles the difference, "partly" when
it settles only part, "code comment only" when only a comment in the rewrite argues for it, and
"no" otherwise.

**CONTROL_PARITY items, verified and given SP ids:** CP-11 is SP-56, CP-14 is SP-20, CP-27 is SP-24,
CP-28 is SP-29 and SP-31, CP-40 is SP-46, CP-41 is SP-43 and SP-44, CP-42 is SP-45, CP-43 is SP-44,
CP-44 is SP-47, and CP-60 and CP-65 are SP-49, SP-51 and SP-52. All were confirmed in the code. CP-14's
record is weaker than it says (see Notes).

**Does legacy save the current frame when you move to another frame?** Yes, with Auto-Save on
Navigate at its default of on (L config/settings.py:45). Any move to a different frame writes the
frame being left first. That covers a timeline click, each step of a drag-scrub, N, B or H, the
Prev/Next buttons, and a timeline file chosen in the file list or reached with Left/Right.
- The write goes through the normal save, in every selected format, with the crop, pixel priority
  and class names in force.
- The frame is then marked Saved (cyan) and its propagated masks are dropped from memory.
- A frame with no segments has all seven sidecar formats deleted instead, and keeps its status
  (L ui/main_window.py:3414-3434, 3480-3519; L ui/managers/save_export_manager.py:97-133).
- Building, trimming, Save All, the end of a propagation and leaving the tab never save the open
  frame (BR:925-937, 954-966).

The web never saves on navigation. It asks first when the open image is unsaved (SP-01).

## Counts

| Severity | Total | Recorded: yes | Partly | Code comment only | No |
|---|---|---|---|---|---|
| S0 | 17 | 9 | 1 | 4 | 3 |
| S1 | 23 | 2 | 3 | 1 | 17 |
| S2 | 9 | 0 | 2 | 0 | 7 |
| S3 | 8 | 2 | 1 | 0 | 5 |
| **All** | **57** | **13** | **7** | **5** | **32** |

SP-01's "yes" is contradicted by another record (see Notes).

## Differences, by severity

| ID | Step | Legacy (file:line) | Web (file:line) | Difference | Sev | Recorded? | Suggested fix |
|---|---|---|---|---|---|---|---|
| SP-01 | Saving: moving to another frame | Leaving a frame writes it in every selected format, marks it Saved (cyan) and drops its propagated masks; an empty frame has all 7 sidecar formats deleted and keeps its status (L ui/main_window.py:3414-3434, 3480-3519; L ui/modes/sequence_view_mode.py:365-373; L ui/managers/save_export_manager.py:106-109). This is legacy's way of saving reviewed frames: "Scrub timeline or click 'Save All' to save" (L ui/main_window.py:4631-4634; Save All tooltip 3298-3300). | Never saves on navigation: `saveOnNavigate: false` (W workspace/WorkspaceProvider.tsx:481-488). It asks when the image is unsaved, and a frame opened with propagated masks is unsaved at once (W workspace/WorkspaceProvider.tsx:540-543), so every propagated frame reviewed asks on leaving. Nothing is ever deleted. | Reviewing writes nothing. An edit survives only by Enter, or by answering Cancel at the prompt; OK discards it. A reviewed frame never turns cyan. | S0 | yes: decision 7 (MB:403), CP:111-112, WT rules/p0Coverage.test.ts:78-81, WT settings/honoured.ts:98-102. But BR:980 (RULE-059's answer) and W workspace/saveState.ts:11-13 say auto-save on navigation stays, on by default | Owner to rule between BR:980 and CP:112. BR:980's answer would do it: save a dirty, successfully loaded frame on leaving, never delete, then mark it saved on the timeline and drop it from the run's masks. |
| SP-02 | Review: correcting a propagated frame | After a correction, leaving saves the frame and `mark_frame_saved` drops its stored masks (L ui/modes/sequence_view_mode.py:365-373). A revisit loads the corrected file (L ui/main_window.py:3591-3625), and Save All skips the frame, which has no stored masks left (L ui/main_window.py:4766-4768). | Enter writes the correction (W workspace/OpenImageView.tsx:710-757), but the timeline is never told. The run's masks stay, and a revisit opens them instead of the file (W sequence/TimelinePanel.tsx:395-396, 488-491; W workspace/WorkspaceProvider.tsx:531-532). Save All still counts the frame (W sequence/PropagationControl.tsx:373-374) and writes the original masks over the correction, unconditionally: W sequence/saveAll.ts:147-151 sends no expectedRevisions (A annotations/service.ts:110-115). | Save All overwrites a hand correction with the uncorrected masks. A revisit shows the uncorrected masks as unsaved work, and Enter then writes them back. | S0 | no | **Done 2026-09-25**: a frame saved by the ordinary save since the run began leaves the run's kept masks, shows saved, and Save All skips it. Still open: an EDITED but unsaved open frame (tied to SP-01's save-on-leave). |
| SP-03 | Timeline: Clear Flags | Repaints every non-reference frame pending, sets the flagged count to 0 and says "Cleared all timeline flags". Masks, scores and the engine's sets are untouched, so Save All still writes every propagated, unflagged frame (L ui/main_window.py:3457-3478; BR:1045-1057). | Sets every non-reference frame's state to pending (W sequence/timeline.ts:265-269). Save All writes only frames that are not pending (W sequence/confidence.ts:195-199), so it writes nothing. The Save button disappears and the unsaved count drops to 0 (W sequence/PropagationControl.tsx:373-379, 494). New timeline, Clear, Propagate and closing the tab stop asking (W sequence/TimelinePanel.tsx:163-177, 371-381). No notice. | Legacy's Clear Flags only repaints. The web's silently throws away what Save All would write, and the guard against losing it. | S0 | no. W sequence/timeline.ts:257-264 calls it legacy's behaviour | Repaint only. Derive saveability from what the commit decided (W sequence/commit.ts), not from the painted state. |
| SP-04 | Propagation: reference seeds | When the open frame is a reference, its seeds come from its segments in memory, unsaved ones included. Other references load from their files (L ui/main_window.py:3640-3668, 4263-4292; BR:452). | Every reference is read from its saved file (W sequence/references.ts:22-26, 118-142), so unsaved work on a reference is not carried. With no file, the frame "could not seed: it has no annotations to carry". With an older file, the older annotations propagate and nothing says so. | Legacy's loop is draw on a frame, G, Ctrl+P. On the web it propagates nothing until the frame is saved, and an edited but unsaved reference propagates its stale file. | S0 | code comment only (W sequence/references.ts:22-26, citing decision 5). BR:460 (RULE-023, rasterize shapes) is followed | Seed the open frame from the workspace's live segments, or ask to save it first when it is an unsaved reference. |
| SP-05 | Saving: Save All class names | Each saved object gets its reference's class name: the open frame's alias for that class at Propagate, else "Class N" (L ui/main_window.py:4277-4280, 4787-4799). The name goes into the NPZ aliases and the COCO, VOC and CreateML labels (L ui/managers/save_export_manager.py:400-403, 424). | Seeds keep only the class id (W sequence/references.ts:155). Save All sends no classAliases (W sequence/saveAll.ts:147-151), so labels are the bare id (A app.ts:812, 831). A reviewed frame saved with Enter carries only its own file's aliases (W workspace/WorkspaceProvider.tsx:533). | A class legacy writes as "car" is written as "0". | S0 | partly: BR:1313 (RULE-082) says the object takes its reference's class AND alias, never "Class N". The web does only the second half | Carry each seed's alias from its reference file's classAliases into Save All and into the review segments. |
| SP-06 | Saving: Save All pixel priority | Save All goes through the normal save (L ui/main_window.py:4813), which resolves overlaps with the pixel-priority settings (L ui/managers/save_export_manager.py:405-410). | Save All sends no pixelPriority (W sequence/saveAll.ts:147-151), and the API then treats it as off (A app.ts:821, 1042-1044). The Enter path does send it (W workspace/OpenImageView.tsx:732-737). | With pixel priority on, Save All writes overlapping masks of different classes differently. | S0 | no | Send the pixelPriority the Enter path sends. |
| SP-07 | Review: what a propagated frame shows | Opening one merges its objects into one "Loaded" mask per class (L ui/main_window.py:3597-3606; L core/segment_manager.py:97-172). The segment table lists that, and the leaving auto-save writes it. Exporters write one instance per contour of each segment (L core/segment_manager.py:254-313; L core/exporters/yolo_detection.py:26-33). | One "AI" segment per tracked object, in the view and in whatever Enter writes (W sequence/PropagationControl.tsx:390-397; W sequence/saveAll.ts:53-66, 121-128). | For touching or overlapping objects of one class, legacy's file saved after a visit has one box or instance and the web's has two. The segment table has a row per object, not per class. Save All is per object in both. | S0 | code comment only (W sequence/saveAll.ts:114-120). BR:1430 calls legacy's workflow-dependence a suspected defect | Owner decision: merge on open for parity, or record the divergence on RULE-090. |
| SP-08 | Propagation: JPEG frames | A JPEG frame is symlinked into SAM 2's staging folder, so SAM 2 reads the original bytes (L models/sam2_model.py:788-796). | Every frame is decoded and re-encoded at JPEG quality 95 (I propagation.py:76-105). | On a JPEG sequence SAM 2 sees recompressed pixels. Masks and scores move, and a score near Min Conf can change which frames are flagged, and so which are written. **Unverified**: not measured, and the goldens use a PNG clip. | S0 | yes: IT test_differential_propagation.py:18-25 | Stage JPEG sources' original bytes, or measure on a JPEG clip and record the tolerance. |
| SP-09 | Propagation: longer than the window, backward pass | Each window's outside references are staged at index 0 in both directions (L ui/managers/propagation_manager.py:990-1016), and SAM 2 is walked with no start frame (1062). A reverse walk then starts at index 0, the earliest seeded frame, and yields nothing. That empties every backward window after the first, and a first one with a reference outside it; their frames stay pending. | Outside references are staged after a backward window's frames, and the walk starts at the reference (I runner.py:106-132, 429-435). PR:345-347 shows the backward pass reaching frame 0. | Frames more than a window before the earliest reference are propagated, and written by Save All, only by the web. **Unverified** at runtime against legacy: read from both codes and SAM 2's default start frame, as I runner.py:112-116 states. | S0 | code comment only (I runner.py:112-116) | Keep. Record it on RULE-026 and add a streaming golden. |
| SP-10 | Saving: crop | Moving between frames does not clear the crop (L ui/main_window.py:3521-3575). One crop applies to every auto-saved frame and to Save All (L ui/managers/save_export_manager.py:412-417; BR:1311). | The crop is cleared on every open (W workspace/WorkspaceProvider.tsx:490-497), and Save All sends none (W sequence/saveAll.ts:147-151). | In legacy one crop blanks every saved frame outside it. On the web it applies only to the frame it was drawn on, when that frame is saved with Enter. | S0 | yes: decision 9 (MB:422), BR:767 | None while the decision stands. Say in the Sequence tab that a crop is per frame. |
| SP-11 | Trim, then Save All | Trim resets the propagation engine (L ui/main_window.py:5251-5253). Save All then reports "No propagated frames to save" (4751-4759) while green frames remain (BR:1238). | Masks are keyed by image and survive (W sequence/timeline.ts:402-407; W sequence/TimelinePanel.tsx:399-405; W sequence/PropagationControl.tsx:318-354). Save All writes the remaining frames. | The web writes frames legacy cannot. | S0 | code comment only. BR:1238 calls legacy's a suspected defect | Keep; record on RULE-077. |
| SP-12 | Clear references, then Save All | Clear All empties the engine's reference annotations (L ui/main_window.py:4003-4005), so Save All writes every object as class 0, "Class 0" (4788-4796; BR:1311). | The object-to-class map survives (W sequence/PropagationControl.tsx:145, 226). | Different class ids in the files. | S0 | yes: BR:1313 | Keep. |
| SP-13 | Propagation: cancel | Abort stops the worker before its finish signal. The last buffered frame is never committed and the frame in flight is dropped (L ui/main_window.py:4417-4445, 4596-4602; BR:1032-1043). | The frame in flight finishes whole (I runner.py:392-399, 459-466), and every frame that arrived commits once the job stops (W sequence/PropagationControl.tsx:311-316). | Up to two more frames are available to Save All after a cancel. | S0 | yes: PR:321-324 | Keep. |
| SP-14 | The open frame at propagation end, Save All and Trim | Each reloads the open frame. That discards its unsaved edits, and shows its new propagated masks (L ui/main_window.py:4638-4645, 4834-4839, 5290-5291; BR:954-966). | Nothing reopens the open frame (W sequence/TimelinePanel.tsx:406-416; W sequence/PropagationControl.tsx:403-430). It keeps its edits and does not show its new masks until clicked again. | Legacy loses the open frame's unsaved work; the web keeps it. | S0 | yes: PR:408-421 | Keep. |
| SP-15 | Leaving the Sequence tab | Tears down the timeline, references, statuses and unsaved propagated masks without asking, and does not save the open frame. Single reloads the image from disk, and coming back shows the setup screen (L ui/main_window.py:3043-3047, 4998-5035, 7242-7272; BR:925-937). | The timeline stays mounted, hidden, and is found as it was (W shell/CentreTabs.tsx:13-15, 96-101). | Legacy loses the run; the web keeps it. | S0 | yes: CP:115-116, VP:212-214 | Keep. |
| SP-16 | New Timeline; Propagate a second time | Both discard unsaved propagated masks without a question (L ui/main_window.py:4998-5035, 4233-4239; BR:1200-1211). | Both ask while frames are unsaved (W sequence/TimelinePanel.tsx:371-381; W sequence/PropagationControl.tsx:163-179). | Legacy loses the run silently. | S0 | yes: CP:115-116, PR:214-224 | Keep. |
| SP-17 | Closing the app or tab | Saves settings only (the stream window). The timeline, propagated masks and the open frame's edits go without a question (L ui/main_window.py:2064-2108; BR:881-893). | The browser's leave-page dialog while propagated frames are unsaved (W sequence/TimelinePanel.tsx:164-177), and CloseGuard for unsaved images. Neither app keeps the timeline. | Legacy loses work silently. | S0 | yes: BR:893, PR:206-208, PR:523-524 | Keep. |
| SP-18 | Building the timeline: first frame | Build opens frame 1 and says "Timeline built: N frames" (L ui/main_window.py:4949-4996). | Build moves the cursor to frame 1 and opens nothing. If the open image is in the range, the cursor jumps to it instead (W sequence/TimelinePanel.tsx:216-223, 335-339). | The view can show an image outside the new timeline while the header names frame 1. | S1 | no | Open the first frame on Build, asking first if the open image is unsaved. |
| SP-19 | Review: which frame is current | The frame on screen is always the current frame. Navigation always completes (L ui/main_window.py:3414-3434). A file outside the timeline bounces back to the current frame (L ui/main_window.py:1447-1459; L ui/managers/file_navigation_manager.py:374-376; L ui/main_window.py:5395-5404). Trim opens the nearest kept frame (5290-5291). | The cursor moves before the open, and the open can be refused at the unsaved prompt (W sequence/TimelinePanel.tsx:238-240, 488-491; W workspace/WorkspaceProvider.tsx:485-488). An image outside the timeline, opened from the list or on the Single tab, leaves the cursor where it was (W sequence/TimelinePanel.tsx:335-339). Trim moves the cursor, not the view (406-416). | The header (W sequence/TimelinePanel.tsx:341-348), G (258-264) and the trim bounds (566-571) then act on a frame that is not on screen. | S1 | partly: showing an outside image is recorded (WT rules/p0Coverage.test.ts:65-69); the rest is not | Move the cursor only when the open succeeds, say "not in the timeline" in the header, and open the nearest frame after Trim. |
| SP-20 | Choosing the range: which files | The rows between Start and End as the file list shows them, sorted and filtered, so searched-out or hidden files are left out (L utils/fast_file_manager.py:1971-1999; BR:1473). | Every image of the raw listing between the two picked names (W shell/App.tsx:344-347 passes `listed`; W sequence/timeline.ts:108-120). | With a filtered list, legacy's timeline is smaller, so propagation and Save All cover different frames. | S1 | partly: CP:50 (CP-14) keeps the listing ORDER for the pickers. Leaving out filtered rows is not addressed | Build from the rows as shown, filtered as on screen. |
| SP-21 | The timeline and the browser's folder | A built timeline is a fixed list of paths (L ui/modes/sequence_view_mode.py:123-126), whatever the file list shows. | Until a status changes, the timeline is rebuilt from whichever folder the browser lists, at the old positions (W sequence/TimelinePanel.tsx:197-206). After that, clicking a frame not in the listed folder does nothing (W shell/App.tsx:351-356). | Browsing another folder silently changes or disconnects the timeline. | S1 | no | Freeze the timeline's images at Build. |
| SP-22 | Review: opening a frame from the file list or with Left/Right | A timeline file chosen in the list, or reached with Left/Right (L ui/right_panel.py:208, 329-335), goes through frame selection (L ui/main_window.py:1447-1455). Its propagated masks show (3591-3606), and the frame left is auto-saved. | The list and Left/Right call openImage without the propagated masks (W dataset/DatasetBrowser.tsx:352; W shell/App.tsx:142-156), so the frame shows its file. | Reviewing with the arrow keys shows none of the run's masks. | S1 | no | Route the opening of a timeline image through the timeline. |
| SP-23 | Review: a frame already saved | A saved frame's stored masks are gone (L ui/modes/sequence_view_mode.py:365-373), so reopening loads the file, not unsaved. | After Save All the run's masks remain (W sequence/PropagationControl.tsx:325-354, 390-401). The frame reopens with them, marked unsaved (W workspace/WorkspaceProvider.tsx:540-543), and asks on leaving. | Saved work is shown as unsaved. | S1 | no | Open written frames from their files. |
| SP-24 | References: size check (G, + All Before, + All Labeled) | The first reference fixes the size. G refuses another size with "Cannot add reference: image is WxH but reference requires WxH". + All Before and + All Labeled skip such frames and report "(N skipped: dimension mismatch)" (L ui/main_window.py:3887-3908, 3934-3953, 3960-3980; L ui/modes/sequence_view_mode.py:232-237; BR:797-808). | No check (W sequence/timeline.ts:194-207, 354-358). + All labeled calls markReferences without `sizeOf` (W sequence/TimelinePanel.tsx:539-541), so W sequence/timeline.ts:150-151 accepts every frame. At run time, frames of a different size from the first reference are dropped (I runner.py:188-202, 277-290). A reference among them silently seeds nothing (I runner.py:302-308), and nothing reports it: `staged.skipped` (I runner.py:297) has no reader. | The user is not told that a reference will not be used. | S1 | no (CP:63, CP-27, reported) | Check sizes when marking, since seeding already fetches each frame's metadata, and report dropped seeds. |
| SP-25 | Propagation: frames of another size | Marked Skipped (brown, and kept through resets), with "N frames have different dimensions (reference is WxH) and will be skipped during propagation" (L ui/main_window.py:4149-4162; L ui/modes/sequence_view_mode.py:586-596; BR:1144-1156). | Left out silently and left pending (I runner.py:277-290, 297). The "N skipped for a size mismatch" count (W sequence/TimelinePanel.tsx:429-438) counts a state nothing in the UI sets. | No brown and no notice. | S1 | no | Return the job's skipped frames and paint them. |
| SP-26 | References: + All Labeled | Probes the disk at the click (L ui/main_window.py:3966). | Uses the listing fetched when the folder opened (W sequence/TimelinePanel.tsx:192-195, 539-541; W dataset/DatasetBrowser.tsx:106-126), which no save refreshes. | Frames labelled this session are missed. | S1 | no | Re-list at the click, as Propagate already does for Skip Labeled (W sequence/PropagationControl.tsx:203-207). |
| SP-27 | Trim with the timeline sorted | Cut and Keep use the frames between the markers as displayed (L ui/main_window.py:5209-5228, 5311-5322; BR:1236). | Positions in natural order (W sequence/timeline.ts:412-449; W sequence/TimelinePanel.tsx:406-407). | Different frames are removed. | S1 | no | Trim over the displayed order. |
| SP-28 | Timeline: Sort | The order is computed once when Sort is pressed, and kept (L ui/widgets/timeline_widget.py:109-120). It is re-applied after a trim (L ui/main_window.py:5286-5288). | Recomputed on every render (W sequence/TimelinePanel.tsx:419), so frames move while a run or a Save All changes them. | Frames jump under the pointer. | S1 | no | Take the order once, when Sort is pressed. |
| SP-29 | Find Archetypes: abort | A second press, or Ctrl+H, aborts with "Reference analysis cancelled" (L ui/widgets/sequence_widget.py:571-599; L ui/main_window.py:5044-5055). | Disabled while "Finding…", and Ctrl+H is ignored then (W sequence/TimelinePanel.tsx:301-303, 545-554). | It cannot be stopped. | S1 | no (CP:64, CP-28, reported) | Add Abort. |
| SP-30 | Find Archetypes: earlier suggestions; H and Shift+H | Clears earlier suggestions first (L ui/main_window.py:5066-5067). H walks the stored suggestion list (L ui/modes/sequence_view_mode.py:486-537). It still reaches frames a Propagate repainted pending (BR:1210) and frames that became references (BR:445). | Adds to earlier suggestions and never clears them (W sequence/TimelinePanel.tsx:309; W sequence/timeline.ts:372-382). H follows the purple state (W sequence/timeline.ts:281-287), so after a Propagate (180-185), or on a reference, it says "No suggested frames". | Stale purple frames, and H loses suggestions. | S1 | no | Clear before marking, and keep the list for H. |
| SP-31 | No AI available | The Reference Frames, Propagation and Review groups are hidden. Propagate and Find Archetypes are disabled with the install hint, and Ctrl+P and Ctrl+H show it too (L ui/widgets/sequence_widget.py:274-278, 307-311, 825-835; L ui/main_window.py:4020-4022, 4710-4712, 5041-5043). Trim and New Timeline stay. | Everything is offered. App always passes `client` (W shell/App.tsx:345-347), although TimelinePanel says a missing client hides propagation (W sequence/TimelinePanel.tsx:82-88). `videoCapable` is read only by the status bar (W shell/StatusBar.tsx:143-150). Failures appear after the click. | Controls that cannot work are offered. | S1 | no (CP:64, CP-28, reported) | Gate on /health's `ai.available` and `videoCapable`. |
| SP-32 | Propagation: which model | Uses the model loaded in the picker. SAM 1 gives "SAM 2 video predictor not available", and no model gives "SAM model not loaded" (L ui/main_window.py:4052-4060). | Sends no model (W sequence/PropagationControl.tsx:253-259). The service uses the manifest's only SAM 2 entry, and fails the job when there are several: "several models can propagate …; name the one to use" (I server.py:213-236). The picker's choice is ignored. | With two SAM 2 checkpoints listed, the web cannot propagate at all. With one, it propagates even while SAM 1 is picked. Read, not run. | S1 | no | Send the picker's model when it is SAM 2, or offer a choice. |
| SP-33 | Min Conf changed after a run | The engine re-flags from stored results, and Save All follows it. The timeline keeps its colours (L ui/main_window.py:4718-4723; L ui/managers/propagation_manager.py:1254-1268; BR:1172-1184). | The timeline re-flags (W sequence/TimelinePanel.tsx:598-608; W sequence/confidence.ts:163-186). A frame flagged with Keep Flagged off has no masks (W sequence/commit.ts:90-98). Lowering Min Conf turns it green, yet Save All withholds it (W sequence/saveAll.ts:101-106). | Green frames that will not be written. What is written is the same in both apps. | S1 | partly: the re-flag is deliberate (WT rules/p0Coverage.test.ts:70-74; PR:1339-1342). The green-but-empty case is not recorded | Keep such frames flagged, or give them their own state. |
| SP-34 | Min Conf across restarts | 0.99 at every launch. It is not a setting (L ui/widgets/sequence_widget.py:384-398; L ui/main_window.py:2096-2107). | A saved setting (W sequence/TimelinePanel.tsx:180-189, 598-603). | It survives a restart. | S1 | yes: decision 9 (MB:422) | Keep. |
| SP-35 | New Timeline: what it resets | Resets the labels, trim, suggestions and the sort (L ui/widgets/sequence_widget.py:770-794; L ui/widgets/timeline_widget.py:86-100). | Resets the range, statuses and kept labels only (W sequence/TimelinePanel.tsx:371-386). Sort, the trim bounds and the notes carry into the next timeline, where Cut and Keep use the old bounds (406-416, 578-583). | A new timeline starts with the previous one's state. | S1 | no | Reset those too. |
| SP-36 | Propagation: window overlaps | A frame only flagged in an earlier window is not in `propagated_frames`, so the next window processes it again and the UI commits it again, merging masks (L ui/managers/propagation_manager.py:1054, 1083-1085; L ui/main_window.py:4537-4569; BR:501). | Overlap frames keep the earlier window's result, whatever it was (I runner.py:455-458; I windows.py:13-16). | Such frames offer different masks for review. Save All excludes flagged frames in both. **Unverified**: no golden covers streaming. | S1 | code comment only (I windows.py:13-16) | Decide with a streaming golden. |
| SP-37 | Enter on a sequence frame in Polygon mode | Does nothing: no finish, no save (L ui/managers/keyboard_event_manager.py:193-230; BR:793-794). | Finishes the polygon and saves, as in Single; the two tabs share one view (W shell/CentreTabs.tsx:7-12). | Legacy's defect is not reproduced. | S1 | no. BR:794 calls legacy's a suspected defect | Keep, and record it. |
| SP-38 | Saving: when Save All can be pressed | Always shown and enabled, during a run too, when it writes what is committed; otherwise "No propagated frames to save" (L ui/main_window.py:3297-3305, 4757-4759). A failed write still marks the frame saved and drops its masks (BR:1311). | Shown only after the run has finished, and only with unsaved frames (W sequence/PropagationControl.tsx:494-509). Failures are listed and not marked saved (W sequence/saveAll.ts:153-157). | Nothing can be saved partway through a long run. | S1 | no | Offer it during a run for committed frames, or record the difference. |
| SP-39 | Statuses after a save: reference frames | A saved reference turns cyan, and the next Propagate repaints it pending (L ui/modes/sequence_view_mode.py:365-373, 143-159). | Role and state are separate, so it stays gold (W sequence/timeline.ts:13-18, 234-240). | The colour differs. | S1 | yes: BR:915-916 | Keep. |
| SP-40 | Propagation: aborting while it starts | The Propagate button is Abort from the first click, through image loading and reference registration (L ui/widgets/sequence_widget.py:629-647; L ui/main_window.py:4417-4432). | While "Reading references…" the button is disabled, there is no Cancel, and Ctrl+P does nothing (W sequence/PropagationControl.tsx:177-178, 281-292, 469-492). | The start cannot be aborted. | S1 | no | Make the reference read cancellable. |
| SP-41 | Choosing the range: controls | Set Start and Set End from the open image, with their names shown. Clear is enabled with either set; Build only with both (L ui/widgets/sequence_widget.py:136-208, 837-872; L ui/main_window.py:4897-4947). The file list colours Start light green (100,200,100), End red (200,80,80) and the rows between dark green (50,90,50), until Clear or New Timeline (L utils/fast_file_manager.py:303-309, 501-513, 1900-1965). | Two selects defaulting to the first and last image. Build is always enabled; there is no Clear and no colouring (W sequence/TimelinePanel.tsx:627-678). | One click builds the whole folder, and the list does not show the range. | S2 | partly: VP:310-311 ("the range is two pickers") | Add Set Start and Set End from the open image and the row colours, or record the pickers. |
| SP-42 | Timeline Sort and the file list | Sort reorders the range's rows in the file list to the timeline's order (a "Timeline" sort), so Left/Right follow it (L ui/main_window.py:3436-3455; L utils/fast_file_manager.py:1331-1358). | The list is untouched (W sequence/TimelinePanel.tsx:522-524). | Left/Right follow the list, not the sorted timeline. | S2 | no | Optional. |
| SP-43 | Timeline: zoom, pan, scrub | Drag scrubs, each step a frame change with its auto-save. ◀ − + ▶ zoom from 1× to 30× and pan by 25%; the wheel pans when zoomed. Long sequences are drawn in blocks (L ui/widgets/timeline_widget.py:341-378, 453-469, 565-594, 640-695). | One button per frame, click only (W sequence/TimelinePanel.tsx:453-499). Cells shrink without limit (W styles.css:1324-1379), so on long sequences most frames cannot be clicked (**unverified** in a browser). | No zoom, pan, wheel or scrub. | S2 | no (CP:74, CP-41) | Add zoom, pan and scrub. |
| SP-44 | Trim: controls | Left and Right labels with file names, Set Left and Set Right, and Clear Trim, enabled with either set. Cut and Keep are enabled only with both. Red triangles mark the bounds on the bar (L ui/widgets/sequence_widget.py:469-537, 934-940; L ui/widgets/timeline_widget.py:380-420; L ui/main_window.py:5338-5344). | "Trim from here" and "Trim to here", with the bounds as numbers. No Clear Trim. Cut and Keep are always enabled and refuse with a note. No markers (W sequence/TimelinePanel.tsx:565-584). | Names, markers and Clear Trim are missing. | S2 | no (CP:74, CP:76) | Add them. |
| SP-45 | Review: counts and buttons | "Suggested refs: N" and "Flagged frames: N", with ← Prev and Next → buttons for suggested and flagged frames, enabled only when there are some, and Clear Suggested (L ui/widgets/sequence_widget.py:281-285, 411-464, 601-608, 649-665). | "Next flagged" and "Next reference" only, always enabled. No counts, no Prev, no Clear Suggested (W sequence/TimelinePanel.tsx:521-561). | The review group is missing. | S2 | no (CP:75, CP-42) | Add it. |
| SP-46 | Propagation: range | Range spinboxes, 1-based, reset to 1..N on Build and Trim (L ui/widgets/sequence_widget.py:318-331, 643-647, 667-679; L ui/main_window.py:4369-4378; BR:476-488). | None. Start and end are never sent (W sequence/PropagationControl.tsx:253-259), though the API and the runner accept them (A app.ts:492-493; I propagation.py:417-419; I runner.py:84-103, 365-373). | Always the whole timeline. | S2 | no (CP:73, CP-40) | Add the two fields and send them. |
| SP-47 | Min Conf: histogram | "Hist" opens a dialog: drag the gold threshold line, Apply sets Min Conf, Close cancels. With no scores it says "No confidence scores available yet" (L ui/widgets/sequence_widget.py:400-404; L ui/main_window.py:4725-4739; L ui/widgets/confidence_histogram_dialog.py:234-303). | An always-visible chart whose line cannot be dragged; the number is typed (W sequence/TimelinePanel.tsx:691-772). The bin holding the threshold is coloured by a different rule (L confidence_histogram_dialog.py:128-141; W sequence/TimelinePanel.tsx:744-748). | The threshold cannot be dragged. | S2 | no (CP:77, CP-44) | Make the line draggable. |
| SP-48 | Streaming: the prompt and the window | Unticking Streaming with more frames than the window asks "Disable streaming anyway?" (default No, estimate in GB), and re-ticks on No. The Window spinbox is in the panel, saved on close (L ui/widgets/sequence_widget.py:356-381, 610-627; L ui/main_window.py:2096-2100). | A warning line in MB and no question (W sequence/PropagationControl.tsx:459-466). The window is in the settings editor. | No confirmation. | S2 | partly: PR:448-459 | Optional confirmation. |
| SP-49 | References: display and Clear All | "References: Frames: 1, 3 ★", or "Frames: 1, 2, 3... (7 total) ★". Clear All is disabled with no references (L ui/widgets/sequence_widget.py:218-224, 253-256, 661, 688-708). | "N frames, M references". Clear references is always enabled (W sequence/TimelinePanel.tsx:426-428, 542-544). | Which frames are references is not listed. | S2 | no (CP:95, CP-65) | Add both. |
| SP-50 | Notices | "Timeline built: N frames" (L ui/main_window.py:4996). "Added frame N as reference" (3898). "Added N frames as references (M skipped: dimension mismatch)" (3950-3953). "No frames before current position" (3931). "Cleared all reference frames" (4009). "Cleared all timeline flags" (3478). "Propagation complete: N frames, M flagged. Scrub timeline or click 'Save All' to save." (4631-4634). "Propagation cancelled" (4445). "Saving N frames..." and "Saved N frames to NPZ" (4761, 4846). "Removed N frames from timeline" (5301). "Timeline cleared. Set new start/end frames." (5035). Find Archetypes' "Found N suggested reference frames", "Only N reference frames identified (expected ~E)" and "Need at least 5 frames to find archetypes" (5054-5139). | Most have none, and the rest read differently: "Propagated N frames" and "Saved N frames" (W sequence/PropagationControl.tsx:421-426, 596-601); "Removed N frames from the timeline. No files were touched." (W sequence/TimelinePanel.tsx:415); "N frames suggested from C scenes." (310-316); and the service's "N frames is fewer than the 5 this needs" (I archetypes.py:435-437). | Different or missing wording. | S3 | no | Copy legacy's notices. |
| SP-51 | Labels and tooltips | "+ Add Current", "+ All Before", "+ All Labeled", "Clear All", "Set Left" and "Set Right", "Clear Trim", "Abort", "Save All", a checkable "Sort" that reads "Sorted", "Clear Flags" and "Keep Flagged Masks". Group titles Timeline Setup, Reference Frames, Propagation, Review and Trim, and a tooltip on nearly every control (L ui/widgets/sequence_widget.py:136-553; L ui/widgets/timeline_widget.py:565-611). | "Mark as reference", "+ All before", "+ All labeled", "Clear references", "Trim from here" and "Trim to here", "Cancel", "Save N frames", "Sort" that reads "Unsort", and "Clear flags". No group titles and few tooltips (W sequence/TimelinePanel.tsx:521-584; W sequence/PropagationControl.tsx:435-523). | Different labels. | S3 | no (CP:90, CP:95) | Copy legacy's. |
| SP-52 | Timeline tooltip | "Frame 3/23", the file stem, "Status: saved", "Confidence: 0.9876" (L ui/widgets/timeline_widget.py:471-489). | "clip/f03.png — reference — confidence 0.9876" (W sequence/TimelinePanel.tsx:478-487). | Different text. | S3 | no (CP:95) | Copy legacy's. |
| SP-53 | The Propagate button and progress | One button: green Propagate, then amber "Starting...", then red "Abort · Loading images...", "Adding reference 1/2", "Frame 12/100" or "Loading chunk 2 (250 frames)...". Find Archetypes reads "Abort · Embedding frames 1-32/100" (L ui/widgets/sequence_widget.py:629-647, 741-768; L ui/main_window.py:4079-4081, 4452-4457, 5089-5093). | Propagate, amber "Reading references…", then disabled beside a separate red Cancel that reads "Stopping…". Progress is a line, "Propagating — 12 of 100 frames", and Find Archetypes reads "Finding…" (W sequence/PropagationControl.tsx:469-492, 532-540; W sequence/TimelinePanel.tsx:552). | One button versus two, and no phase text. | S3 | partly: the colours, VP:306-311 | Optional. |
| SP-54 | The header line | Set when a frame loads, "-- Conf" only above 0, and kept after New Timeline (L ui/main_window.py:3274-3276, 3536-3549). | Updated live, and reset to "No sequence loaded" (W sequence/TimelinePanel.tsx:341-348; W shell/CentreTabs.tsx:93). Same format. | When it updates. | S3 | no | None. |
| SP-55 | Entering the Sequence tab | Sequence has its own viewer, empty until a file is clicked, and a notice: "Sequence Mode: Set start/end frames, then Build Timeline" (L ui/main_window.py:3278-3281, 5346-5382). | The open image stays in view, and there is no notice (W shell/CentreTabs.tsx:91-101). | What the tab shows first. | S3 | yes: VP:205-208 | None. |
| SP-56 | Sequence keys off the tab | The keys are app-wide over a torn-down timeline. N, B and H say "No more flagged frames", "No reference frames" or "No suggested frames"; Ctrl+H says "Build a timeline first"; G and Ctrl+P do nothing (L ui/main_window.py:1024-1056, 4664-4706, 5057-5059, 5150-5168). | Silent, except Ctrl+H: "Find Archetypes works on the Sequence tab" (W sequence/sequenceActive.ts:1-21; W sequence/TimelinePanel.tsx:264-333; W shell/CentreTabs.tsx:67-71). | Notice text. | S3 | yes: CP:47 (CP-11, done) | None. |
| SP-57 | Web-only additions | None of these exist. | The counts line and "kept their existing labels" (W sequence/TimelinePanel.tsx:426-449), "Next reference" (528-530), a Clear for a finished run (W sequence/PropagationControl.tsx:511-523), the "could not seed", "will not be written" and "produced no mask" lines (554-591), and explanatory paragraphs (W sequence/TimelinePanel.tsx:611-615, 672-675). | Extra controls and text. | S3 | no | None. |

### Notes

**The web matches legacy here, but not what the recorded answers ask for.**
- **Deleting every mask on a propagated frame does not stick.** Save All writes the run's masks back,
  because it reads the run and not the file (W sequence/saveAll.ts:130-151). Legacy does the same
  after deleting the files (BR:907). BR:918-921 (RULE-055, question 2) says deleting them must drop
  the propagated masks and return the frame to pending.
- **Save All does not ask about unsaved edits on the open frame.** It writes the run's masks for that
  frame, as legacy does (L ui/main_window.py:4764-4826). BR:1313 (RULE-082) says it should ask.
  Unlike legacy, the web then keeps the edits on screen (SP-14).

**Records that disagree with each other or with the code.**
- **Auto-save on navigation.** BR:980 and W workspace/saveState.ts:11-13 say it stays, on by default.
  CP:112, WT settings/honoured.ts:98-102 and WT rules/p0Coverage.test.ts:78-81 say it is dropped,
  and the code passes `saveOnNavigate: false` (W workspace/WorkspaceProvider.tsx:481-485). SP-01
  needs the owner's ruling.
- **CP-14's citation.** CP:50 cites VP:307-308 for keeping the listing order in the sequence range
  pickers, but those lines are about button colours. The nearest record, VP:310-311, says the range
  is two pickers and nothing about order or filtering (SP-20).
- **Clear Flags.** W sequence/timeline.ts:257-264 describes it as legacy's behaviour. Its effect on
  Save All is not (SP-03).
- **Legacy "writes an empty mask over every frame".** These say legacy propagates with no reference
  and does that: W sequence/TimelinePanel.tsx:14-17, W sequence/PropagationControl.tsx:10-12 and
  240-243, A app.ts:451, and WT acceptance/c10.sequenceTimeline.test.tsx:181-182. It does not:
  - Propagate is disabled with no reference (L ui/widgets/sequence_widget.py:658-659).
  - With none, it says "Please set a reference frame first" (L ui/main_window.py:4027-4029).
  - With no usable segments, it says "No valid segments in reference frames" (4294-4298).
- **The missing client.** W sequence/TimelinePanel.tsx:82-88 says a missing client hides
  propagation, but App always passes one (SP-31).

## What the goldens and tests cover, and what they do not

**Covered, against legacy:**
- **The model's output.** IT test_propagation_goldens.py, with
  IT goldens/propagation/synthetic-shapes.{json,npz} captured from legacy's own MainWindow methods
  by IT fixtures/capture_propagation_goldens.py. With a SAM 2 checkpoint, the runner reproduces
  legacy's per-object masks (IoU at least 0.98), empties and flags. The setup is fixed:
  - a 23-frame PNG clip;
  - one reference frame (frame 8) with two objects;
  - both passes, in full-context mode;
  - Min Conf 0.99.
- **What the app does with that output.** WT acceptance/c11.goldens.test.tsx runs the golden's four
  scenarios: defaults, Keep Flagged on, and Skip Labeled on and off over labelled frames. It drives
  TimelinePanel and PropagationControl with a fake client that replays legacy's model output, and
  compares:
  - the timeline after the run and after Save All;
  - the tooltip confidences, to four decimals;
  - which objects each frame offers for review, through the `onOpen` callback;
  - which frames, objects and class ids Save All sends.
- **A forward-only live differential.** IT test_differential_propagation.py compares with legacy on
  PNG frames, seeded on frame 0, so there is no backward pass.
- **Find Archetypes' frames.** IT test_differential_archetypes.py checks that it suggests the same
  frames as legacy's worker, on 90 frames in three scenes (PR:28-31).
- **Manual full-stack runs** of the synthetic clip (PR:596-607, PR:1461-1469). These are not
  automated.

**Not covered:**
1. **Anything after a frame is opened in the app.** The capture replaced
   `_load_sequence_frame_segments` with a no-op (IT fixtures/capture_propagation_goldens.py:308),
   and the web test replaces `onOpen` with a spy (WT acceptance/c11.goldens.test.tsx:241-243). So
   none of these is compared: per-class merging (SP-07), navigation saving and the prompts (SP-01),
   hand corrections (SP-02), reopening saved frames (SP-23), file-list and arrow opens (SP-22), and
   the cursor and view (SP-18, SP-19).
2. **File contents.** The capture records only class ids and masks from `_save_output_to_npz`
   (capture:310-319). The web test records only the class id and object of each segment
   (c11.goldens:223-230). None of these is compared: class names (SP-05), pixel priority (SP-06), the
   crop (SP-10), the formats, the image size, and the bytes written.
3. **Reference seeding.** The capture substituted `_load_segments_for_reference_frame` (capture:307),
   and the web test serves polygons from a fake `loadAnnotations`. Neither covers:
   - the open frame's unsaved annotations (SP-04);
   - class names from aliases;
   - more than one reference frame.
4. **Image sizes.** Every frame is one size, so mismatched references and frames are not covered
   (SP-24, SP-25).
5. **Streaming.** 23 frames fit in one window (PR:27). There are no overlaps, backward windows or
   seams against legacy (SP-09, SP-36).
6. **The propagation range.** Always the whole timeline (capture:337), and the web cannot set one
   (SP-46).
7. **Thresholds.** Only 0.99. No Min Conf change after a run, and no histogram (SP-33, SP-47).
8. **Cancel, abort and errors.** None of these is compared with legacy (SP-13, SP-40). The web's own
   tests use fakes.
9. **Timeline operations.** None of these is compared with legacy:
   - Clear Flags (SP-03);
   - Sort (SP-27, SP-28);
   - Trim (SP-11, SP-27);
   - New Timeline;
   - Clear references (SP-12);
   - + All before and + All labeled (SP-24, SP-26);
   - Find Archetypes' clearing, abort and H navigation (SP-29, SP-30).
10. **Hand edits after propagation** and their interaction with Save All (SP-02).
11. **JPEG frames.** The clip is PNG (SP-08).
12. **Notices and counts.** The golden records them (capture:356-359, 390, 394), but the web test
    does not compare them.
13. **Model choice and no AI** (SP-31, SP-32).
14. **The web's other sequence tests** (WT sequence/TimelinePanel.test.tsx,
    WT sequence/propagation.test.tsx, WT acceptance/c10.sequenceTimeline.test.tsx and
    c11.propagate.test.tsx) hold the web's intended behaviour, including several of the deliberate
    divergences above. They are not compared with legacy.

## Recommended fix order

1. **SP-03.** Clear Flags must not change what Save All writes, or what the loss guards count. It is
   a small change, and today it removes both silently.
2. **SP-01, SP-02, SP-23: the owner's ruling, then one change.**
   - Get the owner to choose between BR:980 and CP:112.
   - Then, when a sequence frame is saved (by Enter, or on leaving it if BR:980 is chosen), mark it
     saved on the timeline and drop it from the run's kept masks.
   - Have Save All send expectedRevisions.
   This makes hand corrections stick.
3. **SP-05 and SP-06.** Give Save All the Enter path's request: the reference's class name, as
   RULE-082's answer asks, and pixel priority. Extend c11.goldens to compare `classAliases` and
   `pixelPriority` in the save request.
4. **SP-04.** Seed the open reference from its live segments, or ask to save it before propagating.
   Legacy's draw, G, Ctrl+P loop depends on it.
5. **SP-19, SP-18, SP-22, SP-21.** Keep the cursor, the header and the view on one frame:
   - open frame 1 on Build;
   - move the cursor only when the open succeeds;
   - route list and arrow opens of timeline images through the timeline;
   - freeze the timeline's images at Build.
6. **SP-24, SP-25, SP-32, SP-31.** Check sizes when marking references, report dropped seeds and
   skipped frames, send the propagation model, and hide or disable propagation when there is no AI.
7. **SP-07, SP-08, SP-09 and SP-36.** Owner decisions, backed by a JPEG clip and a streaming golden
   captured from legacy the way synthetic-shapes was.
8. **The remaining S1s:** SP-27, SP-28, SP-30, SP-29, SP-26, SP-33, SP-35, SP-38, SP-40, SP-37.
9. **S2, in this order:** SP-45 (review group), SP-46 (range), SP-43 (zoom and scrub), SP-44 (trim),
   SP-47 (histogram), SP-41 (range setup and row colours), SP-49, SP-48, SP-42.
10. **S3:** SP-50 to SP-57.
11. **Records.**
    - Write down the deliberate choices that are argued only in code comments: SP-04 if it stays,
      SP-07, SP-09, SP-11, SP-36 and SP-37. They belong on their BUSINESS_RULES cards or in
      CONTROL_PARITY's recorded decisions.
    - Correct the statements listed under "Records that disagree".
    - Every fix gets a test that fails without it, as CONTROL_PARITY requires.
