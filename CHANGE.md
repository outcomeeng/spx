---
title: Cross-worktree Change and baton lifecycle
repository: "@outcomeeng/spx"
status: pending
maturity: proposed
tier: prototype
change_id: pending
branches: []
agent_session_ids: []
---

## Intent

Provide a **Change** artifact that preserves operator-approved intent from the initial prompt through production, together with one **baton** that records availability, current ownership, handoff, and revival.

The product model is backend-neutral. The **host-local prototype** stores a Change and its baton in cross-worktree state on one host to prove the lifecycle and atomic ownership transitions. Production continuity requires a remotely reachable **durable backend**. This boundary lets products remove every `PLAN.md` file and instruction-bearing session file without treating the gitignored prototype as durable across machines. It also makes all five **verification types** discoverable for a Change at an exact Git commit hash.

## Operator-visible Change

The Change is a backend-agnostic artifact that comprises machine-readable metadata and human-readable content because the operator reads, refines, and signs it. Its human-readable content defines the desired change in a format that meets the declared maturity level's definition of ready. Its machine-readable metadata includes its current maturity, the targeted tier (prototype, experimental, production), and its branch lineage.

Every Change has one stable **product identity** that survives status transitions, path changes, worktree changes, machine changes, and backend migration. A **backend-qualified locator** and a **human-facing handle** may change without changing that identity. Filesystem paths, branch names, issue numbers, agent session identifiers, and transcript identifiers are references to a Change rather than its identity.

Any durable Change backend must provide the following information per Change:

- all checkpointed versions;
- operator sign-off;
- if closed, which Changes it was carried-forward by;
- commit-aligned history of agent session claims;
- timestamps for:
  - integration and production completion;
  - archival.

Archived Changes retain their complete lineage. A `carried-forward` event links continued intent to the state from which it came, allowing reconstruction from the initial prompt through production or abandonment.

The exact Markdown schema and the boundary between operator-authored and machine-maintained sections remain refinement work. The shared fields and lifecycle semantics follow the backend-neutral [*Change model*](spx/25-outcomeeng.enabler/31-changes.enabler/changes.md); adapters map those semantics to their own storage and transaction primitives.

## Host-local file prototype

The first implementation is a file adapter that stores Change artifacts in the Git common-dir product root defined by [*worktree management*](spx/15-worktree-management.pdr.md), using the same location model as the existing [*session artifact*](spx/36-session.enabler/session.md).

This adapter is shared by every worktree on one host. It is gitignored, has no historical event store, and provides no cross-machine continuity. Its purpose is to prove Change lifecycle semantics, baton schema, atomic acquisition, atomic revival, and migration from current session state.

Every active Change has one cross-worktree directory keyed by its universally unique identifier (UUID) in the `.spx/` directory of the Git worktree pool:

```text
.spx/changes/doing/{change-uuid}/
|-- CHANGE.md
|-- handoff/
|   `-- baton.json
`-- current/
```

Completed Changes move with their full contents and lineage to:

```text
.spx/changes/archive/{change-uuid}/
```

The store uses the same repository-level, cross-worktree location principle as the existing session store. Every worktree on the same host reads one shared Change. Remote machines obtain durable Change state from the configured durable backend.

## Durable backend boundary

Production and cross-machine continuity use a remotely reachable backend that preserves the backend-neutral Change identity, checkpoint lineage, operator sign-off, ownership transitions, and exact-commit-hash verification references. Linear, Jira, GitHub Issues, and Git-backed records can implement this contract. The methodology and Change schema do not depend on one of them.

The first durable adapter is Git. It stores tracked Change records under the reserved `spx/changes/` namespace. Each Change-record transaction writes directly to the repository's default branch and uses compare-and-set against the exact previously observed record version and default-branch head. A stale writer fails without replacing a newer record. The adapter records the successful commit as the durable checkpoint and exposes conflicts through the shared Change operation result. These record transactions are independent of the Change's implementation branch.

The host-local `.spx/changes/` prototype and tracked `spx/changes/` Git adapter are separate storage tiers. The prototype can validate lifecycle behavior before the adapter stores history. Production claims, handoffs, and lineage come from the configured durable backend; copying or synchronizing the gitignored prototype directory never substitutes for a durable transaction.

## Baton invariant

Every active Change has exactly one baton across its `handoff/` and `current/` directories.

- `handoff/baton.json` means the Change is available for continuation.
- `current/{agent}-{session-id}-{pid}.json` means the named agent session owns the Change.
- Zero batons means corrupted state.
- More than one baton means corrupted state.
- The owner identity is surfaced verbatim from the current baton path.

Ownership always comes from a structured backend operation: the baton path for the host-local prototype or the configured backend's compare-and-set claim record. Transcript text is never parsed to infer ownership.

The supported agent component begins with `codex` or `claude`. The session identifier and process identifier retain their complete source values.

## Baton protocol

Change creation writes `CHANGE.md` and an initial `handoff/baton.json`.

An agent acquires a Change through an `spx` subcommand that atomically renames the exact handoff path to:

```text
current/{codex|claude}-{session-id}-{agent-pid}.json
```

Concurrent acquisition attempts use the same source path. One atomic rename succeeds; every later attempt observes that the source path has gone.

While an agent owns the Change, `current/` contains the one baton and `handoff/` is empty.

At the end of an agent session, the owner:

1. updates Change lineage;
2. writes the next baton payload using the strict baton schema;
3. atomically renames its exact current path to `handoff/baton.json`.

A handoff therefore exists only between agent sessions. During active work, the baton path itself identifies the owner.

## Ownership and revival

