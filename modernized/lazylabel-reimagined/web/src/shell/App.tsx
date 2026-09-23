/**
 * The application shell.
 *
 * Phase 2 built the shell, Phase 4 the dataset browser and the three-pane layout, Phase 5 the
 * tools that fill the panels. The subtitle used to name the phase the tools were coming in; it
 * names what the app is for now, because a user is not reading a plan.
 *
 * What it genuinely exercises: the API client against a real server, the settings provider
 * including its degraded state, the hotkey system end to end, and the capability table.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { WireDatasetImage } from "@lazylabel/contracts";

import { CAPABILITIES } from "../capabilities.js";
import { DatasetBrowser } from "../dataset/DatasetBrowser.jsx";
import { NotificationHost } from "../notifications/NotificationProvider.jsx";
import { OpenImageView } from "../workspace/OpenImageView.jsx";
import { AdjustmentsPanel } from "../workspace/AdjustmentsPanel.jsx";
import { ClassTable } from "../workspace/ClassTable.jsx";
import { HistoryControls } from "../workspace/HistoryControls.jsx";
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
import { useWorkspace, type Tool } from "../workspace/WorkspaceProvider.jsx";
import { Panel, Workspace } from "./Panel.jsx";
import { StatusBar } from "./StatusBar.jsx";
import { applyTheme, nextTheme, themeFor } from "./theme.js";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { HotkeyEditor } from "../hotkeys/HotkeyEditor.jsx";
import { Dialog } from "./Dialog.jsx";
import { SettingsEditor } from "../settings/SettingsEditor.jsx";
import { useHotkey } from "../hotkeys/HotkeyProvider.jsx";
import type { ApiClient, ApiHealth } from "../api/client.js";
import { enterEditMode } from "../tools/edit.js";
import { useNotifications } from "../notifications/NotificationProvider.jsx";

/** The client already names this shape; re-declaring it here is how the two drift apart. */
type Health = ApiHealth;

export function App({ client }: { readonly client: ApiClient }): ReactNode {
  const { state, settings, save } = useSettings();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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
    <main className="app" inert={showHotkeys || showSettings}>
      <NotificationHost />
      {/* Renders nothing. It asks `onClose` whether closing this tab would lose work, and arms the
          browser's own dialog when it would -- decision 7's last silent path. */}
      <CloseGuard />

      <header>
        <h1>LazyLabel</h1>
        <p className="subtitle">Annotate a folder of images, in the browser</p>
      </header>

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
            {/* Legacy's mode buttons live here: SAM, polygon, bbox, circle, selection, edit. They
                are named rather than mocked -- a row of disabled buttons that look real invites a
                user to press one, and saying where the work stands does not. */}
            <Panel title="Drawing tools">
              <ToolPicker />
              <HistoryControls />
              {/* Shift erases with whichever shape is active, which is legacy's gesture and is not
                  discoverable by looking at the picker. It is read when the shape is FINISHED -- a
                  box or circle released, a polygon closed -- so "while drawing" misled: a polygon
                  drawn with Shift and closed by a plain Enter is added (found 2026-09-23). */}
              <p className="panel__missing">
                Hold Shift as you finish a shape to erase with it instead of adding it: release a
                box or circle with Shift held, or close a polygon with Shift+Enter.
              </p>
            </Panel>
            <Panel title="AI tools">
              <ModelPicker client={client} />
              <AutoPolygonPanel />
              <FragmentPanel />
            </Panel>
            <Panel title="Image adjustments">
              <ZoomControl />
              <AdjustmentsPanel />
            </Panel>
            <Panel title="Rescale and thresholds" initiallyCollapsed>
              <ChannelPanel />
            </Panel>
            <Panel title="Crop" initiallyCollapsed>
              <CropPanel />
            </Panel>

            <Panel title="Settings">
              {state.status === "loading" ? (
                <p>Loading…</p>
              ) : (
                <p>
                  Schema version {state.settings.schemaVersion},{" "}
                  {Object.keys(state.settings.values).length} settings and{" "}
                  {Object.keys(state.settings.hotkeys).length} hotkeys.
                </p>
              )}
              <button type="button" onClick={() => setShowSettings(true)}>
                Edit settings
              </button>{" "}
              <button type="button" onClick={() => setShowHotkeys(true)}>
                Show hotkeys
              </button>
              {showSettings && (
                <Dialog title="Settings" onClose={() => setShowSettings(false)}>
                  <SettingsEditor />
                </Dialog>
              )}
              {/* In a dialog, because the editor needs the width legacy's gave it and this column
                  is a quarter of that. It renders into document.body, outside the inert page. */}
              {showHotkeys && (
                <Dialog title="Hotkeys" onClose={() => setShowHotkeys(false)}>
                  <HotkeyEditor />
                </Dialog>
              )}
            </Panel>
          </>
        }
        centre={
          <OpenImageView
            client={client}
            projectId="default"
            // RULE-091's prefetch needs the folder in the order the user steps through it.
            folderKeys={listed.map((image) => image.key)}
            archetypes={archetypes}
          />
        }
        right={
          <>
            <DatasetBrowser client={client} projectId="default" onListed={setListed} />

            <Panel title="Split view" initiallyCollapsed>
              <SplitView
                images={listed}
                // Both panes' sizes and annotations now come from the workspace store, which holds
                // two open images. The measuring and loading that used to happen in the view were
                // there only because it held one, and they were a second copy of an ordering the
                // store already gets right: the size has to land before the annotations, or the
                // normalized coordinates rescale.
                pixelsUrl={(key, processing) =>
                  client.pixelsUrl("default", key, processingQuery(processing))
                }
                tileUrl={(key, processing, z, x, y) =>
                  client.tileUrl("default", key, z, x, y, processingQuery(processing))
                }
              />
            </Panel>

            <Panel title="Sequence" initiallyCollapsed>
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
            </Panel>

            <Panel title="Segments">
              <SegmentTable />
            </Panel>
            <Panel title="Classes">
              <ClassTable />
            </Panel>

            <Panel title="What is built" initiallyCollapsed>
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
    </main>
  );
}

