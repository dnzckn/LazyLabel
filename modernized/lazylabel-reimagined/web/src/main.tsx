/**
 * Browser entry point: build the client, wire the providers, mount.
 *
 * The hotkey bindings come from the loaded settings, so a rebinding takes effect without a reload;
 * `HotkeyProvider` rebuilds its key map whenever they change.
 */

import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { ApiClient } from "./api/client.js";
import { createLogger } from "./log.js";
import { HotkeyProvider } from "./hotkeys/HotkeyProvider.jsx";
import { NotificationProvider } from "./notifications/NotificationProvider.jsx";
import { SettingsProvider, useSettings } from "./settings/SettingsProvider.jsx";
import { App } from "./shell/App.jsx";

import "./styles.css";

const logger = createLogger();

const client = new ApiClient({
  baseUrl: import.meta.env["VITE_LAZYLABEL_API"] ?? "/api",
  // The correlation id ties a browser error to the server's log line for the same request. Without
  // it, "it failed" from a user and a million log lines are two unrelated facts.
  onCorrelationId: (id) => logger.log("debug", "request", { correlationId: id }),
});

/** Bindings live in settings, so the hotkey provider sits inside the settings provider. */
function Bound(): ReactNode {
  const { settings } = useSettings();
  return (
    <HotkeyProvider bindings={settings.hotkeys}>
      <App client={client} />
    </HotkeyProvider>
  );
}

const container = document.getElementById("root");
if (container === null) throw new Error("index.html has no #root element to mount into");

createRoot(container).render(
  <StrictMode>
    {/* Outermost, because a failure to LOAD settings is itself something to report. */}
    <NotificationProvider>
      <SettingsProvider client={client}>
        <Bound />
      </SettingsProvider>
    </NotificationProvider>
  </StrictMode>,
);
