# Atomic Terminal-State Write Protocol

A single test run's terminal state is published through a write-once protocol: reserve an empty run file with exclusive-create semantics, then serialize one JSONL record into that reserved file only while it is still empty. Reads classify any run file whose JSONL record is missing, unreadable, unparseable, or shape-invalid as incomplete evidence rather than failing the whole lookup. The module exports `writeTerminalTestRunState(runFilePath, state, deps)` (fill reserved file, refuse non-empty file); `TESTING_RUN_STATE_INCOMPLETE_REASON`, the closed set of reasons a run file is incomplete (missing, I/O error, parse-invalid, shape-invalid); and `TESTING_RUN_STATE_ERROR`, the closed run-state failure set — run-file reservation (collision-limit, run-file-create-failed) and terminal write (state-already-exists, write-failed). The terminal status needs no guard because `TestRunState.status` is a closed terminal union and the read path validates deserialized status.

## Rationale

Exclusive reservation makes the run file visible as in-progress evidence before dispatch starts; the terminal writer fills that same file once the run has a terminal state. A re-run writes a new, uniquely named run file rather than mutating a settled one. Classifying empty or malformed state as incomplete instead of erroring the lookup keeps one corrupt file from hiding every healthy run, and the incomplete reason recorded per file keeps diagnostics available without failing the lookup.

Overwriting an existing terminal record on re-run was rejected because it destroys prior evidence and races concurrent readers; failing the entire lookup on one unparseable JSONL record was rejected because one corrupt file would blind fast status to all healthy runs.

## Invariants

- An existing terminal JSONL record is never overwritten by a subsequent write.
- A run file without a parse-valid, shape-valid JSONL record is classified incomplete and excluded from terminal-run selection.
- An empty reserved run file is incomplete evidence until the terminal writer stores its JSONL record.

## Verification

### Audit

- ALWAYS: `createTestRunFile` reserves the JSONL run file with an exclusive-create flag before dispatch starts ([audit])
- ALWAYS: `writeTerminalTestRunState` refuses the write when the run file already contains a record, returning a typed error — terminal state is write-once ([audit])
- ALWAYS: reads classify missing, I/O-failed, parse-invalid, and shape-invalid state as incomplete evidence using `TESTING_RUN_STATE_INCOMPLETE_REASON` — one corrupt file never fails the lookup ([audit])
- ALWAYS: all write and read functions accept a `deps` parameter exposing filesystem operations — enables `l1` testing of the write protocol without mocking ([audit])
- NEVER: overwrite an existing terminal JSONL record — destroys prior evidence ([audit])
- NEVER: throw from a run lookup because one run file holds malformed state — malformed state is classified, not fatal ([audit])
