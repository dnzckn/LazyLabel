"""Check that every rule id cited in the analysis documents exists, and that no P0 rule is orphaned.

Usage (from this directory):
    E:/venv/lazylabel/Scripts/python.exe check_citations.py

Exists because the first draft of AI_NATIVE_SPEC.md mis-cited roughly half its rules and invented
RULE-103, which does not exist. The prose was mostly right and the ids were not, which is the
dangerous combination: a downstream agent turns ids into tests mechanically and wires them to the
wrong behavior without anyone noticing.

Exit status is non-zero on any problem, so CI can gate it.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ANALYSIS = HERE.parent
CATALOG = HERE / "rules_with_ids.json"

# Documents that are allowed to cite rules. The rule catalog itself is excluded: it defines them.
DOCUMENTS = ["AI_NATIVE_SPEC.md", "REIMAGINED_ARCHITECTURE.md", "MODERNIZATION_BRIEF.md"]

# Where a P0 rule may find a home: a capability in the spec, or the behavior contract in the brief.
CAPABILITY_SOURCES = ["AI_NATIVE_SPEC.md", "MODERNIZATION_BRIEF.md"]


def main() -> None:
    with open(CATALOG, encoding="utf-8") as handle:
        rules = json.load(handle)
    known = {rule["id"] for rule in rules}
    problems: list[str] = []

    cited_anywhere: set[str] = set()
    for name in DOCUMENTS:
        path = ANALYSIS / name
        if not path.exists():
            problems.append(f"{name} is missing")
            continue
        text = path.read_text(encoding="utf-8")
        cited = set(re.findall(r"RULE-\d{3}", text))
        cited_anywhere |= cited
        for rule_id in sorted(cited - known):
            problems.append(f"{name} cites {rule_id}, which is not in the catalog")

    homed: set[str] = set()
    for name in CAPABILITY_SOURCES:
        path = ANALYSIS / name
        if path.exists():
            homed |= set(re.findall(r"RULE-\d{3}", path.read_text(encoding="utf-8")))

    orphans = sorted(
        rule["id"] for rule in rules if rule["priority"] == "P0" and rule["id"] not in homed
    )
    for rule_id in orphans:
        problems.append(f"{rule_id} is P0 but appears in no capability or contract")

    print(f"catalog {len(known)} rules | cited {len(cited_anywhere)} | P0 without a home {len(orphans)}")
    if problems:
        print("\n" + "\n".join(problems))
        sys.exit(f"\n{len(problems)} citation problem(s)")
    print("every cited rule exists, and every P0 rule has a home")


if __name__ == "__main__":
    main()
