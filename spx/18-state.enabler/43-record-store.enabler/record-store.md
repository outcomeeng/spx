# Record Store

PROVIDES JSONL run/record mechanics — single-artifact run paths, append, and latest-record reads — per [`spx/17-state.adr.md`](../../17-state.adr.md)
SO THAT consumers persisting local execution history within a resolved `.spx/` scope
CAN append run records and recover the latest complete record without reimplementing append/read mechanics

## Assertions

### Scenarios

- Given a run token, when a single-artifact run path is built, then the path is `runs/run-{run-token}.jsonl` ([test](tests/record-store.scenario.l1.test.ts))

### Compliance

- ALWAYS: JSONL append and latest-record reads ignore blank trailing lines and return the last parse-valid record ([test](tests/jsonl-records.scenario.l1.test.ts))
- NEVER: a run-file create writes through a candidate path that already resolves to a symbolic link or existing file — the exclusive-create open fails on any existing path, so a planted symlink is skipped and its target is never written through ([test](tests/run-file.compliance.l1.test.ts))
