# Audit Branch Directory Structure

## Purpose

This decision governs how audit verdict files and audit run state are named and organized on disk under `.spx/audit/{branch-slug}`.

## Context

**Business impact:** Agents and CI pipelines need to locate the most recent audit evidence for a branch without sharing mutable state with the invoking agent or another branch. Multiple audits of the same branch must coexist so history is preserved.

**Technical constraints:** `.spx/` is gitignored and resolves to the Git common-dir product root per `spx/15-worktree-resolution.pdr.md`. The layout accommodates additional audit artifact types without restructuring and keeps branch state separated.

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

**Branch slug:** The current branch name is encoded into a filesystem-safe slug. The slug is deterministic, contains no path separators, and is at most 120 UTF-8 bytes. Slugging lowercases the branch name, replaces every run of non-alphanumeric characters with `-`, trims leading and trailing `-`, truncates the normalized prefix when required so the final slug stays within the byte limit, and adds a deterministic disambiguator: the first eight lowercase hex characters of the SHA-256 digest of the original branch name. When the normalized branch-name prefix is non-empty, the slug appends the SHA-256 prefix with a `-` separator; when the normalized prefix is empty, the slug is the SHA-256 prefix alone with no leading separator. Detached HEAD state uses `detached-{short-sha}` as the original branch identity, where `{short-sha}` is the first twelve lowercase hex characters of the git `HEAD` commit SHA.

**Run directory:** `{YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}` — timestamp format from `spx/36-session.enabler/21-timestamp-format.adr.md` extended with UTC milliseconds, plus a run id of twelve lowercase hex characters generated from `node:crypto` `randomBytes` at run start. The timestamp prefix keeps directory names time-sortable; the run id prevents collisions between concurrent audits that start in the same millisecond. Directory creation uses exclusive create semantics and retries with a new run id on `EEXIST` collisions, up to ten attempts. Any non-collision creation error, or ten exhausted collision attempts, fails the audit run before auditors start. `Math.random` is not used for run ids.

**State file:** `state.json` records the terminal run envelope. Domain-specific auditor output lives in verdict artifacts; `state.json` stays a compact index for status, list, and latest-run lookup. The file is written exactly once after the run reaches a terminal state. In-progress audit runs do not write `state.json`. Runs that reach a terminal state without writing a verdict artifact omit `verdictPath`. Terminal state writes use a temporary file in the same run directory followed by an atomic same-directory rename to `state.json`; missing, unreadable, partial, or parse-invalid state files are incomplete/interrupted evidence and cannot satisfy latest terminal lookup. The run directory is the mutual-exclusion boundary: exactly one audit process owns a successfully exclusive-created run directory, and no other process writes `state.json` inside that directory.

**Incomplete runs:** A run directory without `state.json` is an incomplete run artifact. This can happen when an audit process is killed before it can write terminal state. `spx audit list` and status commands surface such directories as incomplete/interrupted using directory metadata only, never as approved or rejected audit evidence. Latest terminal audit lookup ignores incomplete run directories unless no terminal run exists for that branch.

**Interrupted runs:** `status: "interrupted"` in `state.json` means the audit reached a terminal control point after graceful cancellation and wrote terminal state. A missing, unreadable, partial, or parse-invalid `state.json` means the process did not reach a terminal state write. Both surface as incomplete/interrupted to operators, but only the parse-valid `status: "interrupted"` file is terminal run state.

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

**Status casing:** `state.json` status values are lowercase machine tokens. CLI display renders status values through an explicit mapping:

| `state.json` status | CLI display string |
| ------------------- | ------------------ |
| `approved`          | `APPROVED`         |
| `rejected`          | `REJECT`           |
| `failed`            | `FAILED`           |
| `interrupted`       | `INTERRUPTED`      |

The mapping preserves the established `APPROVED` and `REJECT` output from `spx audit verify <file>`.

**Node-first verdict artifacts:** `.spx/nodes/` verdict artifacts remain verifiable when supplied as explicit `spx audit verify <file>` arguments, but branch-scoped audit list/status views do not index or display node-first artifacts. No automated relocation is provided; branch-scoped audit runs write only to `.spx/audit/{branch-slug}/runs/`.

**Latest run:** The latest terminal run for a branch is selected from `state.json` timestamps, not from directory-name lexical order. Status and list commands compare `completedAt` first, `startedAt` second, and run directory name third as a deterministic tie-breaker. Incomplete run directories without `state.json` do not satisfy latest terminal lookup when any terminal run exists for the branch.

## Rationale

A flat single directory under `.spx/audit/` would merge verdicts for all branches, requiring filename parsing to locate a branch's history. A nested hierarchy mirroring `spx/` would encode the spec tree path in directory nesting, making directory creation expensive and path manipulation error-prone.

The branch-scoped directory approach keeps audit execution state aligned with the reviewable unit: a branch. All artifacts for one branch are co-located, timestamped run directories preserve history, and additional artifact types fit inside each run without changing the branch boundary.

No status subdirectories are needed: audit runs are write-once artifacts. Unlike sessions, which transition between `todo`, `doing`, and `archive`, an audit run is emitted once and never changes state.

Alternatives rejected:

- **Flat `.spx/audit/`**: All branches share one directory; locating a specific branch's runs requires filtering by filename prefix.
- **Node-first `.spx/nodes/{encoded-node-path}/`**: Organizes explicit-file verdict verification, but it does not isolate local audit execution by branch.
- **`.spx/audit/` with status subdirectories**: Runs have no state transitions; status directories add ceremony with no benefit.

## Trade-offs accepted

