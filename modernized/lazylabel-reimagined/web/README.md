# LazyLabel web app — Phase 2 scaffold

React 19, TypeScript, Vite. Phase 2's scope for the browser is bootstrap, configuration, logging,
and the settings and hotkey schema — **not** the workspace, which Phase 4 builds.

So what is here is a shell that does a shell's job and says plainly what is not built, rather than a
mock editor that Phase 4 would have to throw away.

```bash
npm install
npm test
npm run dev     # proxies /api to http://127.0.0.1:8787
npm run build
```

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
  `Ctrl+Z` means and which assignments are legal (RULE-049).

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
for movement keys, arguably wrong for mnemonic ones like M for Merge. Phase 5 owns the rebinding UI
and can revisit it; what matters now is that one rule applies everywhere.

Two behaviours that are cheap to get wrong and expensive to have wrong: a keystroke aimed at a text
field is not a hotkey (pressing V in a class-name field writes a V, it does not delete segments),
and an action with no handler registered does not swallow the key — preventing the default for
something nothing handles is how Ctrl+A silently stops selecting text.

## What is not built

Twelve of the fourteen capabilities. `src/capabilities.ts` lists each with the phase that builds it
and what is missing; `test/acceptance/pending.test.ts` holds a tagged placeholder for each, and
`coverage.test.ts` fails if the two ever disagree.
