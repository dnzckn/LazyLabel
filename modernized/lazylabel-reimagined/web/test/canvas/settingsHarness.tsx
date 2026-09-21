/**
 * A settings context for the drawing layers.
 *
 * The layers read `point_radius`, `line_thickness` and `annotation_size_multiplier` through
 * `useSizing`, which uses `useSettings` — and that throws without a provider, deliberately. A hook
 * that quietly returns a default when its provider is missing makes a wiring mistake undetectable,
 * which is the defect family this project has found eight of.
 *
 * So the tests supply one. `values` overrides individual keys, which is how the sizing tests ask
 * for a bigger handle without restating the whole schema.
 */

import { render } from "@testing-library/react";
import type { ReactNode } from "react";

import { defaultSettings } from "@lazylabel/settings-schema";

import type { ApiClient } from "../../src/api/client.js";
import { HotkeyProvider } from "../../src/hotkeys/HotkeyProvider.jsx";
import { SettingsProvider } from "../../src/settings/SettingsProvider.jsx";

export function renderWithSettings(
  node: ReactNode,
  values: Readonly<Record<string, unknown>> = {},
): ReturnType<typeof render> {
  const base = defaultSettings();
  const client = {
    getSettings: async () => ({ ...base, values: { ...base.values, ...values } }),
    putSettings: async (next: unknown) => next,
  } as unknown as ApiClient;

  // The hotkey provider comes with the settings one: layers read the drawing-aid sizing AND
  // register remappable keys, and `useHotkey` throws without a provider by design.
  const wrap = (inner: ReactNode) => (
    <SettingsProvider client={client}>
      <HotkeyProvider bindings={base.hotkeys}>{inner}</HotkeyProvider>
    </SettingsProvider>
  );

  const result = render(wrap(node));
  // A rerender has to go back through the providers. Testing Library's own replaces the WHOLE
  // tree, so handing it a bare component drops the context the component needs -- which surfaces
  // as "useSettings must be used inside a SettingsProvider" from a test that had one.
  return { ...result, rerender: (next: ReactNode) => result.rerender(wrap(next)) };
}
