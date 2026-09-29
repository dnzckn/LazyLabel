/**
 * Choosing a checkpoint by NAME, which is the whole of RULE-085's answer.
 *
 * Legacy picks by matching substrings of the file name, so `sam2_hiera_large_tuned.pt` contains
 * `_t` and loads as TINY. It does not error — the user simply gets worse masks from a model they
 * believe is their fine-tuned large. A picker over manifest names cannot do that.
 *
 * It is legacy's dropdown since 2026-09-29 (model_selection_widget.py:138-143), of the models that
 * segment: it was radio buttons, and listed the embedder Find Archetypes uses, until the owner
 * asked for "a drop down to select from available models".
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import { ApiError, type ApiClient, type WireModelStatus, type WireUnloadResult } from "../../src/api/client.js";
import { NotificationHost, NotificationProvider } from "../../src/notifications/NotificationProvider.jsx";
import { ModelPicker, currentLine, defaultModel, useDefaultModel } from "../../src/workspace/ModelPicker.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";
import { longTexts } from "../terse.js";

afterEach(cleanup);

const usable = (name: string, over: Partial<WireModelStatus> = {}): WireModelStatus => ({
  name,
  family: "sam2",
  size: "large",
  videoCapable: true,
  segmenter: true,
  present: true,
  verified: true,
  detail: null,
  ...over,
});

/** The model controls the service answers, each replaceable by a test. */
interface Controls {
  readonly refreshModels?: () => Promise<readonly WireModelStatus[]>;
  readonly loadModel?: (model: string) => Promise<readonly string[]>;
  readonly unloadModel?: () => Promise<WireUnloadResult>;
  readonly loadedModels?: () => Promise<readonly string[]>;
}

