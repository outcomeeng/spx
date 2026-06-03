# Issues: Testing

Coordination notes for the `spx test` enabler. The `spx test` command, the registry-based dispatch, passing-scope filtering, last-run evidence recording, and the registry-based per-node run are built and proven (`tests/execution-recording.scenario.l1.test.ts`, `tests/testing.scenario.l1.test.ts`), so `41-testing.enabler` participates in the quality gate and is no longer listed in `spx/EXCLUDE`.

## FOLLOW-UP: recorded product-input digests are empty until descriptors declare product inputs

Last-run evidence records `productInputDigests: []` because no testing descriptor declares product inputs and the domain-execution-descriptor implementation (specified at `spx/16-config.enabler/43-domain-execution-descriptors.enabler/domain-execution-descriptors.md`) does not yet exist in `src/`. The staleness comparison's product-input dimension is therefore inert; the resolved testing config digest, the discovered test path-set digest, and the discovered test content digest carry staleness detection in the meantime.

**Resolution:** when the domain-execution-descriptor surface lands and the testing descriptors declare their product inputs (e.g. `package.json`, `tsconfig.json`, `pyproject.toml`), have `recordRun` (`src/commands/testing/run-command.ts`) compute and record their digests in place of the empty list.

**Evidence:** `src/commands/testing/run-command.ts` `NO_PRODUCT_INPUT_DIGESTS`; `src/testing/run-state.ts` `ProductInputDigest`; `spx/41-testing.enabler/43-last-run-evidence.enabler/43-staleness-comparison.adr.md`.

## FOLLOW-UP: a zero-outcome run records a vacuous `passed` status

`deriveStatus` in `src/commands/testing/run-command.ts` derives status with `outcomes.every(exitCode === SUCCESS_EXIT_CODE)`, so a run that dispatches no runner (no test files discovered, or every matching runner gated out by absent-language detection) records `status: passed` by vacuous truth. The status is not consumed today: a zero-outcome run's `runnerOutcomes` cover no node, so `selectLatestTerminalTestRunForNode` never selects it and the status-delegation resolver treats the node as absent and re-runs. The vacuous `passed` only misleads a consumer that reads `state.status` directly without coverage-gating.

**Resolution:** when the status-delegation resolver lands (unit 3), decide the zero-outcome status semantics (a distinct status, or a documented vacuous-pass contract justified by coverage-gating) and amend `spx/41-testing.enabler/71-execution-recording.adr.md` accordingly, with a recording test for the empty-outcome path. In the same pass, decide whether `runNodeCommand` should reject a `nodePath` that matches no discovered file — distinct from a matched node whose runner is gated out by absent-language detection — rather than silently recording an empty run, which only re-fires the resolver's per-node run.

**Evidence:** local changes review on PR-2c; `src/commands/testing/run-command.ts` `deriveStatus` and `runNodeCommand`; `src/testing/run-state.ts` `selectLatestTerminalTestRunForNode` coverage gating.

## FOLLOW-UP: a failed dispatch orphans the reserved run directory

`runTestsCommand` and `runNodeCommand` reserve the run directory (`createTestRunDirectory`) before dispatch so `startedAt` marks the run's start. If `runTests` throws after reservation, the directory is left without a `state.json`. `readTestingRuns` classifies it as an incomplete run, so it never corrupts the read path, but repeated dispatch failures accumulate stale directories under `.spx/local/testing/runs/`.

**Resolution:** either defer directory creation until dispatch succeeds (accepting a later `startedAt`), or add a cleanup path that prunes incomplete run directories; decide alongside the terminal-write-protocol's lifecycle in `spx/41-testing.enabler/43-last-run-evidence.enabler/32-terminal-write-protocol.adr.md`.

**Evidence:** local changes review on PR-2c; `src/commands/testing/run-command.ts` `reserveRunDirectory`; `src/testing/run-state.ts` `readTestingRuns` incomplete-run classification.

## FOLLOW-UP: command-layer coverage for content-digest staleness

The recording tests assert `discoveredTestPathsDigest` over the covered files but do not exercise `discoveredTestContentDigest` changing when file bytes change. The property "last-run state is stale when the discovered test file content digest differs" is proven at the `run-state` unit (`staleness.property.l1.test.ts`) but not end-to-end through the command layer.

**Resolution:** add a scenario that records a run, rewrites a covered test file's content, and asserts `isStalenessMatch` returns false against the freshly recorded content digest — covering the content-digest path through `runTestsCommand` / `runNodeCommand`.

**Evidence:** local changes review on PR-2c; `src/commands/testing/run-command.ts` `readCoveredContents`; `spx/41-testing.enabler/43-last-run-evidence.enabler/43-staleness-comparison.adr.md`.

## FOLLOW-UP: covered-content reads are serial

`readCoveredContents` (`src/commands/testing/run-command.ts`) reads each covered test file with a serial `await` in a `for` loop. For a full-suite run over a large spec tree this is O(n) sequential I/O; concurrent reads would cut wall-clock time.

