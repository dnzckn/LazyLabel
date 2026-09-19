/**
 * Settings and hotkeys, loaded once and shared by the app.
 *
 * The state has four cases and they are kept apart on purpose, because the failure-mode table in
 * `AI_NATIVE_SPEC.md` gives the database its own row: when it is unavailable, "nothing persists
 * across a reload, but annotations still load and save, because they are files", and the user sees
 * a banner rather than a blocked app.
 *
 * So `unavailable` is not an error state. It carries working defaults, lets every annotation
 * feature run, and only says that preferences will not be remembered. Collapsing it into `failed`
 * would stop someone labelling because their settings file is locked, which is the opposite of
 * what decision 5 bought by keeping annotations in the user's folder.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { defaultSettings, type StoredSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../api/client.js";

export type SettingsState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly settings: StoredSettings }
  | {
      /** Settings could not be read. Defaults are in use and will not be remembered. */
      readonly status: "unavailable";
      readonly settings: StoredSettings;
      readonly reason: string;
    };

export interface SettingsContextValue {
  readonly state: SettingsState;
  /** The settings to act on, whatever the state. Never undefined, so no caller has to branch. */
  readonly settings: StoredSettings;
  readonly save: (next: StoredSettings) => Promise<{ corrections: readonly string[] }>;
  readonly reload: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
  client,
  children,
}: {
  readonly client: ApiClient;
  readonly children: ReactNode;
}): ReactNode {
  const [state, setState] = useState<SettingsState>({ status: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;

    client
      .getSettings()
      .then((settings) => {
        if (!cancelled) setState({ status: "ready", settings });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          status: "unavailable",
          settings: defaultSettings(),
          reason: cause instanceof Error ? cause.message : String(cause),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [client, generation]);

  const save = useCallback(
    async (next: StoredSettings) => {
      const stored = await client.putSettings(next);
      setState({ status: "ready", settings: stored });
      // The API corrects an unusable export-format list rather than storing it (RULE-088), and says
      // so. Returning that lets the caller tell the user instead of quietly showing something else
      // than what they chose.
      return { corrections: stored.corrections ?? [] };
    },
    [client],
  );

  const reload = useCallback(() => setGeneration((n) => n + 1), []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      state,
      settings: state.status === "loading" ? defaultSettings() : state.settings,
      save,
      reload,
    }),
    [state, save, reload],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (value === null) throw new Error("useSettings must be used inside a SettingsProvider");
  return value;
}
