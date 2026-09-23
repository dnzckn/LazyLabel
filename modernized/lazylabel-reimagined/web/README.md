# LazyLabel web app

React 19, TypeScript, Vite. The whole browser side: the dataset browser, the canvas and its drawing
tools, the AI tools, the image adjustments, the sequence timeline and the split view.

Phases 2, 4 and 5 built it in that order, and the shell's habit from Phase 2 survived all of
them — **it says plainly what is not built rather than showing a control with nothing behind it.**
That is not decoration. Three features in this project were implemented, unit-tested and
unreachable at some point, and a dead control is the same lie told deliberately.

```bash
npm install
npm test
npm run dev     # proxies /api to http://127.0.0.1:8787
npm run build
```

| Variable | Default | What it is |
|---|---|---|
| `LAZYLABEL_API` | `http://127.0.0.1:8787` | Development only: where `npm run dev` proxies `/api`. Read from the environment or a `.env` file by `vite.config.ts`. |
| `VITE_LAZYLABEL_API` | `/api` | The API's base URL, compiled into the build. Leave it unset: the default is same-origin, which the deployment's proxy serves, and an absolute URL would need CORS on an API that has none. |

## What genuinely works

- **The typed API client.** Every response shape comes from `@lazylabel/contracts`, shared with the
  server. Its most important property is that a load returns one of *three* values — annotations,
  no file, or a file that could not be read — so the collapse decision 15d forbids cannot be written
  by accident.
- **Settings, including the degraded case.** When the settings database is unavailable the app runs
  on defaults and shows a banner, because annotations are files and labelling should continue. The
  failure-mode table calls for exactly that, and it is only true if the browser treats a settings
  failure as degraded rather than fatal.
- **The hotkey system.** Bindings come from the shared schema, so this and the API agree about what
  `Ctrl+Z` means and which assignments are legal (RULE-049). Settings, Show hotkeys opens the
  editor: click a key and press the new one, and a key another action holds is refused by name.

## The keyboard translation

`src/hotkeys/keyEvent.ts` is the only place that knows two vocabularies. Stored bindings are Qt key
sequences — `Ctrl+Z`, `Shift+Space`, `Right`, `Ctrl+Plus`, `Return`, `.` — because decision 5 keeps
existing `hotkeys.json` files working, and a browser reports something different for every one.

It reads `event.code`, the physical key, rather than `event.key`, for three reasons:

1. `event.key` for a letter depends on Shift, so `Shift+Z` reports `Z` and `z` reports `z`. Qt names
   the key `Z` in both cases and lists Shift separately.
2. Legacy binds Save Output to **both** `Return` and `Enter` — in Qt, the main Enter key and the
   keypad's. `event.key` calls both `"Enter"`; only `event.code` separates them.
3. `event.key` follows the keyboard layout, so WASD panning would move different directions on
   AZERTY. The physical key keeps the cluster under the user's fingers.

Point 3 is a deliberate trade: an AZERTY user pressing the key labelled Z gets W's binding. Right
for movement keys, arguably wrong for mnemonic ones like M for Merge. Phase 5 came and went without
revisiting it, which is the honest status: one rule applies everywhere, no rebinding UI was built,
and the hotkey reference in the Settings panel is how a user sees the bindings today.

Two behaviours that are cheap to get wrong and expensive to have wrong: a keystroke aimed at a text
field is not a hotkey (pressing V in a class-name field writes a V, it does not delete segments),
and an action with no handler registered does not swallow the key — preventing the default for
something nothing handles is how Ctrl+A silently stops selecting text.

## What is not built

**All fourteen capabilities are built** -- `src/capabilities.ts` marks every one, and each has an
acceptance test named for it. This section said C11 was the one missing, and that stopped being
true when propagation landed; it was corrected on 2026-09-23, along with every count below.

One refinement is named rather than implied. A linked pair (**C14**) links ADDING: one shape drawn
once lands in both images. Erasing, merging and deleting still act on the image they are done
in, where RULE-092 says legacy applies them to both.

**THE GUARDS ANSWER "what else is missing", and they are the ones to read first**, because each
was built after the same defect was found by hand for the nth time: a thing that works, a test
that proves it works, and nothing calling it.

- `test/reach/unreached.ts` -- every exported FUNCTION no production code calls, with why, across
  this app, the API, the formats package and the two shared libraries. Two left, neither a gap: a
  border tracer the formats tests need on its own, and the image-to-screen half of the coordinate
  transform, which no feature needs yet. The inference service has its own
  (`inference/tests/test_reach.py`). A new one fails the test, and so does wiring one up without
  removing its entry.
- `test/settings/honoured.ts` -- every setting, classified read, dropped or gap, checked against the
  source in both directions. No gaps left. The counts are asserted, so a change moves an entry.
- `test/rules/p0Coverage.test.ts` -- every P0, P1 and P2 rule named by a test or recorded as a
  deliberate divergence with the decision behind it.
- The hotkey editor in the app itself (Settings, Show hotkeys). It marks each action live or "not
  yet" from the DISPATCHER's own registrations rather than a list someone keeps, so it cannot drift.
  The count moves with what is mounted, deliberately: it answers "will this do something if I press
  it now".

`src/capabilities.ts` lists every capability with its state, `test/acceptance/placeheld.ts` holds a
tagged placeholder for each unbuilt one -- none now -- and `coverage.test.ts` fails if those
disagree, or if a capability is marked built with no acceptance test named for it.

**That guard went stale once and it is worth knowing how.** It kept listing eight built
capabilities as pending, and every check still passed, because the checks compare the table with
the placeholders rather than with the app. Keeping the table honest in the same commit as the
feature is the cheapest defence; the guard then makes you write the acceptance test.
