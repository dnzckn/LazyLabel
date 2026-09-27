/**
 * Choosing which checkpoint the AI tools use.
 *
 * The list comes from the manifest, so a model is chosen by NAME — the thing whoever installed the
 * checkpoint declared it to be. Legacy picks by matching substrings of the FILE NAME, which is the
 * defect RULE-085 records: `sam2_hiera_large_tuned.pt` contains `_t` and loads as TINY, building a
 * tiny config around large weights. It does not error; the user just gets worse masks from a model
 * they believe is their fine-tuned large.
 *
 * MODELS THAT CANNOT BE USED ARE STILL SHOWN, disabled, with the reason in the row's tooltip -- the
 * way legacy explains a control it disables. A picker that listed only the working ones makes a
 * corrupt checkpoint indistinguishable from an absent one -- and the two have different fixes:
 * re-download it, or go and find it.
 *
 * AN EMPTY MANIFEST says only that. A checkpoint the manifest does not list is not loadable, and
 * deliberately: adding one is an explicit act with a hash attached. The panel said so in a
 * paragraph until the owner asked, on 2026-09-26, for legacy's panels without them.
 *
 * LEGACY'S CONTROLS AROUND THE LIST (CONTROL_PARITY.md CP-49): Refresh over it, Load and Unload
 * under it, and the "Current: ..." line (L ui/widgets/model_selection_widget.py:117-166). Browse
 * Models is left out by a recorded decision: a server has no file picker.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { useNotifications } from "../notifications/NotificationProvider.jsx";
import { useSettings } from "../settings/SettingsProvider.jsx";
import type { ApiClient, WireModelStatus } from "../api/client.js";

/** How the API says it was started with no inference service (`api/src/app.ts`, `inferenceOf`). */
const NOT_CONFIGURED = /no inference service is configured/;

type State =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly models: readonly WireModelStatus[] }
  | { readonly status: "failed"; readonly reason: string };

/** Installed, matching its hash, and able to answer prompts. */
export function isUsable(model: WireModelStatus): boolean {
  return model.present && model.verified && model.segmenter;
}

/**
 * The model the AI tools use when none has been chosen: legacy's default, SAM 1 vit_h
 * ("Default (vit_h)", config/settings.py:40-41), when it is usable, else the first usable one. Null
 * when nothing can segment.
 */
export function defaultModel(models: readonly WireModelStatus[]): string | null {
  const usable = models.filter(isUsable);
  return (usable.find((model) => model.family === "sam1" && model.size === "vit_h") ?? usable[0])?.name ?? null;
}

/**
 * CHOOSE legacy's default model when none is chosen, once, as soon as the settings and the model
 * list are both in.
 *
 * Legacy's AI mode works the moment it is chosen, with the default model loaded on first use
 * (mode_manager.py:26-29). Here `ai_model` started empty, so AI mode drew nothing and said nothing
 * until the user found this section (`CONTROL_PARITY.md` CP-13). Stored, so the section shows what
 * the tools use; a user who wants another model picks it here as before.
 */
