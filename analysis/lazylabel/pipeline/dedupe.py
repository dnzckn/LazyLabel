"""Find near-duplicate rule cards (same file, overlapping lines, similar names) and merge approved clusters.

Usage:
  python dedupe.py propose <result.json> <clusters.json>          # writes candidate clusters for review
  python dedupe.py merge <result.json> <clusters.json> <out.json>  # merges clusters listed with "merge": true
"""

import json
import re
import sys


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def dump_json(obj, path):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=1)

STOP = {"the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "is", "are", "with", "by", "per", "from", "as",
        "at", "its", "their", "when", "into", "be", "not", "no", "only", "all", "each", "one", "two", "uses", "use"}


def citations(src: str):
    out = []
    for part in src.split(";"):
        m = re.search(r"([\w./-]+\.py):(\d+)(?:-(\d+))?", part.strip())
        if m:
            a = int(m.group(2))
            b = int(m.group(3) or a)
            out.append((m.group(1), min(a, b), max(a, b)))
    return out


def tokens(name: str):
    return {t for t in re.findall(r"[a-z0-9]+", name.lower()) if t not in STOP and len(t) > 2}


def overlap(c1, c2) -> float:
    best = 0.0
    for f1, a1, b1 in c1:
        for f2, a2, b2 in c2:
            if f1 != f2:
                continue
            inter = min(b1, b2) - max(a1, a2) + 1
            if inter > 0:
                best = max(best, inter / min(b1 - a1 + 1, b2 - a2 + 1))
    return best


def propose(result_path, clusters_path):
    rules = load_json(result_path)["confirmedRules"]
    n = len(rules)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    cites = [citations(r["source"]) for r in rules]
    toks = [tokens(r["name"] + " " + r.get("plainEnglish", "")) for r in rules]
    for i in range(n):
        for j in range(i + 1, n):
            ov = overlap(cites[i], cites[j])
            if ov < 0.5:
                continue
            jac = len(toks[i] & toks[j]) / max(1, len(toks[i] | toks[j]))
            if jac >= 0.22 and rules[i]["category"] == rules[j]["category"] or jac >= 0.35:
                parent[find(i)] = find(j)
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    clusters = [{"merge": None, "members": [{"index": i, "name": rules[i]["name"], "category": rules[i]["category"],
                                              "priority": rules[i]["priority"], "confidence": rules[i]["confidence"],
                                              "source": rules[i]["source"], "then": rules[i]["then"][:300]} for i in g]}
                for g in groups.values() if len(g) > 1]
    dump_json(clusters, clusters_path)
    print(f"{n} rules; {len(clusters)} candidate clusters covering {sum(len(c['members']) for c in clusters)} rules")


RANGE_RE = re.compile(r"^([\w./-]+\.py):(\d+)(?:-(\d+))?$")


def drop_covered_ranges(cites: list) -> list:
    """Remove a plain path:line-line citation when another citation of the same file already covers it."""
    parsed = []
    for c in cites:
        m = RANGE_RE.match(c)
        parsed.append((m.group(1), int(m.group(2)), int(m.group(3) or m.group(2))) if m else None)
    keep = []
    for i, c in enumerate(cites):
        p = parsed[i]
        if p and any(q and j != i and q[0] == p[0] and q[1] <= p[1] and p[2] <= q[2] and (q[1], q[2]) != (p[1], p[2])
                     for j, q in enumerate(parsed)):
            continue  # a wider citation of the same file already covers this one
        keep.append(c)
    return keep


def drop_contained(values: list, split_parts: bool) -> list:
    """Remove a merged value that another value already states verbatim."""
    if split_parts:  # parameters are semicolon lists: dedupe their individual clauses
        parts = []
        for v in values:
            for piece in v.split(";"):
                piece = piece.strip()
                if piece and piece.lower() not in {p.lower() for p in parts}:
                    parts.append(piece)
        parts = [p for i, p in enumerate(parts)
                 if not any(j != i and p.lower() in q.lower() and len(p) < len(q) for j, q in enumerate(parts))]
        values = ["; ".join(parts)]
    return [v for i, v in enumerate(values)
            if not any(j != i and v.lower() in w.lower() and len(v) < len(w) for j, w in enumerate(values))]


PANEL_POINTER = "Judges' reasoning: analysis/lazylabel/P0_PANEL.md."

