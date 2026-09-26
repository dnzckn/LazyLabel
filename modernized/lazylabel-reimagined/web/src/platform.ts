/**
 * Whether the browser runs on an Apple platform, where legacy reads the keyboard and mouse
 * differently.
 *
 * Legacy is a Qt application, and Qt treats a Mac's keys and clicks in two ways of its own. Legacy
 * turns off neither (it sets no `AA_MacDontSwapCtrlAndMeta`, no `QT_MAC_DONT_OVERRIDE_CTRL_LMB`):
 *   - Qt's "Ctrl" is the Command key there, and its "Meta" the Control key (`qapplekeymapper.mm`
 *     swaps them). So a binding legacy writes as "Ctrl+Z" is Command+Z on a Mac.
 *   - A click with Control held is a RIGHT click (`qnsview_mouse.mm`, `mouseDown:`).
 *
 * Asked on every use rather than once, because it is cheap and a test can then stub it.
 */
export function isApplePlatform(): boolean {
  const nav = globalThis.navigator as
    | (Navigator & { readonly userAgentData?: { readonly platform?: string } })
    | undefined;
  if (nav === undefined) return false;
  // `userAgentData` is the newer API and not every browser has it; `platform` every browser still
  // answers ("MacIntel" on every Mac, Apple silicon included, and on an iPad asking for desktop pages).
  const platform = nav.userAgentData?.platform || nav.platform || "";
  return /^(mac|iphone|ipad|ipod)/i.test(platform);
}
