# Status File Contract

## Purpose

This decision governs how spx persists each spec-tree node's derived lifecycle state to disk — where the state lives, what shape it takes, who writes it, and what its absence means — so every consumer reads one fixed contract.

## Context

**Business impact:** `spx spec status` and quality-gate consumers report a node's lifecycle state without re-running validation and tests. A persisted per-node record keeps status reporting fast, and git history answers "when did this node last pass?". One fixed contract keeps every consumer reading the same artifact.

**Technical constraints:** spx resolves the tracked `spx/` tree per `spx/15-worktree-resolution.pdr.md` and derives node state live today. The persisted file co-exists with that live derivation and with the existing `spx.config.{json,yaml,toml}` family. Tooling produces the file; it is never hand-edited.

## Decision

Each node's lifecycle state persists in a co-located, machine-written `spx.status.json` file — `{ "status": "declared" | "specified" | "failing" | "passing" }` — written only by `spx spec status --update`, where a missing file means "no recorded state" and consumers derive that node's state live.

## Rationale

Per-node co-location ties a node's recorded state to that node's own commits, so git history — not a field inside the file — answers "when did this node last pass?". A single writer keeps every other path a pure reader, so reading status never mutates the tree. Absence routing to live derivation makes the mechanism additive: status works on a fresh checkout before any `--update` has run, and a missing file is never an error.

Alternatives considered and rejected:

- A single central status file at the `spx/` root mapping node paths to state — centralizes per-node state away from the node and creates cross-branch merge contention.
- Multiple formats (`spx.status.{json,yaml,toml}`) mirroring `spx.config.*` — config is human-authored, so ergonomic formats help; the status file is machine-written, so one canonical JSON format is correct.
- An in-file staleness anchor (content hash or commit SHA) — git already tracks content changes, and staleness is computed from a node's dependency changes at read time, so an in-file anchor duplicates git and adds maintenance.

## Trade-offs accepted

| Trade-off                                                           | Mitigation / reasoning                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A status file in every node directory adds many small tracked files | Each is one line of JSON; co-location is what ties recorded state to the node's own history      |
| The file records no staleness anchor                                | Staleness is derived at read time from dependency changes; storing an anchor would duplicate git |
| A later format change requires a deliberate revision                | The single-writer rule means only one path changes; consumers read through one contract          |

## Product invariants

- `spx spec status` reflects a node's last `spx spec status --update` result for any node with a committed `spx.status.json`.
- A node with no `spx.status.json` reports the same live-derived state it did before any `--update` ran.
- `spx spec status` without `--update` executes no node tests: it reports the persisted `spx.status.json` when present and the live structural derivation otherwise, returning within the product's per-command latency budget declared in `spx/spx.product.md` (under 100ms once the CLI process is running).
- `spx spec status --update` is the only command path that executes node tests; test execution is what distinguishes refreshing recorded state from reporting it.

## Compliance

### Recognized by

Every refreshed node directory contains an `spx.status.json` whose `status` is one of the four lifecycle states, and `spx spec status` reports those states without re-running tests.

### MUST

- Write `spx.status.json` only through the `spx spec status --update` path — every other path reads ([review])
- Place each `spx.status.json` in the directory of the node it describes ([review])
- Record the lifecycle state as a JSON `status` field whose value is one of `declared`, `specified`, `failing`, `passing` ([review])
- Report only derivable state from `spx spec status` without `--update` — the persisted `spx.status.json` when present, otherwise the live structural derivation ([review])

### NEVER

- Treat a missing `spx.status.json` as an error or a fixed state — absence routes to live derivation ([review])
- Offer `spx.status.yaml` or `spx.status.toml` — the status file is machine-written JSON only ([review])
- Execute node tests from any `spx spec status` invocation other than `--update` ([review])