| Trade-off                                           | Mitigation / reasoning                                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Branch history grows unbounded                      | Future `spx audit prune` command will manage retention, analogous to `spx session prune`                               |
| Branch slug readability is reduced by hash suffixes | The suffix makes collisions practically negligible without requiring lookup and keeps slugging a pure function         |
| Long branch names lose tail text in the directory   | The SHA-256 suffix is retained after truncation, so identity remains deterministic while path components stay portable |
| Per-node history is nested under branch history     | The branch is the hermetic execution boundary; per-node indexing can be derived from state files inside each run       |

## Invariants

- Each branch maps to exactly one directory name under `.spx/audit/` — the slug is a pure function of the branch identity, stays within the 120-byte component limit, always includes a deterministic digest suffix, and omits the separator when the normalized prefix is empty
- Detached HEAD state maps to a branch identity of `detached-{short-sha}`, where `{short-sha}` is the first twelve lowercase hex characters of the git `HEAD` commit SHA
- Each `state.json` file contains the complete terminal run envelope required to list, inspect, and identify the latest branch audit without parsing verdict XML
- `state.json` is written exactly once after the run reaches `approved`, `rejected`, `failed`, or `interrupted`
- A run directory without a readable, parse-valid `state.json` is incomplete/interrupted evidence and cannot satisfy an approved or rejected audit status
- `status: "interrupted"` is graceful terminal state; missing, unreadable, partial, or parse-invalid `state.json` is non-terminal incomplete evidence
- `baseRef` is always the resolved audit config descriptor base ref captured at run start; the descriptor default is `main`
- Latest terminal audit lookup orders terminal runs by `state.json` timestamps before using directory names as a tie-breaker
- Audit run directories within a branch directory are never renamed or moved — timestamps and run ids are assigned at write time and are stable
- The `.spx/audit/` root is always resolved relative to the Git common-dir product root per `spx/15-worktree-resolution.pdr.md`

## Compliance

### Recognized by

A verdict file at `.spx/audit/work-config-backed-execution-scope/runs/2026-04-25_15-45-00-123-a1b2c3d4e5f6/verdict.audit.xml`.

### MUST

- Encode branch names into filesystem-safe slugs with no path separators ([review])
- Append `-{sha256-prefix}` when the normalized branch-name prefix is non-empty, where `sha256-prefix` is the first eight lowercase hex characters of the SHA-256 digest of the original branch identity ([review])
- Use `sha256-prefix` alone when slug normalization produces an empty branch-name prefix ([review])
- Use `detached-{short-sha}` as the branch identity in detached HEAD state, where `short-sha` is the first twelve lowercase hex characters of the git `HEAD` commit SHA ([review])
- Name run directories `{YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}` using UTC timestamps and a twelve-character lowercase hex run id generated from `node:crypto` `randomBytes` at run start; never use `Math.random` for run ids ([review])
- Create run directories with exclusive create semantics and retry with a new run id on `EEXIST` collisions up to ten attempts; fail the run before auditors start on non-collision creation errors or exhausted retries ([review])
- Write `state.json` exactly once at terminal run completion with branch name, branch slug, head commit SHA, resolved audit descriptor base ref, audit config digest, auditor identifiers, target paths, run start timestamp, run completion timestamp, optional verdict path, and final status ([review])
- Write terminal `state.json` through a temporary file in the same run directory followed by an atomic same-directory rename to the final path; the run directory owner is the only process allowed to create that state file ([review])
- Keep branch slugs at or below 120 UTF-8 bytes, preserving the full `-{sha256-prefix}` suffix whenever the normalized branch-name prefix must be truncated ([review])
- Default the audit descriptor `baseRef` to `main` when `audit.baseRef` is absent from `spx.config.*` ([review])
- Surface run directories with missing, unreadable, partial, or parse-invalid `state.json` as incomplete/interrupted in list and status output, and exclude them from latest terminal audit lookup when any terminal run exists for the branch ([review])
- Select the latest terminal run by greatest `completedAt`, then greatest `startedAt`, then lexicographically greatest run directory name as a deterministic tie-breaker ([review])
- Store `state.json` statuses as lowercase machine tokens; render CLI status strings through the explicit persisted-status-to-display mapping ([review])
- Compute `auditConfigDigest` from config-owned canonical descriptor JSON for the resolved audit config descriptor section after defaults are applied, excluding unrelated descriptor sections and raw file formatting ([review](../16-config.enabler/21-descriptor-registration.adr.md))
- Resolve `.spx/audit/` relative to the Git common-dir product root per `spx/15-worktree-resolution.pdr.md` ([review](../15-worktree-resolution.pdr.md))
- Derive all path component names (`.spx`, `audit`, `runs`) from the audit config descriptor defaults — single source of truth ([review](../16-config.enabler/21-descriptor-registration.adr.md))
- Keep `spx audit verify <file>` accepting any explicit verdict file path supplied by the caller, including node-first `.spx/nodes/` artifacts and branch-scoped `.spx/audit/` artifacts ([review])
- Do not index, list, or migrate `.spx/nodes/` artifacts into branch-scoped audit status; node-first artifacts are explicit-file verification inputs only ([review])

### NEVER

- Create status subdirectories under a branch directory — audit runs have no state transitions ([review])
- Hardcode the strings `"audit"`, `"runs"`, or `".spx"` outside of the audit config descriptor defaults ([review])
- Use `/` in branch slug directory names — breaks filesystem portability ([review])
- Write `state.json` for an in-progress audit run ([review])
- Treat a run directory without `state.json` as approved or rejected audit evidence ([review])
