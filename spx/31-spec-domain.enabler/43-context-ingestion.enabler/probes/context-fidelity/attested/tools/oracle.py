#!/usr/bin/env python3
"""Computes the context-fidelity expectations for targets T0..T5 from the tracked tree at one commit.

Usage: oracle.py <commit> <output-directory>

The script reads only `git ls-tree` and `git show` output at <commit>. It never runs `spx`.
"""

import json
import re
import subprocess
import sys
from fractions import Fraction

COMMIT = sys.argv[1]
OUT = sys.argv[2]
ROOT = "spx"
PRODUCT_SPEC = "spx/spx.product.md"

T2 = "spx/31-spec-domain.enabler/43-context-ingestion.enabler/43-target-resolution.enabler"
T3 = "spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler"
T4 = "spx/18-state.enabler/32-worktree-topology.enabler"
TARGETS = {
    "t0": None,
    "t1": ["spx"],
    "t2": [T2],
    "t3": [T3],
    "t4": [T4],
    "t5": [T2, T3, T4],
}

KINDS = "enabler|outcome|substrate|capability|domain|interface|surface|variant|product"
NODE_RE = re.compile(r"^(\d+(?:\.\d+)?)-(.+)\.(" + KINDS + r")$")
DEC_RE = re.compile(r"^(\d+(?:\.\d+)?)-(.+)\.(adr|pdr)\.md$")
OPENING = {
    "enabler": "PROVIDES",
    "outcome": "WE BELIEVE THAT",
    "substrate": "SUPPLIES",
    "capability": "PROVIDES",
    "domain": "OWNS",
    "interface": "ADAPTS",
    "surface": "EXPOSES",
}
PRECEDENCE = [
    "target",
    "product",
    "ancestor",
    "sibling",
    "immediate-child",
    "outcome-record",
    "knowledge-index",
    "cited-decision",
    "issue",
]
RANK = {"full": 3, "digest": 2, "reference": 1}
REASON_MODE = {
    "target": "full",
    "product": "full",
    "ancestor": "full",
    "sibling": "digest",
    "immediate-child": "digest",
    "outcome-record": "full",
    "knowledge-index": "reference",
    "cited-decision": "full",
    "issue": "reference",
}

raw = subprocess.run(
    ["git", "ls-tree", "-r", "-z", "--name-only", COMMIT, ROOT],
    capture_output=True,
    check=True,
).stdout.decode("utf-8")
FILES = set(p for p in raw.split("\0") if p)
NAMES = {}
for p in FILES:
    parts = p.split("/")
    for i in range(1, len(parts)):
        NAMES.setdefault("/".join(parts[:i]), set()).add(parts[i])

_src = {}


def source(path):
    if path not in _src:
        data = subprocess.run(
            ["git", "show", f"{COMMIT}:{path}"], capture_output=True, check=True
        ).stdout
        _src[path] = data.decode("utf-8")
    return _src[path]


def node_spec(d):
    m = NODE_RE.match(d.rsplit("/", 1)[1])
    slug = m.group(2)
    for cand in (f"{d}/{slug}.spec.md", f"{d}/{slug}.md"):
        if cand in FILES:
            return cand
    return None


def child_nodes(d):
    out = []
    for n in NAMES.get(d, ()):
        m = NODE_RE.match(n)
        if m and f"{d}/{n}" in NAMES and node_spec(f"{d}/{n}"):
            out.append((Fraction(m.group(1)), n))
    return sorted(out)


def decisions(d):
    out = []
    for n in NAMES.get(d, ()):
        m = DEC_RE.match(n)
        if m and f"{d}/{n}" in FILES:
            out.append((Fraction(m.group(1)), n))
    return sorted(out)


def own_spec(d):
    return PRODUCT_SPEC if d == ROOT else node_spec(d)


def issues(d):
    p = f"{d}/ISSUES.md"
    return p if p in FILES else None


def knowledge(d):
    p = f"{d}/knowledge/index.md"
    return p if p in FILES else None


def outcome_record(d):
    if d == ROOT:
        return None
    slug = NODE_RE.match(d.rsplit("/", 1)[1]).group(2)
    p = f"{d}/{slug}.outcome.md"
    return p if p in FILES else None


def is_doc(p):
    return not (p.endswith("/ISSUES.md") or p.endswith("/knowledge/index.md"))


