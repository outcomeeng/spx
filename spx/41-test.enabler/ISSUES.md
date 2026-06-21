# Issues: Testing

Coordination notes for the `spx test` enabler. The `spx test` command, the registry-based dispatch, passing-scope filtering, last-run evidence recording, and the registry-based per-node run are built and proven (`tests/execution-recording.scenario.l1.test.ts`, `tests/test.scenario.l1.test.ts`), so `41-test.enabler` participates in the quality gate and is no longer listed in `spx/EXCLUDE`.

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
`spx/41-test.enabler/test.md`;
`spx/41-test.enabler/tests/execution-recording.scenario.l1.test.ts`;
`spx/41-test.enabler/32-test-config.enabler/tests/test-config.compliance.l1.test.ts`.

## FOLLOW-UP: a zero-outcome run records a vacuous `passed` status

`deriveStatus` in `src/commands/test/run-command.ts` derives status with `outcomes.every(exitCode === SUCCESS_EXIT_CODE)`, so a run that dispatches no runner (no test files discovered, or every matching runner gated out by absent-language detection) records `status: passed` by vacuous truth. The status is not consumed today: a zero-outcome run's `runnerOutcomes` cover no node, so `selectLatestTerminalTestRunForNode` never selects it and the status-delegation resolver treats the node as absent and re-runs. The vacuous `passed` only misleads a consumer that reads `state.status` directly without coverage-gating.

**Resolution:** when the status-delegation resolver lands (unit 3), decide the zero-outcome status semantics (a distinct status, or a documented vacuous-pass contract justified by coverage-gating) and amend `spx/41-test.enabler/71-execution-recording.adr.md` accordingly, with a recording test for the empty-outcome path. In the same pass, decide whether `runNodeCommand` should reject a `nodePath` that matches no discovered file — distinct from a matched node whose runner is gated out by absent-language detection — rather than silently recording an empty run, which only re-fires the resolver's per-node run.

**Evidence:** local changes review on PR-2c; `src/commands/test/run-command.ts` `deriveStatus` and `runNodeCommand`; `src/test/run-state.ts` `selectLatestTerminalTestRunForNode` coverage gating.

## FOLLOW-UP: a failed dispatch orphans the reserved run file

`runTestsCommand` and `runNodeCommand` reserve the run file (`createTestRunFile`) before dispatch so `startedAt` marks the run's start. If `runTests` throws after reservation, the file is left empty. `readTestingRuns` classifies it as an incomplete run, so it never corrupts the read path, but repeated dispatch failures accumulate stale empty files under `.spx/worktree/test/runs/`.

**Resolution:** either defer run-file creation until dispatch succeeds (accepting a later `startedAt`), or add a cleanup path that prunes incomplete run files; decide alongside the terminal-write-protocol's lifecycle in `spx/41-test.enabler/43-last-run-evidence.enabler/32-terminal-write-protocol.adr.md`.

**Evidence:** local changes review on PR-2c; `src/commands/test/run-command.ts` `reserveRunFile`; `src/test/run-state.ts` `readTestingRuns` incomplete-run classification.

## FOLLOW-UP: covered-content reads are serial

`readCoveredContents` (`src/commands/test/run-command.ts`) reads each covered test file with a serial `await` in a `for` loop. For a full-suite run over a large spec tree this is O(n) sequential I/O; concurrent reads would cut wall-clock time.

**Resolution:** read the covered files concurrently (e.g. `Promise.all` over the mapped reads) when the file count justifies it, benchmarked against a realistic tree; weigh against the product's <100ms CLI-latency target in `spx/spx.product.md`.

**Evidence:** local changes review on PR-2c; `src/commands/test/run-command.ts` `readCoveredContents`.

## FOLLOW-UP: testing runner contract names the root `projectRoot`, not `productDir`

`TestRunRequest.projectRoot` and `TestRunnerDependencies.isLanguagePresent(projectRoot)` (`src/test/languages/types.ts`) name the repository root with the deprecated term; `CLAUDE.md` prefers `productDir` for root-directory APIs. The dispatch and CLI already speak `productDir` and map it onto the descriptor's `projectRoot` field at the call boundary.

**Resolution:** when the descriptor contract is next edited, rename `projectRoot` to `productDir` across `TestRunRequest`, both language descriptors, the dispatch, the CLI, and the runner harnesses and generators.

**Evidence:** local changes review on PR-2a (F-003); `CLAUDE.md` product-directory vocabulary rule; `src/test/languages/types.ts`.

## FOLLOW-UP: extract shared runner test-infra when a third language is added

The recording command runner (`createRecordingCommandRunner` and the `RecordingCommandRunner` interface) is duplicated between `testing/harnesses/testing/python-runner.ts` and `testing/harnesses/testing/typescript-runner.ts`, and the runner generators (`testing/generators/testing/python-runner.ts` and `…/typescript-runner.ts`) redeclare the same spec-tree path constants (`SPEC_ROOT`, `TESTS_DIR`, `NODE_SUFFIX`, the node-index and path-count bounds). Both operate purely on the shared `TestingLanguageDescriptor` contract (`src/test/languages/types.ts`), so the structure is identical across languages. With two language runners the parallel structure is the cheaper choice; a third runner makes the duplication worth extracting and risks silent divergence.

**Resolution:** when a third language testing descriptor is added, extract the shared recording command runner to `testing/harnesses/testing/language-runner.ts` and the shared generator constants to `testing/generators/testing/language-runner.ts`, and re-point every language runner harness and generator — and the dispatch-level tests (`spx/41-test.enabler/tests/test.scenario.l1.test.ts` and `tests/execution-recording.scenario.l1.test.ts`), which import `createRecordingCommandRunner` from the typescript-runner harness — at the shared module.

