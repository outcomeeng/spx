# Audit Branch Run Files

Audit run state is stored under `.spx/branch/{branch-slug}/audit/runs/run-{run-token}.jsonl`, a branch-scoped layout in which every run for a branch is co-located under the state-store branch scope. Each run file is created with exclusive semantics and is write-once: an audit run is emitted once and never changes state. On reaching a terminal state, the run writes one JSONL record holding the terminal audit envelope.

```text
.spx/branch/
  {branch-slug}/
    audit/
      runs/
        run-{YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}.jsonl
```

## Rationale

The branch-scoped layout keeps audit execution state aligned with the reviewable unit, so all of one branch's artifacts are co-located and timestamped run files preserve history. Runs are write-once because, unlike sessions (which move through `todo` → `doing` → `archive`), an audit run is emitted once and never transitions, so no status subdirectories are needed. The slug is a pure, hashed function of the branch identity from `spx/34-state-store.enabler/`, so it stays collision-safe and portable without a lookup, surviving truncation of long names and detached-HEAD state. Run tokens carry a UTC timestamp prefix for time-sortable history and a random run id so concurrent audits starting in the same millisecond cannot collide, and exclusive-create semantics make the run file the single-owner boundary. Writing the JSONL record exactly once at terminal state keeps a run's record either absent or complete, which lets list and status views treat a missing, unreadable, or unparseable file as incomplete evidence rather than a verdict.

Rejected: a flat `.spx/audit/` (all branches share one directory, so locating a branch's runs requires filename-prefix filtering); a node-first `.spx/nodes/{encoded-node-path}/` layout (organizes explicit-file verification but does not isolate local audit execution by branch); and `.spx/branch/{branch-slug}/audit/` with status subdirectories (runs have no state transitions, so status directories add ceremony with no benefit).

## Invariants

- Each branch maps to exactly one directory name under `.spx/branch/` — the slug is a pure function of the state-store branch identity, stays within the 120-byte component limit, always includes a deterministic digest suffix, and omits the separator when the normalized prefix is empty.
- Detached HEAD state maps to a branch identity of `detached-{short-sha}`, where `{short-sha}` is the first twelve lowercase hex characters of the `HEAD` commit SHA.
- The terminal run envelope is `AuditRunState`, and each terminal JSONL record contains it complete — enough to list, inspect, and identify the latest branch audit without parsing verdict XML:

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

- `run-{run-token}.jsonl` is written exactly once after the run reaches `approved`, `rejected`, `failed`, or `interrupted`.
- A run file without a readable, parse-valid JSONL terminal record is incomplete/interrupted evidence and cannot satisfy an approved or rejected audit status.
- `status: "interrupted"` is graceful terminal state; a missing, unreadable, partial, or parse-invalid JSONL record is non-terminal incomplete evidence.
- `baseRef` is always the resolved audit config descriptor base ref captured at run start; the descriptor default is `main`.
- `auditConfigDigest` is the lowercase hex SHA-256 of the config-owned canonical descriptor JSON for the resolved audit config descriptor section after defaults are applied, excluding unrelated sections and raw formatting.
- `AuditRunState.status` values are lowercase machine tokens rendered to CLI display through a fixed mapping that preserves the established `spx audit verify` output: `approved` → `APPROVED`, `rejected` → `REJECT`, `failed` → `FAILED`, `interrupted` → `INTERRUPTED`.
- Latest terminal audit lookup orders terminal runs by JSONL record timestamps (`completedAt`, then `startedAt`) before using run file names as a tie-breaker.
- Audit run files within a branch directory are never renamed or moved — timestamps and run ids are assigned at write time and are stable.
- Node-first `.spx/nodes/` verdict artifacts remain verifiable as explicit `spx audit verify <file>` arguments but are not indexed by branch-scoped list/status views; branch-scoped runs write only under `.spx/branch/{branch-slug}/audit/runs/`.
- The `.spx/branch/` root is always resolved relative to the Git common-dir product root per `spx/15-worktree-management.pdr.md`.

## Verification

### Audit

- ALWAYS: construct branch slugs through `spx/34-state-store.enabler/` branch identity semantics ([audit])
- ALWAYS: name run files `run-{YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}.jsonl` using UTC timestamps and a twelve-character lowercase hex run id from `node:crypto` `randomBytes` at run start; never use `Math.random` for run ids ([audit])
- ALWAYS: create run files with exclusive-create semantics and retry with a new run id on `EEXIST` up to ten attempts; fail the run before auditors start on non-collision creation errors or exhausted retries ([audit])
- ALWAYS: write the JSONL terminal record exactly once at terminal run completion with branch name, branch slug, head commit SHA, resolved audit descriptor base ref, audit config digest, auditor identifiers, target paths, run start timestamp, run completion timestamp, optional verdict path, and final status ([audit])
- ALWAYS: default the audit descriptor `baseRef` to `main` when `audit.baseRef` is absent from `spx.config.*` ([audit])
- ALWAYS: surface missing, unreadable, partial, or parse-invalid JSONL records as incomplete/interrupted in list and status output, and exclude them from latest terminal audit lookup when any terminal run exists for the branch ([audit])
- ALWAYS: select the latest terminal run by greatest `completedAt`, then greatest `startedAt`, then lexicographically greatest run file name as a deterministic tie-breaker ([audit])
- ALWAYS: store terminal JSONL status values as lowercase machine tokens and render CLI status strings through the explicit persisted-status-to-display mapping ([audit])
- ALWAYS: compute `auditConfigDigest` from config-owned canonical descriptor JSON for the resolved audit config descriptor section after defaults are applied, excluding unrelated descriptor sections and raw file formatting, per `spx/16-config.enabler/21-descriptor-registration.adr.md` ([audit])
- ALWAYS: resolve `.spx/branch/{branch-slug}/audit/` relative to the Git common-dir product root per `spx/15-worktree-management.pdr.md` ([audit])
- ALWAYS: derive shared path-component names (`.spx`, `branch`, `worktree`, `audit`, `runs`, `run-`, `.jsonl`) from state-store defaults ([audit])
- ALWAYS: keep `spx audit verify <file>` accepting any explicit verdict file path supplied by the caller, including node-first `.spx/nodes/` and branch-scoped `.spx/branch/{branch-slug}/audit/` artifacts ([audit])
- NEVER: index, list, or migrate `.spx/nodes/` artifacts into branch-scoped audit status — node-first artifacts are explicit-file verification inputs only ([audit])
- NEVER: create status subdirectories under a branch directory — audit runs have no state transitions ([audit])
- NEVER: hardcode the strings `"branch"`, `"audit"`, `"runs"`, `"run-"`, `".jsonl"`, or `".spx"` outside source-owned defaults ([audit])
- NEVER: use `/` in branch slug directory names — it breaks filesystem portability ([audit])
- NEVER: write a terminal JSONL record for an in-progress audit run ([audit])
- NEVER: treat a missing or invalid run record as approved or rejected audit evidence ([audit])