def walk_order():
    order = []

    def walk(d):
        for p in (own_spec(d), issues(d), outcome_record(d), knowledge(d)):
            if p:
                order.append(p)
        merged = [(i, n, "dec") for i, n in decisions(d)] + [
            (i, n, "node") for i, n in child_nodes(d)
        ]
        for i, n, k in sorted(merged, key=lambda x: (x[0], x[1])):
            if k == "dec":
                order.append(f"{d}/{n}")
            else:
                walk(f"{d}/{n}")

    walk(ROOT)
    return order


ORDER = walk_order()
POS = {p: i for i, p in enumerate(ORDER)}

LINK_RE = re.compile(
    r"\[(?:[^\]\\]|\\.)*\]\(\s*<?([^)\s>]+)>?(?:\s+(?:\"[^\"]*\"|'[^']*'))?\s*\)"
)
FENCE_FLAGS = []


def citations(path):
    text = source(path)
    found = []
    fence = False
    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            fence = not fence
        for h in LINK_RE.findall(line):
            if re.match(r"^spx/.+\.(adr|pdr)\.md$", h) and ".." not in h.split("/"):
                if fence:
                    FENCE_FLAGS.append((path, h))
                if h not in found:
                    found.append(h)
    return found


def split_front_matter(text):
    lines = text.splitlines(keepends=True)
    if lines and lines[0].rstrip("\r\n") == "---":
        for i in range(1, len(lines)):
            if lines[i].rstrip("\r\n") == "---":
                return "".join(lines[1:i]), "".join(lines[i + 1 :])
        raise SystemExit("unterminated front matter")
    return None, text


def metadata_for(path):
    if not is_doc(path) or path == PRODUCT_SPEC or DEC_RE.match(path.rsplit("/", 1)[1]):
        return {}
    fm, _ = split_front_matter(source(path))
    if fm:
        m = re.search(r"^malleability:\s*(\S+)\s*$", fm, re.M)
        if m:
            return {"malleability": m.group(1)}
    return {}


def paragraph(lines, start):
    out = []
    for ln in lines[start:]:
        if ln.strip() == "":
            break
        out.append(ln)
    return "".join(out)


NONPROSE = []


def digest_for(path):
    _, body = split_front_matter(source(path))
    lines = body.splitlines(keepends=True)
    name = path.rsplit("/", 1)[1]
    if DEC_RE.match(name):
        title = next(i for i, ln in enumerate(lines) if ln.startswith("# "))
        j = title + 1
        while lines[j].strip() == "" or re.match(r"^#{1,6} ", lines[j]):
            j += 1
        if re.match(r"^(#|\||>|[-*] |\d+\. |```)", lines[j]):
            NONPROSE.append((path, lines[j].rstrip()))
        return paragraph(lines, j)
    kind = NODE_RE.match(path.rsplit("/", 2)[1]).group(3)
    kw = OPENING[kind] + " "
    for i, ln in enumerate(lines):
        if ln.startswith(kw) and (i == 0 or lines[i - 1].strip() == ""):
            return paragraph(lines, i)
    raise SystemExit(f"no opening for {path}")


def content_for(path, mode):
    if mode == "reference":
        return None
    if mode == "full":
        return split_front_matter(source(path))[1]
    return digest_for(path)


def structural_targeted(target):
    """path -> list of reasons for one explicit target."""
    sel = {}

    def add(p, reason):
        if p:
            sel.setdefault(p, []).append(reason)

    segs = target.split("/")
    chain = [ROOT]
    for i in range(2, len(segs) + 1):
        chain.append("/".join(segs[:i]))
    k = len(chain) - 1
    root_target = k == 0
    add(PRODUCT_SPEC, "target" if root_target else "product")
    for i, d in enumerate(chain):
        add(issues(d), "issue")
        if i >= 1:
            add(node_spec(d), "target" if i == k else "ancestor")
            parent = chain[i - 1]
            for _, n in child_nodes(parent):
                if f"{parent}/{n}" != d:
                    add(node_spec(f"{parent}/{n}"), "sibling")
        if i == k:
            for _, n in decisions(d):
                add(f"{d}/{n}", "target")
            for _, n in child_nodes(d):
                add(node_spec(f"{d}/{n}"), "immediate-child")
            add(outcome_record(d), "outcome-record")
            add(knowledge(d), "knowledge-index")
        else:
            nxt = NODE_RE.match(chain[i + 1].rsplit("/", 1)[1])
            limit = Fraction(nxt.group(1))
            for idx, n in decisions(d):
                if idx < limit:
                    add(f"{d}/{n}", "product" if i == 0 else "ancestor")
    return sel


