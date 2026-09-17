"""Render the merged modernize-extract-rules result into BUSINESS_RULES.md, DATA_OBJECTS.md and P0_PANEL.md.

Usage: python render_rules.py <merged.json> <out_dir> <run_note.json> [rules_with_ids.json]

<merged.json> is the workflow result after attach_panel.py and dedupe.py merge. run_note.json carries facts the
result does not: date, snapshot commit and the coverage note. Rule Cards follow the exact format in
commands/modernize-extract-rules.md (hard line breaks via two trailing spaces).
"""

import collections
import json
import re
import sys
from pathlib import Path


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def dump_json(obj, path):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=1)

result_path, out_dir, note_path = sys.argv[1], Path(sys.argv[2]), sys.argv[3]
res = load_json(result_path)
note = load_json(note_path)

CATEGORY_ORDER = ["Calculation", "Validation", "Lifecycle", "Policy"]
PRIORITY_ORDER = {"P0": 0, "P1": 1, "P2": 2}
LENSES = ("compliance", "fidelity")
BR = "  "  # markdown hard line break


def md(text) -> str:
    """Escape characters markdown would swallow or misread; collapse newlines."""
    s = str(text if text is not None else "").strip()
    s = s.replace("\\", "\\\\").replace("<", "\\<").replace(">", "\\>")
    return re.sub(r"\s*\n\s*", " ", s)


def cell(text) -> str:
    return md(text).replace("|", "\\|")


def quote(text) -> str:
    """Blockquote that keeps the judge's paragraphs and lists."""
    lines = []
    for raw in str(text or "").strip().splitlines():
        line = raw.rstrip().replace("\\", "\\\\").replace("<", "\\<").replace(">", "\\>")
        if re.match(r"^\s*#", line):
            line = "\\" + line.lstrip()
        lines.append("> " + line if line else ">")
    return "\n".join(lines)


def anchor(rule_id: str, name: str) -> str:
    return f"#{rule_id.lower()}-{re.sub(r'[^a-z0-9 -]', '', name.lower()).replace(' ', '-')}"


def source_file(src: str) -> str:
    return src.split(";")[0].strip().split(":")[0]


def verdict_text(v) -> str:
    if not v:
        return "no verdict"
    return f"P0 {'yes' if v['p0Justified'] else 'no'}, faithful {'yes' if v['faithful'] else 'no'}"


def panel_outcome(panel) -> str:
    got = [v for v in panel.values() if v]
    if not got:
        return "no verdict; demoted to P1"
    if not all(v["p0Justified"] for v in got):
        return "demoted to P1"
    if not all(v["faithful"] for v in got):
        return "kept P0; confidence Medium"
    return "kept P0" + ("" if len(got) == 2 else " on one verdict")


rules = list(res.get("confirmedRules") or [])
rules.sort(key=lambda r: (
    CATEGORY_ORDER.index(r["category"]) if r["category"] in CATEGORY_ORDER else 99,
    PRIORITY_ORDER.get(r["priority"], 9),
    source_file(r["source"]),
    r["name"].lower(),
))
for i, r in enumerate(rules, 1):
    r["id"] = f"RULE-{i:03d}"
name_to_id = {}
id_to_name = {r["id"]: r["name"] for r in rules}
for r in rules:
    name_to_id[r["name"]] = r["id"]
    for m in r.get("mergedSpecs") or []:
        name_to_id.setdefault(m["name"], r["id"])
if len(sys.argv) > 4:
    dump_json(rules, sys.argv[4])

folded = [(r, m) for r in rules for m in (r.get("mergedSpecs") or [])]
raw_cards = len(rules) + len(folded)
by_cat = collections.OrderedDict((c, []) for c in CATEGORY_ORDER)
for r in rules:
    by_cat.setdefault(r["category"], []).append(r)
