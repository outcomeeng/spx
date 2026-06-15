# Audit Branch Run Journals

An audit run is one append-only event journal stored under `.spx/branch/{branch-slug}/audit/runs/run-{run-token}.jsonl` at the Git common-dir product root, bound to the appendable journal store of `spx/18-state.enabler/71-appendable-journal-store.enabler/` over that run file path. The run's events are the sole source of truth; the `AuditRunState` envelope and every list, status, and latest-run view are projections folded from the event history, and the run seals at terminal state. Branch slugging, run-file naming, and the store and seal-marker mechanics are owned by `spx/18-state.enabler`; audit owns the run's event vocabulary and the projection fold.

## Rationale

Binding each run to the journal contract of `spx/15-agent-run-journal.enabler/21-event-sourced-journal.adr.md` makes audit one consumer of the same append/read/render/seal contract every agentic verdict-mode run uses, so a run persists once as facts and renders identically into CLI status, reports, and CI check summaries whichever backend the run uses. Folding the `AuditRunState` envelope as a projection rather than writing a bespoke terminal record keeps the run's source of truth a pure event history: incremental facts — auditor started, finding reported, run completed — accumulate as events, and the envelope re-renders from them on demand. Branch-scoping aligns a run's journal with the reviewable unit and timestamped run tokens preserve history; resolving the run path and slug through the state module keeps audit free of git topology and `.spx/` layout.

Rejected: a write-once terminal JSONL record (a single bespoke record carries no incremental history, so list, status, and CI projections have nothing to replay and an interrupted run leaves no partial trail); a flat `.spx/audit/` (all branches share one directory, so locating a branch's runs requires filename-prefix filtering); a node-first `.spx/nodes/{encoded-node-path}/` verdict-artifact layout (organizes explicit-file verification of externally-produced verdicts, which the domain does not perform); and status subdirectories under a branch directory (a run's lifecycle is its sealed event history, not a directory transition).

## Invariants

- A run file is the JSONL event history of exactly one journal stream; its seal-marker path is `{run-file-path}.sealed`.
- The `AuditRunState` envelope is a pure projection of a run's event prefix: the same events always fold to the same envelope.
- `AuditRunState` carries the run's branch name, branch slug, head commit SHA, resolved base ref, audit config digest, auditor identifiers, target paths, start and completion timestamps, an optional output path, and a terminal status of `approved`, `rejected`, `failed`, or `interrupted`.
- A run is terminal evidence only when its journal is sealed; an unsealed run — or a sealed run whose history holds no readable terminal-completion event — is incomplete evidence and folds to no approved or rejected status.
- The branch slug is a pure function of the state-store branch identity within the state module's default byte bound; detached HEAD maps to a branch identity of `detached-{short-sha}`, the first twelve lowercase hex characters of the `HEAD` commit SHA.
- `baseRef` defaults to the audit descriptor's `main` when `audit.baseRef` is absent.
- `AuditRunState.status` values are lowercase machine tokens rendered to CLI display through a fixed mapping: `approved` → `APPROVED`, `rejected` → `REJECT`, `failed` → `FAILED`, `interrupted` → `INTERRUPTED`.
- Latest terminal audit lookup orders runs by greatest completion timestamp, then greatest start timestamp, then lexicographically greatest run-file name.
- The `.spx/branch/` root resolves relative to the Git common-dir product root per `spx/15-worktree-management.pdr.md`.

## Verification

### Audit

- ALWAYS: bind each audit run to the appendable journal store of `spx/18-state.enabler/71-appendable-journal-store.enabler/` over the run file path, and treat the event history as the run's source of truth per `spx/15-agent-run-journal.enabler/21-event-sourced-journal.adr.md` ([audit])
- ALWAYS: render the `AuditRunState` envelope and every list, status, and latest-run view as a projection folded from a run's event history, never from a bespoke terminal record ([audit])
- ALWAYS: seal a run's journal at terminal completion and read seal state from the store's seal marker ([audit])
- ALWAYS: construct branch slugs and run-file names through `spx/18-state.enabler/32-scope-addressing.enabler/` semantics, using the state module's default slug byte bound rather than audit configuration ([audit])
- ALWAYS: resolve `.spx/branch/{branch-slug}/audit/` relative to the Git common-dir product root per `spx/15-worktree-management.pdr.md` ([audit])
- ALWAYS: render persisted lowercase status tokens to CLI display through the fixed `approved` → `APPROVED`, `rejected` → `REJECT`, `failed` → `FAILED`, `interrupted` → `INTERRUPTED` mapping ([audit])
- ALWAYS: gate terminal evidence on the seal marker read from the store — surface an unsealed run, or a sealed run whose history holds no readable terminal-completion event, as incomplete, and exclude it from latest terminal audit lookup when a terminal run exists for the branch ([audit])
- ALWAYS: derive shared path-component names (`.spx`, `branch`, `audit`, `runs`, `run-`, `.jsonl`) from state-store defaults ([audit])
- NEVER: persist audit run state as a write-once terminal JSONL record outside the event-journal contract ([audit])
- NEVER: create, index, or read node-first `.spx/nodes/` verdict artifacts — audit persists only branch-scoped run journals ([audit])
- NEVER: create status subdirectories under a branch directory — a run's lifecycle is its sealed event history ([audit])
- NEVER: hardcode the strings `.spx`, `branch`, `audit`, `runs`, `run-`, or `.jsonl` outside source-owned state-store defaults ([audit])