export function useDefaultModel(client: ApiClient): void {
  const { state, settings, save } = useSettings();
  const loaded = state.status === "ready";
  const chosen = String(settings.values["ai_model"] ?? "");
  // Held while a choice is being saved, and kept when the save fails. A refused save is taken back,
  // which empties `ai_model` again and would rerun this at the pace of the network; the failure is
  // reported once instead. Let go on success, so Reset to Default chooses again.
  const held = useRef(false);

  useEffect(() => {
    if (!loaded || chosen !== "" || held.current) return;
    let cancelled = false;
    client
      .models()
      .then((models) => {
        const pick = defaultModel(models);
        if (cancelled || pick === null) return;
        held.current = true;
        save({ ...settings, values: { ...settings.values, ai_model: pick } }).then(
          () => {
            held.current = false;
          },
          () => undefined,
        );
      })
      // No models to be had is the section's to say (below); nothing is chosen for it.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chosen, client, loaded, save, settings]);
}

/** The user's last act this session that legacy's line reports while nothing is loaded. */
type Said = "picked" | "unloaded" | null;

/**
 * Legacy's line under the buttons, in its words for each state:
 *
 * - "Loading: name" while a Load runs (L ui/main_window.py:1276-1279);
 * - "Current: name" once a model is in memory, however it got there -- a Load, or the first AI use
 *   (L ui/managers/sam_single_view_manager.py:163-171);
 * - "No model loaded" after an Unload (L ui/main_window.py:1303);
 * - "Selected: name" for a model picked while none is loaded (L ui/main_window.py:1214-1232);
 * - "Current: No model loaded" before any of that (L ui/widgets/model_selection_widget.py:163).
 *
 * Named by manifest name, as the list is, where legacy's names SAM 1 "SAM vit_h" and SAM 2 by its
 * file's stem.
 */
export function currentLine(loading: string | null, loaded: readonly string[], said: Said, chosen: string): string {
  if (loading !== null) return `Loading: ${loading}`;
  if (loaded.length > 0) return `Current: ${loaded.join(", ")}`;
  if (said === "unloaded") return "No model loaded";
  if (said === "picked" && chosen !== "") return `Selected: ${chosen}`;
  return "Current: No model loaded";
}

const reasonOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

export function ModelPicker({ client }: { readonly client: ApiClient }): ReactNode {
  const { settings, save } = useSettings();
  const { notify } = useNotifications();
  const [state, setState] = useState<State>({ status: "loading" });
  /** What the inference service has in memory, by name. */
  const [loaded, setLoaded] = useState<readonly string[]>([]);
  /** The model a Load is putting in memory, while it does. */
  const [loading, setLoading] = useState<string | null>(null);
  const [said, setSaid] = useState<Said>(null);

  const chosen = String(settings.values["ai_model"] ?? "");

  const listed = useCallback((models: readonly WireModelStatus[]) => {
    setState({ status: "ready", models });
    setLoaded(models.filter((model) => model.loaded === true).map((model) => model.name));
  }, []);

  useEffect(() => {
    let cancelled = false;

    client
      .models()
      .then((models) => {
        if (!cancelled) listed(models);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setState({ status: "failed", reason: reasonOf(cause) });
      });

    return () => {
      cancelled = true;
    };
  }, [client, listed]);

  /*
   * THE FIRST AI USE LOADS A MODEL, as legacy's first AI click does, and legacy's line says so when
   * it happens. Asked after an embed or a prompt answers, and only when that could have changed the
   * answer: with the chosen model the only one loaded, the next prompt changes nothing.
   */
  const known = useRef({ loaded, chosen });
  known.current = { loaded, chosen };
  useEffect(() => {
    // A client built without it, as the shell's tests build theirs, has nothing to report.
    if (typeof client.onInference !== "function") return undefined;
    let cancelled = false;
    const stop = client.onInference(() => {
      const now = known.current;
      if (now.loaded.length === 1 && now.loaded[0] === now.chosen) return;
      client.loadedModels().then(
        (names) => {
          if (!cancelled) setLoaded(names);
        },
        () => undefined,
      );
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [client]);

  const choose = useCallback(
    (name: string) => {
      setSaid("picked");
      void save({ ...settings, values: { ...settings.values, ai_model: name } });
    },
    [save, settings],
  );

  // Legacy's Refresh: the list read again, and "Models list refreshed." (main_window.py:1204-1212).
  const refresh = useCallback(() => {
    client.refreshModels().then(
      (models) => {
        listed(models);
        notify({ severity: "success", message: "Models list refreshed." });
      },
      // Where legacy warns that no models folder is chosen, the service says why it could not
      // read its manifest; the list it had stays.
      (cause: unknown) => notify({ severity: "warning", message: reasonOf(cause) }),
    );
  }, [client, listed, notify]);

  // Legacy's Load (main_window.py:1234-1279): the model in memory now, freeing any other.
  const load = useCallback(() => {
    if (chosen === "") return;
    if (loaded.includes(chosen)) {
      notify({ severity: "info", message: "Model already loaded" });
      return;
    }
    setLoading(chosen);
    // The worker's words while it loads, and when it has (single_view_sam_init_worker.py:36, 55).
    notify({ severity: "info", message: `Loading ${chosen}...` });
    client.loadModel(chosen).then(
      (names) => {
        setLoading(null);
        setLoaded(names);
        notify({ severity: "info", message: "AI model initialized" });
      },
      (cause: unknown) => {
        setLoading(null);
        // Legacy's 5 s line for a model that would not load (sam_single_view_manager.py:186-197).
        notify({ severity: "info", message: `AI model failed: ${reasonOf(cause)}`, durationMs: 5_000 });
      },
    );
  }, [chosen, client, loaded, notify]);

  // Legacy's Unload (main_window.py:1281-1305): out of memory, and the CUDA cache emptied.
  const unload = useCallback(() => {
    client.unloadModel().then(
      (result) => {
        setLoaded(result.loaded);
        if (result.unloaded.length === 0) {
          notify({ severity: "info", message: "No model loaded" });
          return;
        }
        setSaid("unloaded");
        notify({ severity: "success", message: "Model unloaded" });
      },
      (cause: unknown) => notify({ severity: "error", message: reasonOf(cause) }),
    );
  }, [client, notify]);

  const usable = state.status === "ready" && state.models.some((model) => model.name === chosen && isUsable(model));

  return (
    <div className="models-section">
      <div className="models__buttons">
        <button type="button" title="Refresh the list of available models" onClick={refresh}>
          Refresh
        </button>
      </div>

      <p className="models__label">Available Models:</p>
      <ModelList state={state} chosen={chosen} onChoose={choose} />

      {/* Load while nothing is in memory, Unload while something is (model_selection_widget.py:212-215). */}
      <div className="models__buttons">
        <button
          type="button"
          className="button--positive"
          title="Load the selected model into memory"
          disabled={loaded.length > 0 || !usable}
          onClick={load}
        >
          Load
        </button>
        <button
          type="button"
          title="Unload model from memory for faster navigation"
          disabled={loaded.length === 0}
          onClick={unload}
        >
          Unload
        </button>
      </div>

      <p className="models__current">{currentLine(loading, loaded, said, chosen)}</p>
    </div>
  );
}

function ModelList({
  state,
  chosen,
  onChoose,
}: {
  readonly state: State;
  readonly chosen: string;
  readonly onChoose: (name: string) => void;
}): ReactNode {
  if (state.status === "loading") return <p>Looking for models…</p>;

  if (state.status === "failed") {
    // No inference service at all is the app as `npm start` runs it before `npm run ai:setup`
    // (DEPLOYABILITY.md R8), and the fix is that one command. The API's own words, which ran to a
    // paragraph here, go in the tooltip.
    if (NOT_CONFIGURED.test(state.reason)) {
      return (
        <p className="panel__missing" title={state.reason}>
          AI tools off: run npm run ai:setup
        </p>
      );
    }
    return (
      <p role="alert" className="banner banner--error">
        The models could not be listed: {state.reason}
      </p>
    );
  }

  if (state.models.length === 0) {
    return <p className="panel__missing">No models available</p>;
  }

  return (
    <ul className="models">
      {state.models.map((model) => {
        // An embedder is listed -- an operator installing checkpoints wants to see it verified
        // -- but it is no model to segment with, and choosing it failed with a message about a
        // "backend for family 'embedder'" until 2026-09-23.
        const usable = isUsable(model);

        return (
          <li key={model.name}>
            <label
              // The reason, not just the fact. "Unavailable" sends a user looking; "the file is
              // not in the model directory" tells them where to look.
              {...(usable
                ? {}
                : {
                    title:
                      !model.segmenter && model.present && model.verified
                        ? "Find Archetypes uses this model; it cannot segment"
                        : (model.detail ?? (model.present ? "does not match its recorded hash" : "not installed")),
                  })}
            >
              <input
                type="radio"
                name="ai_model"
                checked={chosen === model.name}
                disabled={!usable}
                onChange={() => onChoose(model.name)}
              />{" "}
              {model.name}{" "}
              <span className="models__detail">
                {model.family} {model.size}
                {model.videoCapable ? "" : ", no propagation"}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
