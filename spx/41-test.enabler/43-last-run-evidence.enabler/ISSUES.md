# Issues: Last-Run Evidence

## FOLLOW-UP: terminal-write no-overwrite is not atomic against concurrent same-directory writers

`writeTerminalTestRunState` checks whether the reserved run file is empty with a preflight `readFile` (returning `STATE_ALREADY_EXISTS` when content is present), then writes the JSONL record into the same file. The preflight and the write are not atomic: two writers targeting the **same** run file could both observe an empty file, then one writer's record could overwrite the other — violating the write-once invariant in [`32-terminal-write-protocol.adr.md`](32-terminal-write-protocol.adr.md).

**Impact:** None in the intended flow. Each run gets a unique random run file from `createTestRunFile`, so two writers never target the same file; the preflight enforces write-once for the sequential re-write case. The race is reachable only under concurrent writes to a deliberately shared run file. The audit peer (`writeTerminalAuditRunState`) shares the identical reserved-file fill pattern.

**Resolution options (deferred — changes the ADR-mandated reserved-file protocol and would diverge from the reused audit pattern):**

- Replace the reserved-empty-file fill with a separate lock/commit protocol or an append protocol that rejects a second terminal record, making no-overwrite atomic and removing the preflight TOCTOU; update [`spx/41-test.enabler/43-last-run-evidence.enabler/32-terminal-write-protocol.adr.md`](spx/41-test.enabler/43-last-run-evidence.enabler/32-terminal-write-protocol.adr.md) and the `TestRunStateFileSystem` interface, and consider the same change for the audit peer.

**Evidence:** Surfaced by automated review (P2, `src/test/run-state.ts` rename site) on PR #65.

## FOLLOW-UP: node-scoped selection treats an empty node-path set as no coverage

`selectLatestTerminalTestRunForNode` (via `runCoversNode`) returns `undefined` for a node whose `nodeTestPaths` is empty — no run is considered to cover a node that declares no test paths. This is the correct outcome under the delegation contract ([`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`](spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md)): only test-bearing, non-`EXCLUDE` nodes reach the resolver, and those always have at least one test path, so a `declared` node never selects evidence. The empty-paths branch is therefore a defensive guard the delegation contract makes unreachable.

**Impact:** None in the intended flow. The branch is untested because the generator's `testPaths` arbitrary enforces `minLength: 1`; no scenario constructs an empty node-path set.

**Resolution (deferred):** If a future caller can pass an empty node-path set, add a generator path and a scenario asserting the no-coverage outcome, or make the contract reject empty input explicitly. Until then the guard's behavior is contract-implied.

**Evidence:** Local changes review on the per-worktree relocation PR (`runCoversNode` empty-paths early return in `src/test/run-state.ts`).

## FOLLOW-UP: `toErrorMessage` diverges from the `src/lib/state-store` copy

Hardening `toErrorMessage` in `src/test/run-state.ts` to resolve SonarQube S6551
(guarded `JSON.stringify` instead of `String(error)` for non-Error, non-string
thrown values) made it diverge from the private `toErrorMessage` at
`src/lib/state-store/index.ts:570`, which still uses `String(error)`. The two
agree on the common Error/string path but differ on non-standard throws
(`throw undefined`, `throw { … }`). A third copy lives in
`src/domains/worktree/occupancy-store.ts`.

**Resolution (deferred — blocked by the SonarQube whole-file gate):** consolidate
into one exported `toErrorMessage` in `src/lib/state-store/index.ts` consumed by
`run-state.ts`, the CLI error handler, and `occupancy-store.ts`. A one-line edit
to `src/lib/state-store/index.ts` re-flags four pre-existing SonarQube findings in
that file under the local whole-changed-file gate (verified by probe), which the
SonarQube-zero-issues program owns. Do the consolidation in that program's pass,
or when `src/lib/state-store/index.ts` is next edited for its own reason.