prio = collections.Counter(r["priority"] for r in rules)
conf = collections.Counter(r["confidence"] for r in rules)
cats = collections.Counter(r["category"] for r in rules)
needs_sme = [r for r in rules if r["confidence"] != "High"]
p0_blockers = [r for r in rules if r["priority"] == "P0" and r["confidence"] != "High"]
rejected = list(res.get("rejectedRules") or [])
flags = list(res.get("injectionFlags") or [])

# Every card that went to the P0 panel, whether it is a kept card or folded into one.
candidates = []
for r in rules:
    if r.get("p0Panel"):
        candidates.append({"name": r["name"], "id": r["id"], "folded": False, "panel": r["p0Panel"], "final": r})
    for m in r.get("mergedSpecs") or []:
        if m.get("p0Panel"):
            candidates.append({"name": m["name"], "id": r["id"], "folded": True, "panel": m["p0Panel"], "final": r})
candidates.sort(key=lambda c: (c["id"], c["folded"], c["name"].lower()))

L = []
a = L.append
a("# BUSINESS RULES: `lazylabel`")
a("")
a("| | |")
a("|---|---|")
a(f"| System | LazyLabel 2.0.8, legacy snapshot `legacy/lazylabel` at {note['snapshot']} |")
a(f"| Produced | {note['date']} by `/code-modernization:modernize-extract-rules lazylabel` (Method A, workflow `extract-rules.js`) |")
a("| Method | Three lens-scoped extractors (calculations, validations, lifecycle); every rule's citation re-read by an independent referee; every P0 candidate sent to two independent judges (compliance and fidelity lenses); near-duplicate cards from different lenses reviewed and merged |")
a(f"| Result | {len(rules)} distinct rules from {raw_cards} confirmed cards ({len(folded)} near-duplicates folded into another card); {len(rejected)} candidate rules rejected by referees; {len(flags)} instruction-shaped source locations flagged |")
a("| Companions | `analysis/lazylabel/DATA_OBJECTS.md` (data objects) and `analysis/lazylabel/P0_PANEL.md` (every P0 judge verdict with its reasoning) |")
a("")
a("**Coverage note.** " + note["coverage"])
a("")
a("How to read a card: **Source** paths are relative to the repository root. **Priority** P0 means the rule guards data integrity (for LazyLabel: what is written to or read from annotation files, and which pixels belong to which class), so it becomes part of the behavior contract every rewrite phase must prove equivalent. **Confidence** below High carries the exact question a subject-matter expert must answer.")
a("")
if flags:
    a("## ⚠ Instruction-shaped content found in source")
    a("")
    a("These locations contain text that looks aimed at automated analysis. A human should inspect them.")
    a("")
    for f in flags:
        a(f"- `{f}`")
    a("")

a("## Summary")
a("")
a("| Measure | Count |")
a("|---|---|")
a(f"| Distinct rules | {len(rules)} |")
for c in CATEGORY_ORDER:
    a(f"| {c} | {cats.get(c, 0)} |")
for p in ("P0", "P1", "P2"):
    a(f"| Priority {p} | {prio.get(p, 0)} |")
for c in ("High", "Medium", "Low"):
    a(f"| Confidence {c} | {conf.get(c, 0)} |")
a(f"| Needing SME confirmation (confidence below High) | {len(needs_sme)} |")
a(f"| Of those, answered since extraction | {sum(1 for r in needs_sme if r.get('answer'))} |")
a(f"| P0 rules below High confidence (blockers for the behavior contract) | {len(p0_blockers)} |")
a(f"| Cards sent to the P0 panel | {len(candidates)} |")
a(f"| Candidate rules rejected by citation referees | {len(rejected)} |")
a("")
a("| ID | Name | Category | Priority | Source | Confidence |")
a("|---|---|---|---|---|---|")
for r in rules:
    cites = [c.strip() for c in r["source"].split(";") if c.strip()]
    more = f" (+{len(cites) - 1} more)" if len(cites) > 1 else ""
    a(f"| [{r['id']}]({anchor(r['id'], r['name'])}) | {cell(r['name'])} | {r['category']} | {r['priority']} | `{cell(cites[0] if cites else r['source'])}`{more} | {r['confidence']} |")
