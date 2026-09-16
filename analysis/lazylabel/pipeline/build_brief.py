"""Fill brief_template.md with generated sections and write analysis/lazylabel/MODERNIZATION_BRIEF.md.

Usage: python build_brief.py <rules_with_ids.json> <out.md> <brief_note.json>
Reads topology.json, phase_sizes.json, c4.mmd and phases.mmd from fixed locations.
brief_note.json carries {"budgetNote": "..."}: facts about this analysis run that no input file records.
"""

import collections
import datetime as dt
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

HERE = Path(__file__).resolve().parent
ANALYSIS = Path(r"E:\GitHub\LazyLabel\analysis\lazylabel")
rules_path, out_path, brief_note_path = sys.argv[1], sys.argv[2], sys.argv[3]
rules = load_json(rules_path)
brief_note = load_json(brief_note_path)
topo = load_json(ANALYSIS / "topology.json")
sizes = load_json(HERE / "phase_sizes.json")
tpl = (HERE / "brief_template.md").read_text(encoding="utf-8")

PHASE_NAMES = {
    "P1": "Annotation format library", "P2": "Architecture and scaffold", "P3": "Inference service",
    "P4": "Workspace shell, dataset browser, persistence", "P5": "Annotation, AI and image tools",
    "P6": "Sequence, multi-view, cutover",
}


def md(s) -> str:
    return re.sub(r"\s*\n\s*", " ", str(s or "")).replace("|", "\\|").replace("<", "\\<").replace(">", "\\>")


# -- inputs with modification times ------------------------------------------------------
inputs = ["ASSESSMENT.md", "ARCHITECTURE.mmd", "topology.json", "call-graph.mmd", "data-lineage.mmd", "critical-path.mmd",
          "BUSINESS_RULES.md", "DATA_OBJECTS.md", "P0_PANEL.md", "PREFLIGHT.md"]
parts = []
for name in inputs:
    p = ANALYSIS / name
    if not p.exists():
        sys.exit(f"required input missing: {p}")
    stamp = dt.datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
    parts.append(f"`{name}` ({stamp})")
inputs_text = "; ".join(parts) + ". `DELTA_CATALOG.md` is not required: this is a cross-stack rebuild, not a same-stack uplift."

# -- size table -----------------------------------------------------------------------------
rows = ["| Phase | Legacy code replaced | Statements | Share | Index share | Size |", "|---|---|---|---|---|---|"]
scope = {"P1": "format exporters, load chain, segment model", "P2": "bootstrap, logging, settings and hotkeys",
         "P3": "SAM models, model manager, embedding cache, archetypes",
         "P4": "window shell (single view), panels, file browsing, save and export, undo",
         "P5": "canvas and drawing tools, AI tool interface, image processing",
         "P6": "sequence mode, propagation, multi-view"}
for p in ("P1", "P2", "P3", "P4", "P5", "P6"):
    s = sizes["phases"][p]
    rows.append(f"| {p} {PHASE_NAMES[p]} | {scope[p]} | {s['statements']:,} | {s['share']}% | {s['index']} | {s['size']} |")
rows.append("")
rows.append("Size bands: S up to 10% of statements, M up to 25%, L up to 40%, XL above 40%.")
size_table = "\n".join(rows)

# -- walkthroughs ---------------------------------------------------------------------------
module_phase = {}
for p, files in sizes["phase_files"].items():
    for f in files:
        module_phase["lazylabel." + f[len("src/"):-3].replace("/", ".").removesuffix(".__init__")] = p
store_phase = {"ds:image_files": "P4", "ds:model_checkpoints": "P3", "ds:sam2_frame_cache": "P3", "ds:settings_json": "P4"}
leaf_names = {leaf["id"]: leaf["name"] for d in topo["root"]["children"] for leaf in d["children"]}
walk = []
for fi, flow in enumerate(topo["flows"]):
    walk.append(f"### {flow['name']}")
    walk.append("")
    walk.append(f"**Persona:** {flow['persona']}. {flow['description']}")
    walk.append("")
    walk.append("| # | What happens | Implemented today by | Data touched | Replaced in |")
    walk.append("|---|---|---|---|---|")
    for si, step in enumerate(flow["steps"], 1):
        code = [n for n in step["nodes"] if n.startswith("lazylabel")]
        data = [n for n in step["nodes"] if n.startswith("ds:")]
        phases = collections.Counter(module_phase[n] for n in code if n in module_phase)
        if "lazylabel.ui.main_window" in code:
            mw_phase = "P6" if fi == 1 else (phases.most_common(1)[0][0] if phases else "P4")
            phases[mw_phase] += 1
        for n in data:
            if n.startswith("ds:sidecar"):
                phases["P1"] += 1
            elif n in store_phase:
                phases[store_phase[n]] += 1
        code_txt = ", ".join(f"`{leaf_names.get(n, n)}`" for n in code)
        data_txt = ", ".join(md(leaf_names.get(n, n)) for n in data) or "none"
        ph = ", ".join(sorted(phases)) or "P4"
        walk.append(f"| {si} | {md(step['label'])} | {code_txt} | {data_txt} | {ph} |")
    walk.append("")
walkthroughs = "\n".join(walk)

