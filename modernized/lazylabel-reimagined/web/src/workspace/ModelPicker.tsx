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
          const usable = model.present && model.verified && model.segmenter;

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
