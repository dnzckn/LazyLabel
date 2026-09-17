"""Fold answered SME questions and corrected specifications back into the rule set.

Usage: python apply_answers.py <decided.json> <rules_with_ids.json> <answers_dir> <date> <out.json>

Each <answers_dir>/RULE-NNN.answer.json was produced by an agent that re-derived one rule from the cited
legacy source and answered that rule's open question. Rules are matched by the id the previous render
assigned, resolved to the rule name so the update survives renumbering.
"""

import json
import pathlib
import re
import sys

FIELDS = ("given", "when", "then", "and", "parameters")


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def dump_json(obj, path):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=1)


decided_path, ids_path, answers_dir, date, out_path = sys.argv[1:6]
res = load_json(decided_path)
id_to_name = {r["id"]: r["name"] for r in load_json(ids_path)}
by_name = {r["name"]: r for r in res["confirmedRules"]}

applied, suspects, unresolved = 0, [], []
for path in sorted(pathlib.Path(answers_dir).glob("*.answer.json")):
    ans = load_json(path)
    name = id_to_name.get(ans["id"])
    if name is None or name not in by_name:
        sys.exit(f"{path.name}: id {ans['id']} does not match a current rule")
    rule = by_name[name]
    for field in FIELDS:
        value = (ans.get(field) or "").strip()
        if field == "and":
            value = re.sub(r"^AND\s+", "", value)  # agents sometimes repeat the clause keyword
        if value:
            rule[field] = value
        elif field == "and":
            rule.pop("and", None)
    if ans.get("edgeCases"):
        rule["edgeCases"] = ans["edgeCases"]
    rule["answer"] = {
        "date": date,
        "text": ans["answer"].strip(),
        "corrections": [c.strip() for c in ans.get("corrections") or [] if c.strip()],
        "unresolved": (ans.get("unresolved") or "").strip(),
    }
    applied += 1
    if ans.get("injectionSuspects"):
        suspects.append((ans["id"], ans["injectionSuspects"]))
    if rule["answer"]["unresolved"]:
        unresolved.append((ans["id"], rule["answer"]["unresolved"]))

res.setdefault("answersApplied", {})["date"] = date
res["answersApplied"]["count"] = applied
dump_json(res, out_path)
print(f"applied {applied} answers")
for rid, items in suspects:
    print(f"  INSTRUCTION-SHAPED TEXT reported by {rid}: {items}")
for rid, text in unresolved:
    print(f"  still open for the owner ({rid}): {text[:160]}")
