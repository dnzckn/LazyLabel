"""Compute run_note.json (coverage note for BUSINESS_RULES.md) and brief_note.json from the pipeline data.

Usage: python make_notes.py <attached.json> <annotated.json> <out_run_note.json> <out_brief_note.json> <date> <snapshot> <runs> <limit_hits>

Every number in the coverage note is derived here rather than typed, so the note cannot drift from the artifacts.
"""

import json
import sys


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def dump_json(obj, path):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=1)


attached_path, annotated_path, run_out, brief_out, date, snapshot, runs, limit_hits = sys.argv[1:9]
attached = load_json(attached_path)
annotated = load_json(annotated_path)
runs, limit_hits = int(runs), int(limit_hits)

cards = attached["confirmedRules"]
rejected = len(attached["rejectedRules"])
dtos = len(attached.get("dataObjects") or [])
rules = annotated["confirmedRules"]
folded = sum(len(r.get("mergedSpecs") or []) for r in rules)
dead = sum(1 for r in rules if r.get("deadCode"))

panels = [r["p0Panel"] for r in cards if r.get("p0Panel")]
both = sum(1 for p in panels if p["compliance"] and p["fidelity"])
one = sum(1 for p in panels if bool(p["compliance"]) != bool(p["fidelity"]))
none = sum(1 for p in panels if not p["compliance"] and not p["fidelity"])
split = sum(1 for p in panels if p["compliance"] and p["fidelity"]
            and not p["compliance"]["p0Justified"] and p["fidelity"]["p0Justified"])

def split_panel(panel) -> bool:
    c, f = (panel or {}).get("compliance"), (panel or {}).get("fidelity")
    return bool(c and f and not c["p0Justified"] and f["p0Justified"])


awaiting = 0
for r in rules:
    if r["priority"] == "P0" or r.get("deadCode"):
        continue
    if any(split_panel(pn) for pn in [r.get("p0Panel")] + [m.get("p0Panel") for m in r.get("mergedSpecs") or []] if pn):
        awaiting += 1

panel_cov = f"{both} of {len(panels)} P0 candidate cards carry both verdicts"
if one:
    panel_cov += f", {one} carry one"
if none:
    panel_cov += f", and {none} carry none because both judges failed on usage limits and those cards were demoted to P1 by default"
panel_cov += "."

dto_text = (f"The data-object catalog returned {dtos} objects (`DATA_OBJECTS.md`)." if dtos
            else "The data-object catalog agent never completed, so `DATA_OBJECTS.md` is empty. Re-run the workflow to fill it.")
dead_text = (f" {dead} rule(s) cite only unreachable code and say so on the card." if dead else "")

coverage = (
    f"Extraction ran **one round** of the three lenses. The workflow normally repeats rounds until two in a row find "
    f"nothing new; it was capped at one round after the first run's later rounds died on usage limits, and a failed round "
    f"is indistinguishable from a dry one. Rules that only a later round would surface are therefore not in this catalog. "
    f"Every one of the {len(cards) + rejected} candidate rules was refereed against its citation. The P0 panel needed "
    f"{runs} workflow runs, because judge agents kept failing on usage limits; in this record {panel_cov} "
    f"In {split} cards the two judges disagreed in one direction: the compliance judge said the rule is not P0 because "
    f"nothing here is financial or regulated, while the fidelity judge said it is P0 because it guards annotation data. "
    f"The workflow demotes a card on any disagreement, so {awaiting} merged rules sit at P1 for that reason alone, "
    f"pending the approver's decision (`MODERNIZATION_BRIEF.md` §7 decision 14, which lists them). Every verdict and its "
    f"reasoning is in `P0_PANEL.md`. "
    f"The {len(cards)} confirmed cards were then reviewed for near-duplicates across lenses and merged into {len(rules)} "
    f"distinct rules, with each folded card's own specification kept in the table at the end of this file.{dead_text} "
    f"{dto_text}"
)

dump_json({"snapshot": snapshot, "date": date, "coverage": coverage}, run_out)
dump_json({"budgetNote": (
    f"Rule extraction alone needed {runs} workflow runs and hit usage limits {limit_hits} times, each time losing the "
    f"agents in flight."
)}, brief_out)
print(f"coverage note: {len(coverage)} chars | panel both {both} one {one} none {none} split {split} | dtos {dtos} | rules {len(rules)} folded {folded} dead {dead}")