/**
 * Choosing a drawing tool.
 *
 * Radio buttons rather than toggle buttons, because the tools are exclusive and a radio group says
 * so to a screen reader and to the keyboard without any code. "None" is a real option and the
 * default: a canvas that starts in a drawing mode turns the first click of a session -- often a
 * click to look at something -- into an annotation.
 */
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
  const { zoom, setZoom, open } = useWorkspace();

  // Powers of two from an eighth to eight. A linear slider spends most of its travel between
  // sizes nobody wants, and legacy's own steps double.
  const step = (by: 1 | -1) => {
    const from = zoom ?? 1;
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

function ToolPicker(): ReactNode {
  const { activeTool, setActiveTool, segments, selected, toggleRecentClass } = useWorkspace();
  const { notify } = useNotifications();

  const tools: readonly { readonly value: Tool; readonly label: string }[] = [
    { value: "none", label: "None" },
    { value: "select", label: "Select" },
    { value: "polygon", label: "Polygon" },
    { value: "box", label: "Box" },
    { value: "circle", label: "Circle" },
    { value: "ai", label: "AI" },
    // Not an annotation tool: a crop decides which pixels reach the FILE (RULE-018), and it sits
    // here because it is chosen and drawn the same way the others are.
    { value: "crop", label: "Crop" },
    // Also not an annotation tool: it moves the VIEW, and nothing it does can be lost.
    { value: "pan", label: "Pan" },
  ];

  /*
   * THE KEYS, which the hotkey reference has been promising since Phase 2 while nothing listened.
   * 1/2/3/4 pick a tool directly, E selects, R edits -- legacy's own bindings, imported with the
   * settings so a user's remapping is honoured.
   *
   * SET DIRECTLY, NOT TOGGLED. RULE-070 is a defect card: legacy means Selection and Edit to
   * toggle back to the previous mode, and the view-model records the mode just left every time, so
   * E R R E leaves you in selection unable to get back to AI without pressing 1. Reproducing that
   * would be reproducing the bug -- the card says so -- and a tool key that sometimes does
   * something else is worse than one that always does the same thing.
   *
   * "edit" is not a tool here: the vertex editor appears when exactly one annotation is selected
   * and no drawing tool is active, so R means "no tool", which is the state that shows the
   * handles.
   */
  useHotkey("sam_mode", () => setActiveTool("ai"));
  useHotkey("polygon_mode", () => setActiveTool("polygon"));
  useHotkey("bbox_mode", () => setActiveTool("box"));
  useHotkey("circle_mode", () => setActiveTool("circle"));
  useHotkey("selection_mode", () => setActiveTool("select"));
  /*
   * EDIT SAYS WHY IT DID NOTHING. The vertex editor opens when exactly one editable annotation is
   * selected and no drawing tool is active, so R clears the tool -- and with nothing selected, or
   * with an AI mask selected, clearing the tool is all that visibly happens. `enterEditMode`
   * carries legacy's own words for that, and they are the only thing separating "the key is not
   * bound" from "this shape has no vertices to drag": a user whose selection is a mask will
   * otherwise press R repeatedly.
   *
   * The tool is still cleared on a refusal. The key means "stop drawing and edit"; refusing the
   * second half is not a reason to ignore the first, and leaving the polygon tool armed would put
   * the next click into a new shape.
   */
  useHotkey("pan_mode", () => setActiveTool("pan"));
  // Legacy's X. It lives beside the tool keys because it is the same kind of thing: what the next
  // stroke will be, chosen without reaching for a panel.
  useHotkey("toggle_recent_class", toggleRecentClass);
  useHotkey("edit_mode", () => {
    setActiveTool("none");
    const outcome = enterEditMode(segments, selected);
    if (outcome.kind === "refused") notify({ severity: "info", message: outcome.reason });
  });

  return (
    <fieldset className="tool-picker">
      <legend>Tool</legend>
      {tools.map((tool) => (
        <label key={tool.value}>
          <input
            type="radio"
            name="tool"
            checked={activeTool === tool.value}
            onChange={() => setActiveTool(tool.value)}
          />{" "}
          {tool.label}
        </label>
      ))}
    </fieldset>
  );
}

/** Whether the OS asks for dark. Guarded: jsdom and older browsers have no matchMedia. */
function systemPrefersDark(): boolean {
  return (
    typeof globalThis.matchMedia === "function"
    && globalThis.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

