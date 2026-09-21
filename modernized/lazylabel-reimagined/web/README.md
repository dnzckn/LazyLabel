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
for movement keys, arguably wrong for mnemonic ones like M for Merge. Phase 5 came and went without
revisiting it, which is the honest status: one rule applies everywhere, no rebinding UI was built,
and the hotkey reference in the Settings panel is how a user sees the bindings today.

Two behaviours that are cheap to get wrong and expensive to have wrong: a keystroke aimed at a text
field is not a hotkey (pressing V in a class-name field writes a V, it does not delete segments),
and an action with no handler registered does not swallow the key — preventing the default for
something nothing handles is how Ctrl+A silently stops selecting text.

## What is not built

**One of the fourteen capabilities**: **C11**, propagating an annotation along a sequence, which
needs the inference service and a recorded sequence to be proven against.

Inside the thirteen that are built, two refinements are named rather than implied. A linked pair
(**C14**) saves each side separately, and a linked EDIT or DELETE is not built -- adding is. And
**RULE-089**'s Operate On View, which would send the adjusted pixels to the model rather than the
decoded ones, is a setting nothing reads.

**THREE GUARDS ANSWER "what else is missing", and they are the ones to read first**, because each
was built after the same defect was found by hand for the nth time: a thing that works, a test
that proves it works, and nothing calling it.

- `test/reach/unreached.ts` — every exported FUNCTION no production code calls, with why. Two left,
  both waiting on C11. A new one fails the test, and so does wiring one up without removing its
  entry.
- `test/settings/honoured.ts` — every setting, classified read, dropped or gap, checked against the
  source in both directions. TWO gaps left, and both are blocked on work larger than a wiring job:
  `operate_on_view` is RULE-089, and `stream_window_size` is C11. The counts in that file are
  asserted, so closing a gap fails the test and prompts whoever closed it to move the entry —
  which is how these two numbers stayed true while the rest of this paragraph went stale once.
- The hotkey reference in the app itself. It marks each action live or "not yet" from the
  DISPATCHER's own registrations rather than a list someone keeps, so it cannot drift — open the
  app and press Show hotkeys. The count moves with what is mounted, deliberately: it answers "will
  this do something if I press it now".

`src/capabilities.ts` lists every capability with its state, `test/acceptance/pending.test.ts`
holds a tagged placeholder for each unbuilt one, and `coverage.test.ts` fails if those disagree —
or if a capability is marked built with no acceptance test named for it.

**That guard went stale once and it is worth knowing how.** It kept listing eight built
capabilities as pending, and every check still passed, because the checks compare the table with
the placeholders rather than with the app. Keeping the table honest in the same commit as the
feature is the cheapest defence; the guard then makes you write the acceptance test.
