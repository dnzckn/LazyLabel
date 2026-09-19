# @lazylabel/settings-schema

The versioned settings and hotkey schema, its legacy importer, and the validation rules the API and
the web app must agree on. No filesystem, no socket, no database — data shapes, defaults, and the
rules for deciding whether a proposed change is allowed.

A separate package for one structural reason: the rebinding dialog must refuse a conflicting key
**while the user is typing**, so the browser needs this logic locally, and importing the API package
into a browser bundle would drag `node:sqlite` and `node:fs` along with it.

## The two rules

**RULE-088 — an unknown key must not cost you everything.** The legacy loader does `cls(**data)`, so
one unrecognized key raises `TypeError`, the handler catches it, and every preference the user ever
set is replaced by defaults. A settings file written by a newer build silently resets the lot. Here
an unknown key is kept verbatim and reported; a wrong-typed value falls back on its own; only a file
that is not JSON at all yields defaults wholesale.

Its second half is easy to miss and is not cosmetic: the **export format list can never be empty**,
unknown format names are dropped, and an invalid list falls back to the defaults. Legacy enforces
this in the export widget rather than in the loader, so a settings file can hold a list the app
would never have let you choose — including an empty one, which makes a save write no files and
still report success.

**RULE-049 — a key bound to another action cannot be assigned.** Checked in the dialog as the user
types, and again when a settings `PUT` arrives, because a client is not a permission.

One edge case is kept deliberately: a hand-edited `hotkeys.json` holding a conflict is **not**
rejected on import. Locking someone out of their own configuration over a key they can simply rebind
is worse than the conflict. Unlike legacy, it is reported rather than swallowed.

## Fixtures

`test/fixtures/legacy-config/` was written by the legacy code itself at commit `2a7d5d8` —
`Settings().save_to_file` and `HotkeyManager.save_hotkeys`. A hand-written fixture only proves the
importer agrees with whoever wrote the fixture.
