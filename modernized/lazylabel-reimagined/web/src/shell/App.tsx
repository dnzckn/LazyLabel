/**
 * The application shell.
 *
 * Phase 2 built the shell, Phase 4 the dataset browser and the three-pane layout, Phase 5 the
 * tools that fill the panels. It fills the window the way legacy's does
 * (analysis/lazylabel/VISUAL_PARITY.md), so there is no visible title or subtitle any more.
 *
 * What it genuinely exercises: the API client against a real server, the settings provider
 * including its degraded state, the hotkey system end to end, and the capability table.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { WireDatasetImage, WireSegment } from "@lazylabel/contracts";

import { CAPABILITIES } from "../capabilities.js";
import { DatasetBrowser, type DatasetBrowserHandle, type FolderOutcome } from "../dataset/DatasetBrowser.jsx";
import { useNotifications } from "../notifications/NotificationProvider.jsx";
import { OpenImageView } from "../workspace/OpenImageView.jsx";
import { AdjustmentsPanel } from "../workspace/AdjustmentsPanel.jsx";
import { AnnotationSettingsPanel } from "../workspace/AnnotationSettingsPanel.jsx";
import { ClassTable } from "../workspace/ClassTable.jsx";
import { ChannelThresholdPanel } from "../workspace/ChannelThresholdPanel.jsx";
import { FrequencyPanel } from "../workspace/FrequencyPanel.jsx";
import { RescalePanel } from "../workspace/RescalePanel.jsx";
import { SplitView } from "../split/SplitView.jsx";
import { CloseGuard } from "../workspace/CloseGuard.jsx";
import { TimelinePanel, type SequenceRange } from "../sequence/TimelinePanel.jsx";
import { CropPanel } from "../workspace/CropPanel.jsx";
import { ModelPicker, useDefaultModel } from "../workspace/ModelPicker.jsx";
import { AutoPolygonPanel, useAutoConvertKey } from "../workspace/AutoPolygonPanel.jsx";
import { FragmentPanel } from "../workspace/FragmentPanel.jsx";
import { SegmentTable } from "../workspace/SegmentTable.jsx";
import { processingQuery } from "../workspace/processing.js";
import { useWorkspace } from "../workspace/WorkspaceProvider.jsx";
import { clampZoom } from "../canvas/fit.js";
import { Panel, Workspace } from "./Panel.jsx";
import { Splitter } from "./Splitter.jsx";
import { CentreTabs } from "./CentreTabs.jsx";
import { ModeControls } from "./ModeControls.jsx";
import { Tabs } from "./Tabs.jsx";
import { StatusBar } from "./StatusBar.jsx";
import { applyTheme, nextTheme, themeFor } from "./theme.js";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { HotkeyEditor } from "../hotkeys/HotkeyEditor.jsx";
import { Dialog } from "./Dialog.jsx";
import { ApplicationSettings } from "../settings/ApplicationSettings.jsx";
import { useHotkey, useKeyHint } from "../hotkeys/HotkeyProvider.jsx";
import { ApiError, type ApiClient, type ApiHealth, type FolderRequest } from "../api/client.js";

/** The client already names this shape; re-declaring it here is how the two drift apart. */
type Health = ApiHealth;

