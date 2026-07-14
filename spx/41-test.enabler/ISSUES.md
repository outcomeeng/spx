# Issues: Test

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

`deriveStatus` in `src/commands/test/run-command.ts` derives status with `outcomes.every(exitCode === SUCCESS_EXIT_CODE)`, so a run that dispatches no runner (no test files discovered, or every matching runner gated out by absent-language detection) records `status: passed` by vacuous truth. A zero-outcome run's `runnerOutcomes` cover no evidence reference, so `selectLatestTerminalTestRunForNode` never selects it. The vacuous `passed` misleads any consumer that reads `state.status` directly without coverage-gating.

**Resolution:** decide the zero-outcome status semantics (a distinct status, or a documented vacuous-pass contract justified by coverage-gating) and amend `spx/41-test.enabler/71-execution-recording.adr.md` accordingly, with a recording test for the empty-outcome path. In the same pass, decide whether `runNodeCommand` should reject a `nodePath` that matches no discovered file — distinct from a matched node whose runner is gated out by absent-language detection — rather than silently recording an empty run.

**Evidence:** local changes review on PR-2c; `src/commands/test/run-command.ts` `deriveStatus` and `runNodeCommand`; `src/test/run-state.ts` `selectLatestTerminalTestRunForNode` coverage gating.

## FOLLOW-UP: a failed dispatch orphans the reserved run file

`runTestsCommand` and `runNodeCommand` reserve the run file (`createTestRunFile`) before dispatch so `startedAt` marks the run's start. If `runTests` throws after reservation, the file is left empty. `readTestingRuns` classifies it as an incomplete run, so it never corrupts the read path, but repeated dispatch failures accumulate stale empty files under `.spx/worktree/test/runs/`.

**Resolution:** either defer run-file creation until dispatch succeeds (accepting a later `startedAt`), or add a cleanup path that prunes incomplete run files; decide alongside the terminal-write-protocol's lifecycle in `spx/41-test.enabler/43-last-run-evidence.enabler/32-terminal-write-protocol.adr.md`.

**Evidence:** local changes review on PR-2c; `src/commands/test/run-command.ts` `reserveRunFile`; `src/test/run-state.ts` `readTestingRuns` incomplete-run classification.

## FOLLOW-UP: covered-content reads are serial

`readCoveredContents` (`src/commands/test/run-command.ts`) reads each covered test file with a serial `await` in a `for` loop. For a full-suite run over a large spec tree this is O(n) sequential I/O; concurrent reads would cut wall-clock time.

**Resolution:** read the covered files concurrently (e.g. `Promise.all` over the mapped reads) when the file count justifies it, benchmarked against a realistic tree; weigh against the product's <100ms CLI-latency target in `spx/spx.product.md`.

**Evidence:** local changes review on PR-2c; `src/commands/test/run-command.ts` `readCoveredContents`.

## FOLLOW-UP: extract shared runner test-infra when a third language is added

The recording command runner (`createRecordingCommandRunner` and the `RecordingCommandRunner` interface) is duplicated between `testing/harnesses/testing/python-runner.ts` and `testing/harnesses/testing/typescript-runner.ts`, and the runner generators (`testing/generators/testing/python-runner.ts` and `…/typescript-runner.ts`) redeclare the same spec-tree path constants (`SPEC_ROOT`, `TESTS_DIR`, `NODE_SUFFIX`, the node-index and path-count bounds). Both operate purely on the shared `TestingLanguageDescriptor` contract (`src/test/languages/types.ts`), so the structure is identical across languages. With two language runners the parallel structure is the cheaper choice; a third runner makes the duplication worth extracting and risks silent divergence.

**Resolution:** when a third language testing descriptor is added, extract the shared recording command runner to `testing/harnesses/testing/language-runner.ts` and the shared generator constants to `testing/generators/testing/language-runner.ts`, and re-point every language runner harness and generator — and the dispatch-level tests (`spx/41-test.enabler/tests/test.scenario.l1.test.ts` and `tests/execution-recording.scenario.l1.test.ts`), which import `createRecordingCommandRunner` from the typescript-runner harness — at the shared module.

