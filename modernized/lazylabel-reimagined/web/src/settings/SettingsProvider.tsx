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
 *
 * SAVES GO ONE AT A TIME, EACH ON TOP OF THE LAST. A caller hands over the whole document, built
 * from the settings it was rendered with; the provider keeps only what that caller CHANGED
 * (`changes.ts`) and applies it to the document the server last confirmed. Until 2026-09-26 each
 * document was sent as built, so two saves inside one round trip were built from the same snapshot
 * and the second put back what the first had changed: a pan speed committed on blur, then a click on
 * Operate On View, and the pan speed was gone after a reload. Changes made while a save is in flight
 * wait for it, merged into the next one.
 *
 * A change shows at once, as a legacy control's does, and is taken back if the server refuses it.
 *
 * A save never writes defaults over settings it failed to read. One made while the load is running
 * waits for it; one made after the load failed asks again first, and only if that fails too is the
 * change applied to the defaults in use -- which is also how a stored document the API cannot read
 * gets replaced.
 *
 * A failed save is said, as a notification, whoever made it. Most controls call `void save(...)`,
 * so a refused PUT used to leave the control where it was with nothing on screen.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { defaultSettings, type StoredSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../api/client.js";
import { useOptionalNotifications } from "../notifications/NotificationProvider.jsx";
import { applyChanges, changesBetween, mergeChanges, type SettingsChanges } from "./changes.js";

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
  /**
   * Save what `next` changes relative to `settings`. Resolves once the server has it, with any
   * corrections it made; rejects, after the change is taken back and the failure reported, if not.
   */
  readonly save: (next: StoredSettings) => Promise<{ corrections: readonly string[] }>;
  readonly reload: () => void;
}

type Status =
  | { readonly status: "loading" }
  | { readonly status: "ready" }
  | { readonly status: "unavailable"; readonly reason: string };

interface Saved {
  readonly corrections: readonly string[];
}

/** Changes sent in one request, and every caller waiting to hear how it went. */
interface Batch {
  changes: SettingsChanges;
  readonly callers: { resolve: (saved: Saved) => void; reject: (cause: unknown) => void }[];
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function SettingsProvider({
  client,
  children,
}: {
  readonly client: ApiClient;
  readonly children: ReactNode;
}): ReactNode {
  const [status, setStatus] = useState<Status>({ status: "loading" });
  // The defaults until the load answers; after it, what the server confirmed plus any change that
  // is on its way there.
  const [shown, setShown] = useState<StoredSettings>(defaultSettings);
  const [generation, setGeneration] = useState(0);

  /** The document the server last returned, or null before it has answered. */
  const confirmed = useRef<StoredSettings | null>(null);
  /** What stands in for it while there is none: the defaults the app started with. */
  const fallback = useRef(shown);
  /** The settings the tree was last rendered with, which every caller built its save from. */
  const rendered = useRef(shown);
  /** The load in flight. A save waits for it, so it cannot overtake it. */
  const loading = useRef<Promise<void>>(Promise.resolve());
  const inFlight = useRef<Batch | null>(null);
  const waiting = useRef<Batch | null>(null);

  // Read from async code, so through refs: either can change between renders.
  const clientRef = useRef(client);
  const notifications = useOptionalNotifications();
  const notifyRef = useRef(notifications?.notify);
  useLayoutEffect(() => {
    rendered.current = shown;
    clientRef.current = client;
    notifyRef.current = notifications?.notify;
  });

  /** What to show: the confirmed document with every change not yet confirmed applied, in order. */
  const showPending = useCallback(() => {
    let settings = confirmed.current ?? fallback.current;
    if (inFlight.current !== null) settings = applyChanges(settings, inFlight.current.changes);
    if (waiting.current !== null) settings = applyChanges(settings, waiting.current.changes);
    setShown(settings);
  }, []);

  useEffect(() => {
    let cancelled = false;

    loading.current = client.getSettings().then(
      (settings) => {
        if (cancelled) return;
        confirmed.current = settings;
        setStatus({ status: "ready" });
        showPending();
      },
      (cause: unknown) => {
        if (cancelled) return;
        setStatus({ status: "unavailable", reason: reasonOf(cause) });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [client, generation, showPending]);

  /** The document a save's changes are applied to. */
  const base = useCallback(async (): Promise<StoredSettings> => {
    // The load, including one a reload started while this one was awaited.
    let seen: Promise<void> | null = null;
    while (seen !== loading.current) {
      seen = loading.current;
      await seen;
    }
    if (confirmed.current !== null) return confirmed.current;

    // The load failed. Ask again rather than write the defaults over settings that may be fine.
    try {
      const settings = await clientRef.current.getSettings();
      confirmed.current = settings;
      setStatus({ status: "ready" });
      return settings;
    } catch {
      return fallback.current;
    }
  }, []);

  const deliver = useCallback(
    async (changes: SettingsChanges): Promise<readonly string[]> => {
      const stored = await clientRef.current.putSettings(applyChanges(await base(), changes));
      // The API corrects an unusable export-format list rather than storing it (RULE-088), and says
      // so. Returning that lets the caller tell the user instead of quietly showing something else
      // than what they chose.
      const { corrections, ...settings } = stored;
      confirmed.current = settings;
      setStatus({ status: "ready" });
      return corrections ?? [];
    },
    [base],
  );

  const pump = useCallback(() => {
    if (inFlight.current !== null || waiting.current === null) return;
    const batch = waiting.current;
    waiting.current = null;
    inFlight.current = batch;

    deliver(batch.changes)
      .then(
        (corrections) => {
          for (const caller of batch.callers) caller.resolve({ corrections });
        },
        (cause: unknown) => {
          for (const caller of batch.callers) caller.reject(cause);
          notifyRef.current?.({
            severity: "error",
            message: `Settings could not be saved: ${reasonOf(cause)}`,
          });
        },
      )
      .finally(() => {
        inFlight.current = null;
        // Refused changes drop out here, so the control goes back to what is stored.
        showPending();
        pump();
      });
  }, [deliver, showPending]);

  const save = useCallback(
    (next: StoredSettings): Promise<Saved> => {
      // Sent even when nothing changed, as every save was: a Reset on settings that are already the
      // defaults still writes them, and the caller still hears back from the server.
      const changes = changesBetween(rendered.current, next);

      const saved = new Promise<Saved>((resolve, reject) => {
        const batch = waiting.current;
        if (batch === null) {
          waiting.current = { changes, callers: [{ resolve, reject }] };
        } else {
          batch.changes = mergeChanges(batch.changes, changes);
          batch.callers.push({ resolve, reject });
        }
        showPending();
        pump();
      });
      // Handled here, since the failure is reported here: most callers `void` this, and each
      // refusal would otherwise be an unhandled rejection too. One that awaits still gets it.
      saved.catch(() => undefined);
      return saved;
    },
    [showPending, pump],
  );

  const reload = useCallback(() => setGeneration((n) => n + 1), []);

  const value = useMemo<SettingsContextValue>(() => {
    const state: SettingsState =
      status.status === "loading"
        ? status
        : status.status === "ready"
          ? { status: "ready", settings: shown }
          : { status: "unavailable", settings: shown, reason: status.reason };
    return { state, settings: shown, save, reload };
  }, [status, shown, save, reload]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (value === null) throw new Error("useSettings must be used inside a SettingsProvider");
  return value;
}
