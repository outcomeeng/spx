#!/usr/bin/env python3
"""Compares run captures with the oracle's expectations (protocol steps 7).

Usage: compare.py <commit> <run directory>
Writes <id>.comparison.md for t0..t5 and prints a failure count per check.
"""
import json
import os
import re
import sys

commit, run = sys.argv[1], sys.argv[2]
sys.argv = ["oracle.py", commit, run]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import oracle  # noqa: E402

IDS = ["t0", "t1", "t2", "t3", "t4", "t5"]
CTX_SOURCES = {"t0": ["t1"], "t1": ["t1"], "t2": ["t2"], "t3": ["t3"], "t4": ["t4"], "t5": ["t2", "t3", "t4"]}


def load(name):
    with open(os.path.join(run, name), encoding="utf-8") as f:
        return json.load(f)


def show_mode(e):
    if e["type"] == "reference":
        return "reference"
    for mode in ("full", "digest"):
        if e.get("content") == oracle.content_for(e["path"], mode):
            return mode
    return "unmatched"


def parse_text_show(text):
    frames = []
    pos = 0
    pat = re.compile(r'<spx-document path="([^"]*)">\n|<spx-reference path="([^"]*)" />')
    while pos < len(text):
        m = pat.match(text, pos)
        if not m:
            raise ValueError(f"unframed text at offset {pos}: {text[pos:pos+60]!r}")
        if m.group(2) is not None:
            frames.append({"type": "reference", "path": m.group(2)})
            pos = m.end()
        else:
            end = text.index("\n</spx-document>", m.end() - 1) if False else None
            close = text.find("</spx-document>", m.end())
            body = text[m.end():close]
            frames.append({"type": "document", "path": m.group(1), "raw": body})
            pos = close + len("</spx-document>")
        if pos < len(text):
            if text.startswith("\n\n", pos):
                pos += 2
            elif text.startswith("\n", pos) and pos + 1 == len(text):
                pos += 1
            else:
                raise ValueError(f"missing blank line at offset {pos}")
    return frames


def split_text_body(raw):
    meta = {}
    if raw.startswith("---\n"):
        end = raw.index("\n---\n", 3) + 5
        for ln in raw[4:end - 5].splitlines():
            k, _, v = ln.partition(": ")
            meta[k] = v
        raw = raw[end:]
    return meta, raw


def fmt(v):
    return json.dumps(v, ensure_ascii=False)[:90]


def parse_list_text(text):
    lines = text.splitlines()
    out = []
    for ln in lines:
        m = re.match(r"^(full|digest|reference) (\S+)(?: \(cited by (.*)\))?$", ln)
        if m:
            out.append({"mode": m.group(1), "path": m.group(2), "cited": m.group(3).split(", ") if m.group(3) else None, "sels": []})
            continue
        m = re.match(r"^  (\S+) (\S+)$", ln)
        if m and out:
            out[-1]["sels"].append({"reason": m.group(1), "target": m.group(2)})
    return out


def contextualize_record(ids):
    rec = {}
    for i in ids:
        with open(os.path.join(run, f"{i}.contextualize.txt"), encoding="utf-8") as f:
            for ln in f:
                m = re.match(r"^(\S+) (read|listed)$", ln.rstrip("\n"))
                if m:
                    prev = rec.get(m.group(1))
                    rec[m.group(1)] = "read" if "read" in (prev, m.group(2)) else "listed"
    return rec