**Resolution:** read the covered files concurrently (e.g. `Promise.all` over the mapped reads) when the file count justifies it, benchmarked against a realistic tree; weigh against the product's <100ms CLI-latency target in `spx/spx.product.md`.

**Evidence:** local changes review on PR-2c; `src/commands/testing/run-command.ts` `readCoveredContents`.

## FOLLOW-UP: enforce the invoked/exitCode invariant in the TestRunInvocation type

`TestRunInvocation` (`src/testing/languages/types.ts`) documents that `exitCode` is "absent when the runner was not invoked" — when `invoked: true`, `exitCode` is present — but the type (`exitCode?: number`) does not enforce it. The dispatch's `exitCode: invocation.exitCode ?? SUCCESS_EXIT_CODE` (`src/commands/testing/dispatch.ts`) defaults a type-allowed-but-runner-impossible `invoked: true, exitCode: undefined` to success; both language runners always return an exit code when invoked, so the fallback never fires today.

**Resolution:** narrow `TestRunInvocation` to a discriminated union (`{ invoked: true; exitCode: number } | { invoked: false }`) and update both runner implementations (`src/testing/languages/{typescript,python}.ts`); this statically enforces the invariant and removes the `?? SUCCESS_EXIT_CODE` fallback. Cross-node — touches the descriptor contract and both runners.

**Evidence:** CI changes review on PR-2c; `src/testing/languages/types.ts` `TestRunInvocation`; `src/commands/testing/dispatch.ts` outcome construction.

## FOLLOW-UP: the testing language descriptor delegates detection to the composition root

`TestingLanguageDescriptor` (`src/testing/languages/types.ts`) delegates presence detection to an agnostic `isLanguagePresent(projectRoot)` in the injected dependencies rather than owning a detector. Because the descriptor carries no detection of its own, the CLI composition root maps each language to its concrete detector through a name-keyed table (`PRESENCE_BY_LANGUAGE_NAME` in `src/interfaces/cli/testing.ts`). Orchestration (`runTests`) stays registry-driven and names no language, so the table is boundary wiring, not an orchestration-layer language reference — but the mapping only exists because detection lives outside the descriptor. While the table exists, `spx/19-language-registration.adr.md`'s invariant — adding a language touches one descriptor module plus one registry entry and no other files — is not fully met, because a third language also needs a `PRESENCE_BY_LANGUAGE_NAME` entry in the CLI.

**Resolution:** move detection onto the descriptor (a `detect`/`isPresent` member or a detection marker on `TestingLanguageDescriptor`), implement it in `src/testing/languages/{typescript,python}.ts`, and replace the CLI's name-keyed table with `descriptor`-driven detection — eliminating the language-name lookup at the boundary.

**Evidence:** local changes review on PR-2a (F-001); `src/interfaces/cli/testing.ts` `PRESENCE_BY_LANGUAGE_NAME`; the descriptor contract `src/testing/languages/types.ts`.

## FOLLOW-UP: testing runner contract names the root `projectRoot`, not `productDir`

`TestRunRequest.projectRoot` and `TestRunnerDependencies.isLanguagePresent(projectRoot)` (`src/testing/languages/types.ts`) name the repository root with the deprecated term; `CLAUDE.md` prefers `productDir` for root-directory APIs. The dispatch and CLI already speak `productDir` and map it onto the descriptor's `projectRoot` field at the call boundary.

**Resolution:** when the descriptor contract is next edited, rename `projectRoot` to `productDir` across `TestRunRequest`, both language descriptors, the dispatch, the CLI, and the runner harnesses and generators.

**Evidence:** local changes review on PR-2a (F-003); `CLAUDE.md` product-directory vocabulary rule; `src/testing/languages/types.ts`.

## FOLLOW-UP: extract shared runner test-infra when a third language is added

The recording command runner (`createRecordingCommandRunner` and the `RecordingCommandRunner` interface) is duplicated between `testing/harnesses/testing/python-runner.ts` and `testing/harnesses/testing/typescript-runner.ts`, and the runner generators (`testing/generators/testing/python-runner.ts` and `…/typescript-runner.ts`) redeclare the same spec-tree path constants (`SPEC_ROOT`, `TESTS_DIR`, `NODE_SUFFIX`, the node-index and path-count bounds). Both operate purely on the shared `TestingLanguageDescriptor` contract (`src/testing/languages/types.ts`), so the structure is identical across languages. With two language runners the parallel structure is the cheaper choice; a third runner makes the duplication worth extracting and risks silent divergence.

**Resolution:** when a third language testing descriptor is added, extract the shared recording command runner to `testing/harnesses/testing/language-runner.ts` and the shared generator constants to `testing/generators/testing/language-runner.ts`, and re-point every language runner harness and generator — and the dispatch-level tests (`spx/41-testing.enabler/tests/testing.scenario.l1.test.ts` and `tests/execution-recording.scenario.l1.test.ts`), which import `createRecordingCommandRunner` from the typescript-runner harness — at the shared module.

**Evidence:** spec-tree-review on PR #69; the shared contract `src/testing/languages/types.ts` both runners conform to.
