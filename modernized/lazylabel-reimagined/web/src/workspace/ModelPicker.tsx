/**
 * Choosing which checkpoint the AI tools use.
 *
 * The list comes from the manifest, so a model is chosen by NAME — the thing whoever installed the
 * checkpoint declared it to be. Legacy picks by matching substrings of the FILE NAME, which is the
 * defect RULE-085 records: `sam2_hiera_large_tuned.pt` contains `_t` and loads as TINY, building a
 * tiny config around large weights. It does not error; the user just gets worse masks from a model
 * they believe is their fine-tuned large.
 *
 * MODELS THAT CANNOT BE USED ARE STILL SHOWN, with the reason and disabled. A picker that listed
 * only the working ones makes a corrupt checkpoint indistinguishable from an absent one — and the
 * two have different fixes: re-download it, or go and find it.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { useSettings } from "../settings/SettingsProvider.jsx";
import type { ApiClient, WireModelStatus } from "../api/client.js";

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

  useEffect(() => {
    if (!loaded || chosen !== "") return;
    let cancelled = false;
    client
      .models()
      .then((models) => {
        const pick = defaultModel(models);
        if (!cancelled && pick !== null) void save({ ...settings, values: { ...settings.values, ai_model: pick } });
      })
      // No models to be had is the section's to say (below); nothing is chosen for it.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chosen, client, loaded, save, settings]);
}

export function ModelPicker({ client }: { readonly client: ApiClient }): ReactNode {
  const { settings, save } = useSettings();
  const [state, setState] = useState<State>({ status: "loading" });

  const chosen = String(settings.values["ai_model"] ?? "");

  useEffect(() => {
    let cancelled = false;

    client
      .models()
      .then((models) => {
        if (!cancelled) setState({ status: "ready", models });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setState({
            status: "failed",
            reason: cause instanceof Error ? cause.message : String(cause),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  const choose = useCallback(
    (name: string) => {
      void save({ ...settings, values: { ...settings.values, ai_model: name } });
    },
    [save, settings],
  );

  if (state.status === "loading") return <p>Looking for models…</p>;

  if (state.status === "failed") {
    return (
      <p role="alert" className="banner banner--error">
        The models could not be listed: {state.reason}
      </p>
    );
  }

  if (state.models.length === 0) {
    return (
      <p className="panel__missing">
        The inference service has no models in its manifest. A checkpoint that is not listed there
        is not loadable, which is deliberate — adding one is an explicit act with a hash attached.
      </p>
    );
  }

  return (
    <>
      <ul className="models">
        {state.models.map((model) => {
          // An embedder is listed -- an operator installing checkpoints wants to see it verified
          // -- but it is no model to segment with, and choosing it failed with a message about a
          // "backend for family 'embedder'" until 2026-09-23.
          const usable = isUsable(model);

          return (
            <li key={model.name}>
              <label>
                <input
                  type="radio"
                  name="ai_model"
                  checked={chosen === model.name}
                  disabled={!usable}
                  onChange={() => choose(model.name)}
                />{" "}
                {model.name}{" "}
                <span className="models__detail">
                  {model.family} {model.size}
                  {model.videoCapable ? "" : ", no propagation"}
                </span>
              </label>

              {!usable && (
                // The reason, not just the fact. "Unavailable" sends a user looking; "the file is
                // not in the model directory" tells them where to look.
                <p className="models__why" role="status">
                  {!model.segmenter && model.present && model.verified
                    ? "Find Archetypes uses this model; it cannot segment"
                    : (model.detail ?? (model.present ? "does not match its recorded hash" : "not installed"))}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {chosen === "" && (
        <p className="panel__missing">Choose a model to use the AI tools.</p>
      )}
    </>
  );
}