totals = {}
for tid in IDS:
    exp = load(f"{tid}.expected.json")
    out = [f"# {tid} comparison", ""]
    fails = {"show": 0, "list": 0, "text-json": 0, "contextualize": 0}

    # show against the expectation
    sj = load(f"{tid}.show.json")["entries"]
    out += ["## show against the expectation", "", "| pos | expected path | actual path | expected mode | actual mode | result |", "| --- | --- | --- | --- | --- | --- |"]
    for i in range(max(len(exp), len(sj))):
        e = exp[i] if i < len(exp) else None
        a = sj[i] if i < len(sj) else None
        problems = []
        if e is None or a is None:
            problems.append("missing entry")
        else:
            am = show_mode(a)
            if e["path"] != a["path"]:
                problems.append("path")
            if e["mode"] != am:
                problems.append("mode")
            if e["mode"] != "reference" and a["type"] == "document":
                if (a.get("metadata") or {}) != e["metadata"]:
                    problems.append("metadata")
                if a.get("content") != e["content"]:
                    problems.append("content")
            if (e["mode"] == "reference") != (a["type"] == "reference"):
                problems.append("type")
        if problems:
            fails["show"] += 1
        out.append(f"| {i} | {e['path'] if e else '-'} | {a['path'] if a else '-'} | {e['mode'] if e else '-'} | {show_mode(a) if a else '-'} | {'FAIL ' + ','.join(problems) if problems else 'ok'} |")
    out.append("")

    # list against the expectation
    if tid == "t0":
        out += ["## list against the expectation", "", "Inapplicable: `list` requires one or more targets.", ""]
    else:
        lj = load(f"{tid}.list.json")["entries"]
        out += ["## list against the expectation", "", "| pos | expected path | actual path | mode | selections | citedBy | result |", "| --- | --- | --- | --- | --- | --- | --- |"]
        for i in range(max(len(exp), len(lj))):
            e = exp[i] if i < len(exp) else None
            a = lj[i] if i < len(lj) else None
            problems = []
            if e is None or a is None:
                problems.append("missing entry")
            else:
                if e["path"] != a["path"]:
                    problems.append("path")
                if e["mode"] != a["mode"]:
                    problems.append("mode")
                if e["selections"] != a["selections"]:
                    problems.append("selections")
                if e.get("citedBy") != a.get("citedBy"):
                    problems.append("citedBy")
            if problems:
                fails["list"] += 1
            out.append(f"| {i} | {e['path'] if e else '-'} | {a['path'] if a else '-'} | {a['mode'] if a else '-'} | {len(a['selections']) if a else '-'} | {'present' if a and 'citedBy' in a else '-'} | {'FAIL ' + ','.join(problems) if problems else 'ok'} |")
        out.append("")

    # text against JSON
    out += ["## Text against JSON", ""]
    text = open(os.path.join(run, f"{tid}.show.txt"), encoding="utf-8").read()
    frames = []
    for j in sj:
        if j["type"] == "reference":
            frames.append(f'<spx-reference path="{j["path"]}" />')
            continue
        meta = j.get("metadata") or {}
        head = "---\n" + "".join(f"{k}: {v}\n" for k, v in meta.items()) + "---\n" if meta else ""
        c = j["content"]
        frames.append(f'<spx-document path="{j["path"]}">\n{head}{c}{"" if c.endswith(chr(10)) else chr(10)}</spx-document>')
    rebuilt = "\n\n".join(frames)
    rows = []
    if text.rstrip("\n") != rebuilt.rstrip("\n"):
        k = next((i for i, (x, y) in enumerate(zip(text, rebuilt)) if x != y), min(len(text), len(rebuilt)))
        cum, bad = 0, None
        for j, fr in zip(sj, frames):
            if cum + len(fr) >= k:
                bad = j["path"]
                break
            cum += len(fr) + 2
        rows.append(f"show text differs from the framed JSON entries near {bad} (offset {k})")
    tf = frames
    if tid != "t0":
        lt = parse_list_text(open(os.path.join(run, f"{tid}.list.txt"), encoding="utf-8").read())
        lj = load(f"{tid}.list.json")["entries"]
        exp_by_path = {e["path"]: e for e in exp}
        if len(lt) != len(lj):
            rows.append(f"list entry count {len(lt)} differs from JSON entries {len(lj)}")
        for t, j in zip(lt, lj):
            if t["path"] != j["path"] or t["mode"] != j["mode"] or t["sels"] != [{"reason": s["reason"], "target": s["target"]} for s in j["selections"]]:
                rows.append(f"list differs at {j['path']}")
            want = exp_by_path.get(j["path"], {}).get("citedBy")
            if t["cited"] != want:
                rows.append(f"list citedBy text differs at {j['path']}")
    fails["text-json"] = len(rows)
    out += (["Every difference is a fidelity failure."] + [f"- FAIL {r}" for r in rows]) if rows else [f"No differences: {len(tf)} show frames" + ("" if tid == "t0" else f" and {len(lt)} list entries") + " carry the JSON entries' paths, metadata, content bytes, modes, reasons, targets, and cited-by text."]
    out.append("")

    # /contextualize against the read set
    rec = contextualize_record(CTX_SOURCES[tid])
    read_set = {e["path"]: e["mode"] for e in exp}
    out += ["## /contextualize against the read set", "", "Differences are recorded as plugins defects for outcomeeng/changes#297 and decide nothing about `show` or `list`.", "", "| path | read set | /contextualize | departure |", "| --- | --- | --- | --- |"]
    paths = sorted(set(read_set) | {p for p in rec if p.startswith("spx/") and re.search(r"\.(md|json)$", p) and "/tests/" not in p}, key=lambda p: (oracle.POS.get(p, 10**9), p))
    dep = 0
    for p in paths:
        rs = read_set.get(p)
        c = rec.get(p, "absent")
        if rs in ("full", "digest"):
            ok = c == "read"
        elif rs == "reference":
            ok = c in ("listed", "read")
        else:
            ok = c == "absent"
        if not ok:
            dep += 1
        out.append(f"| {p} | {rs or 'outside'} | {c} | {'yes' if not ok else 'no'} |")
    fails["contextualize"] = dep
    out.append("")
    harness = [p for p in ("CLAUDE.md", "AGENTS.md", "spx/local/merging.md", "spx/local/coordination.md", "spx/local/typescript.md", "spx/local/typescript-tests.md", "spx/PLAN.md") if p in rec]
    out += ["Harness guides, `spx/local/` overlays, and `PLAN.md` sit outside `show` and `list`; the rows record the boundary and decide nothing: " + (", ".join(f"{p} ({rec[p]})" for p in harness) or "none recorded") + ".", ""]
    body = "\n".join(out)
    body = re.sub(r"(?<!\]\()(?<![\w/.-])(spx/[^\s|)\]`]+\.(?:adr|pdr)\.md)", lambda m: f"[{m.group(1)}]({m.group(1)})", body)
    with open(os.path.join(run, f"{tid}.comparison.md"), "w", encoding="utf-8") as f:
        f.write(body)
    totals[tid] = fails
print(json.dumps(totals, indent=1))