function mount(models: readonly WireModelStatus[] | Error, chosen = "", controls: Controls = {}) {
  const saved: unknown[] = [];
  /** What `onInference` subscribers hear: an embed or a prompt the service answered. */
  const listeners = new Set<() => void>();
  const api = {
    getSettings: async () => {
      const base = defaultSettings();
      return { ...base, values: { ...base.values, ai_model: chosen } };
    },
    putSettings: async (settings: unknown) => {
      saved.push(settings);
      return settings;
    },
    models: async () => {
      if (models instanceof Error) throw models;
      return models;
    },
    refreshModels: vi.fn(controls.refreshModels ?? (async () => (models instanceof Error ? [] : models))),
    loadModel: vi.fn(controls.loadModel ?? (async (model: string) => [model])),
    unloadModel: vi.fn(
      controls.unloadModel
        ?? (async () => ({ unloaded: models instanceof Error ? [] : models.filter((m) => m.loaded).map((m) => m.name), loaded: [] })),
    ),
    loadedModels: vi.fn(controls.loadedModels ?? (async () => [])),
    onInference: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  render(
    <NotificationProvider>
      <SettingsProvider client={api as unknown as ApiClient}>
        <ModelPicker client={api as unknown as ApiClient} />
      </SettingsProvider>
      <NotificationHost />
    </NotificationProvider>,
  );

  return {
    saved,
    api,
    /** An embed or a prompt answered, which may have loaded a model. */
    answered: () => act(() => listeners.forEach((listener) => listener())),
  };
}

/** The dropdown, by legacy's label over it (model_selection_widget.py:139). */
const dropdown = () => screen.getByRole("combobox", { name: "Available Models:" }) as HTMLSelectElement;
const option = (name: string) => screen.getByRole("option", { name }) as HTMLOptionElement;
/** A model's entry, once the list has come. */
const listed = (name: string) => screen.findByRole("option", { name }) as Promise<HTMLOptionElement>;
/** Pick a model, as a user does from the dropdown. */
const choose = (name: string) => fireEvent.change(dropdown(), { target: { value: name } });

describe("with no inference service", () => {
  const NONE = "no inference service is configured, so the AI tools are unavailable";

  it("says, in one short line, the command that adds the AI tools, with the API's reason in its tooltip", async () => {
    // DEPLOYABILITY.md R8: `npm start` before `npm run ai:setup`. The section printed the API's
    // reason after "The models could not be listed:", 99 characters that named no fix.
    mount(new ApiError(503, "inference_unavailable", NONE));

    const hint = await screen.findByText("AI tools off: run npm run ai:setup");
    expect(hint.title).toBe(NONE);
    expect(longTexts(document.body)).toEqual([]);
  });

  it("still gives every other reason the models could not be listed", async () => {
    mount(new ApiError(503, "manifest_unreadable", "manifest.json is not valid JSON"));
    expect(await screen.findByText("The models could not be listed: manifest.json is not valid JSON")).toBeTruthy();
    expect(screen.queryByText(/ai:setup/)).toBeNull();
  });
});

describe("listing what is installed", () => {
  it("offers each model by its manifest name, in legacy's dropdown with its tooltip", async () => {
    mount([usable("SAM 2.1 large"), usable("SAM 1 huge", { family: "sam1", size: "vit_h" })]);

    expect(await listed("SAM 2.1 large")).toBeTruthy();
    expect(option("SAM 1 huge")).toBeTruthy();
    expect(dropdown().title).toBe("Select a .pth model file to use");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("names each model alone, with no family, size or propagation beside it", async () => {
    // The owner, 2026-09-29, of "mobilenet_v3_small, no propagation": the detail the radio rows
    // printed beside each name made no sense in the panel. Legacy's entries are names alone.
    mount([usable("SAM 1 huge", { family: "sam1", size: "vit_h", videoCapable: false })]);

    expect((await listed("SAM 1 huge")).textContent).toBe("SAM 1 huge");
    expect(screen.queryByText(/no propagation/)).toBeNull();
    expect(screen.queryByText(/vit_h/)).toBeNull();
  });

  it("says, in legacy's words, that no model is loaded when nothing is chosen yet", async () => {
    // model_selection_widget.py:163.
    mount([usable("SAM 2.1 large")]);
    expect(await screen.findByText("Current: No model loaded")).toBeTruthy();
  });

  it("shows nothing chosen while none is, rather than the first model", async () => {
    // A dropdown with no entry for "none" shows its first, which would name a model the AI tools
    // do not use.
    mount([usable("SAM 2.1 large")]);
    await listed("SAM 2.1 large");

    expect(dropdown().value).toBe("");
    expect(dropdown().selectedOptions[0]?.textContent).toBe("");
  });

  it("marks the chosen one, and says what is LOADED, not what is chosen", async () => {
    // Legacy's dropdown shows "Default (vit_h)" at start and its line "Current: No model loaded"
    // (model_selection_widget.py:142, 163).
    mount([usable("SAM 2.1 large"), usable("SAM 1 huge")], "SAM 1 huge");

    await waitFor(() => expect(dropdown().value).toBe("SAM 1 huge"));
    expect(screen.getByText("Current: No model loaded")).toBeTruthy();
  });

  it("shows a chosen model the list no longer has as the choice, disabled, with why", async () => {
    mount([usable("SAM 2.1 large")], "SAM 2 gone");

    await waitFor(() => expect(dropdown().value).toBe("SAM 2 gone"));
    expect(option("SAM 2 gone").disabled).toBe(true);
    expect(option("SAM 2 gone").title).toBe("not one of the available models");
  });
});

describe("models that cannot be used", () => {
  // A disabled model's reason is its tooltip, as legacy explains a control it disables.
  it("shows a corrupt checkpoint, disabled, with its reason", async () => {
    // Present and unverified is the case worth showing: a picker that listed only the working ones
    // makes a corrupt checkpoint indistinguishable from an absent one, and the two have different
    // fixes -- re-download it, or go and find it.
    mount([
      usable("SAM 2.1 large"),
      usable("SAM 1 huge", { verified: false, detail: "sha256 does not match the manifest" }),
    ]);

    const broken = await listed("SAM 1 huge");
    expect(broken.disabled).toBe(true);
    expect(broken.title).toBe("sha256 does not match the manifest");
    expect(option("SAM 2.1 large").disabled).toBe(false);
    expect(option("SAM 2.1 large").title).toBe("");
  });

  it("leaves out the embedder Find Archetypes uses", async () => {
    // It shares the manifest with the SAM checkpoints and is no model to segment with: choosing it
    // failed with "no backend for family 'embedder'" until 2026-09-23, and it was listed disabled
    // until the owner asked why, on 2026-09-29. Find Archetypes finds it on its own.
    mount([
      usable("SAM 2.1 large"),
      usable("MobileNetV3 small", { family: "embedder", size: "mobilenet_v3_small", segmenter: false, videoCapable: false }),
    ]);

    await listed("SAM 2.1 large");
    expect(screen.queryByRole("option", { name: /MobileNetV3/ })).toBeNull();
    expect([...dropdown().options].map((entry) => entry.textContent)).toEqual(["", "SAM 2.1 large"]);
  });

  it("shows a missing one too, and says it is missing", async () => {
    mount([usable("SAM 2.1 tiny", { present: false, verified: false, detail: "not in the model directory" })]);

    expect((await listed("SAM 2.1 tiny")).title).toBe("not in the model directory");
  });

  it("falls back to a reason of its own when the service gave none", async () => {
    // "Unavailable" sends a user looking; saying which of the two problems it is tells them where.
    mount([
      usable("SAM 1 huge", { verified: false, detail: null }),
      usable("SAM 2.1 tiny", { present: false, verified: false, detail: null }),
    ]);

    expect((await listed("SAM 1 huge")).title).toBe("does not match its recorded hash");
    expect(option("SAM 2.1 tiny").title).toBe("not installed");
  });
});

describe("choosing one", () => {
  it("saves the NAME, not a file path", async () => {
    const { saved } = mount([usable("SAM 2.1 large")]);
    await listed("SAM 2.1 large");

    choose("SAM 2.1 large");

    await waitFor(() => expect(saved).toHaveLength(1));
    expect((saved[0] as { values: Record<string, unknown> }).values["ai_model"]).toBe("SAM 2.1 large");
  });
});

describe("when there is nothing to choose from", () => {
  it("says there are none rather than showing a blank panel", async () => {
    mount([]);

    expect(await screen.findByText("No models available")).toBeTruthy();
  });

  it("says the same when the manifest holds only the embedder", async () => {
    mount([usable("MobileNetV3 small", { family: "embedder", segmenter: false })]);

    expect(await screen.findByText("No models available")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("reports a failure to list them", async () => {
    mount(new Error("the inference service is unreachable"));

    expect((await screen.findByRole("alert")).textContent).toContain("unreachable");
  });
});

describe("legacy's default model (CONTROL_PARITY.md CP-13)", () => {
  // Legacy's AI mode works as soon as it is chosen, with "Default (vit_h)" loaded on first use.
  // Here ai_model started empty, so AI mode drew nothing and said nothing.
  const huge = usable("SAM 1 huge", { family: "sam1", size: "vit_h", videoCapable: false });

  it("is SAM 1 vit_h when it is usable, wherever it is listed", () => {
    expect(defaultModel([usable("SAM 2.1 large"), huge])).toBe("SAM 1 huge");
  });

  it("is the first usable model otherwise", () => {
    expect(defaultModel([usable("broken", { verified: false }), usable("SAM 2.1 large")])).toBe("SAM 2.1 large");
    expect(defaultModel([{ ...huge, present: false }, usable("SAM 2.1 large")])).toBe("SAM 2.1 large");
  });

  it("is never an embedder, and nothing when nothing can segment", () => {
    expect(defaultModel([usable("MobileNetV3", { segmenter: false })])).toBeNull();
    expect(defaultModel([])).toBeNull();
  });

  function Chooser({ client }: { readonly client: ApiClient }): React.ReactNode {
    useDefaultModel(client);
    return null;
  }

  function mountChooser(models: readonly WireModelStatus[], chosen = "") {
    const saved: { values: Record<string, unknown> }[] = [];
    const api = {
      getSettings: async () => {
        const base = defaultSettings();
        return { ...base, values: { ...base.values, ai_model: chosen } };
      },
      putSettings: async (settings: { values: Record<string, unknown> }) => {
        saved.push(settings);
        return settings;
      },
      models: vi.fn(async () => models),
    } as unknown as ApiClient;
    render(
      <SettingsProvider client={api}>
        <Chooser client={api} />
      </SettingsProvider>,
    );
    return { saved, api };
  }

  it("is chosen once when none is, so AI mode works without a visit to this section", async () => {
    const { saved } = mountChooser([usable("SAM 2.1 large"), huge]);

    await waitFor(() => expect(saved.at(-1)?.values["ai_model"]).toBe("SAM 1 huge"));
  });

  it("does not override a model the user chose", async () => {
    const { saved, api } = mountChooser([usable("SAM 2.1 large"), huge], "SAM 2.1 large");

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(saved).toHaveLength(0);
    expect(api.models).not.toHaveBeenCalled();
  });

  it("chooses nothing when nothing can segment", async () => {
    const { saved, api } = mountChooser([usable("MobileNetV3", { segmenter: false })]);

    await waitFor(() => expect(api.models).toHaveBeenCalled());
    expect(saved).toHaveLength(0);
  });
});

describe("legacy's model controls (CONTROL_PARITY.md CP-49)", () => {
  // model_selection_widget.py:117-166 and main_window.py:1204-1305.
  const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
  const line = () => document.querySelector(".models__current")?.textContent;

  it("has legacy's Refresh, Load and Unload, with its tooltips, around the list", async () => {
    mount([usable("SAM 2.1 large")], "SAM 2.1 large");
    await listed("SAM 2.1 large");

    expect(button("Refresh").title).toBe("Refresh the list of available models");
    expect(screen.getByText("Available Models:")).toBeTruthy();
    expect(button("Load").title).toBe("Load the selected model into memory");
    expect(button("Unload").title).toBe("Unload model from memory for faster navigation");
    expect(line()).toBe("Current: No model loaded");
  });

  it("offers Load while nothing is loaded and Unload while something is", async () => {
    mount([usable("SAM 2.1 large")], "SAM 2.1 large");
    await listed("SAM 2.1 large");
    await waitFor(() => expect(button("Load").disabled).toBe(false));
    expect(button("Unload").disabled).toBe(true);

    fireEvent.click(button("Load"));

    await waitFor(() => expect(button("Unload").disabled).toBe(false));
    expect(button("Load").disabled).toBe(true);
  });

  it("reports a model the service already has as current, from the list", async () => {
    mount([usable("SAM 2.1 large", { loaded: true })], "SAM 2.1 large");

    await waitFor(() => expect(line()).toBe("Current: SAM 2.1 large"));
    expect(button("Load").disabled).toBe(true);
    expect(button("Unload").disabled).toBe(false);
  });

  it("Load says Loading, asks for the chosen model, and then names it Current", async () => {
    let finish: (loaded: readonly string[]) => void = () => undefined;
    const { api } = mount([usable("SAM 2.1 large")], "SAM 2.1 large", {
      loadModel: () => new Promise((resolve) => { finish = resolve; }),
    });
    await waitFor(() => expect(button("Load").disabled).toBe(false));

    fireEvent.click(button("Load"));

    expect(line()).toBe("Loading: SAM 2.1 large");
    expect(screen.getByRole("status").textContent).toBe("Loading SAM 2.1 large...");
    expect(api.loadModel).toHaveBeenCalledWith("SAM 2.1 large");
    await act(async () => finish(["SAM 2.1 large"]));
    expect(line()).toBe("Current: SAM 2.1 large");
    expect(screen.getByRole("status").textContent).toBe("AI model initialized");
  });

  it("a Load that fails says so for 5 s, in legacy's words, and offers Load again", async () => {
    mount([usable("SAM 2.1 large")], "SAM 2.1 large", {
      loadModel: async () => {
        throw new Error("SAM 2.1 large cannot be used: the file is not in the model directory");
      },
    });
    await waitFor(() => expect(button("Load").disabled).toBe(false));

    fireEvent.click(button("Load"));

    expect(await screen.findByText(/^AI model failed: SAM 2.1 large cannot be used/)).toBeTruthy();
    expect(line()).toBe("Current: No model loaded");
    expect(button("Load").disabled).toBe(false);
  });

  it("Unload frees it, says so, and the line reads No model loaded", async () => {
    const { api } = mount([usable("SAM 2.1 large", { loaded: true })], "SAM 2.1 large");
    await waitFor(() => expect(button("Unload").disabled).toBe(false));

    fireEvent.click(button("Unload"));

    expect(await screen.findByText("Model unloaded")).toBeTruthy();
    expect(api.unloadModel).toHaveBeenCalled();
    expect(line()).toBe("No model loaded");
    expect(button("Load").disabled).toBe(false);
    expect(button("Unload").disabled).toBe(true);
  });

  it("a model picked while none is loaded reads Selected", async () => {
    mount([usable("SAM 2.1 large"), usable("SAM 1 huge", { family: "sam1", size: "vit_h" })], "SAM 1 huge");
    await listed("SAM 2.1 large");

    choose("SAM 2.1 large");

    await waitFor(() => expect(line()).toBe("Selected: SAM 2.1 large"));
  });

  it("a model picked while one is loaded leaves the line naming that one", async () => {
    mount([usable("SAM 2.1 large"), usable("SAM 1 huge", { family: "sam1", size: "vit_h", loaded: true })], "SAM 1 huge");
    await waitFor(() => expect(line()).toBe("Current: SAM 1 huge"));

    choose("SAM 2.1 large");

    expect(line()).toBe("Current: SAM 1 huge");
  });

  it("Refresh lists what the service now has and says legacy's words", async () => {
    const { api } = mount([usable("SAM 2.1 large")], "SAM 2.1 large", {
      refreshModels: async () => [usable("SAM 2.1 large"), usable("SAM 2.1 tiny", { size: "tiny" })],
    });
    await listed("SAM 2.1 large");

    fireEvent.click(button("Refresh"));

    expect(await listed("SAM 2.1 tiny")).toBeTruthy();
    expect(screen.getByText("Models list refreshed.")).toBeTruthy();
    expect(api.refreshModels).toHaveBeenCalledTimes(1);
  });

  it("a Refresh the service cannot answer keeps the list and says why", async () => {
    mount([usable("SAM 2.1 large")], "SAM 2.1 large", {
      refreshModels: async () => {
        throw new Error("the manifest is not valid JSON");
      },
    });
    await listed("SAM 2.1 large");

    fireEvent.click(button("Refresh"));

    expect(await screen.findByText("Warning: the manifest is not valid JSON")).toBeTruthy();
    expect(option("SAM 2.1 large")).toBeTruthy();
  });

  it("names a model the first AI use loaded, as legacy's line does", async () => {
    // Legacy loads on the first AI click and writes "Current: ..." then (sam_single_view_manager.py:153-171).
    const { api, answered } = mount([usable("SAM 2.1 large")], "SAM 2.1 large", {
      loadedModels: async () => ["SAM 2.1 large"],
    });
    await listed("SAM 2.1 large");

    answered();

    await waitFor(() => expect(line()).toBe("Current: SAM 2.1 large"));
    // With the chosen model the one in memory, a prompt cannot change the answer: not asked again.
    answered();
    expect(api.loadedModels).toHaveBeenCalledTimes(1);
  });

  it("words each state as legacy does", () => {
    expect(currentLine("A", [], null, "A")).toBe("Loading: A");
    expect(currentLine(null, ["A"], "unloaded", "B")).toBe("Current: A");
    expect(currentLine(null, [], "unloaded", "A")).toBe("No model loaded");
    expect(currentLine(null, [], "picked", "A")).toBe("Selected: A");
    expect(currentLine(null, [], null, "A")).toBe("Current: No model loaded");
  });
});
