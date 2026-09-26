# Cutting over

Phase 6's fifth exit criterion: *"The PyPI package and desktop app are handled per decision 1, and
the legacy app stays available until this criterion is met."*

This is the checklist for that day, and the answer to "what does a user actually do". It is not a
plan for the remaining engineering — `PROGRESS.md` is that. It is the document you read when the
engineering is done and the question is whether to switch.

## What decision 1 settled

`lazylabel-gui` is **frozen at 2.0.8**. No further PyPI releases. The existing release stays
installable, so anyone can `pip install lazylabel-gui==2.0.8` and run the desktop app, during the
transition and after it. Nothing is yanked and nothing is deprecated in place.

That is the whole of the package decision, and it is deliberately the least disruptive option: a
user who does not want to move does not have to, and a user who tries the web app and dislikes it
has the desktop one still working on the same folder of files.

**Both apps can be open on the same image, and the web one now notices.** Saves are conditional on
the revision of the file the annotations were read from, so if the desktop app — or another tab, or
a script — wrote it in between, the web app refuses, writes nothing, and says so. Before that it
overwrote silently, which is the failure this whole arrangement would otherwise invite. Only the
file being edited is guarded; the other six sidecars are still written unconditionally, because the
load returns one revision and claiming to guard the rest would be a claim the client cannot make.

**The two can read each other's work.** That is not a coincidence, it is decision 5 — the
annotation sidecars beside your images are the source of truth in both. The web app writes the
same seven formats identically to legacy (Phase 1, proven against goldens legacy itself wrote), so
a folder labelled in one opens in the other.

## Class names cross both ways

A legacy NPZ stores its class-alias table as a **pickled Python dict**. Since the owner's decision
of 2026-09-25 the web app handles it exactly as the desktop app does:

- **Reading.** It reads the desktop app's table as data, without unpickling it (SEC-01 still
  holds: nothing in the web stack executes a pickle). It accepts exactly the structure the desktop
  app writes, a NumPy object array holding one dict of class ids to names, and refuses anything
  else.
