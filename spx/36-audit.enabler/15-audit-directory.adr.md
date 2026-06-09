# Audit Branch Directory Structure

Audit verdicts and run state are stored under `.spx/audit/{branch-slug}/runs/{run-dir}/`, a branch-scoped layout in which every run for a branch is co-located under its slug. Each run directory is created with exclusive semantics and is write-once: an audit run is emitted once and never changes state. On reaching a terminal state, the run writes a single `state.json` envelope alongside its verdict artifact.

```text
.spx/audit/
  {branch-slug}/
    runs/
      {YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}/
        verdict.audit.xml
        state.json
```

## Rationale

The branch-scoped layout keeps audit execution state aligned with the reviewable unit — a branch — so all of one branch's artifacts are co-located, timestamped run directories preserve history, and new artifact types fit inside a run without moving the branch boundary. Runs are write-once because, unlike sessions (which move through `todo` → `doing` → `archive`), an audit run is emitted once and never transitions, so no status subdirectories are needed. The slug is a pure, hashed function of the branch identity so it stays collision-safe and portable without a lookup, surviving truncation of long names and detached-HEAD state. Run directories carry a UTC timestamp prefix for time-sortable history and a random run id so concurrent audits starting in the same millisecond cannot collide, and exclusive-create semantics make the run directory the single-owner mutual-exclusion boundary. Writing `state.json` exactly once, atomically, at terminal state keeps a run's record either absent (in-progress or killed) or complete — never half-written — which is what lets list and status views treat a missing or unparseable file as incomplete evidence rather than a verdict, and reserves `status: "interrupted"` for the graceful terminal case that did reach a write.

