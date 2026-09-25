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

import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { WireDatasetImage } from "@lazylabel/contracts";

import { CAPABILITIES } from "../capabilities.js";
import { DatasetBrowser } from "../dataset/DatasetBrowser.jsx";
import { ExportFormats } from "../dataset/ExportFormats.jsx";
import { NotificationHost } from "../notifications/NotificationProvider.jsx";
import { OpenImageView } from "../workspace/OpenImageView.jsx";
import { AdjustmentsPanel } from "../workspace/AdjustmentsPanel.jsx";
import { ClassTable } from "../workspace/ClassTable.jsx";
import { ChannelPanel } from "../workspace/ChannelPanel.jsx";
import { SplitView } from "../split/SplitView.jsx";
import { CloseGuard } from "../workspace/CloseGuard.jsx";
import { TimelinePanel } from "../sequence/TimelinePanel.jsx";
import { CropPanel } from "../workspace/CropPanel.jsx";
import { ModelPicker } from "../workspace/ModelPicker.jsx";
import { AutoPolygonPanel } from "../workspace/AutoPolygonPanel.jsx";
import { FragmentPanel } from "../workspace/FragmentPanel.jsx";
import { SegmentTable } from "../workspace/SegmentTable.jsx";
import { processingQuery } from "../workspace/processing.js";
import { useWorkspace } from "../workspace/WorkspaceProvider.jsx";
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
import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";
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
  const { imageState, openImage, open, crop } = useWorkspace();
  // The folder as the browser listed it, so the sequence timeline builds from the same answer
  // rather than fetching it again. Two fetches is two answers to one question.
  const [listed, setListed] = useState<readonly WireDatasetImage[]>([]);
  /**
   * What Find Archetypes suggested, held HERE because two distant parts of the tree need it.
   *
   * The timeline draws them; RULE-091's prefetch, which runs beside the open image, encodes the
   * first uncached one ahead of the neighbours. The shell is the only place that can see both.
   */
  const [archetypes, setArchetypes] = useState<readonly string[]>([]);

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
   * over `listed`, the same array the browser rendered, so the key and a click move through the
   * same order -- a second source for "what is next" would eventually disagree with the one the
   * user can see.
   *
   * Unsaved work is still guarded: `openImage` asks before discarding it, whatever route asked for
   * the change. A hotkey that bypassed the prompt would be the fastest possible way to lose a
   * whole image, because it is the key you hold down.
   */
  const step = useCallback(
    (by: 1 | -1) => {
      if (open === null || listed.length === 0) return;
      const at = listed.findIndex((image) => image.key === open.image.key);
      if (at < 0) return;
      // Clamped, not wrapping. Legacy stops at the ends, and a folder that silently restarts is
      // how a user re-labels the first image believing it is the last.
      const next = listed[Math.min(listed.length - 1, Math.max(0, at + by))];
      if (next !== undefined && next.key !== open.image.key) openImage(next);
    },
    [listed, open, openImage],
  );

  useHotkey("load_next_image", () => step(1));
  useHotkey("load_previous_image", () => step(-1));

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

      {/* The dataset folder is the source of truth, so losing it blocks everything. */}
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
            : `The dataset folder ${health.datasetRoot} cannot be read.`}{" "}
          Nothing can be loaded or saved until it is available.
        </p>
      )}

      {/* Losing the database does not. Annotations are files, so labelling continues. */}
      {state.status === "unavailable" && (
        <p role="status" className="banner banner--warning">
          Settings are unavailable, so preferences will not be remembered. Annotation work is
          unaffected, because annotations are files in your folder. ({state.reason})
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
                        {state.status === "loading" ? (
                          <p>Loading…</p>
                        ) : (
                          <p>
                            Schema version {state.settings.schemaVersion},{" "}
                            {Object.keys(state.settings.values).length} settings and{" "}
                            {Object.keys(state.settings.hotkeys).length} hotkeys.
                          </p>
                        )}
                        <ExportFormats />
                        <button type="button" onClick={() => setShowSettings(true)}>
                          Edit settings
                        </button>{" "}
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
                      <Panel title="Rescale and Channel Threshold" initiallyCollapsed>
                        <ChannelPanel />
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
                a quarter of that. It renders into document.body, outside the inert page. */}
            {showHotkeys && (
              <Dialog title="Hotkeys" onClose={() => setShowHotkeys(false)}>
                <HotkeyEditor />
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
            sequence={
              <TimelinePanel
                client={client}
                images={listed}
                onArchetypes={setArchetypes}
                onOpen={(key, segments) => {
                  const image = listed.find((entry) => entry.key === key);
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
            <DatasetBrowser client={client} projectId="default" onListed={setListed} />

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

  // Powers of two from an eighth to eight. A linear slider spends most of its travel between
  // sizes nobody wants, and legacy's own steps double. From Fit, the steps start at the size the
  // image is shown at: fitting enlarges a small image, and doubling from 1 would shrink it.
  const step = (by: 1 | -1) => {
    const from = zoom ?? fitted ?? 1;
    setZoom(Math.min(8, Math.max(0.125, by === 1 ? from * 2 : from / 2)));
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

  return (
    <div className="zoom">
      <span>Zoom</span>
      <button type="button" aria-label="Zoom out" onClick={() => step(-1)}>−</button>
      <span className="field__value">{zoom === null ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
      <button type="button" aria-label="Zoom in" onClick={() => step(1)}>+</button>
      <button type="button" onClick={() => setZoom(null)} disabled={zoom === null}>
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