def tidy(text):
    """Collapse whitespace and drop a 'Panel:' label whose sentence was removed as answered."""
    if not text:
        return text
    s = re.sub(r"[ 	]+", " ", str(text)).strip()
    s = re.sub(r"Panel:\s*(?=(\||$))", "", s)
    s = re.sub(r"\s*\|\s*(?=\||$)", "", s)
    return s.strip(" |").strip()



def collapse_panel_pointer(question):
    """Merged questions repeat the pointer to the panel record once per folded card; keep one."""
    if not question or question.count(PANEL_POINTER) < 2:
        return question
    parts = []
    for part in question.split(" | "):
        part = part.replace(PANEL_POINTER, "").strip()
        if part and part not in parts:
            parts.append(part)
    return tidy(" | ".join(parts)) + " " + PANEL_POINTER


def merge(result_path, clusters_path, out_path):
    """Merge reviewed clusters. Each cluster lists members by "names" (preferred) or by "members" indices.

    The base card keeps its own Given/When/Then; every folded card's specification is kept in
    base["mergedSpecs"] so nothing a lens recorded is lost (rendered as an audit appendix).
    """
    res = load_json(result_path)
    rules = res["confirmedRules"]
    clusters = load_json(clusters_path)
    by_name = {}
    for i, r in enumerate(rules):
        by_name.setdefault(r["name"], []).append(i)
    rank_p = {"P0": 0, "P1": 1, "P2": 2}
    rank_c = {"High": 0, "Medium": 1, "Low": 2}
    drop = set()
    merged_clusters = 0
    for c in clusters:
        if not c.get("merge"):
            continue
        if "names" in c:
            idx = []
            for n in dict.fromkeys(c["names"]):
                hits = by_name.get(n, [])
                if not hits or len(hits) != c["names"].count(n):
                    sys.exit(f"merge plan lists {n!r} {c['names'].count(n)} time(s) but it matches {len(hits)} rule(s)")
                idx.extend(hits)
        else:
            idx = [m["index"] for m in c["members"]]
        if drop.intersection(idx):
            sys.exit(f"rule merged twice: {[rules[i]['name'] for i in idx if i in drop]}")
        base_i = min(idx, key=lambda i: (rank_p.get(rules[i]["priority"], 9), rank_c.get(rules[i]["confidence"], 9),
                                         -len(rules[i].get("edgeCases") or []), i))
        base = dict(rules[base_i])
        others = [rules[i] for i in idx if i != base_i]
        group = [base] + others
        base["priority"] = min((r["priority"] for r in group), key=lambda p: rank_p.get(p, 9))
        base["confidence"] = max((r["confidence"] for r in group), key=lambda x: rank_c.get(x, 9))
        seen_src = []
        for r in group:
            for part in r["source"].split(";"):
                q = part.strip()
                if q and q not in seen_src:
                    seen_src.append(q)
        base["source"] = "; ".join(drop_covered_ranges(seen_src))
        edges = []
        for r in group:
            for e in r.get("edgeCases") or []:
                if e not in edges:
                    edges.append(e)
        base["edgeCases"] = edges
        for key in ("smeQuestion", "suspectedDefect", "parameters"):
            vals = []
            for r in group:
                v = (r.get(key) or "").strip()
                if v and v not in vals:
                    vals.append(v)
            vals = drop_contained(vals, key == "parameters")
            if vals:
                base[key] = " | ".join(vals) if key != "parameters" else "; ".join(vals)
        base["smeQuestion"] = tidy(collapse_panel_pointer(base.get("smeQuestion")))
        if base["confidence"] != "High" and not base.get("smeQuestion"):
            base["smeQuestion"] = "Merged near-duplicate cards disagreed on confidence; confirm the specification against the cited code."
        base["mergedSpecs"] = [{k: r.get(k) for k in ("name", "category", "priority", "confidence", "source", "plainEnglish",
                                                       "given", "when", "then", "and", "p0Panel")} for r in others]
        rules[base_i] = base
        drop.update(i for i in idx if i != base_i)
        merged_clusters += 1
    res["confirmedRules"] = [r for i, r in enumerate(rules) if i not in drop]
    res.setdefault("stats", {})["mergedClusters"] = merged_clusters
    res["stats"]["droppedAsDuplicates"] = len(drop)
    dump_json(res, out_path)
    print(f"merged {merged_clusters} clusters, folded {len(drop)} duplicate cards; {len(res['confirmedRules'])} rules remain")


if __name__ == "__main__":
    if sys.argv[1] == "propose":
        propose(sys.argv[2], sys.argv[3])
    else:
        merge(sys.argv[2], sys.argv[3], sys.argv[4])
