"""Fold answered SME questions and corrected specifications back into the rule set.

Usage: python apply_answers.py <decided.json> <rules_with_ids.json> <answers_dir> <date> <out.json>

Each <answers_dir>/RULE-NNN.answer.json was produced by an agent that re-derived one rule from the cited
legacy source and answered that rule's open question.

MATCHING IS BY NAME, not by id, and the id is only a cross-check. Rule ids are POSITIONAL: they are
assigned by render_rules.py in priority order, so promoting one rule to P0 renumbers every rule after
it. On 2026-09-19 exactly that happened -- two Phase 3 rules were restored to P0 at their phase entry
-- and it silently swapped which rule two answer files pointed at. The answers had already been
applied correctly that run, because apply_answers runs BEFORE render_rules reassigns the ids, so
nothing was wrong until the next run, which would have attached a propagation answer to a crop rule.

Hence: every answer file carries the rule `name` it was written for, that name is what selects the
rule, and a `name` that disagrees with what its `id` currently resolves to is a hard error. A file
with no name at all is refused rather than matched on the id alone -- being unable to apply an
answer is recoverable, applying it to the wrong rule is not.
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
    name = (ans.get("name") or "").strip()
    if not name:
        sys.exit(
            f"{path.name}: no 'name' field. Rule ids are positional and move when priorities change,"
            f" so an answer file must record the rule name it was written for."
        )
    if name not in by_name:
        sys.exit(f"{path.name}: no rule named {name!r} in the merged set (was it renamed or folded?)")

    # The id is a cross-check, not the key. A disagreement means the catalog was renumbered since
    # this file was written, and continuing would attach this answer to whatever now sits at that id.
    by_id = id_to_name.get(ans["id"])
    if by_id is not None and by_id != name:
        sys.exit(
            f"{path.name}: it answers {name!r}, but id {ans['id']} now names {by_id!r}."
            f" Rename the file and update its id field; do not change the name to match."
        )
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