# -- behavior contract ----------------------------------------------------------------------
p0 = [r for r in rules if r["priority"] == "P0"]
live_p0 = [r for r in p0 if not r.get("deadCode")]
blockers = [r for r in live_p0 if r["confidence"] != "High"]
by_phase = collections.Counter(p for r in live_p0 for p in r["phases"])
S = []
a = S.append
a(f"`BUSINESS_RULES.md` holds {len(rules)} confirmed rules. **{len(p0)} are P0**, meaning they guard data integrity: what is written to or read from annotation files, and which pixels belong to which class. Together they are the regression suite. **No phase ships until every P0 rule assigned to it passes an equivalence test** (§6).")
a("")
a("P0 rules per phase: " + ", ".join(f"{p} {by_phase.get(p, 0)}" for p in ("P1", "P2", "P3", "P4", "P5", "P6")) + ". A rule citing code in several phases is proven in each.")
a("")
if len(p0) != len(live_p0):
    a(f"{len(p0) - len(live_p0)} P0 rule(s) cite only unreachable code and are excluded from the contract: " + ", ".join(r["id"] for r in p0 if r.get("deadCode")) + ".")
    a("")
a("| ID | Rule | Phases | Confidence |")
a("|---|---|---|---|")
for r in live_p0:
    a(f"| {r['id']} | {md(r['name'])} | {', '.join(r['phases'])} | {r['confidence']}{' (blocker)' if r['confidence'] != 'High' else ''} |")
a("")
if blockers:
    a(f"**Blockers: {len(blockers)} P0 rules are below High confidence.** Each needs an SME answer, recorded in `BUSINESS_RULES.md`, before the phases it belongs to start:")
    a("")
    for r in blockers:
        a(f"- [ ] **{r['id']}** ({', '.join(r['phases'])}) {md(r['name'])}: {md(r.get('smeQuestion') or 'Confirm the specification against the cited code.')}")
else:
    a("No P0 rule is below High confidence, so there are no SME blockers.")
a("")

# Cards the panel demoted because the compliance judge said "not P0" while the fidelity judge said "P0".
def split_panel(panel) -> bool:
    c, f = (panel or {}).get("compliance"), (panel or {}).get("fidelity")
    return bool(c and f and not c["p0Justified"] and f["p0Justified"])


def unjudged(panel) -> bool:
    return panel is not None and not any((panel or {}).values())


awaiting, never_judged = [], []
for r in rules:
    if r["priority"] == "P0" or r.get("deadCode"):
        continue
    panels = [r.get("p0Panel")] + [m.get("p0Panel") for m in r.get("mergedSpecs") or []]
    if any(split_panel(pn) for pn in panels if pn):
        awaiting.append(r)
    elif any(unjudged(pn) for pn in panels if pn):
        never_judged.append(r)
a(f"**Awaiting decision 14: {len(awaiting)} rules the panel split on.** For each, the compliance judge rated it not P0 because nothing here is regulated or financial, and the fidelity judge rated it P0 because it guards annotation data. The workflow demoted them to P1. If decision 14 restores them, they join the table above and gate their phases.")
a("")
a("| ID | Rule | Phases | Confidence |")
a("|---|---|---|---|")
for r in awaiting:
    a(f"| {r['id']} | {md(r['name'])} | {', '.join(r['phases'])} | {r['confidence']} |")
a("")
if never_judged:
    a(f"**{len(never_judged)} P0 candidates never received a verdict** (both judges failed on usage limits) and were demoted to P1 by default: " + ", ".join(r["id"] for r in never_judged) + ". Treat them like the rules above under decision 14.")
    a("")
a("Defects the rewrite must **not** reproduce, even where a rule describes today's behavior: delete-on-empty saves and silent loss on close or multi-view navigation (`ASSESSMENT.md` 5.1), pickled class aliases (5.3), and settings reset on unknown keys (5.8). Each rule card's **Suspected defect** line records the preserve-or-fix question, and decision 7 settles the save semantics.")
p0_section = "\n".join(S)
p0_scope_note = (
    f"The compliance judge rated {len(awaiting)} rules not P0 because LazyLabel moves no money and carries no regulatory duty, "
    "while the fidelity judge rated those same rules P0 because they guard annotation data (`P0_PANEL.md`). The workflow demoted them, so §5 "
    "lists them separately and they gate no phase. Choose (a) restore them all to P0, (b) keep them all at P1, where they are tested but do not gate, "
    "or (c) restore a named subset. *Recommended:* (c), restoring every rule assigned to P1 or P4, because reading and writing users' "
    "existing annotation files is this conversion's core promise."
)

out = (tpl.replace("{{INPUTS}}", inputs_text)
          .replace("{{C4}}", (HERE / "c4.mmd").read_text(encoding="utf-8").rstrip())
          .replace("{{PHASES_MMD}}", (HERE / "phases.mmd").read_text(encoding="utf-8").rstrip())
          .replace("{{SIZE_TABLE}}", size_table)
          .replace("{{WALKTHROUGHS}}", walkthroughs.rstrip())
          .replace("{{P0_SECTION}}", p0_section)
          .replace("{{P0_SCOPE_NOTE}}", p0_scope_note)
          .replace("{{BUDGET_NOTE}}", brief_note["budgetNote"]))
left = re.findall(r"\{\{[A-Z0-9_]+\}\}", out)
if left:
    sys.exit(f"unfilled placeholders: {left}")
Path(out_path).write_text(out, encoding="utf-8")
print(f"brief written: {out_path} | P0 {len(p0)} (live {len(live_p0)}) | blockers {len(blockers)} | per phase {dict(by_phase)}")