Rejected: a flat `.spx/audit/` (all branches share one directory, so locating a branch's runs requires filename-prefix filtering); a node-first `.spx/nodes/{encoded-node-path}/` layout (organizes explicit-file verification but does not isolate local audit execution by branch); and `.spx/audit/` with status subdirectories (runs have no state transitions, so status directories add ceremony with no benefit).

## Invariants

- Each branch maps to exactly one directory name under `.spx/audit/` — the slug is a pure function of the branch identity, stays within the 120-byte component limit, always includes a deterministic digest suffix, and omits the separator when the normalized prefix is empty.
- Detached HEAD state maps to a branch identity of `detached-{short-sha}`, where `{short-sha}` is the first twelve lowercase hex characters of the `HEAD` commit SHA.
- The terminal run envelope is `AuditRunState`, and each `state.json` contains it complete — enough to list, inspect, and identify the latest branch audit without parsing verdict XML:

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

- `state.json` is written exactly once after the run reaches `approved`, `rejected`, `failed`, or `interrupted`.
- A run directory without a readable, parse-valid `state.json` is incomplete/interrupted evidence and cannot satisfy an approved or rejected audit status.
- `status: "interrupted"` is graceful terminal state; a missing, unreadable, partial, or parse-invalid `state.json` is non-terminal incomplete evidence.
- `baseRef` is always the resolved audit config descriptor base ref captured at run start; the descriptor default is `main`.
- `auditConfigDigest` is the lowercase hex SHA-256 of the config-owned canonical descriptor JSON for the resolved audit config descriptor section after defaults are applied, excluding unrelated sections and raw formatting.
- `state.json` status values are lowercase machine tokens rendered to CLI display through a fixed mapping that preserves the established `spx audit verify` output: `approved` → `APPROVED`, `rejected` → `REJECT`, `failed` → `FAILED`, `interrupted` → `INTERRUPTED`.
- Latest terminal audit lookup orders terminal runs by `state.json` timestamps (`completedAt`, then `startedAt`) before using directory names as a tie-breaker.
- Audit run directories within a branch directory are never renamed or moved — timestamps and run ids are assigned at write time and are stable.
- Node-first `.spx/nodes/` verdict artifacts remain verifiable as explicit `spx audit verify <file>` arguments but are not indexed by branch-scoped list/status views; branch-scoped runs write only under `.spx/audit/{branch-slug}/runs/`.
- The `.spx/audit/` root is always resolved relative to the Git common-dir product root per `spx/15-worktree-management.pdr.md`.

## Verification

### Audit

- ALWAYS: construct the branch slug by lowercasing the branch name, replacing each run of non-alphanumeric characters with `-`, trimming leading and trailing `-`, and truncating the normalized prefix as needed before appending the disambiguator ([audit])
- ALWAYS: encode branch names into filesystem-safe slugs with no path separators ([audit])
- ALWAYS: append `-{sha256-prefix}` when the normalized branch-name prefix is non-empty, where `sha256-prefix` is the first eight lowercase hex characters of the SHA-256 digest of the original branch identity ([audit])
- ALWAYS: use `sha256-prefix` alone when slug normalization produces an empty branch-name prefix ([audit])
- ALWAYS: use `detached-{short-sha}` as the branch identity in detached HEAD state, where `short-sha` is the first twelve lowercase hex characters of the `HEAD` commit SHA ([audit])
- ALWAYS: keep branch slugs at or below 120 UTF-8 bytes, preserving the full `-{sha256-prefix}` suffix whenever the normalized branch-name prefix must be truncated ([audit])
- ALWAYS: name run directories `{YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}` using UTC timestamps and a twelve-character lowercase hex run id from `node:crypto` `randomBytes` at run start; never use `Math.random` for run ids ([audit])
- ALWAYS: create run directories with exclusive-create semantics and retry with a new run id on `EEXIST` up to ten attempts; fail the run before auditors start on non-collision creation errors or exhausted retries ([audit])
- ALWAYS: write `state.json` exactly once at terminal run completion with branch name, branch slug, head commit SHA, resolved audit descriptor base ref, audit config digest, auditor identifiers, target paths, run start timestamp, run completion timestamp, optional verdict path, and final status ([audit])
- ALWAYS: write terminal `state.json` through a temporary file in the same run directory followed by an atomic same-directory rename to the final path; the run directory owner is the only process allowed to create that state file ([audit])
- ALWAYS: default the audit descriptor `baseRef` to `main` when `audit.baseRef` is absent from `spx.config.*` ([audit])
- ALWAYS: surface run directories with missing, unreadable, partial, or parse-invalid `state.json` as incomplete/interrupted in list and status output, and exclude them from latest terminal audit lookup when any terminal run exists for the branch ([audit])
- ALWAYS: select the latest terminal run by greatest `completedAt`, then greatest `startedAt`, then lexicographically greatest run directory name as a deterministic tie-breaker ([audit])
- ALWAYS: store `state.json` statuses as lowercase machine tokens and render CLI status strings through the explicit persisted-status-to-display mapping ([audit])
- ALWAYS: compute `auditConfigDigest` from config-owned canonical descriptor JSON for the resolved audit config descriptor section after defaults are applied, excluding unrelated descriptor sections and raw file formatting, per `spx/16-config.enabler/21-descriptor-registration.adr.md` ([audit])
- ALWAYS: resolve `.spx/audit/` relative to the Git common-dir product root per `spx/15-worktree-management.pdr.md` ([audit])
- ALWAYS: derive all path-component names (`.spx`, `audit`, `runs`) from the audit config descriptor defaults — single source of truth, per `spx/16-config.enabler/21-descriptor-registration.adr.md` ([audit])
- ALWAYS: keep `spx audit verify <file>` accepting any explicit verdict file path supplied by the caller, including node-first `.spx/nodes/` and branch-scoped `.spx/audit/` artifacts ([audit])
- NEVER: index, list, or migrate `.spx/nodes/` artifacts into branch-scoped audit status — node-first artifacts are explicit-file verification inputs only ([audit])
- NEVER: create status subdirectories under a branch directory — audit runs have no state transitions ([audit])
- NEVER: hardcode the strings `"audit"`, `"runs"`, or `".spx"` outside the audit config descriptor defaults ([audit])
- NEVER: use `/` in branch slug directory names — it breaks filesystem portability ([audit])
- NEVER: write `state.json` for an in-progress audit run ([audit])
- NEVER: treat a run directory without `state.json` as approved or rejected audit evidence ([audit])