a("")

for cat, items in by_cat.items():
    if not items:
        continue
    a(f"## {cat} rules ({len(items)})")
    a("")
    for r in items:
        a(f"### {r['id']}: {md(r['name'])}")
        a(f"**Category:** {r['category']}{BR}")
        a(f"**Priority:** {r['priority']}{BR}")
        a(f"**Source:** `{r['source']}`{BR}")
        a(f"**Plain English:** {md(r['plainEnglish'])}{BR}")
        a(f"**Specification:**{BR}")
        a(f"  Given {md(r['given'])}{BR}")
        a(f"  When  {md(r['when'])}{BR}")
        a(f"  Then  {md(r['then'])}{BR}")
        if r.get("and"):
            a(f"  And   {md(r['and'])}{BR}")
        a(f"**Parameters:** {md(r.get('parameters') or 'None')}{BR}")
        edges = r.get("edgeCases") or []
        a(f"**Edge cases handled:** {'; '.join(md(e) for e in edges) if edges else 'None recorded'}{BR}")
        if r.get("suspectedDefect"):
            a(f"**Suspected defect:** {md(r['suspectedDefect'])}{BR}")
        ans = r.get("answer")
        if ans:
            text = md(ans["text"])
            if ans.get("unresolved"):
                text += " **Still open for the owner:** " + md(ans["unresolved"])
            a(f"**Answer ({ans['date']}):** {text}{BR}")
        if r["confidence"] == "High":
            why = "citation confirmed by an independent referee"
            if r["priority"] == "P0":
                got = [v for v in (r.get("p0Panel") or {}).values() if v]
                why += ("; both P0 judges (compliance and fidelity lenses) rated it P0 and the specification faithful" if len(got) == 2
                        else "; the only P0 judge that returned a verdict rated it P0 and faithful (the other judge failed)")
            if r.get("mergedSpecs"):
                why += f"; {len(r['mergedSpecs'])} near-duplicate card(s) from other lenses were folded in"
        else:
            why = "SME question: " + md(r.get("smeQuestion") or "not recorded by the extractor; confirm the specification against the cited code")
            if r.get("answer"):
                why += f" Answered on {r['answer']['date']}, above."
        if r.get("confidenceNote"):
            why += " " + md(r["confidenceNote"])
        a(f"**Confidence:** {r['confidence']} — {why}")
        a("")

a("## Rules requiring SME confirmation")
a("")
if needs_sme:
    a("Answer each question on the rule card (or in the brief's open questions). P0 rules block their phase until answered.")
    a("")
    for r in sorted(needs_sme, key=lambda r: (PRIORITY_ORDER.get(r["priority"], 9), r["id"])):
        if r.get("answer"):
            continue  # answered on the card; listed in the answered section below
        q = md(r.get("smeQuestion") or "Confirm the specification against the cited code.")
        if len(q) > 400:
            q = q[:400].rsplit(" ", 1)[0] + " … (full question and evidence on the card)"
        a(f"- [ ] **[{r['id']}]({anchor(r['id'], r['name'])})** ({r['priority']}, {r['confidence']}) {md(r['name'])}: {q}")
else:
    a("None.")
a("")

answered = [r for r in rules if r.get("answer")]
if answered:
    a("## Questions answered since extraction")
    a("")
    a("Each rule below had its specification re-derived from the cited legacy source, and its question answered from that code or from an approved decision in `MODERNIZATION_BRIEF.md` §7. The full answer, and the corrections made to the card, are on the card itself.")
    a("")
    for r in sorted(answered, key=lambda r: r["id"]):
        first = md(r["answer"]["text"]).split(". ")[0]
        a(f"- **[{r['id']}]({anchor(r['id'], r['name'])})** ({r['priority']}, {r['confidence']}) {md(r['name'])}: {first}.")
        for c in r["answer"].get("corrections") or []:
            a(f"  - {md(c)}")
    a("")

