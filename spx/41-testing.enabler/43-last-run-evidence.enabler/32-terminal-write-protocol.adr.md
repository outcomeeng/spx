# Atomic Terminal-State Write Protocol

## Purpose

This decision governs how a single test run's terminal state is written to disk so that a reader never observes a partially written `state.json` and a completed run is never silently overwritten.

## Context

**Business impact:** Fast status reads the latest terminal `state.json` for the current branch. A reader that observes a half-written file, or a writer that clobbers an existing terminal record, corrupts the evidence fast status depends on. Writes happen while other processes in other worktrees may read the shared Git common-dir product root concurrently.

**Technical constraints:** Testing state lives under `.spx/testing/{branch-slug}/runs/{run-directory}/state.json` per `spx/41-testing.enabler/43-last-run-evidence.enabler/11-last-run-directory.adr.md`. A run directory without a parse-valid `state.json` is incomplete evidence. The write path must be observable through dependency injection for isolated testing.

## Decision

Write terminal state through a write-once protocol: serialize to a uniquely named temporary file in the run directory with an exclusive-create flag, then atomically rename it onto `state.json`; refuse the write when a `state.json` already exists. Reads classify any run directory whose `state.json` is missing, unreadable, unparseable, or shape-invalid as incomplete evidence rather than failing the whole lookup.

The module exports:

1. `writeTerminalTestRunState(runDir, state, deps)` — temp-file + atomic rename, exclusive create, refuse overwrite
2. `TESTING_RUN_STATE_INCOMPLETE_REASON` — the closed set of reasons a run directory is incomplete (missing, I/O error, parse-invalid, shape-invalid)
3. `TESTING_RUN_STATE_ERROR` — the closed set of write-path failures (collision-limit, write-failed, state-already-exists, invalid-terminal-state)

## Rationale

Temp-file-plus-rename makes the publish of a terminal record atomic on POSIX filesystems: a reader sees either no `state.json` or the complete file, never a prefix. Exclusive-create on the temp file and refuse-on-existing on the target make the write idempotent and non-destructive — a re-run writes a new run directory rather than mutating a settled one. Classifying malformed state as incomplete (instead of erroring the lookup) keeps one corrupt directory from hiding every healthy run.

Alternatives considered:

- **Write `state.json` in place**: A reader can observe a partial file mid-write. Rejected — atomic publish requires rename.
- **Overwrite an existing terminal record on re-run**: Destroys prior evidence and races concurrent readers. Rejected — terminal state is write-once; a new run gets a new directory.
- **Fail the entire branch lookup on one unparseable `state.json`**: One corrupt directory blinds fast status to all healthy runs. Rejected — malformed state is classified incomplete and skipped.

## Trade-offs accepted

| Trade-off                                              | Mitigation / reasoning                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Temp-file + rename adds a filesystem step per write    | The cost is one extra rename; it buys atomic publish that a direct write cannot provide                     |
| Refuse-overwrite means a re-run cannot reuse a run dir | Run directories are uniquely named per run, so a re-run naturally targets a fresh directory                 |
| Incomplete classification hides the cause from callers | The incomplete reason is recorded per directory, so diagnostics remain available without failing the lookup |

## Invariants

- A reader observes `state.json` as either absent or complete — never partially written
- An existing terminal `state.json` is never overwritten by a subsequent write
- A run directory without a parse-valid, shape-valid `state.json` is classified incomplete and excluded from terminal-run selection
- The temporary file name is unique per write attempt so concurrent writers in the same run directory do not collide on the temp path

## Compliance

### Recognized by

Observable `deps` parameter on the write and read functions. Terminal writes go through temp-file + rename; reads return a partition of terminal and incomplete runs rather than throwing on malformed state.

### MUST

- `writeTerminalTestRunState` writes to a uniquely named temp file with an exclusive-create flag, then renames onto `state.json` — guarantees atomic publish ([review])
- `writeTerminalTestRunState` refuses the write when `state.json` already exists, returning a typed error — terminal state is write-once ([review])
- Reads classify missing, I/O-failed, parse-invalid, and shape-invalid state as incomplete evidence using `TESTING_RUN_STATE_INCOMPLETE_REASON` — one corrupt directory never fails the lookup ([review])
- All write and read functions accept a `deps` parameter exposing filesystem operations — enables `l1` testing of the write protocol without mocking ([review])

### NEVER

- Write `state.json` in place without the temp-file + rename step — exposes partial reads ([review])
- Overwrite an existing terminal `state.json` — destroys prior evidence ([review])
- Throw from a branch-run lookup because one run directory holds malformed state — malformed state is classified, not fatal ([review])