**Evidence:** spec-tree-review on PR #239 (`run-state.ts` ↔
`src/lib/state-store/index.ts:570`); local SonarQube finding probe surfacing four
state-store findings from a one-line edit.

## The staleness property test calls fast-check directly, bypassing the property harness's seed and replay

`tests/staleness.property.l1.test.ts` runs each property through `fc.assert` with fast-check's default run count, not through the property harness in `testing/harnesses/property/property.ts`. That harness owns the run count, the per-run timeout, and the seed: it reads `SPX_PROPERTY_SEED` or draws one, and a failure reports the seed and the shrunk counterexample so the caller replays the exact run. A failing property in the file reports fast-check's own seed text and ignores `SPX_PROPERTY_SEED`.

**Impact:** a failure in the file does not replay through the pinned seed every other property in the product uses, and its run count and timeout drift from the harness's.

**Scope:** every property in `tests/staleness.property.l1.test.ts`; the file is outside the set of test files this changeset changes and the files those import.

**Resolution:** route each property through the property harness, then re-run this node's tests and its test-evidence audit.

## The terminal-run pool generator lives in a test file

`arbitraryTerminalRunPool` in `tests/run-state.property.l1.test.ts` composes the latest-covering-run pool: it draws the run file names, states, runner outcomes, and base date, and sorts the names to fix the tie-breaking winners and losers. It is a generator defined in the test file that uses it, beside the shared `TEST_RUN_STATE_TEST_GENERATOR` in `testing/generators/testing/run-state.ts`.

**Impact:** the pool's construction, which carries the expected run file name the property asserts against, sits in the evidence it constrains, so the generator is neither reusable by a sibling test nor audited as governed test infrastructure.

**Scope:** the one generator and the property "selects the latest covering run by completed time, started time, and run file name" that consumes it.

**Resolution:** move the pool generator into `testing/generators/testing/run-state.ts` beside the generators it composes, then re-run this node's tests and its test-evidence audit.

## The passing-scope compliance test writes the literal `exclude` key

`tests/passing-scope.compliance.l1.test.ts` builds its section value as `{ [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: { exclude: [excludedScope] } }` and passes `{ exclude: [excludedScope] }` to `writeTestingConfig`. The `exclude` key is a string literal in the test, where the passing-scope key beside it comes from `TESTING_CONFIG_FIELDS`.

**Impact:** a rename of the exclusion key in the path-filter configuration the passing scope validates against leaves the test writing a key that configuration no longer reads, so the test continues to exclude nothing it names and its comparison of the passing scope before and after deleting state compares two scopes that omit the exclusion.

**Scope:** the two literal `exclude` occurrences in that file; the rest of the compliance test is unaffected.

**Resolution:** take the key from the path-filter configuration's own field name, then re-run this node's tests and its test-evidence audit.

## The passing-scope compliance test owns its dependency setup

`tests/passing-scope.compliance.l1.test.ts` defines `invokedArgs`, `gitIdentityStub`, `testCommandDeps`, and `resolvePassingScope` in the executed test file. `testCommandDeps` assembles the dependency bag that `runTestsCommand` receives from the testing registry, the recording runner, and a git double whose `execa` returns a sampled literal. `resolvePassingScope` validates the section value through the testing config descriptor and returns its passing scope.

**Impact:** the dependency bag, the git double, and the recorded-invocation reading sit in the evidence they constrain, so a sibling test that drives `runTestsCommand` rebuilds them, and the harness boundary [`spx/12-test-infrastructure.adr.md`](spx/12-test-infrastructure.adr.md) assigns to governed test infrastructure goes unaudited for this setup.

**Scope:** the four functions in that file and their call sites in the one compliance test; the test's assertion flow is unaffected.

**Resolution:** move the dependency setup into a harness under `testing/harnesses/testing/` that the test imports, then re-run this node's tests and its test-evidence audit.