a("## Candidate rules rejected by the citation referees")
a("")
if rejected:
    a("Kept for audit. A rejected rule is not behavior to preserve.")
    a("")
    a("| Name | Cited source | Referee verdict |")
    a("|---|---|---|")
    for r in rejected:
        a(f"| {cell(r['name'])} | `{cell(r['source'])}` | {cell(r.get('rejectionReason', ''))} |")
else:
    a("None.")
a("")

a("## Near-duplicate cards folded into another card")
a("")
if folded:
    a("The three extraction lenses often described the same behavior. Each group below was reviewed and merged into one card: sources, edge cases, parameters, suspected defects and SME questions were unioned, and the highest priority and the lowest confidence were kept. The folded card's own outcome is listed here so nothing a lens recorded is lost.")
    a("")
    a("| Folded card | Lens category | Kept as | Folded card's outcome (Then) |")
    a("|---|---|---|---|")
    for r, m in sorted(folded, key=lambda x: (x[0]["id"], x[1]["name"].lower())):
        a(f"| {cell(m['name'])} | {m['category']} | [{r['id']}]({anchor(r['id'], r['name'])}) | {cell(m.get('then'))}{(' And ' + cell(m['and'])) if m.get('and') else ''} |")
else:
    a("None.")
a("")
(out_dir / "BUSINESS_RULES.md").write_text("\n".join(L) + "\n", encoding="utf-8")

# ---- P0_PANEL.md -----------------------------------------------------------------------------
P = []
p = P.append
lens_counts = {lens: collections.Counter() for lens in LENSES}
for c in candidates:
    for lens in LENSES:
        v = c["panel"].get(lens)
        lens_counts[lens]["no verdict" if not v else ("P0 yes" if v["p0Justified"] else "P0 no")] += 1
        if v:
            lens_counts[lens]["faithful yes" if v["faithful"] else "faithful no"] += 1
split = [c for c in candidates if c["panel"].get("compliance") and c["panel"].get("fidelity")
         and not c["panel"]["compliance"]["p0Justified"] and c["panel"]["fidelity"]["p0Justified"]]
p("# P0 PANEL RECORD: `lazylabel`")
p("")
p(f"Every card the extractors rated P0 was judged by two independent agents before it could enter the behavior contract (`legacy/lazylabel` at {note['snapshot']}, {note['date']}). Rule IDs refer to `analysis/lazylabel/BUSINESS_RULES.md`. A card folded into another card is listed under the ID it was folded into.")
p("")
p("- **Compliance lens:** would a regulator, auditor, or finance controller care if this behavior changed silently?")
p("- **Fidelity lens:** re-derive the behavior from the cited code independently. Does the Given/When/Then match what the code does, including rounding, ordering and edge cases?")
p("")
p("Both judges answer two questions: is P0 justified (moves money, enforces a regulatory requirement, or guards data integrity), and is the specification faithful. The workflow keeps a card at P0 only when every returned verdict says P0 is justified. It lowers confidence to Medium when any verdict says the specification is unfaithful.")
p("")
p("| Verdicts | Compliance judge | Fidelity judge |")
p("|---|---|---|")
for k in ("P0 yes", "P0 no", "faithful yes", "faithful no", "no verdict"):
    p(f"| {k} | {lens_counts['compliance'][k]} | {lens_counts['fidelity'][k]} |")
