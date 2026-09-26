# LazyLabel alias converter

Rewrites a legacy LazyLabel `.npz` or `_CM.npz` so its class names survive the move to the web app.

> **No longer needed (2026-09-25).** The owner decided the web app handles `.npz` files exactly as
> the desktop app does. It now reads the desktop app's pickled `class_aliases` table as data, without
> unpickling anything, and writes the same table itself, so names cross between the two apps in both
> directions with no conversion step. The format library's `src/format/legacyAliases.ts` does this.
> Files this converter already wrote still load: the web app reads `class_aliases_json` too. What
> follows describes the converter as it was built.

```bash
python -m pip install -e ".[dev]"
lazylabel-convert-aliases /path/to/labelled/folder /path/to/converted
```

## Why it exists

A legacy NPZ stores its class-alias table as a **pickled Python dict**. Nothing in the web stack
will unpickle one (SEC-01), so the masks load perfectly and the names do not. Pascal VOC and
CreateML carry *names* rather than ids, so converting a dataset without this first writes `3` where
the original said `stop sign` — and nothing about the output looks wrong.

The web app reports the loss on load and warns before exporting, so the gap is visible. This is what
closes it.

## It does not trust the file

`np.load(..., allow_pickle=True)` runs whatever the file says to run. A payload whose `__reduce__`
returns `(os.system, ("…",))` executes on load — and `tests/test_aliases.py` proves that is a real
behaviour, not a theoretical one, by doing it. A converter exists precisely to be pointed at files
whose provenance nobody is sure of, so it is the last place to trust one.

Instead the payload goes through a `pickle.Unpickler` whose `find_class` permits exactly the names
that rebuilding a NumPy object array needs, and raises on everything else. That is an allow-list,
not a blocklist: anything a hostile file wants to do requires a name that is not on it.

A file it cannot vouch for is **reported and skipped**, never partially written, and the command
exits non-zero so a script running it over a dataset notices.

## The constraints it keeps

From `REIMAGINED_ARCHITECTURE.md` section 4, and each is load-bearing:

- writes to a **new path**, never in place, so a conversion that goes wrong costs nothing;
- a **separate short-lived process**, so permission to unpickle does not live in a running service;
- no network access to lose, because it makes no network calls;
- the **only** component permitted to load pickle at all.

Two more it adds. Every member other than the alias table is copied **byte for byte** — the masks
are the irreplaceable part, and a converter that re-encodes them is one that can corrupt them. And
files that are not `.npz` are not copied: this is a converter, not a backup tool.

## What it writes

The alias table becomes `class_aliases_json.npy`, a NumPy unicode scalar holding one JSON document,
per decision 4. The **new member name** matters: legacy's `_restore_aliases` calls `.item()` on
`class_aliases` inside a `try` and `.items()` on the result outside it, so a unicode scalar under the
old name would raise and take the entire legacy load down with it — losing every segment, not just
the names. Under the new name, legacy ignores it and keeps working.

Verified end to end against the Phase 1 goldens, which the legacy Python exporters produced: all
twelve convert, their names come back in full, and the results read in NumPy with no pickle and in
the TypeScript format library with `unreadableAliases: false`.
