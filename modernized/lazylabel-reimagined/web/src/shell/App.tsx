/**
 * The application shell.
 *
 * Phase 2 built the shell itself: configuration, logging, settings and hotkeys. Phase 4 added the
 * dataset browser. What is still missing is the workspace — the canvas and the tools — so the shell
 * says plainly what is not built rather than mocking an editor that would be thrown away.
 *
 * What it genuinely exercises: the API client against a real server, the settings provider
 * including its degraded state, the hotkey system end to end, and the capability table.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { CAPABILITIES } from "../capabilities.js";
import { DatasetBrowser } from "../dataset/DatasetBrowser.jsx";
import { NotificationHost } from "../notifications/NotificationProvider.jsx";
import { OpenImageView } from "../workspace/OpenImageView.jsx";
import { useWorkspace, type Tool } from "../workspace/WorkspaceProvider.jsx";
import { Panel, Workspace } from "./Panel.jsx";
import { StatusBar } from "./StatusBar.jsx";
import { applyTheme, nextTheme, themeFor } from "./theme.js";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { useHotkey, useHotkeyContext } from "../hotkeys/HotkeyProvider.jsx";
import type { ApiClient, ApiHealth } from "../api/client.js";

/** The client already names this shape; re-declaring it here is how the two drift apart. */
type Health = ApiHealth;

export function App({ client }: { readonly client: ApiClient }): ReactNode {
  const { state, settings, save } = useSettings();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [showHotkeys, setShowHotkeys] = useState(false);
  // From the store, not held here: the status bar is one reader of this among several.
  const { imageState } = useWorkspace();

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

  // The shell's own hotkey, and the proof the dispatcher works end to end.
  useHotkey("fit_view", () => setShowHotkeys((open) => !open));

  return (
    <main className="app">
      <NotificationHost />

      <header>
        <h1>LazyLabel</h1>
        <p className="subtitle">The drawing and AI tools are built in Phase 5</p>
      </header>

      {healthError !== null && (
        <p role="alert" className="banner banner--error">
          The API could not be reached: {healthError}
        </p>
      )}

      {/* The dataset folder is the source of truth, so losing it blocks everything. */}
      {health?.dataset === "unreadable" && (
        <p role="alert" className="banner banner--error">
          The dataset folder cannot be read. Nothing can be loaded or saved until it is available.
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
              {/* Named, not mocked: the rest of the drawing tools are still Phase 5 work, and a row
                  of dead buttons would invite a user to press one. */}
              <p className="panel__missing">
                Boxes, circles and vertex editing are still to come.
              </p>
            </Panel>
            <Panel
              title="AI tools"
              pending={{ phase: "Phase 5", summary: "click and box prompts through the SAM service" }}
            />
            <Panel
              title="Image adjustments"
              pending={{ phase: "Phase 5", summary: "brightness, contrast, channel thresholds and crop" }}
            />

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
              <button type="button" onClick={() => setShowHotkeys((open) => !open)}>
                {showHotkeys ? "Hide" : "Show"} hotkeys
              </button>
              {showHotkeys && <HotkeyReference />}
            </Panel>
          </>
        }
        centre={<OpenImageView client={client} projectId="default" />}
        right={
          <>
            <DatasetBrowser client={client} projectId="default" />

            <Panel
              title="Segments"
              pending={{ phase: "Phase 5", summary: "the segment table, with merge, delete and reclass" }}
            />
            <Panel
              title="Classes"
              pending={{ phase: "Phase 5", summary: "the class table and its ordering controls" }}
            />

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
function ToolPicker(): ReactNode {
  const { activeTool, setActiveTool } = useWorkspace();

  const tools: readonly { readonly value: Tool; readonly label: string }[] = [
    { value: "none", label: "None" },
    { value: "polygon", label: "Polygon" },
  ];

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

/** The bindings in force, grouped the way the legacy hotkey dialog groups them. */
function HotkeyReference(): ReactNode {
  const { bindings } = useHotkeyContext();

  return (
    <section>
      <h2>Hotkeys</h2>
      <table className="hotkeys">
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Key</th>
            <th scope="col">Alternate</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(bindings).map(([action, binding]) => (
            <tr key={action}>
              <th scope="row">{action}</th>
              <td>{binding.primary}</td>
              <td>{binding.secondary ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
