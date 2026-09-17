"""Apply the approver's decisions to the merged rule set before it is annotated and rendered.

Usage: python apply_decisions.py <merged.json> <decisions.json> <out.json>

Today that means decision 14: rules the P0 panel demoted only because the compliance judge said nothing here
is financial or regulated are restored to P0. Where that disagreement was the card's only open question, the
question is answered and the confidence the demotion lowered is restored.
"""

import json
import re
import sys

SCOPE_Q = ("The compliance judge rated this not P0 while the fidelity judge rated it P0. "
           "Decide whether it guards annotation data integrity and belongs in the behavior contract.")
PANEL_POINTER = "Judges' reasoning: analysis/lazylabel/P0_PANEL.md."

def tidy(text):
    """Collapse whitespace and drop a 'Panel:' label whose sentence was removed as answered."""
    if not text:
        return text
    s = re.sub(r"[ 	]+", " ", str(text)).strip()
    s = re.sub(r"Panel:\s*(?=(\||$))", "", s)
    s = re.sub(r"\s*\|\s*(?=\||$)", "", s)
    return s.strip(" |").strip()



def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def dump_json(obj, path):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=1)


merged_path, decisions_path, out_path = sys.argv[1:4]
res = load_json(merged_path)
dec = load_json(decisions_path)
restore = list(dec.get("restoreP0") or [])
date = dec["approval"]["date"]

by_name = {r["name"]: r for r in res["confirmedRules"]}
missing = [n for n in restore if n not in by_name]
if missing:
    sys.exit(f"decisions.json names rules that are not in the merged set (did a merge change a kept name?): {missing}")

answered_only = 0
for name in restore:
    rule = by_name[name]
    rule["priority"] = "P0"
    rule["restoredByDecision"] = 14
    parts = [p.strip() for p in (rule.get("smeQuestion") or "").split(" | ")]
    kept = [tidy(p.replace(SCOPE_Q, "").replace(PANEL_POINTER, "")) for p in parts]
    kept = [p for p in kept if p]
    if kept:
        rule["smeQuestion"] = tidy(" | ".join(kept)) + " " + PANEL_POINTER
    else:
        # The P0 scope split was this card's only open question, and decision 14 settles it.
        rule.pop("smeQuestion", None)
        answered_only += 1
        if rule["confidence"] != "High" and all(
            v["faithful"] for pn in [rule.get("p0Panel")] + [m.get("p0Panel") for m in rule.get("mergedSpecs") or []]
            if pn for v in pn.values() if v
        ):
            rule["confidence"] = "High"
            rule["confidenceNote"] = (f"Confidence was lowered only by the P0 panel disagreement that decision 14 "
                                      f"settled on {date}; every judge found the specification faithful.")

res["decisionsApplied"] = {"date": date, "covers": dec["approval"]["covers"], "restoredToP0": len(restore),
                           "questionsClosed": answered_only}
dump_json(res, out_path)
print(f"restored {len(restore)} rules to P0; {answered_only} had no question left after decision 14")
