/**
 * Choosing a checkpoint by NAME, which is the whole of RULE-085's answer.
 *
 * Legacy picks by matching substrings of the file name, so `sam2_hiera_large_tuned.pt` contains
 * `_t` and loads as TINY. It does not error — the user simply gets worse masks from a model they
 * believe is their fine-tuned large. A picker over manifest names cannot do that.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient, WireModelStatus } from "../../src/api/client.js";
import { ModelPicker, defaultModel, useDefaultModel } from "../../src/workspace/ModelPicker.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";

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

function mount(models: readonly WireModelStatus[] | Error, chosen = "") {
  const saved: unknown[] = [];
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
  } as unknown as ApiClient;

  render(
    <SettingsProvider client={api}>
      <ModelPicker client={api} />
    </SettingsProvider>,
  );

  return { saved };
}

describe("listing what is installed", () => {
  it("offers each model by its manifest name", async () => {
    mount([usable("SAM 2.1 large"), usable("SAM 1 huge", { family: "sam1", size: "vit_h" })]);

    expect(await screen.findByRole("radio", { name: /SAM 2.1 large/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /SAM 1 huge/ })).toBeTruthy();
  });

  it("says which cannot propagate, rather than promising it", async () => {
    // A SAM 1-only install is a working install with no propagation, and "AI ready" alone would
    // promise a feature that is never going to appear.
    mount([usable("SAM 1 huge", { family: "sam1", videoCapable: false })]);

    expect(await screen.findByText(/no propagation/)).toBeTruthy();
  });

  it("asks the user to choose when nothing is chosen yet", async () => {
    mount([usable("SAM 2.1 large")]);
    expect(await screen.findByText(/Choose a model/)).toBeTruthy();
  });

  it("marks the chosen one", async () => {
    mount([usable("SAM 2.1 large"), usable("SAM 1 huge")], "SAM 1 huge");

    await waitFor(() =>
      expect((screen.getByRole("radio", { name: /SAM 1 huge/ }) as HTMLInputElement).checked).toBe(true),
    );
    expect(screen.queryByText(/Choose a model/)).toBeNull();
  });
});

describe("models that cannot be used", () => {
  it("shows a corrupt checkpoint, disabled, with its reason", async () => {
    // Present and unverified is the case worth showing: a picker that listed only the working ones
    // makes a corrupt checkpoint indistinguishable from an absent one, and the two have different
    // fixes -- re-download it, or go and find it.
    mount([
      usable("SAM 2.1 large"),
      usable("SAM 1 huge", { verified: false, detail: "sha256 does not match the manifest" }),
    ]);

    const broken = await screen.findByRole("radio", { name: /SAM 1 huge/ });
    expect((broken as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/sha256 does not match/)).toBeTruthy();
  });

  it("lists the embedder, but not as a model to segment with", async () => {
    // It shares the manifest with the SAM checkpoints. Choosing it for the AI tool failed with
    // "no backend for family 'embedder'" until 2026-09-23.
    mount([
      usable("SAM 2.1 large"),
      usable("MobileNetV3 small", { family: "embedder", size: "mobilenet_v3_small", segmenter: false, videoCapable: false }),
    ]);

    const embedder = await screen.findByRole("radio", { name: /MobileNetV3 small/ });
    expect((embedder as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Find Archetypes uses this model; it cannot segment/)).toBeTruthy();
  });

  it("shows a missing one too, and says it is missing", async () => {
    mount([usable("SAM 2.1 tiny", { present: false, verified: false, detail: "not in the model directory" })]);

    expect(await screen.findByText(/not in the model directory/)).toBeTruthy();
  });

  it("falls back to a reason of its own when the service gave none", async () => {
    // "Unavailable" sends a user looking; saying which of the two problems it is tells them where.
    mount([usable("SAM 1 huge", { verified: false, detail: null })]);

    expect(await screen.findByText(/does not match its recorded hash/)).toBeTruthy();
  });
});

describe("choosing one", () => {
  it("saves the NAME, not a file path", async () => {
    const { saved } = mount([usable("SAM 2.1 large")]);

    fireEvent.click(await screen.findByRole("radio", { name: /SAM 2.1 large/ }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect((saved[0] as { values: Record<string, unknown> }).values["ai_model"]).toBe("SAM 2.1 large");
  });
});

describe("when there is nothing to choose from", () => {
  it("explains an empty manifest rather than showing a blank panel", async () => {
    mount([]);

    expect(await screen.findByText(/no models in its manifest/)).toBeTruthy();
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