The current baton path provides the agent kind, complete session identifier, and process identifier needed to determine host-local prototype ownership and process liveness.

When the named owner is dead, a new agent revives the Change through an `spx` subcommand that atomically renames the exact stale current path to the new owner path. Competing revival attempts race on the same stale source path, so one succeeds.

Revival appends a lineage event to `CHANGE.md` containing the previous owner path, new owner path, and revival time. Process-identity and process-identifier-reuse handling remain refinement work. If owner liveness is uncertain, takeover must preserve the current baton.

A worktree occupancy claim proves that one native agent session holds one local checkout. The configured Change backend remains authoritative for global ownership. Transcript discovery supports only adapter-local agent-session resume after backend ownership is acquired; transcript content carries no claim, handoff, or revival authority.

## Baton format

The baton uses JavaScript Object Notation (JSON) because Python and TypeScript read and write JSON natively, Rust has established JSON support, JSON Schema validates the payload, and `jq` inspects it directly.

The initial schema is:

```json
{
  "schema_version": 1,
  "change_id": "019f...",
  "next_step": "/decompose",
  "transient_state": null
}
```

Serialization requires:

- 8-bit Unicode Transformation Format;
- one trailing newline;
- stable key ordering;
- identifiers and Git commit hashes represented as strings;
- exactly the schema-declared keys;
- one `next_step` value from a finite source-owned set;
- `transient_state` as `null` or a schema-defined object;
- atomic writes and renames owned by `spx`.

The baton contains no instructions, plans, verification forecasts, skill sequences, copied constraints, or durable intent. `next_step` names one eligible top-level methodology entry verb. `transient_state` describes only external or ephemeral state that cannot be derived from the Change, repository, Git commit hash, or verification records.

## Branch identity

Each Change has one stable work branch across all handoffs:

```text
change/{slug}-{short-change-id}
```

The initial proposal uses `change/{slug}-{UUID[0,7]}`. The final short-identifier derivation and collision rule remain refinement work, including behavior for time-ordered UUID variants. The full Change UUID remains authoritative in `CHANGE.md`. The branch is a transport and lineage reference; branch deletion, renaming, or backend migration does not change the Change identity.

Cross-machine handoff resumes from the durable Change record and a hosted Git ref at the recorded exact commit hash. Native transcript resume remains an adapter-local convenience after ownership is acquired through the Change backend.

## Verification discovery

All five verification types are discoverable for an exact Change and Git commit hash:

- `audit`;
- `validate`;
- `review`;
- `evaluate`;
- `test`.

A new `spx` domain, such as `spx change`, deterministically derives applicable verification work from:

- the Change;
- the current or handoff baton;
- repository truth;
- the exact subject Git commit hash;
- verification records already attached to that commit hash.

Every verification record names its type and full subject commit hash. Discovery reports required, satisfied, stale, and unavailable verification from recorded state and repository truth. Prose in a handoff never selects verification or orders verifier execution.

The new domain name, result schema, storage projection, and interaction with verification journals remain refinement work.

## Session migration

The existing [*session artifact*](spx/36-session.enabler/session.md) combines durable Change state with transient handoff state. The prototype converts current state only:

- current durable intent and Change metadata move into `CHANGE.md`;
- one next entry verb and applicable external state move into `baton.json`;
- queue claiming becomes atomic baton movement;
- session ownership state becomes the current baton path;
- session commands retire after Change and baton commands cover creation, acquisition, handoff, revival, inspection, and archival.

The prototype does not reconstruct historical sessions, import old checkpoints, or backfill lineage. Existing verification records remain in storage governed by their commit hash and are discovered from there. Compatibility and bulk migration belong to later maturity tiers.

## Required outcomes

- An operator can read and sign one Markdown Change.
- Every active Change has exactly one verifiable baton.
- One atomic filesystem rename decides acquisition or revival.
- Any worktree on the same host observes the same prototype Change, baton, and owner.
- A dead owner can be revived without deleting or reconstructing the Change.
- A handoff carries one eligible `next_step` and optional `transient_state` only.
- The host-local prototype stores the current operator-approved Change without implementing a historical event store or claiming cross-machine durability.
- A durable backend preserves stable Change identity, checkpoint lineage, sign-off, ownership transitions, and exact-commit-hash references across machines.
- The Git durable adapter stores tracked records under `spx/changes/`, writes through default-branch compare-and-set transactions, and rejects stale writers.
- Ownership comes from structured Change-backend operations; transcript parsing and worktree occupancy never establish global Change ownership.
- Applicable verification is derived for all five verification types at an exact Git commit hash.
- Current session state can be converted into one Change and baton without historical backfill.
- Products can migrate durable planning into Changes and prohibit `PLAN.md` entirely.

## Refinement boundary

The next refinement establishes:

- the complete `CHANGE.md` schema;
- operator sign-off representation;
- Change and baton command names;
- the finite `next_step` set;
- transient-state schema;
- rules for owner liveness and process identifier reuse;
- short Change identifier derivation;
- the backend-neutral identity and backend-locator schema;
- the Git adapter's record layout, compare-and-set token, conflict result, and default-branch transaction envelope;
- verification discovery domain and result schema;
- migration and compatibility behavior;
- governing product nodes and decisions.

Checkpoint history, carried-forward lineage, and production-grade history storage remain backend responsibilities for a later maturity tier. That tier begins after the file-based lifecycle satisfies the [required outcomes](#required-outcomes).

## Operator sign-off

- [ ] Intent approved
- [ ] Prototype scope approved
- [ ] Refinement boundary approved
- [ ] Ready for node and decision mapping
