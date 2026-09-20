/**
 * Which theme applies, and what happens when the place it is stored is unreachable.
 */

import { afterEach, describe, expect, it } from "vitest";

import { applyTheme, nextTheme, themeFor } from "../../src/shell/theme.js";

afterEach(() => {
  delete document.documentElement.dataset["theme"];
  document.documentElement.style.colorScheme = "";
});

describe("choosing a theme", () => {
  it("honours a stored preference", () => {
    expect(themeFor({ settingsAvailable: true, darkMode: true })).toBe("dark");
    expect(themeFor({ settingsAvailable: true, darkMode: false })).toBe("light");
  });

  it("falls back to the system when settings cannot be read", () => {
    // The case that decides the design. `dark_mode` defaults to true, so honouring the default
    // here would hand a user with an unreachable settings database a dark app on a light desktop
    // and no way out -- the toggle writes to the same store that is down.
    expect(themeFor({ settingsAvailable: false, darkMode: true })).toBe("system");
    expect(themeFor({ settingsAvailable: false, darkMode: false })).toBe("system");
  });

  it("treats a non-boolean as unset rather than as truthy", () => {
    // A settings file can be written by hand or by an older version. Reading the string "false" as
    // truthy-therefore-dark is how a document gains a value the UI honours and the schema rejects.
    expect(themeFor({ settingsAvailable: true, darkMode: "true" })).toBe("system");
    expect(themeFor({ settingsAvailable: true, darkMode: "false" })).toBe("system");
    expect(themeFor({ settingsAvailable: true, darkMode: 1 })).toBe("system");
    expect(themeFor({ settingsAvailable: true, darkMode: undefined })).toBe("system");
    expect(themeFor({ settingsAvailable: true, darkMode: null })).toBe("system");
  });
});

describe("applying a theme", () => {
  it("marks the document so the stylesheet can override the media query", () => {
    applyTheme(document.documentElement, "dark");

    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  it("tells the browser too, so its own furniture matches", () => {
    // Scrollbars and form controls are the browser's, not the stylesheet's. A dark page with light
    // scrollbars is the giveaway that a theme was applied to the author's CSS only.
    applyTheme(document.documentElement, "light");

    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("hands control back to the media query for system", () => {
    applyTheme(document.documentElement, "dark");
    applyTheme(document.documentElement, "system");

    expect(document.documentElement.dataset["theme"]).toBeUndefined();
    expect(document.documentElement.style.colorScheme).toBe("light dark");
  });

  it("can be applied twice without accumulating anything", () => {
    applyTheme(document.documentElement, "dark");
    applyTheme(document.documentElement, "light");

    expect(document.documentElement.dataset["theme"]).toBe("light");
  });
});

describe("what the toggle switches to", () => {
  it("flips an explicit choice", () => {
    expect(nextTheme("dark", false)).toBe("light");
    expect(nextTheme("light", false)).toBe("dark");
  });

  it("flips away from what the system is actually showing", () => {
    // Switching to a fixed value from "system" would make the control appear to do nothing on
    // whichever half of machines already matched it.
    expect(nextTheme("system", true)).toBe("light");
    expect(nextTheme("system", false)).toBe("dark");
  });
});
