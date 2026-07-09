# Record Store

PROVIDES JSONL run/record mechanics — single-artifact run paths, run-file-name parsing, append, latest-record reads, and recency ordering of a scope's run records — per [`spx/17-state.adr.md`](../../17-state.adr.md)
SO THAT consumers persisting local execution history within a resolved `.spx/` scope
CAN append run records, recover the latest complete record, parse a run token from a run-file name, and order runs by recency without reimplementing run-record mechanics or re-deriving the run-token format

## Assertions

### Scenarios

- Given a run token, when a single-artifact run path is built, then the path is `runs/run-{run-token}.jsonl` ([test](tests/record-store.scenario.l1.test.ts))

### Properties

- Composing a run file name from a run token and parsing the name back returns the original token; a name that is not a run file parses to nothing ([test](tests/run-record.property.l1.test.ts))
- A run token's capture-timestamp prefix, assigned when the token is composed, is recoverable from the token alone ([test](tests/run-record.property.l1.test.ts))
- Ordering run records by recency ranks them by capture timestamp, then filesystem creation time, then run token; the newest-first and oldest-first orderings are exact reverses ([test](tests/run-record.property.l1.test.ts))

### Compliance

- ALWAYS: JSONL append and latest-record reads ignore blank trailing lines and return the last parse-valid record ([test](tests/jsonl-records.scenario.l1.test.ts))
- NEVER: a run-file create writes through a candidate path that resolves to a symbolic link — the exclusive-create open fails, so a planted symlink is skipped and its target is never written through ([test](tests/run-file.compliance.l1.test.ts))
