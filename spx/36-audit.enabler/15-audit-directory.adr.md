# Audit Branch Directory Structure

## Purpose

This decision governs how audit verdict files and audit run state are named and organized on disk under `.spx/audit/{branch-slug}`.

## Context

**Business impact:** Agents and CI pipelines need to locate the most recent audit evidence for a branch without sharing mutable state with the invoking agent or another branch. Multiple audits of the same branch must coexist so history is preserved.

**Technical constraints:** `.spx/` is gitignored and resolves to the main repository root per `spx/15-worktree-resolution.pdr.md`. The layout must accommodate future audit artifact types without restructuring and must keep branch state separated.

## Decision

Audit verdicts are stored under `.spx/audit/{branch-slug}/` using a branch-scoped layout:

```
.spx/audit/
  {branch-slug}/
    runs/
      {YYYY-MM-DD_HH-mm-ss}/
        verdict.audit.xml
        state.json
```

**Branch slug:** The current branch name is encoded into a filesystem-safe slug. The slug is deterministic and contains no path separators. Slugging lowercases the branch name, replaces every run of non-alphanumeric characters with `-`, trims leading and trailing `-`, and appends a deterministic disambiguator when two branch names normalize to the same slug. The disambiguator is the first eight lowercase hex characters of the SHA-256 digest of the original branch name, appended with a `-` separator.

**Run directory:** `{YYYY-MM-DD_HH-mm-ss}` — timestamp format from `spx/36-session.enabler/21-timestamp-format.adr.md`, using UTC components so run directories sort consistently.

**State file:** `state.json` records the run envelope: branch name, branch slug, head commit SHA, base ref, audit config digest, auditor identifiers, target paths, run start timestamp, run completion timestamp, verdict path, and final status. Domain-specific auditor output lives in verdict artifacts; `state.json` stays a compact index for status, list, and latest-run lookup.

**Latest run:** The lexicographically last run directory inside `.spx/audit/{branch-slug}/runs/` is the most recent audit for that branch.

## Rationale

A flat single directory under `.spx/audit/` would merge verdicts for all branches, requiring filename parsing to locate a branch's history. A nested hierarchy mirroring `spx/` would encode the spec tree path in directory nesting, making directory creation expensive and path manipulation error-prone.

The branch-scoped directory approach keeps audit execution state aligned with the reviewable unit: a branch. All artifacts for one branch are co-located, timestamped run directories preserve history, and future artifact types can be added inside each run without changing the branch boundary.

No status subdirectories are needed: audit runs are write-once artifacts. Unlike sessions, which transition between `todo`, `doing`, and `archive`, an audit run is emitted once and never changes state.

Alternatives rejected:

- **Flat `.spx/audit/`**: All branches share one directory; locating a specific branch's runs requires filtering by filename prefix.
- **Node-first `.spx/nodes/{encoded-node-path}/`**: Organizes existing verdict verification, but it does not isolate local audit execution by branch.
- **`.spx/audit/` with status subdirectories**: Runs have no state transitions; status directories add ceremony with no benefit.

## Trade-offs accepted

| Trade-off                                       | Mitigation / reasoning                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Branch history grows unbounded                  | Future `spx audit prune` command will manage retention, analogous to `spx session prune`                         |
| Branch slugs can collide after sanitization     | The slugger appends the first eight lowercase hex characters of the SHA-256 digest of the original branch name   |
| Per-node history is nested under branch history | The branch is the hermetic execution boundary; per-node indexing can be derived from state files inside each run |

## Invariants

- Each branch maps to exactly one directory name under `.spx/audit/` — the slug is a pure function of the branch identity plus any required deterministic disambiguator
- Each `state.json` file contains the complete run envelope required to list, inspect, and identify the latest branch audit without parsing verdict XML
- Audit run directories within a branch directory are never renamed or moved — timestamps are assigned at write time and are stable
- The `.spx/audit/` root is always resolved relative to the main repository root per `spx/15-worktree-resolution.pdr.md`

## Compliance

### Recognized by

A verdict file at `.spx/audit/work-config-backed-execution-scope/runs/2026-04-25_15-45-00/verdict.audit.xml`.

### MUST

- Encode branch names into filesystem-safe slugs with no path separators ([review])
- Append `-{sha256-prefix}` when branch-name normalization collides, where `sha256-prefix` is the first eight lowercase hex characters of the SHA-256 digest of the original branch name ([review])
- Name run directories `{YYYY-MM-DD_HH-mm-ss}` using UTC timestamps ([review])
- Write `state.json` with branch name, branch slug, head commit SHA, base ref, audit config digest, auditor identifiers, target paths, run start timestamp, run completion timestamp, verdict path, and final status ([review])
- Resolve `.spx/audit/` relative to the main repository root via `detectMainRepoRoot` per `spx/15-worktree-resolution.pdr.md` ([review](../15-worktree-resolution.pdr.md))
- Derive all path component names (`.spx`, `audit`, `runs`) from the audit config descriptor defaults — single source of truth ([review](../16-config.enabler/21-descriptor-registration.adr.md))

### NEVER

- Create status subdirectories under a branch directory — audit runs have no state transitions ([review])
- Hardcode the strings `"audit"`, `"runs"`, or `".spx"` outside of the audit config descriptor defaults ([review])
- Use `/` in branch slug directory names — breaks filesystem portability ([review])
