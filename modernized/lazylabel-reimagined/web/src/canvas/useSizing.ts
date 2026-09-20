/**
 * The drawing-aid sizing, as a hook, so a layer does not need it threaded through four callers.
 *
 * A hook rather than a prop for the same reason the tool is context: five layers and the canvas
 * all want it, none of their parents has an opinion about it, and passing it down would put the
 * question in four components that do not ask it.
 */

import { useMemo } from "react";

import { useSettings } from "../settings/SettingsProvider.jsx";
import { sizingFrom, type Sizing } from "./sizing.js";

export function useSizing(): Sizing {
  const { settings } = useSettings();
  return useMemo(() => sizingFrom(settings.values), [settings.values]);
}
