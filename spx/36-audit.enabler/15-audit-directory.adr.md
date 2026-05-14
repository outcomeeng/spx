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
      {YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}/
        verdict.audit.xml
        state.json
```

**Branch slug:** The current branch name is encoded into a filesystem-safe slug. The slug is deterministic and contains no path separators. Slugging lowercases the branch name, replaces every run of non-alphanumeric characters with `-`, trims leading and trailing `-`, and adds a deterministic disambiguator: the first eight lowercase hex characters of the SHA-256 digest of the original branch name. When the normalized branch-name prefix is non-empty, the slug appends the SHA-256 prefix with a `-` separator; when the normalized prefix is empty, the slug is the SHA-256 prefix alone with no leading separator. Detached HEAD state uses `detached-{short-sha}` as the original branch identity, where `{short-sha}` is the first twelve lowercase hex characters of the git `HEAD` commit SHA.

**Run directory:** `{YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}` — timestamp format from `spx/36-session.enabler/21-timestamp-format.adr.md` extended with UTC milliseconds, plus a run id of twelve lowercase hex characters generated from random bytes at run start. The timestamp prefix keeps directory names time-sortable; the run id prevents collisions between concurrent audits that start in the same millisecond. Directory creation uses exclusive create semantics and retries with a new run id on collision.

**State file:** `state.json` records the terminal run envelope. Domain-specific auditor output lives in verdict artifacts; `state.json` stays a compact index for status, list, and latest-run lookup. The file is written exactly once after the run reaches a terminal state. In-progress audit runs do not write `state.json`. Runs that reach a terminal state without writing a verdict artifact omit `verdictPath`.

**Incomplete runs:** A run directory without `state.json` is an incomplete run artifact. This can happen when an audit process is killed before it can write terminal state. `spx audit list` and status commands surface such directories as incomplete/interrupted using directory metadata only, never as approved or rejected audit evidence. Latest terminal audit lookup ignores incomplete run directories unless no terminal run exists for that branch.

**Base ref:** `baseRef` records the resolved audit config descriptor's base ref at run start, after descriptor defaults are applied. The audit descriptor default `baseRef` is `main`. A configured `audit.baseRef` value in `spx.config.*` overrides that default; `state.json` records the resolved value so status, list, and latest-run views do not need to re-resolve config.

```ts
interface AuditRunState {
  readonly branchName: string;
  readonly branchSlug: string;
  readonly headSha: string;
  readonly baseRef: string;
  readonly auditConfigDigest: string;
  readonly auditors: readonly string[];
  readonly targets: readonly string[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly verdictPath?: string;
  readonly status: "approved" | "rejected" | "failed" | "interrupted";
}
```

**Audit config digest:** `auditConfigDigest` is the lowercase hex SHA-256 digest of the config-owned canonical descriptor JSON for the resolved audit config descriptor section after defaults are applied. The digest excludes unrelated descriptor sections and raw file formatting.

**Status casing:** `state.json` status values are lowercase machine tokens. CLI display may render verdict tokens in uppercase, including the existing `APPROVED` and `REJECT` output from `spx audit verify <file>`.

**Latest run:** The latest terminal run for a branch is selected from `state.json` timestamps, not from directory-name lexical order. Status and list commands compare `completedAt` first, `startedAt` second, and run directory name third as a deterministic tie-breaker. Incomplete run directories without `state.json` do not satisfy latest terminal lookup when any terminal run exists for the branch.

## Rationale

A flat single directory under `.spx/audit/` would merge verdicts for all branches, requiring filename parsing to locate a branch's history. A nested hierarchy mirroring `spx/` would encode the spec tree path in directory nesting, making directory creation expensive and path manipulation error-prone.

The branch-scoped directory approach keeps audit execution state aligned with the reviewable unit: a branch. All artifacts for one branch are co-located, timestamped run directories preserve history, and future artifact types can be added inside each run without changing the branch boundary.

No status subdirectories are needed: audit runs are write-once artifacts. Unlike sessions, which transition between `todo`, `doing`, and `archive`, an audit run is emitted once and never changes state.

Alternatives rejected:

- **Flat `.spx/audit/`**: All branches share one directory; locating a specific branch's runs requires filtering by filename prefix.
- **Node-first `.spx/nodes/{encoded-node-path}/`**: Organizes existing verdict verification, but it does not isolate local audit execution by branch.
- **`.spx/audit/` with status subdirectories**: Runs have no state transitions; status directories add ceremony with no benefit.

## Trade-offs accepted

| Trade-off                                           | Mitigation / reasoning                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Branch history grows unbounded                      | Future `spx audit prune` command will manage retention, analogous to `spx session prune`                         |
| Branch slug readability is reduced by hash suffixes | The suffix makes collisions practically negligible without requiring lookup and keeps slugging a pure function   |
| Per-node history is nested under branch history     | The branch is the hermetic execution boundary; per-node indexing can be derived from state files inside each run |

## Invariants

- Each branch maps to exactly one directory name under `.spx/audit/` — the slug is a pure function of the branch identity, always includes a deterministic digest suffix, and omits the separator when the normalized prefix is empty
- Detached HEAD state maps to a branch identity of `detached-{short-sha}`, where `{short-sha}` is the first twelve lowercase hex characters of the git `HEAD` commit SHA
- Each `state.json` file contains the complete terminal run envelope required to list, inspect, and identify the latest branch audit without parsing verdict XML
- `state.json` is written exactly once after the run reaches `approved`, `rejected`, `failed`, or `interrupted`
- A run directory without `state.json` is incomplete/interrupted evidence and cannot satisfy an approved or rejected audit status
- `baseRef` is always the resolved audit config descriptor base ref captured at run start; the descriptor default is `main`
- Latest terminal audit lookup orders terminal runs by `state.json` timestamps before using directory names as a tie-breaker
- Audit run directories within a branch directory are never renamed or moved — timestamps and run ids are assigned at write time and are stable
- The `.spx/audit/` root is always resolved relative to the main repository root per `spx/15-worktree-resolution.pdr.md`

## Compliance

### Recognized by

A verdict file at `.spx/audit/work-config-backed-execution-scope/runs/2026-04-25_15-45-00-123-a1b2c3d4e5f6/verdict.audit.xml`.

### MUST

- Encode branch names into filesystem-safe slugs with no path separators ([review])
- Append `-{sha256-prefix}` when the normalized branch-name prefix is non-empty, where `sha256-prefix` is the first eight lowercase hex characters of the SHA-256 digest of the original branch identity ([review])
- Use `sha256-prefix` alone when slug normalization produces an empty branch-name prefix ([review])
- Use `detached-{short-sha}` as the branch identity in detached HEAD state, where `short-sha` is the first twelve lowercase hex characters of the git `HEAD` commit SHA ([review])
- Name run directories `{YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}` using UTC timestamps and a twelve-character lowercase hex run id generated at run start ([review])
- Create run directories with exclusive create semantics and retry with a new run id when a directory already exists ([review])
- Write `state.json` exactly once at terminal run completion with branch name, branch slug, head commit SHA, resolved audit descriptor base ref, audit config digest, auditor identifiers, target paths, run start timestamp, run completion timestamp, optional verdict path, and final status ([review])
- Default the audit descriptor `baseRef` to `main` when `audit.baseRef` is absent from `spx.config.*` ([review])
- Surface run directories missing `state.json` as incomplete/interrupted in list and status output, and exclude them from latest terminal audit lookup when any terminal run exists for the branch ([review])
- Select the latest terminal run by greatest `completedAt`, then greatest `startedAt`, then lexicographically greatest run directory name as a deterministic tie-breaker ([review])
- Store `state.json` statuses as lowercase machine tokens; render CLI verdict strings separately from persisted state casing ([review])
- Compute `auditConfigDigest` from config-owned canonical descriptor JSON for the resolved audit config descriptor section after defaults are applied, excluding unrelated descriptor sections and raw file formatting ([review](../16-config.enabler/21-descriptor-registration.adr.md))
- Resolve `.spx/audit/` relative to the main repository root via `detectMainRepoRoot` per `spx/15-worktree-resolution.pdr.md` ([review](../15-worktree-resolution.pdr.md))
- Derive all path component names (`.spx`, `audit`, `runs`) from the audit config descriptor defaults — single source of truth ([review](../16-config.enabler/21-descriptor-registration.adr.md))
- Keep `spx audit verify <file>` accepting any explicit verdict file path supplied by the caller, including existing `.spx/nodes/` artifacts and new `.spx/audit/` artifacts ([review])

### NEVER

- Create status subdirectories under a branch directory — audit runs have no state transitions ([review])
- Hardcode the strings `"audit"`, `"runs"`, or `".spx"` outside of the audit config descriptor defaults ([review])
- Use `/` in branch slug directory names — breaks filesystem portability ([review])
- Write `state.json` for an in-progress audit run ([review])
- Treat a run directory without `state.json` as approved or rejected audit evidence ([review])