- **Writing.** It writes the same `class_aliases` member, so the desktop app reads the names in
  web-saved files. That was checked with the desktop app's own loader, and `exporters/tools/
  compare_npz.py` repeats the check for every golden case.

So there is no converter step. A table the web app refuses is reported on load, with a warning
before exporting, because Pascal VOC and CreateML carry *names* rather than ids. Re-exporting
without the names would write `3` where the original said `stop sign`, and nothing about the output
would look wrong. The acceptance round-trip names it too: `npm run acceptance` counts such files as
having unreadable class names.

The archives are equal array for array and name for name, but not byte for byte: NumPy pickles
the table as protocol 4 and the web app as protocol 2, which NumPy 1.x and 2.x both load.

## Before the switch

Each of these is checkable, and none of them is an opinion.

- [x] **Every Phase 6 exit criterion is met.** They are listed in `MODERNIZATION_BRIEF.md` §3 and
      tracked in `PROGRESS.md`. This document assumes that and does not restate it. Met
      2026-09-25, criteria 2 and 4 on synthetic data the owner chose.
- [x] **The acceptance corpus round-trips.** Met 2026-09-25 on the synthetic corpus the owner
      chose (`api/test/fixtures/acceptance-corpus`, run by `api/test/acceptance/corpus.test.ts`):
      every file the web app writes, on a fresh save or on opening and saving again, is what the
      desktop app writes. For real datasets: `npm run acceptance -- <corpus> --oracle
      <legacy re-saves>`. Without the oracle, instance-format differences on images with several
      shapes are the desktop app's own behaviour on reopening, not the web app's.
- [x] **No dataset needs converting.** Met 2026-09-25: the web app reads and writes the desktop
      app's pickled class names as data, so every dataset works as the desktop app saved it, including
      every one it saves while both apps are in use (the owner keeps both). The acceptance corpus
      is used exactly as legacy wrote it and round-trips with no converter step.
- [x] **The live differential suites have been run with real checkpoints**, not just CI. They skip
      themselves when no checkpoint is configured, so a green CI run says nothing about them —
      `PROGRESS.md` has the command and the expected counts. Met 2026-09-25 with all three
      checkpoints on CPython 3.12: 650 passed, 0 skipped. Run them again if the inference service
      changes before the switch.
- [ ] **The deployment has been built and run.** Skipped for now, the owner's choice
      (2026-09-23, confirmed 2026-09-25). Everything under `modernized/lazylabel-reimagined/
      deploy/` is currently reasoned rather than observed; its README says so and names what to
      check first. That has to stop being true before anyone depends on it.
- [x] **A backup of the dataset folder exists.** The owner's answer, 2026-09-25: not needed, the
      backups exist. The web app deletes files as the desktop app does since 2026-09-26: saving
      an image with no segments removes its seven annotation files. And this is the first time a
      different program will write these files, so the cheapest insurance against being wrong
      about that is a copy.

## What a user does

1. Keep the desktop app installed. It is 2.0.8 and it keeps working.
2. Point the web app at the dataset folder, following the quick start at the top of the
   repository's `README.md`. (The Docker route, `DATASET_ROOT` in `deploy/example.env`, is
   unverified: CI builds its images, but nothing has ever run them.)
3. Work in whichever one suits the task. The files are the same files, class names included.

There is no import step and no database to populate. That is the point of decision 5: the
annotations were always files in a folder, and they still are.

**Your settings and hotkeys come with you, once.** The first time the API starts, it reads the
desktop app's `settings.json` and `hotkeys.json` from `~/.config/lazylabel` and stores them; from
then on, what the web app stores is the truth and those files are never read again. Its log lists
every preference the import changed and why. Two things it does differently from the desktop
app's own loader, both on purpose: a key it does not recognise is kept rather than resetting every
preference, which is how a settings file from releases 1.3.8 to 1.5.0 loses everything when the
desktop app itself upgrades; and a file that is not JSON is reported and not replaced by defaults,
so fixing it and restarting still works. Running in Docker, the container cannot see your home
folder, so mount it -- `deploy/README.md` shows how.

## What is lost, and what is gained

Being straight about both, because a cutover document that only lists gains is an advertisement.

**Lost, deliberately:**

- **Pop-out panels.** Legacy detaches its left and right panels into separate windows. Not ported,
  with four recorded reasons — chief among them that a browser window is already resizable and a
  second view is a second tab. `PROGRESS.md` records where it would attach if it is wanted.
- **The four-view multi-view setting.** Only two viewers ever existed behind it; the setting was a
  control that did nothing.
- **Silent loss on closing.** Closing the tab still asks while there is unsaved work, where the
  desktop app closes without a question (SP-17). The owner's decision of 2026-09-26 to match the
  desktop app's silent behaviours covered the Sequence tab, New Timeline, emptied images and the
  Multi view, not closing.

**Matched on the owner's decision of 2026-09-26** ("Match the desktop app exactly"): saving an image
with no segments deletes its seven annotation files, with the desktop app's "Deleted: ..." notice;
leaving the Sequence tab or pressing New Timeline drops unsaved propagated frames without asking;
the Multi view saves both images on every move. One guard stays: an image whose annotations could
not be read is never written over or deleted (SEC-04), where the desktop app deletes its files.

**Gained, beyond the obvious:**

- **Nothing unpickles anything** (SEC-01), and checkpoints load hash-checked and weights-only. The
  desktop app's pickled class names are read as data instead, which only accepts the one shape
  the desktop app writes.
- **A damaged file is never overwritten or deleted** (SEC-04): the web app will not save over, or
  delete the files of, an image whose annotations could not be read, and it says why.
- **Per-image class ids that stay per-image** (decision 6), so one dataset's numbering cannot leak
  into another's.
- **Several legacy defects designed out rather than ported**, each recorded on its rule card:
  the FFT's stale cache, the undo stack's malformed erase records, the crop that silently survives
  an image change.

## After the switch

- The desktop app stays installable. Nothing needs to be done to keep that true; it is what
  freezing at 2.0.8 means.
- `legacy/lazylabel` in this repository stays pinned at snapshot `2a7d5d8` and read-only. It is the
  oracle every differential test compares against, and it remains the answer to "what did the old
  one do".
- If the package should start shipping again — as the Python inference client, say — that reopens
  decision 1 rather than being a detail of this one.