def pick(reasons):
    reason = min(reasons, key=PRECEDENCE.index)
    mode = max((REASON_MODE[r] for r in reasons), key=RANK.get)
    return reason, mode


ERRORS = []


def select(target):
    struct = structural_targeted(target)
    docs = [p for p in struct if is_doc(p)]
    seen = set(docs)
    queue = list(docs)
    cited_only = []
    while queue:
        d = queue.pop(0)
        for h in citations(d):
            if h not in FILES:
                ERRORS.append((h, d))
                continue
            if h not in seen:
                seen.add(h)
                cited_only.append(h)
                queue.append(h)
    result = {}
    for p, reasons in struct.items():
        result[p] = pick(reasons)
    for p in cited_only:
        result[p] = ("cited-decision", "full")
    return result


def targetless():
    result = {}
    result[PRODUCT_SPEC] = ("product", "full")
    p = issues(ROOT)
    if p:
        result[p] = ("issue", "reference")
    for _, n in decisions(ROOT):
        result[f"{ROOT}/{n}"] = ("product", "digest")
    for _, n1 in child_nodes(ROOT):
        d1 = f"{ROOT}/{n1}"
        result[node_spec(d1)] = ("sibling", "digest")
        if issues(d1):
            result[issues(d1)] = ("issue", "reference")
        for _, n in decisions(d1):
            result[f"{d1}/{n}"] = ("product", "digest")
        for _, n2 in child_nodes(d1):
            d2 = f"{d1}/{n2}"
            result[node_spec(d2)] = ("sibling", "digest")
            if issues(d2):
                result[issues(d2)] = ("issue", "reference")
            for _, n in decisions(d2):
                result[f"{d2}/{n}"] = ("product", "digest")
    return result


def canonical(t):
    return "spx/" if t == "spx" else t


def position(p, union_struct_paths):
    return (0, POS[p]) if p in union_struct_paths else (1, p)


def build(tid):
    targets = TARGETS[tid]
    if targets is None:
        sel = targetless()
        paths = sorted(sel, key=lambda p: POS[p])
        out = []
        for p in paths:
            reason, mode = sel[p]
            e = {"path": p, "mode": mode}
            if mode != "reference":
                e["metadata"] = metadata_for(p)
                e["content"] = content_for(p, mode)
            out.append(e)
        return out
    per = {t: select(t) for t in targets}
    struct_union = set()
    for t in targets:
        for p, reasons in structural_targeted(t).items():
            struct_union.add(p)
    all_paths = set()
    for t in targets:
        all_paths |= set(per[t])
    ordered = sorted(all_paths, key=lambda p: position(p, struct_union))
    sel_docs = [p for p in ordered if is_doc(p)]
    out = []
    for p in ordered:
        mode = max((per[t][p][1] for t in targets if p in per[t]), key=RANK.get)
        selections = []
        for t in sorted(targets, key=canonical):
            if p in per[t]:
                selections.append({"target": canonical(t), "reason": per[t][p][0]})
        e = {"path": p, "mode": mode, "selections": selections}
        if any(s["reason"] == "cited-decision" for s in selections):
            e["citedBy"] = [d for d in sel_docs if p in citations(d)]
        if mode != "reference":
            e["metadata"] = metadata_for(p)
            e["content"] = content_for(p, mode)
        out.append(e)
    return out


def main():
    summary = {}
    for tid in TARGETS:
        entries = build(tid)
        with open(f"{OUT}/{tid}.expected.json", "w", encoding="utf-8") as f:
            json.dump(entries, f, indent=2, ensure_ascii=False)
            f.write("\n")
        summary[tid] = len(entries)
    print(json.dumps(summary))
    if ERRORS:
        print("UNRESOLVED CITATIONS:", ERRORS)
    if FENCE_FLAGS:
        print("CITATIONS INSIDE FENCES:", sorted(set(FENCE_FLAGS)))
    if NONPROSE:
        print("NON-PROSE DECISION STATEMENTS:", NONPROSE)


if __name__ == "__main__":
    main()
