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

import { useEffect, useState, type ReactNode } from "react";

import { CAPABILITIES } from "../capabilities.js";
import { DatasetBrowser } from "../dataset/DatasetBrowser.jsx";
import { NotificationHost } from "../notifications/NotificationProvider.jsx";
import { StatusBar } from "./StatusBar.jsx";
import type { ImageState } from "../workspace/saveState.js";
import { useSettings } from "../settings/SettingsProvider.jsx";
import { useHotkey, useHotkeyContext } from "../hotkeys/HotkeyProvider.jsx";
import type { ApiClient, ApiHealth } from "../api/client.js";

/** The client already names this shape; re-declaring it here is how the two drift apart. */
type Health = ApiHealth;

export function App({ client }: { readonly client: ApiClient }): ReactNode {
  const { state } = useSettings();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [openImage, setOpenImage] = useState<ImageState | null>(null);

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
        <p className="subtitle">The canvas and the drawing tools are built in Phase 5</p>
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

      {health !== null && (
        <dl className="health">
          <dt>Dataset folder</dt>
          <dd>{health.dataset}</dd>
          <dt>Settings database</dt>
          <dd>{health.database}</dd>
        </dl>
      )}

      <section>
        <h2>Settings</h2>
        {state.status === "loading" ? (
          <p>Loading…</p>
        ) : (
          <p>
            Schema version {state.settings.schemaVersion}, {Object.keys(state.settings.values).length}{" "}
            settings and {Object.keys(state.settings.hotkeys).length} hotkeys.
          </p>
        )}
        <button type="button" onClick={() => setShowHotkeys((open) => !open)}>
          {showHotkeys ? "Hide" : "Show"} hotkeys
        </button>
      </section>

      {showHotkeys && <HotkeyReference />}

      <DatasetBrowser client={client} projectId="default" onImageState={setOpenImage} />

      <section>
        <h2>What is built</h2>
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
      </section>

      {/* Last, and outside the scrolling content: continuous state, never events. What used to be a
          status-bar message is a notification now, which is what stops a destructive one expiring. */}
      <StatusBar image={openImage} health={health} />
    </main>
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