p("")
p(f"**Lens mismatch.** LazyLabel moves no money and carries no regulatory duty, so the compliance question rarely fits it. In {len(split)} of {len(candidates)} cards the compliance judge rated the card not P0 while the fidelity judge rated the same card P0 on data-integrity grounds, and the workflow demoted all of them. Whether annotation-data integrity alone makes a rule P0 is a decision for the approver, recorded as an open question in `MODERNIZATION_BRIEF.md`.")
p("")
p("| Card | Kept as | Compliance judge | Fidelity judge | Workflow outcome | Card now |")
p("|---|---|---|---|---|---|")
for c in candidates:
    f = c["final"]
    p(f"| {cell(c['name'])}{' (folded)' if c['folded'] else ''} | {c['id']} | {verdict_text(c['panel'].get('compliance'))} | {verdict_text(c['panel'].get('fidelity'))} | {panel_outcome(c['panel'])} | {f['priority']}, {f['confidence']} |")
p("")
p("## Judges' reasoning")
p("")
for c in candidates:
    p(f"### {c['id']}: {md(c['name'])}{' (folded card)' if c['folded'] else ''}")
    p("")
    for lens in LENSES:
        v = c["panel"].get(lens)
        p(f"**{lens.capitalize()} judge:** {verdict_text(v)}")
        p("")
        if v:
            p(quote(v["reason"]))
            p("")
(out_dir / "P0_PANEL.md").write_text("\n".join(P) + "\n", encoding="utf-8")

# ---- DATA_OBJECTS.md ---------------------------------------------------------------------------
dtos = list(res.get("dataObjects") or [])
D = []
d = D.append
d("# DATA OBJECTS: `lazylabel`")
d("")
d(f"Core records, entities and file payloads of LazyLabel 2.0.8 (`legacy/lazylabel` at {note['snapshot']}), catalogued on {note['date']} by the modernize-extract-rules workflow. Rule IDs refer to `analysis/lazylabel/BUSINESS_RULES.md`.")
d("")
if not dtos:
    d("No data objects were returned by the catalog agent.")
else:
    d("| Data object | Source | Fields | Rules |")
    d("|---|---|---|---|")
    for o in dtos:
        ids = {name_to_id.get(n) for n in (o.get("consumedBy") or [])} - {None}
        d(f"| [{cell(o['name'])}](#{re.sub(r'[^a-z0-9 -]', '', o['name'].lower()).replace(' ', '-')}) | `{cell(o['source'])}` | {len(o.get('fields') or [])} | {len(ids)} |")
    d("")
    for o in dtos:
        d(f"## {md(o['name'])}")
        d("")
        d(f"**Source:** `{o['source']}`")
        d("")
        extra = {k: v for k, v in o.items() if k not in ("name", "source", "fields", "consumedBy")}
        for k, v in extra.items():
            d(f"**{k}:** {md(v if isinstance(v, str) else json.dumps(v))}")
            d("")
        d("| Field | Type | Note |")
        d("|---|---|---|")
        for fld in o.get("fields") or []:
            d(f"| `{cell(fld['name'])}` | `{cell(fld['type'])}` | {cell(fld.get('note', ''))} |")
        d("")
        consumers = o.get("consumedBy") or []
        if consumers:
            ids, unknown = [], []
            for n in consumers:  # several pre-merge card names can point at one rule
                rid = name_to_id.get(n)
                if rid and rid not in ids:
                    ids.append(rid)
                elif not rid and n not in unknown:
                    unknown.append(n)
            text = "; ".join(f"{rid} ({md(id_to_name[rid])})" for rid in ids)
            if unknown:
                text += (" | Named by the catalog agent but not in the confirmed catalog: "
                         + "; ".join(md(n) for n in unknown))
            d("**Rules that read or produce it:** " + text)
            d("")
(out_dir / "DATA_OBJECTS.md").write_text("\n".join(D) + "\n", encoding="utf-8")

print(f"rules {len(rules)} (from {raw_cards} cards, {len(folded)} folded) | by category {dict(cats)} | by priority {dict(prio)} | by confidence {dict(conf)}")
print(f"needs SME {len(needs_sme)} | P0 below High {len(p0_blockers)} | panel cards {len(candidates)} (compliance-no/fidelity-yes split {len(split)}) | rejected {len(rejected)} | injection flags {len(flags)} | data objects {len(dtos)}")