export function App({ client }: { readonly client: ApiClient }): ReactNode {
  const { state, settings, save } = useSettings();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [showHotkeys, setShowHotkeys] = useState(false);
  // The capability table: for whoever is checking this build, not for labelling, so it lives in a
  // dialog rather than a panel beside the work (legacy has none).
  const [showAbout, setShowAbout] = useState(false);
  // From the store, not held here: the status bar is one reader of this among several.
  const { imageState, openImage, open, crop, saveCounts, segments, classAliases } = useWorkspace();
  // The pair, for the Multi tab's next and previous (CP-31), and the save of both before it (CP-67).
  const { sides, multiView, openImageOn, closeSide, activeSide, setActiveSide, savePair } = useWorkspace();
  // RULE-024's answer, from the pixels: whether a load opens the Rescale and FFT sections.
  const grayscale = open?.metadata?.sourceChannels === 1;
  // The folder as the browser listed it, so the sequence timeline builds from the same answer
  // rather than fetching it again. Two fetches is two answers to one question.
  const [listed, setListed] = useState<readonly WireDatasetImage[]>([]);
  // The rows the list SHOWS, sorted, searched and not hidden: the order the Multi tab's pair steps
  // through and a sequence range is built from.
  const [shownRows, setShownRows] = useState<readonly WireDatasetImage[]>([]);
  /**
   * What Find Archetypes suggested, held HERE because two distant parts of the tree need it.
   *
   * The timeline draws them; RULE-091's prefetch, which runs beside the open image, encodes the
   * first uncached one ahead of the neighbours. The shell is the only place that can see both.
   */
  const [archetypes, setArchetypes] = useState<readonly string[]>([]);
  // Legacy's "Sequence Mode: ..." line: the timeline knows the frame, the shell draws the header.
  const [sequenceStatus, setSequenceStatus] = useState("No sequence loaded");
  // The sequence range the file list colours, as the timeline hands it up (SP-41).
  const [sequenceRange, setSequenceRange] = useState<SequenceRange | null>(null);

  // A preference the user chose wins; a default they never chose yields to the operating system.
  // That matters most when settings are UNREACHABLE: dark_mode defaults to true, so honouring the
  // default there would hand someone a dark app on a light desktop with no way out, since the
  // toggle writes to the same store that is down.
  const theme = themeFor({
    settingsAvailable: state.status === "ready",
    darkMode: settings.values["dark_mode"],
  });

  useEffect(() => {
    applyTheme(document.documentElement, theme);
  }, [theme]);

  // What the toggle would switch to. Computed once: asking twice invites the two answers to
  // disagree, and the disagreement would be a button whose label does not match what it does.
  const switchesTo = nextTheme(theme, systemPrefersDark());

  const toggleTheme = useCallback(() => {
    void save({
      ...settings,
      values: { ...settings.values, dark_mode: switchesTo === "dark" },
    });
  }, [save, settings, switchesTo]);

  useEffect(() => {
    let cancelled = false;
    client
      .health()
      .then((result) => {
        if (!cancelled) setHealth(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setHealthError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  /*
   * `fit_view` USED TO LIVE HERE AND DID THE WRONG THING. It toggled the hotkey reference, which
   * was honest scaffolding when it was written -- the first wire through a new dispatcher, proving
   * the thing worked end to end -- and became a lie the moment the reference table started
   * reporting it as live. A key called `fit_view`, listed under that name with its key beside it,
   * that opens a list of keys instead of fitting the image is worse than a key that does nothing:
   * a user presses it once, gets something unexpected, and stops trusting the table.
   *
   * It is now in `ZoomControl`, where `setZoom` already is and where fitting is what it means.
   * The reference dialog keeps its button and loses a binding the schema never gave it.
   */

  /*
   * NEXT AND PREVIOUS IMAGE -- the keys an annotator presses more than any other, and the second
   * step of persona flow 1: label it, move on. They were dead while the reference promised them.
   *
   * The shell binds them; the dataset browser steps, over the rows it SHOWS, sorted, searched and
   * not hidden, as legacy's does. It stepped over the raw listing until 2026-09-25, which a sort or
   * a search made a different order from the one on screen (`CONTROL_PARITY.md` CP-14).
   *
   * Unsaved work is still guarded: `openImage` saves it first with Auto-Save on Navigate on, as
   * legacy's does, and otherwise asks before discarding it, whatever route asked for the change. A
   * hotkey that bypassed both would be the fastest possible way to lose a whole image, because it
   * is the key you hold down.
   */
  /*
   * The run's masks a timeline frame opens with, whichever way it is opened (SP-22). The timeline
   * hands the lookup up; a ref, because it changes whenever the run does and only a click or a
   * key ever reads it.
   */
  const reviewLookup = useRef<(key: string) => readonly WireSegment[] | undefined>(() => undefined);
  const onReviewLookup = useCallback(
    (lookup: (key: string) => readonly WireSegment[] | undefined) => {
      reviewLookup.current = lookup;
    },
    [],
  );
  const reviewFor = useCallback((key: string) => reviewLookup.current(key), []);

  /*
   * Every image the browser has listed, by key. A built timeline is a fixed list of files, as
   * legacy's is (`sequence_view_mode.py:123-126`), so its frames still open after the browser has
   * moved to another folder; clicking one did nothing until 2026-09-26 (SP-21).
   */
  const seenImages = useRef(new Map<string, WireDatasetImage>());
  useEffect(() => {
    for (const image of listed) seenImages.current.set(image.key, image);
  }, [listed]);

  /*
   * The list steps, as legacy's file manager does (fast_file_manager.py:1771-1843): from its current
   * row, which a click moves as well as an open, over the rows it shows. It stepped from the open
   * image until 2026-09-26, when a click in the list began to select without opening (CP-48).
   */
  const browser = useRef<DatasetBrowserHandle>(null);
  const step = useCallback((by: 1 | -1) => browser.current?.step(by), []);
  // Closed to its header, a section of the right-hand column gives its height to the others.
  const [segmentsClosed, setSegmentsClosed] = useState(false);
  const [classesClosed, setClassesClosed] = useState(false);
  // Save All writes files the list shows ticks for; it reads them again after (CP-48).
  const [writes, setWrites] = useState(0);
  /*
   * SAVE ALL CAN WRITE THE OPEN FRAME'S FILE, and legacy then loads the open frame from its file
   * again (main_window.py:4834-4839). So does this, when the frame has nothing unsaved; unsaved
   * edits are kept (SEQUENCE_PARITY.md SP-14). Left showing what it held before the run, the next
   * move's Auto-Save wrote that over the file Save All had just written, and deleted it for a frame
   * opened empty (found end to end, 2026-09-26). Read when Save All ends, so through a ref.
   */
  const openNow = useRef({ open, dirty: sides[activeSide].dirty, openImage, segments });
  openNow.current = { open, dirty: sides[activeSide].dirty, openImage, segments };
  /** The run's masks the open frame was loaded with at the end of a propagation (below). */
  const runShown = useRef<{ readonly key: string; readonly segments: readonly WireSegment[] } | null>(null);
  const onWritten = useCallback((keys: readonly string[]) => {
    setWrites((count) => count + 1);
    const now = openNow.current;
    if (now.open === null || !keys.includes(now.open.image.key)) return;
    // Unsaved only because it shows the run's masks, untouched, which Save All has just written:
    // loaded from the file without saving or asking, since nothing it holds is lost.
    const onlyTheRun = runShown.current?.key === now.open.image.key && runShown.current.segments === now.segments;
    if (onlyTheRun) now.openImage(now.open.image, { discard: true });
    else if (!now.dirty) now.openImage(now.open.image);
  }, []);
  /*
   * A FINISHED PROPAGATION LOADS THE OPEN FRAME AGAIN, so the masks the run made for it show, as
   * legacy's does (main_window.py:4638-4645). Through the review lookup, which is where the run's
   * masks are, and only for a frame with nothing unsaved (SP-14). The frame shows the run's masks
   * as unsaved, as one opened from the timeline does, and nothing is saved on the way. In an effect,
   * so the lookup the Sequence panel hands up after the run's last masks has been handed up.
   */
  const [propagations, setPropagations] = useState(0);
  const onPropagated = useCallback(() => setPropagations((count) => count + 1), []);
  useEffect(() => {
    if (propagations === 0) return;
    const now = openNow.current;
    if (now.open === null || now.dirty) return;
    const segments = reviewFor(now.open.image.key);
    if (segments === undefined) return;
    runShown.current = { key: now.open.image.key, segments };
    now.openImage(now.open.image, { segments, keepUnchanged: true });
  }, [propagations, reviewFor]);

  /*
   * IN THE MULTI TAB THE PAIR MOVES, as legacy's does (main_window.py:6491-6557; CP-31): by two rows
   * of the list as shown, counted from the LEFT image whichever side is being edited -- the next two
   * into the left and right, the right emptied when the list has only one more. Legacy's words at
   * the ends, where nothing moves, and when the left side is empty.
   *
   * WITH AUTO-SAVE ON NAVIGATE ON, BOTH SIDES ARE SAVED FIRST, before anything is decided -- at the
   * ends of the list and with the left side empty too -- changed or not, and an empty side's files
   * deleted without a word: legacy's `_save_multi_view_annotations` opens both of its moves
   * (main_window.py:6496-6497, 6529-6530; CONTROL_PARITY.md CP-67), which legacy runs whatever the
   * setting says and the owner wants only with it on (2026-09-26). A save that fails keeps the pair
   * where it is, with the reason said. The move is then made from what the save left, so a side
   * just saved is opened over or emptied without a question.
   */
  const { notify } = useNotifications();
  /** The move, from the pair as the save left it. `stepPair` calls it through a ref, after the save. */
  const movePair = (by: 1 | -1): void => {
    const left = sides[0].open;
    if (left === null) {
      notify({ severity: "info", message: "No current image" });
      return;
    }
    const at = shownRows.findIndex((image) => image.key === left.image.key);
    const first = at < 0 ? undefined : shownRows[at + 2 * by];
    if (first === undefined) {
      notify({
        severity: "info",
        message: by === 1 ? "Reached end of image list" : "Reached beginning of image list",
      });
      return;
    }
    const second = shownRows[at + 2 * by + 1];
    const review = (image: WireDatasetImage) => {
      const segments = reviewFor(image.key);
      return segments === undefined ? undefined : { segments };
    };
    // Saved already: the opens do not save the pair again.
    openImageOn(0, first, { ...review(first), pairSaved: true });
    if (second !== undefined) openImageOn(1, second, { ...review(second), pairSaved: true });
    // The tools go with the image left on screen, as when the pair is cleared by hand.
    else if (sides[1].open !== null && closeSide(1) && activeSide === 1) setActiveSide(0);
  };
  // The latest: the one a key press finds reads the sides as they were before the save.
  const movePairNow = useRef(movePair);
  movePairNow.current = movePair;
  // Both sides are saved first only with Auto-Save on Navigate on (the owner, 2026-09-26: saving on
  // a move is "only if the user has the save on navigation setting turned on"). With it off, each
  // side's open asks about its own changes, as in the Single view.
  const autoSave = settings.values["auto_save"] !== false;
  const stepPair = useCallback(
    (by: 1 | -1) => {
      if (!autoSave) {
        movePairNow.current(by);
        return;
      }
      void savePair().then((saved) => {
        if (saved) movePairNow.current(by);
      });
    },
    [autoSave, savePair],
  );

  /*
   * A FILE OPENED FROM THE LIST IN THE MULTI TAB OPENS A PAIR, as legacy's does: that file on the
   * left and the next one in the list's order on the right, the right emptied at the end of the
   * list; both sides saved first with Auto-Save on Navigate on (file_navigation_manager.py:390-423;
   * CP-31). With it off, each side's open asks about its own changes.
   */
  const openPair = (image: WireDatasetImage): void => {
    const at = shownRows.findIndex((row) => row.key === image.key);
    const second = at < 0 ? undefined : shownRows[at + 1];
    const review = (each: WireDatasetImage) => {
      const segments = reviewFor(each.key);
      return segments === undefined ? undefined : { segments };
    };
    openImageOn(0, image, { ...review(image), pairSaved: true });
    if (second !== undefined) openImageOn(1, second, { ...review(second), pairSaved: true });
    else if (sides[1].open !== null && closeSide(1) && activeSide === 1) setActiveSide(0);
  };
  const openPairNow = useRef(openPair);
  openPairNow.current = openPair;
  const onOpenInPair = useCallback(
    (image: WireDatasetImage) => {
      if (!autoSave) {
        openPairNow.current(image);
        return;
      }
      void savePair().then((saved) => {
        if (saved) openPairNow.current(image);
      });
    },
    [autoSave, savePair],
  );

  /*
   * OPEN IMAGE FOLDER, legacy's button over the file list (right_panel.py:112-114, 205;
   * main_window.py:1431-1438), by the owner's request of 2026-09-29: "in the gui the user should be
   * able to select a folder to load".
   *
   * THE IMAGE OPEN IS LEFT FIRST, as a move to another image leaves it: saved with Auto-Save on
   * Navigate on, asked about otherwise (`leaveAll`). First, and not once the folder has opened,
   * because then its key names a file in the new folder: its save would write there, over a
   * same-named image's files, and "keep my work" could no longer keep the user on it. A refused
   * save or a declined question keeps everything as it is, and no folder is asked for.
   *
   * THEN THE FOLDER, and while its dialog is open the app takes no input, as legacy's modal dialog
   * blocks its window: an edit made meanwhile would be closed unsaved when the folder opens. Closing
   * the dialog changes nothing more. Opening one empties the view -- both images closed, the
   * Sequence timeline gone as leaving its tab takes it, the Multi pair with the images -- and the
   * file list shows the new folder's root.
   */
  const { leaveAll, closeAll } = useWorkspace();
  const [openingFolder, setOpeningFolder] = useState(false);
  /** Rises with every folder opened: the file list goes to its root, and the timeline goes. */
  const [foldersOpened, setFoldersOpened] = useState(0);
  /** The server could show no folder dialog after all: the path is typed instead. */
  const [noDialog, setNoDialog] = useState(false);
  const openFolder = useCallback(
    async (request: FolderRequest): Promise<FolderOutcome> => {
      setOpeningFolder(true);
      try {
        if (!(await leaveAll())) return "stayed";
        let answer;
        try {
          answer = await client.openFolder(request);
        } catch (cause) {
          if (cause instanceof ApiError && cause.code === "no_folder_dialog") {
            setNoDialog(true);
            notify({ severity: "warning", message: cause.message });
            return "no-dialog";
          }
          notify({ severity: "error", message: `Could not open the folder: ${cause instanceof Error ? cause.message : String(cause)}` });
          return "failed";
        }
        if (answer.cancelled) return "cancelled";
        closeAll();
        setListed([]);
        setShownRows([]);
        setArchetypes([]);
        seenImages.current.clear();
        runShown.current = null;
        setHealth((current) =>
          current === null ? current : { ...current, dataset: "ok", datasetRoot: answer.datasetRoot },
        );
        setFoldersOpened((count) => count + 1);
        notify({ severity: "info", message: `Opened ${answer.datasetRoot ?? ""}` });
        return "opened";
      } finally {
        setOpeningFolder(false);
      }
    },
    [client, closeAll, leaveAll, notify],
  );
  useEffect(() => {
    if (!openingFolder) return undefined;
    // Keys too: the hotkeys listen on the document, which `inert` does not reach.
    const block = (event: KeyboardEvent): void => event.stopImmediatePropagation();
    window.addEventListener("keydown", block, true);
    return () => window.removeEventListener("keydown", block, true);
  }, [openingFolder]);

  useHotkey("load_next_image", () => (multiView ? stepPair(1) : step(1)));
  useHotkey("load_previous_image", () => (multiView ? stepPair(-1) : step(-1)));
  // Legacy's P toggles Auto-Convert. Registered here, where it is always mounted, rather than in
  // the Auto-Convert section, which can be collapsed.
  useAutoConvertKey();
  // Legacy's default model, chosen once when none is, so AI mode works as soon as it is picked.
  useDefaultModel(client);

  return (
    // Inert behind the hotkey dialog, so Tab cannot walk out of it into a page that would then
    // take the keystrokes the dialog exists to capture.
    // A <div>, not a second <main>: the image pane is the page's main landmark, and a <main>
    // inside a <main> is invalid and gives a screen reader two regions called main.
    <div className="app" inert={showHotkeys || showAbout || openingFolder}>
      {/* Renders nothing. It asks `onClose` whether closing this tab would lose work, and arms the
          browser's own dialog when it would -- decision 7's last silent path. */}
      <CloseGuard />

      {/* Named for a screen reader, not shown. Legacy's window has no heading and the image gets
          the space; the browser tab already says what the page is. */}
      <h1 className="visually-hidden">LazyLabel</h1>

      {healthError !== null && (
        <p role="alert" className="banner banner--error">
          The API could not be reached: {healthError}
        </p>
      )}

      {/* The dataset folder is the source of truth, so losing it blocks everything: nothing can be
          loaded or saved until it is available. The banner said that too until the owner asked,
          on 2026-09-26, for messages as short as legacy's. */}
      {health?.dataset === "unreadable" && (
        <p role="alert" className="banner banner--error">
          {/*
            * NAMING THE PATH, which the failure-mode table asks for and which this did not do.
            * "The dataset folder cannot be read" is true of a folder the operator configured, the
            * server knows and the browser was never told -- so the one person who can fix it was
            * given every word except the useful one. On a deployment pointed at the WRONG folder
            * it is worse still, because that one looks healthy: it lists somebody else's images.
            */}
          {health?.datasetRoot === undefined
            ? "The dataset folder cannot be read."
            : `The dataset folder ${health.datasetRoot} cannot be read.`}
        </p>
      )}

      {/* Losing the database does not: annotations are files in the folder, so labelling continues,
          which is why this is a status rather than an alert. */}
      {state.status === "unavailable" && (
        <p role="status" className="banner banner--warning">
          Settings are unavailable; preferences will not be remembered ({state.reason})
        </p>
      )}

      {/* Saves succeed and vanish when the API restarts, which from here is "settings do not
          save" -- the owner's report of 2026-09-26, whose API ran with LAZYLABEL_DB=:memory:. */}
      {health?.databaseInMemory === true && (
        <p role="status" className="banner banner--warning">
          Settings are kept in memory and will be lost when the API restarts.
        </p>
      )}

      <Workspace
        left={
          <>
            {/* Legacy's left column (control_panel.py:185-240): the Mode Controls card, a centred
                bold "Settings" label, then Global and Image tabs holding its sections in its
                order (385-531). Both tabs stay mounted: Image Adjustments holds the zoom keys. */}
            <ModeControls onHotkeys={() => setShowHotkeys(true)} />
            <p className="settings-label">Settings</p>
            <Tabs
              label="Settings"
              tabs={[
                {
                  id: "global",
                  label: "Global",
                  content: (
                    <>
                      <Panel title="AI Model Selection">
                        <ModelPicker client={client} />
                      </Panel>
                      <Panel title="AI Fragment Filter">
                        <FragmentPanel />
                      </Panel>
                      <Panel title="AI → Polygon Conversion">
                        <AutoPolygonPanel />
                      </Panel>
                      <Panel title="Application Settings">
                        {/* Legacy's group, its controls in its order (settings_widget.py:33-110).
                            Operate On View and pixel priority were in a Settings dialog behind an
                            "Edit settings" button here until 2026-09-29; the dialog is gone. */}
                        <ApplicationSettings />
                        {/* Not legacy's: the capability table, for whoever is checking the build. */}
                        <button type="button" className="app-settings__about" onClick={() => setShowAbout(true)}>
                          What is built
                        </button>
                      </Panel>
                    </>
                  ),
                },
                {
                  id: "image",
                  label: "Image",
                  content: (
                    <>
                      <Panel title="Border Crop">
                        <CropPanel />
                      </Panel>
                      {/* Legacy's three processing sections, in its order and with its defaults
                          (control_panel.py:503-521), each set again when an image loads (823-885):
                          Channel Threshold opens, Rescale and FFT open only for grayscale. */}
                      <Panel
                        title="Rescale"
                        initiallyCollapsed
                        collapseOnLoad={{ key: open?.metadata ?? null, collapsed: !grayscale }}
                      >
                        <RescalePanel client={client} projectId="default" />
                      </Panel>
                      <Panel
                        title="Channel Threshold"
                        collapseOnLoad={{ key: open?.metadata ?? null, collapsed: false }}
                      >
                        <ChannelThresholdPanel />
                      </Panel>
                      <Panel
                        title="FFT Threshold"
                        initiallyCollapsed
                        collapseOnLoad={{ key: open?.metadata ?? null, collapsed: !grayscale }}
                      >
                        <FrequencyPanel />
                      </Panel>
                      {/* Legacy's Size, Pan and Join, a section of their own (control_panel.py:
                          521-525). Pan and Join were in a Settings dialog until 2026-09-29. */}
                      <Panel title="Annotation Settings">
                        <AnnotationSettingsPanel />
                      </Panel>
                      <Panel title="Image Adjustments">
                        <ZoomControl />
                        <AdjustmentsPanel />
                      </Panel>
                    </>
                  ),
                },
              ]}
            />
            {showAbout && (
              <Dialog title="What is built" onClose={() => setShowAbout(false)}>
                <table className="capabilities">
                  <thead>
                    <tr>
                      <th scope="col">Capability</th>
                      <th scope="col">In the web app</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CAPABILITIES.map((entry) => (
                      <tr key={entry.id}>
                        <th scope="row">
                          {entry.id} · {entry.summary}
                        </th>
                        <td>
                          {entry.webStatus === "built" && "built"}
                          {entry.webStatus === "not-this-service" && "not the web app's"}
                          {entry.webStatus === "pending" && `${entry.webPhase}: ${entry.missing}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Dialog>
            )}
            {/* In a dialog, because the editor needs the width legacy's gave it and this column is
                a quarter of that. It renders into document.body, outside the inert page. Named as
                legacy's window is (hotkey_dialog.py:149); the editor draws the Close, on one row
                with Reset to Defaults as legacy's does. */}
            {showHotkeys && (
              <Dialog title="Hotkey Configuration" onClose={() => setShowHotkeys(false)} closeButton={false}>
                <HotkeyEditor onClose={() => setShowHotkeys(false)} />
              </Dialog>
            )}
          </>
        }
        centre={
          // Legacy's centre tabs. The Multi and Sequence tabs were collapsed panels in the right
          // column until 2026-09-24, a quarter of the window wide.
          <CentreTabs
            viewer={
              <OpenImageView
                client={client}
                projectId="default"
                // RULE-091's prefetch needs the folder in the order the user steps through it.
                folderKeys={listed.map((image) => image.key)}
                archetypes={archetypes}
              />
            }
            multi={(viewer) => (
              <SplitView
                images={listed}
                viewer={viewer}
                // Both panes' sizes and annotations come from the workspace store, which holds two
                // open images. The size has to land before the annotations, or the normalized
                // coordinates rescale, and the store already gets that order right.
                pixelsUrl={(key, processing) =>
                  client.pixelsUrl("default", key, processingQuery(processing))
                }
                tileUrl={(key, processing, z, x, y) =>
                  client.tileUrl("default", key, z, x, y, processingQuery(processing))
                }
              />
            )}
            sequenceStatus={sequenceStatus}
            // Leaving the Sequence tab reloads the open image from its file, as legacy's Single and
            // Multi each load it from disk: its unsaved edits and propagated masks go, unasked and
            // unsaved (main_window.py:3043-3056, 7242-7272; SEQUENCE_PARITY.md SP-15).
            onLeaveSequence={() => {
              if (open !== null) openImage(open.image, { discard: true });
            }}
            // Which image the Sequence tab's own viewer shows (SP-55).
            {...(open === null ? {} : { openKey: open.image.key, openSerial: open.serial })}
            sequence={
              <TimelinePanel
                client={client}
                images={listed}
                // Build takes the rows between Start and End as the list shows them (SP-20, SP-41),
                // and the list colours the range it hands back.
                rows={shownRows}
                onRange={setSequenceRange}
                savedElsewhere={saveCounts}
                // An open reference frame seeds from what is on screen, not its file (SP-04), and
                // the open image's class names at Propagate are the ones Save All writes (SP-05).
                {...(open === null
                  ? {}
                  : { openAnnotations: { key: open.image.key, segments, classAliases } })}
                onArchetypes={setArchetypes}
                onReviewLookup={onReviewLookup}
                // Without AI the propagation controls are hidden and their keys say why (SP-31).
                {...(health === null
                  ? {}
                  : { ai: { available: health.ai.available, videoCapable: health.ai.videoCapable, reason: health.ai.reason } })}
                onStatus={setSequenceStatus}
                onWritten={onWritten}
                onPropagated={onPropagated}
                folderOpened={foldersOpened}
                {...(open === null ? {} : { openKey: open.image.key })}
                onOpen={(key, segments, built) => {
                  const image = listed.find((entry) => entry.key === key) ?? seenImages.current.get(key);
                  // RULE-090: a frame the propagation produced masks for shows those masks. Build's
                  // open leaves an unchanged image unsaved, as legacy's does.
                  if (image !== undefined) {
                    openImage(image, {
                      ...(segments === undefined ? {} : { segments }),
                      ...(built === true ? { keepUnchanged: true } : {}),
                    });
                  }
                }}
              />
            }
          />
        }
        right={
          // Legacy's right panel: a vertical splitter of the file explorer, the segments and the
          // classes (right_panel.py:67-201), each keeping its share of the height and scrolling its
          // own list. Legacy's shares at 1600x900 are 294, 242 and 234 pixels of 770. A section's
          // minimum keeps its controls, its table's header and about two rows in view, near legacy's
          // own minimum sizes of 201, 146 and 138.
          <Splitter
            storageKey="lazylabel.rightColumn"
            sections={[
              {
                id: "images",
                label: "Images",
                share: 0.38,
                min: 200,
                content: (
                  <DatasetBrowser
                    ref={browser}
                    onOpenInPair={onOpenInPair}
                    client={client}
                    projectId="default"
                    onListed={setListed}
                    onShown={setShownRows}
                    reviewSegments={reviewFor}
                    range={sequenceRange}
                    root={health?.datasetRoot}
                    written={writes}
                    folderChoice={noDialog && health?.folderChoice === "dialog" ? "path" : health?.folderChoice}
                    onOpenFolder={openFolder}
                    opened={foldersOpened}
                    // Until /health says whether a folder is open, so a start with none shows no empty list.
                    pending={health === null && healthError === null}
                  />
                ),
              },
              {
                id: "segments",
                label: "Segments",
                share: 0.31,
                min: 170,
                collapsed: segmentsClosed,
                content: (
                  <Panel title="Segments" onCollapsedChange={setSegmentsClosed}>
                    <SegmentTable />
                  </Panel>
                ),
              },
              {
                id: "classes",
                label: "Classes",
                share: 0.31,
                min: 150,
                collapsed: classesClosed,
                content: (
                  <Panel title="Classes" onCollapsedChange={setClassesClosed}>
                    <ClassTable />
                  </Panel>
                ),
              },
            ]}
          />
        }
      />

      {/* Last, and outside the scrolling content, as legacy's: its messages show here too (CP-64). */}
      <StatusBar
        image={imageState}
        cropped={crop !== null}
        health={health}
        healthError={healthError}
        theme={{ switchesTo, onToggle: toggleTheme }}
      />
    </div>
  );
}

/**
 * How far in the image is drawn — the thing a browser's own zoom cannot do.
 *
 * Ctrl+= scales the whole PAGE, panels included; an annotator wants the picture larger and the
 * controls where they were. Legacy's zoom is image-only for the same reason, and without one a
 * 2000-pixel scan fitted into the pane shows five image pixels per screen pixel, which makes
 * placing a vertex on a boundary guesswork.
 *
 * FIT is the default and is not "100%". Fitting is what a user wants on opening an image; 1:1 on
 * a large scan shows one corner of it.
 */
function ZoomControl(): ReactNode {
  const { zoom, setZoom, open, fitted, multiView, setZoomOn, sides } = useWorkspace();
  const keyOf = useKeyHint();

  // Fit, key and button alike: in the Multi tab both viewers, as legacy's (viewport_manager.py:81-94).
  const fit = () => {
    if (multiView) {
      setZoomOn(0, null);
      setZoomOn(1, null);
    } else {
      setZoom(null);
    }
  };

  // Powers of two from an eighth to eight. A linear slider spends most of its travel between
  // sizes nobody wants, and legacy's own steps double. From Fit, the steps start at the size the
  // image is shown at: fitting enlarges a small image, and doubling from 1 would shrink it.
  const step = (by: 1 | -1) => {
    const from = zoom ?? fitted ?? 1;
    setZoom(clampZoom(by === 1 ? from * 2 : from / 2));
  };

  /*
   * The keys, which the schema has always listed and nothing has ever answered.
   *
   * ABOVE the early return, because a hook cannot be conditional -- so they are registered even
   * with no image open, where zooming changes nothing visible. That is the same bargain the
   * segment table's keys make, and the reference table means the same thing by "live": a handler
   * exists. Duplicating each action's enablement into that table is where it would start to drift.
   */
  useHotkey("zoom_in", () => step(1));
  useHotkey("zoom_out", () => step(-1));
  // Fit, which is this app's default and is NOT 1:1 -- one-to-one on a large scan shows a corner.
  useHotkey("fit_view", fit);

  if (open === null) return null;

  // Legacy has no zoom buttons, only the keys, so each carries its key's name from legacy's hotkey
  // list (hotkeys.py:45, 108-109).
  return (
    <div className="zoom">
      <span>Zoom</span>
      <button type="button" aria-label="Zoom out" title={`Zoom Out${keyOf("zoom_out")}`} onClick={() => step(-1)}>
        −
      </button>
      <span className="field__value">{zoom === null ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
      <button type="button" aria-label="Zoom in" title={`Zoom In${keyOf("zoom_in")}`} onClick={() => step(1)}>
        +
      </button>
      <button
        type="button"
        title={`Fit View${keyOf("fit_view")}`}
        onClick={fit}
        disabled={multiView ? sides.every((side) => side.zoom === null) : zoom === null}
      >
        Fit
      </button>
      <button type="button" onClick={() => setZoom(1)}>1:1</button>
    </div>
  );
}

/** Whether the OS asks for dark. Guarded: jsdom and older browsers have no matchMedia. */
function systemPrefersDark(): boolean {
  return (
    typeof globalThis.matchMedia === "function"
    && globalThis.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