**Test-contract assertion already shared:** the parallel recording-runner *contract test* is extracted to `testing/harnesses/testing/recording-command-runner.ts` (`assertRecordingCommandRunnerContract`), consumed by the python and typescript runner test-harness nodes, so SonarCloud sees no duplicated test block on new code. The two `createRecordingCommandRunner` *source* copies stay parallel until the third language — only the shared assertion was lifted, parametrized by each language's factory and source-owned generators.

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

**Resolution (decided):** the policy is to keep every worktree's dependencies
installed, not to avoid pnpm. A worktree whose `node_modules` matches the
lockfile runs `pnpm exec` and `pnpm run` gates cleanly — no dependency repair,
no `prepare`/install-hooks cascade, no `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.
The root cause was that pool worktrees drift stale: dependency install on a
lockfile change fired only on `post-merge` and `post-rewrite` (pull/rebase), so a
worktree parked at a new commit through `git switch` or `git worktree add` (which
fire `post-checkout`) never re-installed. The post-checkout install gate
`spx/21-infrastructure.enabler/43-precommit.enabler/60-deps-install-on-checkout.adr.md`
closes that gap: every checkout that changes the lockfile re-installs in that
worktree.

**Tracking classification:** Resolved. Originally a tracked deferral chosen by the
operator for the broader package-manager setup issue during agent test-output
feature work on June 17, 2026.

**Evidence:** `spx/21-infrastructure.enabler/43-precommit.enabler/60-deps-install-on-checkout.adr.md`;
`spx/21-infrastructure.enabler/43-precommit.enabler/precommit.md`; `lefthook.yml`
`post-checkout` command; `src/lib/precommit/deps-install-gate.ts`.

**Skills:** `spec-tree:contextualize`, `spec-tree:apply`,
`typescript:code-typescript`, `typescript:test-typescript`,
`typescript:audit-typescript-tests`, and
`typescript:audit-typescript`.

## RESOLVED: `spx test` owns focused and changed-set verification

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
missing targeted-test surface into product-wide resource contention and
review-loop latency. The product needs a first-class targeted path so agents can
verify the files or node they changed without exercising unrelated tests on every
iteration.

**Original target:** add explicit target operands after `--` to `spx test` and
`spx test passing`. Resolve each operand as either a node path whose co-located
tests should run or a concrete test file path, route the selected tests through
the existing testing registry, preserve passing-scope behavior for `passing`,
and keep `--agent` output/artifact handling on the same selected set. The
targeted path should be the expected agent verification command for iterative
push-readiness work; the full package suite should remain an explicit broad gate,
not the only product-owned way to obtain trustworthy test evidence.

**Resolution:** explicit target operands are available through `spx test
spx/<node>` and `spx test spx/<node>/tests/<file>`. Selective changeset testing
is available through `spx test --changed [--base <ref>]`, which resolves changed
spec or test files by node path and changed source files through registered
language adapters. The product `CLAUDE.md` running-tests STOP TRIGGER documents
`spx test --changed [--base origin/main]` as the focused agent verification path.
The remaining raw-Vitest package script (`pnpm run build && vitest run`) is the
deliberate broad full-suite gate covered by the running-tests STOP TRIGGER,
alongside the human `test:coverage` and `test:watch` scripts.

**Evidence:** agent-output feature work on June 18, 2026 used direct Vitest
before explicit target operands and changed-set planning were present. The
operator reported the full suite taking about 45 seconds idle and about 20
minutes under load 200, with multiple agents repeatedly running the full suite
during PR push loops. A second agent review called out the absent
`--changed`/`--base` planner and package-script non-dogfooding.

**Tracking classification:** Resolved for focused local verification. The
full-suite package script remains a deliberate broad gate.

**Skills:** `spec-tree:contextualize`, `spec-tree:apply`,
`typescript:code-typescript`, `typescript:test-typescript`,
`typescript:audit-typescript-tests`, and
`typescript:audit-typescript`.
