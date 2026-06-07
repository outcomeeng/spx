# Atomic Terminal-State Write Protocol

A single test run's terminal state is published through a write-once protocol: serialize to a uniquely named temporary file in the run directory with an exclusive-create flag, then atomically rename it onto `state.json`, refusing the write when a `state.json` already exists. Reads classify any run directory whose `state.json` is missing, unreadable, unparseable, or shape-invalid as incomplete evidence rather than failing the whole lookup.

## Rationale

Temp-file-plus-rename makes the publish of a terminal record atomic on POSIX filesystems: a reader sees either no `state.json` or the complete file, never a prefix. Exclusive-create on the temp file and refuse-on-existing on the target make the write idempotent and non-destructive — a re-run writes a new, uniquely named run directory rather than mutating a settled one. Classifying malformed state as incomplete instead of erroring the lookup keeps one corrupt directory from hiding every healthy run, and the incomplete reason recorded per directory keeps diagnostics available without failing the lookup.

Writing `state.json` in place was rejected because a reader can observe a partial file mid-write; overwriting an existing terminal record on re-run was rejected because it destroys prior evidence and races concurrent readers; failing the entire branch lookup on one unparseable `state.json` was rejected because one corrupt directory would blind fast status to all healthy runs.

## Invariants

The module exports `writeTerminalTestRunState(runDir, state, deps)` (temp-file + atomic rename, exclusive create, refuse overwrite); `TESTING_RUN_STATE_INCOMPLETE_REASON`, the closed set of reasons a run directory is incomplete (missing, I/O error, parse-invalid, shape-invalid); and `TESTING_RUN_STATE_ERROR`, the closed run-state failure set — run-directory creation (collision-limit, run-directory-create-failed) and terminal write (state-already-exists, write-failed). The terminal status needs no guard because `TestRunState.status` is a closed terminal union and the read path validates deserialized status.

- A reader observes `state.json` as either absent or complete — never partially written.
- An existing terminal `state.json` is never overwritten by a subsequent write.
- A run directory without a parse-valid, shape-valid `state.json` is classified incomplete and excluded from terminal-run selection.
- The temporary file name is unique per write attempt so concurrent writers in the same run directory do not collide on the temp path.

## Verification

### Audit

- ALWAYS: `writeTerminalTestRunState` writes to a uniquely named temp file with an exclusive-create flag, then renames onto `state.json` — guarantees atomic publish ([audit])
- ALWAYS: `writeTerminalTestRunState` refuses the write when `state.json` already exists, returning a typed error — terminal state is write-once ([audit])
- ALWAYS: reads classify missing, I/O-failed, parse-invalid, and shape-invalid state as incomplete evidence using `TESTING_RUN_STATE_INCOMPLETE_REASON` — one corrupt directory never fails the lookup ([audit])
- ALWAYS: all write and read functions accept a `deps` parameter exposing filesystem operations — enables `l1` testing of the write protocol without mocking ([audit])
- NEVER: write `state.json` in place without the temp-file + rename step — exposes partial reads ([audit])
- NEVER: overwrite an existing terminal `state.json` — destroys prior evidence ([audit])
- NEVER: throw from a run lookup because one run directory holds malformed state — malformed state is classified, not fatal ([audit])
