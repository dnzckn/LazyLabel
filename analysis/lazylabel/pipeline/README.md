# Rules and brief pipeline

These scripts turn the raw output of `/code-modernization:modernize-extract-rules lazylabel` into `BUSINESS_RULES.md`, `DATA_OBJECTS.md` and `P0_PANEL.md`, then fill `MODERNIZATION_BRIEF.md` from `brief_template.md`. Keep them so the brief can be regenerated after the Phase 1 pilot, as §3 of the brief expects.

## Files

| File | Role |
|---|---|
| `extract_rules_result.json` | The workflow's final result with every P0 judge verdict attached. This is the only copy of the raw extraction; do not edit it by hand. |
| `attach_panel.py` | One-time step that produced `extract_rules_result.json` from the workflow result and the session journal. Kept for audit; it cannot be re-run without that journal. |
| `merge_plan.json` | The reviewed groups of near-duplicate cards, by rule name. Edit this to change which cards merge. |
| `dedupe.py` | `propose` suggests duplicate clusters; `merge` applies `merge_plan.json`. |
| `annotate.py` | Adds the brief phase that replaces each rule's cited code, and flags rules that cite only unreachable code. Reads `legacy/lazylabel`. |
| `render_rules.py` | Writes the three rule artifacts and `rules_with_ids.json`. |
| `make_notes.py` | Derives `run_note.json` and `brief_note.json` from the data, so their counts cannot drift from the artifacts. |
| `run_note.json` | Snapshot, date and coverage note shown at the top of `BUSINESS_RULES.md`. Generated; do not hand-edit. |
| `phase_sizes.json` | Statement counts and legacy files per brief phase. |
| `build_brief.py`, `brief_template.md`, `c4.mmd`, `phases.mmd`, `brief_note.json` | Generate `MODERNIZATION_BRIEF.md`. |

## Regenerate

Run from this folder in Git Bash. Intermediate JSON files are gitignored.

```bash
cd E:/GitHub/LazyLabel/analysis/lazylabel/pipeline
```

```bash
E:/venv/lazylabel/Scripts/python.exe dedupe.py merge extract_rules_result.json merge_plan.json merged.json
```

```bash
E:/venv/lazylabel/Scripts/python.exe annotate.py merged.json phase_sizes.json annotated.json
```

```bash
E:/venv/lazylabel/Scripts/python.exe make_notes.py extract_rules_result.json annotated.json run_note.json brief_note.json 2026-09-15 2a7d5d8 4 4
```

The last four arguments are the render date, the legacy snapshot commit, how many workflow runs extraction needed, and how many times it hit usage limits.

```bash
E:/venv/lazylabel/Scripts/python.exe render_rules.py annotated.json .. run_note.json rules_with_ids.json
```

```bash
E:/venv/lazylabel/Scripts/python.exe build_brief.py rules_with_ids.json ../MODERNIZATION_BRIEF.md brief_note.json
```

Then check that every Mermaid block still parses before committing.

## Warnings

- **Brief edits.** Approvers steer execution by editing `MODERNIZATION_BRIEF.md` directly. `build_brief.py` overwrites that file from `brief_template.md`, so copy any approved edits into the template first, or they are lost.
- **Rule IDs.** IDs are assigned by sorting on category, priority, source file and name. Changing the merge plan or a rule's priority renumbers rules, so update any `RULE-NNN` references written elsewhere.
- **SME answers.** Answers recorded on rule cards in `BUSINESS_RULES.md` are overwritten on regeneration. Record them in `extract_rules_result.json` (the rule's `smeQuestion` and `confidence`) or re-apply them after rendering.
