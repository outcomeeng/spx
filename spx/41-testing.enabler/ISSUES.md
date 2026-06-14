# Issues: Testing

Coordination notes for the `spx test` enabler. The `spx test` command, the registry-based dispatch, passing-scope filtering, last-run evidence recording, and the registry-based per-node run are built and proven (`tests/execution-recording.scenario.l1.test.ts`, `tests/testing.scenario.l1.test.ts`), so `41-testing.enabler` participates in the quality gate and is no longer listed in `spx/EXCLUDE`.

## FOLLOW-UP: testing scenario fixtures remain split across helpers

The completed fixture coordination plan listed a future combined fixture surface for
config file formats, passing-scope filters, language-specific test files, and
expected last-run state. The live helper surface is smaller and split by need:
`withTestingTempProductDir`, `writeTestFileFixture`,
`writeTestingConfig`, and `writeTestingStateFile` in
`testing/harnesses/testing/harness.ts`, plus the per-language recording runners in
`testing/harnesses/testing/{typescript,python}-runner.ts`. This keeps individual
tests explicit, but it also means config-backed command tests currently stage
`spx.config.json` through `writeTestingConfig`; they do not share a fixture that
can vary JSON, TOML, and YAML config files from one scenario description.

**Resolution:** keep the split helpers while test setup remains small. If another
testing scenario needs the same combined setup, extract a dedicated scenario
fixture that can materialize config format variants, passing-scope policy,
language-specific test files, and optional last-run state from one description.
When extracting it, cover the `spx.config.{toml,json,yaml}` command path rather
than only the descriptor validator and JSON helper path.

**Evidence:** `testing/harnesses/testing/harness.ts`;
`spx/41-testing.enabler/testing.md`;
`spx/41-testing.enabler/tests/execution-recording.scenario.l1.test.ts`;
`spx/41-testing.enabler/32-testing-config.enabler/tests/testing-config.compliance.l1.test.ts`.

## FOLLOW-UP: a zero-outcome run records a vacuous `passed` status

`deriveStatus` in `src/commands/testing/run-command.ts` derives status with `outcomes.every(exitCode === SUCCESS_EXIT_CODE)`, so a run that dispatches no runner (no test files discovered, or every matching runner gated out by absent-language detection) records `status: passed` by vacuous truth. The status is not consumed today: a zero-outcome run's `runnerOutcomes` cover no node, so `selectLatestTerminalTestRunForNode` never selects it and the status-delegation resolver treats the node as absent and re-runs. The vacuous `passed` only misleads a consumer that reads `state.status` directly without coverage-gating.

**Resolution:** when the status-delegation resolver lands (unit 3), decide the zero-outcome status semantics (a distinct status, or a documented vacuous-pass contract justified by coverage-gating) and amend `spx/41-testing.enabler/71-execution-recording.adr.md` accordingly, with a recording test for the empty-outcome path. In the same pass, decide whether `runNodeCommand` should reject a `nodePath` that matches no discovered file — distinct from a matched node whose runner is gated out by absent-language detection — rather than silently recording an empty run, which only re-fires the resolver's per-node run.

**Evidence:** local changes review on PR-2c; `src/commands/testing/run-command.ts` `deriveStatus` and `runNodeCommand`; `src/testing/run-state.ts` `selectLatestTerminalTestRunForNode` coverage gating.

## FOLLOW-UP: a failed dispatch orphans the reserved run file

`runTestsCommand` and `runNodeCommand` reserve the run file (`createTestRunFile`) before dispatch so `startedAt` marks the run's start. If `runTests` throws after reservation, the file is left empty. `readTestingRuns` classifies it as an incomplete run, so it never corrupts the read path, but repeated dispatch failures accumulate stale empty files under `.spx/worktree/test/runs/`.

**Resolution:** either defer run-file creation until dispatch succeeds (accepting a later `startedAt`), or add a cleanup path that prunes incomplete run files; decide alongside the terminal-write-protocol's lifecycle in `spx/41-testing.enabler/43-last-run-evidence.enabler/32-terminal-write-protocol.adr.md`.

**Evidence:** local changes review on PR-2c; `src/commands/testing/run-command.ts` `reserveRunFile`; `src/testing/run-state.ts` `readTestingRuns` incomplete-run classification.

## FOLLOW-UP: covered-content reads are serial

`readCoveredContents` (`src/commands/testing/run-command.ts`) reads each covered test file with a serial `await` in a `for` loop. For a full-suite run over a large spec tree this is O(n) sequential I/O; concurrent reads would cut wall-clock time.

**Resolution:** read the covered files concurrently (e.g. `Promise.all` over the mapped reads) when the file count justifies it, benchmarked against a realistic tree; weigh against the product's <100ms CLI-latency target in `spx/spx.product.md`.

**Evidence:** local changes review on PR-2c; `src/commands/testing/run-command.ts` `readCoveredContents`.

## FOLLOW-UP: testing runner contract names the root `projectRoot`, not `productDir`

`TestRunRequest.projectRoot` and `TestRunnerDependencies.isLanguagePresent(projectRoot)` (`src/testing/languages/types.ts`) name the repository root with the deprecated term; `CLAUDE.md` prefers `productDir` for root-directory APIs. The dispatch and CLI already speak `productDir` and map it onto the descriptor's `projectRoot` field at the call boundary.

**Resolution:** when the descriptor contract is next edited, rename `projectRoot` to `productDir` across `TestRunRequest`, both language descriptors, the dispatch, the CLI, and the runner harnesses and generators.

**Evidence:** local changes review on PR-2a (F-003); `CLAUDE.md` product-directory vocabulary rule; `src/testing/languages/types.ts`.

## FOLLOW-UP: extract shared runner test-infra when a third language is added

The recording command runner (`createRecordingCommandRunner` and the `RecordingCommandRunner` interface) is duplicated between `testing/harnesses/testing/python-runner.ts` and `testing/harnesses/testing/typescript-runner.ts`, and the runner generators (`testing/generators/testing/python-runner.ts` and `…/typescript-runner.ts`) redeclare the same spec-tree path constants (`SPEC_ROOT`, `TESTS_DIR`, `NODE_SUFFIX`, the node-index and path-count bounds). Both operate purely on the shared `TestingLanguageDescriptor` contract (`src/testing/languages/types.ts`), so the structure is identical across languages. With two language runners the parallel structure is the cheaper choice; a third runner makes the duplication worth extracting and risks silent divergence.

**Resolution:** when a third language testing descriptor is added, extract the shared recording command runner to `testing/harnesses/testing/language-runner.ts` and the shared generator constants to `testing/generators/testing/language-runner.ts`, and re-point every language runner harness and generator — and the dispatch-level tests (`spx/41-testing.enabler/tests/testing.scenario.l1.test.ts` and `tests/execution-recording.scenario.l1.test.ts`), which import `createRecordingCommandRunner` from the typescript-runner harness — at the shared module.

**Evidence:** spec-tree-review on PR #69; the shared contract `src/testing/languages/types.ts` both runners conform to.