**Evidence:** spec-tree-review on PR #69; the shared contract `src/test/languages/types.ts` both runners conform to.

## FOLLOW-UP: pnpm script gates can enter dependency repair before the requested command

During test-suite agent-output research and verification on June 17, 2026,
package-manager entrypoints failed before reaching the requested tool. A local
runner probe failed before invoking Vitest:

```bash
pnpm exec vitest --help
```

```text
[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] Aborted removal of modules directory due to no TTY
```

The direct local binary succeeded:

```bash
./node_modules/.bin/vitest --help
```

and reported `vitest/4.1.8` with `--reporter`, `--outputFile`,
`--silent`, `--hideSkippedTests`, `--changed`, and `--bail`.

The package build gate later failed the same way through a package script:

```bash
pnpm run build
```

```text
[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] Aborted removal of modules directory due to no TTY
```

With `CI=1`, pnpm recreated `node_modules` and then failed in `prepare` while
Lefthook tried to replace a hook under the shared git directory:

```text
Error: could not replace the hook: remove /Users/shz/Code/outcomeeng/spx/spx.git/hooks/post-rewrite: operation not permitted
```

**Impact:** agent-run verification that shells through pnpm can fail before the
requested test, build, or validation tool starts, producing package-manager setup
output rather than evidence for the command the agent intended to run. The
agent-output testing path preserves the descriptor-selected command, so
TypeScript `spx test --agent` still uses the `pnpm exec vitest` adapter path
until runner-adapter policy changes; package-script gates can hit the same
dependency repair path.

**Resolution:** decide a package-script verification policy for non-interactive
agents: either keep using pnpm with a configured non-interactive install/hook
policy, or document direct local-binary equivalents for gates that do not require
pnpm script semantics. The policy must preserve the requested command's evidence
without package-manager setup output taking over the run.

**Tracking classification:** Tracked deferral, chosen by the operator for the
broader package-manager setup issue during agent test-output feature work on
June 17, 2026.

**Revisit condition:** fix before documenting agent package-script gates or
requiring agents to run `pnpm run build`, `pnpm run test`, or `pnpm run
publish:check` as their default verification entrypoints.

**Skills:** `spec-tree:contextualize`, `spec-tree:apply`,
`typescript:code-typescript`, `typescript:test-typescript`,
`typescript:audit-typescript-tests`, and
`typescript:audit-typescript`.

## FOLLOW-UP: `spx test` lacks explicit target arguments

Agents expect focused verification through the product CLI, for example:

```bash
spx test passing -- spx/10-my-feature.enabler
```

The live `spx test` command discovers every `spx/**/tests/` file and optionally
applies the configured `testing.passingScope`; it does not accept explicit
caller-supplied node or test-file paths. The testing command already has a
registry-based per-node run surface for status consumers, and
`spx/17-file-inclusion.enabler/file-inclusion.md` declares that explicit caller
paths bypass normal filters, but that explicit-path contract is not exposed on
the `spx test` CLI. Agents therefore fall back to direct runner commands such as
`./node_modules/.bin/vitest run <test files>` for focused checks, bypassing the
agent-output path whose behavior they are trying to verify.

**Impact:** the full package suite is too slow for every agent iteration.
On an idle machine it takes roughly 45 seconds; under high load it can stretch to
about 20 minutes. Parallel PR work multiplies that cost: each agent repeatedly
runs the full suite during every push-readiness loop. A ten-agent workload turns a
missing targeted-test surface into repository-wide resource contention and
review-loop latency. The product needs a first-class targeted path so agents can
verify the files or node they changed without exercising unrelated tests on every
iteration.

**Resolution:** add explicit target operands after `--` to `spx test` and
`spx test passing`. Resolve each operand as either a node path whose co-located
tests should run or a concrete test file path, route the selected tests through
the existing testing registry, preserve passing-scope behavior for `passing`,
and keep `--agent` output/artifact handling on the same selected set. The
targeted path should be the expected agent verification command for iterative
push-readiness work; the full package suite should remain an explicit broad gate,
not the only product-owned way to obtain trustworthy test evidence.

**Additional gaps to close in the same area:**

- Selective changeset testing: `spx test passing` means configured passing scope,
  not tests affected by the current diff. The product has no `spx test --changed`,
  no `--base origin/main`, no planner from changed files to affected nodes or test
  files, and no product-owned Vitest `--related` integration through `spx`.
- Dogfooding: package scripts and CI still use raw Vitest through `pnpm test`
  (`pnpm run build && vitest run`) rather than `spx test`, so the product-owned
  test verb exists without owning the default local or CI verification path.

**Evidence:** agent-output feature work on June 18, 2026; targeted verification
used direct Vitest because `spx test --agent` has no explicit-target CLI. The
operator reported the full suite taking about 45 seconds idle and about 20
minutes under load 200, with multiple agents repeatedly running the full suite
during PR push loops. A second agent review called out the absent
`--changed`/`--base` planner and package-script and CI non-dogfooding.

**Revisit condition:** fix before documenting `spx test --agent` as the default
focused verification command for agents.

**Skills:** `spec-tree:contextualize`, `spec-tree:apply`,
`typescript:code-typescript`, `typescript:test-typescript`,
`typescript:audit-typescript-tests`, and
`typescript:audit-typescript`.
