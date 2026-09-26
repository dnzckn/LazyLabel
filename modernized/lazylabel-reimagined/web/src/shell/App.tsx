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
import { DatasetBrowser } from "../dataset/DatasetBrowser.jsx";
import { ExportFormats } from "../dataset/ExportFormats.jsx";
import { NotificationHost } from "../notifications/NotificationProvider.jsx";
import { OpenImageView } from "../workspace/OpenImageView.jsx";
import { AdjustmentsPanel } from "../workspace/AdjustmentsPanel.jsx";
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
import { CentreTabs } from "./CentreTabs.jsx";
import { ModeControls } from "./ModeControls.jsx";
import { Tabs } from "./Tabs.jsx";
import { StatusBar } from "./StatusBar.jsx";
import { applyTheme, nextTheme, themeFor } from "./theme.js";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { HotkeyEditor } from "../hotkeys/HotkeyEditor.jsx";
import { Dialog } from "./Dialog.jsx";
import { SettingsEditor } from "../settings/SettingsEditor.jsx";
import { ResetSettings } from "../settings/ResetSettings.jsx";
import { useHotkey, useKeyHint } from "../hotkeys/HotkeyProvider.jsx";
import type { ApiClient, ApiHealth } from "../api/client.js";

/** The client already names this shape; re-declaring it here is how the two drift apart. */
type Health = ApiHealth;

export function App({ client }: { readonly client: ApiClient }): ReactNode {
  const { state, settings, save } = useSettings();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // The capability table: for whoever is checking this build, not for labelling, so it lives in a
  // dialog rather than a panel beside the work (legacy has none).
  const [showAbout, setShowAbout] = useState(false);
  // From the store, not held here: the status bar is one reader of this among several.
  const { imageState, openImage, open, crop, saveCounts, segments, classAliases } = useWorkspace();
  // RULE-024's answer, from the pixels: whether a load opens the Rescale and FFT sections.
  const grayscale = open?.metadata?.sourceChannels === 1;
  // The folder as the browser listed it, so the sequence timeline builds from the same answer
  // rather than fetching it again. Two fetches is two answers to one question.
  const [listed, setListed] = useState<readonly WireDatasetImage[]>([]);
  // The rows the list SHOWS, sorted and searched: the order next and previous image step through.
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
   * The shell owns them because the shell is what knows the FOLDER: the store holds what is open,
   * the dataset browser holds the list, and this is where the two already meet. Stepping is done
   * over the rows the browser SHOWS, sorted and searched, so the key moves to the row below the
   * one open, as legacy's does. It stepped over the raw listing until 2026-09-25, which a sort or a
   * search made a different order from the one on screen (`CONTROL_PARITY.md` CP-14).
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

  const step = useCallback(
    (by: 1 | -1) => {
      if (open === null || shownRows.length === 0) return;
      const at = shownRows.findIndex((image) => image.key === open.image.key);
      if (at < 0) return;
      // Clamped, not wrapping. Legacy stops at the ends, and a folder that silently restarts is
      // how a user re-labels the first image believing it is the last.
      const next = shownRows[Math.min(shownRows.length - 1, Math.max(0, at + by))];
      if (next === undefined || next.key === open.image.key) return;
      const segments = reviewFor(next.key);
      openImage(next, segments === undefined ? undefined : { segments });
    },
    [shownRows, open, openImage, reviewFor],
  );

  useHotkey("load_next_image", () => step(1));
  useHotkey("load_previous_image", () => step(-1));
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
    <div className="app" inert={showHotkeys || showSettings || showAbout}>
      <NotificationHost />
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
                        {/* Controls only, as legacy's group has (settings_widget.py:33-110). It
                            opened with a line counting the schema's settings and hotkeys. */}
                        {/* Legacy's first control here, on by default (settings_widget.py:39-44).
                            Moving to another image saves the one being left, by the owner's
                            decision of 2026-09-25; off, the move asks instead. */}
                        <label title="Automatically save work when switching to any new image (navigation keys, the file list, the timeline)">
                          <input
                            type="checkbox"
                            checked={settings.values["auto_save"] !== false}
                            onChange={(event) =>
                              void save({
                                ...settings,
                                values: { ...settings.values, auto_save: event.currentTarget.checked },
                              })
                            }
                          />{" "}
                          Auto-Save on Navigate
                        </label>
                        <ExportFormats />
                        <button type="button" onClick={() => setShowSettings(true)}>
                          Edit settings
                        </button>{" "}
                        {/* Legacy's last control in this group (settings_widget.py:104-110), for
                            every setting rather than the group's five; hotkeys keep theirs. */}
                        <ResetSettings />{" "}
                        <button type="button" onClick={() => setShowAbout(true)}>
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
                      <Panel title="Image Adjustments">
                        <ZoomControl />
                        <AdjustmentsPanel />
                      </Panel>
                    </>
                  ),
                },
              ]}
            />
            {showSettings && (
              <Dialog title="Settings" onClose={() => setShowSettings(false)}>
                <SettingsEditor />
              </Dialog>
            )}
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
                {...(open === null ? {} : { openKey: open.image.key })}
                onOpen={(key, segments) => {
                  const image = listed.find((entry) => entry.key === key) ?? seenImages.current.get(key);
                  // RULE-090: a frame the propagation produced masks for shows those masks.
                  if (image !== undefined) {
                    openImage(image, segments === undefined ? undefined : { segments });
                  }
                }}
              />
            }
          />
        }
        right={
          <>
            <DatasetBrowser
              client={client}
              projectId="default"
              onListed={setListed}
              onShown={setShownRows}
              reviewSegments={reviewFor}
              range={sequenceRange}
            />

            <Panel title="Segments">
              <SegmentTable />
            </Panel>
            <Panel title="Classes">
              <ClassTable />
            </Panel>

          </>
        }
      />

      {/* Last, and outside the scrolling content: continuous state, never events. What used to be a
          status-bar message is a notification now, which is what stops a destructive one expiring. */}
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
  const { zoom, setZoom, open, fitted } = useWorkspace();
  const keyOf = useKeyHint();

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
  useHotkey("fit_view", () => setZoom(null));

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
        onClick={() => setZoom(null)}
        disabled={zoom === null}
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

