# Issues: Record Store

## Tracked Follow-Ups

- `testing/harnesses/state/in-memory-file-system.ts`: `writeFile` with `WRITE_EXISTING_FLAG` replaces the stored string, while `defaultStateStoreFileSystem.writeFile` opens with `r+` and writes from position 0 without truncating trailing bytes. Current record-store callers only write to empty files with this flag, so behavior is equivalent today. Revisit before adding callers that overwrite non-empty records through `WRITE_EXISTING_FLAG`, and align the in-memory filesystem with the real filesystem semantics or tighten the production write contract.

## FILED — Run-path assertion keeps its predicate in the state harness

Evidence: a test-evidence audit of `spx/18-state.enabler/43-record-store.enabler/record-store.md` at committed head `10ff4056eecbe36281a04ac06e68f75f02cf45df` returned APPROVED and filed one finding (rule assertion-seam, property predicate-ownership) on `testing/harnesses/state/record-store.ts`. The assertion "Given a run token, when a single-artifact run path is built, then the path is `runs/run-{run-token}.jsonl`" links `tests/record-store.scenario.l1.test.ts`, which passes the harness function to `it()` and holds no predicate. `assertSingleArtifactRunFilePath` calls `expect(...)` and owns the run-file-name, run-token regex, and run-file-path predicates. The finding sits on text the originating Change leaves unchanged: `git diff 4cfdd4579e07188595f31f75e8d21a845fec2b16..HEAD` shows no change to `testing/harnesses/state/record-store.ts` or `tests/record-store.scenario.l1.test.ts`.

Impact: the harness owns every `expect` call and the pass/fail predicate for the run-path assertion, and the linked test carries no visible predicate, so inverting the claim changes only harness code. Severity FILED: it blocks nothing.

Settlement condition: the harness returns its observation of the built run path, and the predicate on that observation lives in the linked test function.
