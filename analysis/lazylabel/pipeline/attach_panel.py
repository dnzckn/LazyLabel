"""Attach each P0 judge verdict from the workflow journal to its rule as rule["p0Panel"].

Usage: python attach_panel.py <result.json> <journal.jsonl> <out.json>

Judges are matched to rules by the rule name and citation quoted in the judge prompt. A rule that went to
the panel gets p0Panel = {"compliance": verdict|None, "fidelity": verdict|None}; None means that judge never
returned a verdict (it died on a session limit in every attempt).
"""

import json
import os
import re
import sys


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def dump_json(obj, path):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=1)

result_path, journal_path, out_path = sys.argv[1:4]
res = load_json(result_path)
jdir = os.path.dirname(journal_path)
with open(journal_path, encoding="utf-8") as fh:
    events = [json.loads(line) for line in fh if line.strip()]

prompt_of, results = {}, {}
for e in events:
    if e["type"] == "started" and e["label"].startswith("p0:"):
        path = os.path.join(jdir, f"agent-{e['agentId']}.jsonl")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                prompt_of[e["key"]] = json.loads(fh.readline())["message"]["content"]
    elif e["type"] == "result":
        results[e["key"]] = e["result"]

panel = {}
for key, prompt in prompt_of.items():
    lens = "compliance" if "COMPLIANCE lens" in prompt else "fidelity"
    name = re.search(r"\nRule: (.*)\n", prompt).group(1).strip()
    source = re.search(r"Citation \(untrusted[^\n]*<<<UNTRUSTED\n(.*?)\nUNTRUSTED>>>", prompt, re.S).group(1).strip()
    slot = panel.setdefault((name, source), {"compliance": None, "fidelity": None})
    if key in results:
        slot[lens] = results[key]

matched = 0
for r in res["confirmedRules"]:
    rec = panel.get((r["name"], r["source"].strip()))
    if rec is not None:
        r["p0Panel"] = rec
        matched += 1
judged = [r for r in res["confirmedRules"] if "p0Panel" in r]
both = sum(1 for r in judged if r["p0Panel"]["compliance"] and r["p0Panel"]["fidelity"])
one = sum(1 for r in judged if bool(r["p0Panel"]["compliance"]) != bool(r["p0Panel"]["fidelity"]))
none = sum(1 for r in judged if not r["p0Panel"]["compliance"] and not r["p0Panel"]["fidelity"])
print(f"panel candidates matched {matched} | both verdicts {both} | one verdict {one} | no verdict {none} | unmatched judge prompts {len(panel) - matched}")
dump_json(res, out_path)

# ---- concise panel questions ---------------------------------------------------------------
# The workflow writes the judges' full reasoning (often several thousand characters) into smeQuestion.
# Replace that with a short, decidable question; the full reasoning is rendered in P0_PANEL.md.
SPLIT = "P0 panel split on whether this moves money / is regulatory ("
DOUBT = "P0 panel doubts spec fidelity: "


def concise(rule):
    panel = rule["p0Panel"]
    got = {lens: v for lens, v in panel.items() if v}
    if not got:
        return "The P0 panel returned no verdicts (both judges failed on session limits). Confirm whether this rule is P0 and whether the specification is faithful."
    missing = [lens for lens in ("compliance", "fidelity") if lens not in got]
    not_p0 = [lens for lens, v in got.items() if not v["p0Justified"]]
    unfaithful = [lens for lens, v in got.items() if not v["faithful"]]
    parts = []
    if not_p0:
        others = [lens for lens in got if lens not in not_p0]
        parts.append(f"The {' and '.join(not_p0)} judge{'s' if len(not_p0) > 1 else ''} rated this not P0"
                     + (f" while the {others[0]} judge rated it P0" if others else "")
                     + ". Decide whether it guards annotation data integrity and belongs in the behavior contract.")
    if unfaithful:
        parts.append(f"The {' and '.join(unfaithful)} judge{'s' if len(unfaithful) > 1 else ''} found the specification unfaithful to the code. Correct the card from the judge's findings before writing its equivalence test.")
    if missing:
        parts.append(f"The {missing[0]} judge returned no verdict.")
    if not parts:
        return None
    return " ".join(parts) + " Judges' reasoning: analysis/lazylabel/P0_PANEL.md."


rewritten = 0
for r in res["confirmedRules"]:
    if "p0Panel" not in r:
        continue
    q = r.get("smeQuestion") or ""
    panel_text = concise(r)
    needs_note = (r["priority"] != "P0" or r["confidence"] != "High")
    if q.startswith(SPLIT) or q.startswith(DOUBT):
        r["smeQuestion"] = panel_text or q
        rewritten += 1
    elif needs_note and panel_text and "P0_PANEL.md" not in q:
        r["smeQuestion"] = (q + " " if q else "") + "Panel: " + panel_text
        rewritten += 1
print(f"panel questions rewritten or annotated: {rewritten}")
dump_json(res, out_path)
