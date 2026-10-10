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

**Resolution:** decide the zero-outcome status semantics (a distinct status, or a documented vacuous-pass contract justified by coverage-gating) and amend [`spx/41-test.enabler/71-execution-recording.adr.md`](spx/41-test.enabler/71-execution-recording.adr.md) accordingly, with a recording test for the empty-outcome path. In the same pass, decide whether `runNodeCommand` should reject a `nodePath` that matches no discovered file — distinct from a matched node whose runner is gated out by absent-language detection — rather than silently recording an empty run.

**Evidence:** local changes review on PR-2c; `src/commands/test/run-command.ts` `deriveStatus` and `runNodeCommand`; `src/test/run-state.ts` `selectLatestTerminalTestRunForNode` coverage gating.

## FOLLOW-UP: a failed dispatch orphans the reserved run file

`runTestsCommand` and `runNodeCommand` reserve the run file (`createTestRunFile`) before dispatch so `startedAt` marks the run's start. If `runTests` throws after reservation, the file is left empty. `readTestingRuns` classifies it as an incomplete run, so it never corrupts the read path, but repeated dispatch failures accumulate stale empty files under `.spx/worktree/test/runs/`.

**Resolution:** either defer run-file creation until dispatch succeeds (accepting a later `startedAt`), or add a cleanup path that prunes incomplete run files; decide alongside the terminal-write-protocol's lifecycle in [`spx/41-test.enabler/43-last-run-evidence.enabler/32-terminal-write-protocol.adr.md`](spx/41-test.enabler/43-last-run-evidence.enabler/32-terminal-write-protocol.adr.md).

**Evidence:** local changes review on PR-2c; `src/commands/test/run-command.ts` `reserveRunFile`; `src/test/run-state.ts` `readTestingRuns` incomplete-run classification.

## FOLLOW-UP: covered-content reads are serial

`readCoveredContents` (`src/commands/test/run-command.ts`) reads each covered test file with a serial `await` in a `for` loop. For a full-suite run over a large spec tree this is O(n) sequential I/O; concurrent reads would cut wall-clock time.

**Resolution:** read the covered files concurrently (e.g. `Promise.all` over the mapped reads) when the file count justifies it, benchmarked against a realistic tree; weigh against the product's <100ms CLI-latency target in `spx/spx.product.md`.

**Evidence:** local changes review on PR-2c; `src/commands/test/run-command.ts` `readCoveredContents`.

## FOLLOW-UP: the recording command runner is declared once per language harness

`createRecordingCommandRunner` and an interface named `RecordingCommandRunner` are declared in both `testing/harnesses/testing/python-runner.ts` and `testing/harnesses/testing/typescript-runner.ts`, and `testing/harnesses/testing/recording-command-runner.ts` declares a third `RecordingCommandRunner` interface for the shared drive. Each language copy records the commands its runner constructs and returns a configured exit code over the shared `TestingLanguageDescriptor` contract (`src/test/languages/types.ts`), so the structure is identical across languages. With two language runners the parallel structure is the cheaper choice; a third runner makes the duplication worth extracting and risks silent divergence.

The consumers import the factory from the language harness that matches their subject:

- `@testing/harnesses/testing/typescript-runner`: `spx/41-test.enabler/tests/execution-recording.scenario.l1.test.ts`, `spx/41-test.enabler/43-last-run-evidence.enabler/tests/passing-scope.compliance.l1.test.ts`, `spx/41-test.enabler/90-targeted-execution.enabler/tests/targeted-execution.scenario.l1.test.ts`, `spx/41-test.enabler/90-targeted-execution.enabler/tests/targeted-execution.compliance.l1.test.ts`, `spx/41-test.enabler/21-typescript-test.enabler/32-test-harness.enabler/tests/test-harness.property.l1.test.ts`, and the harness modules `testing/harnesses/testing/test-scenarios.ts`, `testing/harnesses/testing/execution-recording-scenarios.ts`, and `testing/harnesses/node-status/node-status.ts`.
- `@testing/harnesses/testing/python-runner`: `spx/41-test.enabler/21-python-test.enabler/32-test-harness.enabler/tests/test-harness.property.l1.test.ts`.

**Resolution:** when a third language testing descriptor is added, extract one recording command runner and its interface into a shared harness module, declare the factory type of `testing/harnesses/testing/recording-command-runner.ts` against it, and re-point every language runner harness and every importer listed above at the shared module.

**Already shared:** the spec-tree path constants (`SPEC_ROOT`, `TESTS_DIR`, `NODE_SUFFIX`, the node-index, depth, and path-count bounds) and the exit-code, presence, and neighbour-report arbitraries live once in `testing/generators/testing/runner-paths.ts`, which `testing/generators/testing/python-runner.ts` and `testing/generators/testing/typescript-runner.ts` import. The simulated report and the reported-entries and neighbour-report scenario construction live once in `testing/harnesses/testing/simulated-report.ts`, which `testing/harnesses/testing/python-runner.ts` and `testing/harnesses/testing/typescript-runner.ts` wrap.

**Recording-runner observation already shared:** the parallel recording-runner *drive* is extracted to `testing/harnesses/testing/recording-command-runner.ts` (`observeRecordingCommandRunner`) with its invocation domain in `testing/generators/testing/recording-command-runner.ts`, consumed by the python and typescript runner test-harness nodes whose linked property tests own the predicates over that observation. Only the shared drive was lifted, parametrized by each language's factory and source-owned generators; the two `createRecordingCommandRunner` source copies stay parallel.

**Evidence:** `testing/harnesses/testing/python-runner.ts`, `testing/harnesses/testing/typescript-runner.ts`, and `testing/harnesses/testing/recording-command-runner.ts`; `testing/generators/testing/runner-paths.ts`; `testing/harnesses/testing/simulated-report.ts`; the shared contract `src/test/languages/types.ts` both runners conform to.

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
[`spx/21-infrastructure.enabler/43-precommit.enabler/60-deps-install-on-checkout.adr.md`](spx/21-infrastructure.enabler/43-precommit.enabler/60-deps-install-on-checkout.adr.md)
closes that gap: every checkout that changes the lockfile re-installs in that
worktree.

**Tracking classification:** Resolved. Originally a tracked deferral chosen by the
operator for the broader package-manager setup issue during agent test-output
feature work on June 17, 2026.

**Evidence:** [`spx/21-infrastructure.enabler/43-precommit.enabler/60-deps-install-on-checkout.adr.md`](spx/21-infrastructure.enabler/43-precommit.enabler/60-deps-install-on-checkout.adr.md);
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
missing targeted-test surface into repository-wide resource contention and
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

## Four test files register their cases from harness modules instead of owning the assertion flow

`tests/test.scenario.l1.test.ts`, `tests/test.mapping.l1.test.ts`, and `tests/test.property.l1.test.ts` each contain one `registerHarnessTestCases(...)` call and no `describe`, `it`, or `expect`. `tests/execution-recording.scenario.l1.test.ts` makes the same call for the cases of its spec scenarios beside one executed `describe` block. The cases, with their predicates, expected values, and fixtures, live in `testing/harnesses/testing/test-scenarios.ts`, `testing/harnesses/testing/test-mapping.ts`, `testing/harnesses/testing/test-properties.ts`, and `testing/harnesses/testing/execution-recording-scenarios.ts`. This is the class [`spx/ISSUES.md`](spx/ISSUES.md) records under "Test assertion flow lives in harnesses instead of executed test files", which [`spx/12-test-infrastructure.adr.md`](spx/12-test-infrastructure.adr.md) rules out.

**Impact:** The node's `tests/` directory holds registration calls where the spec links expect the evidence, so a reader of a linked test file sees none of the predicates it proves, and the test-evidence audit judges predicate ownership in harness code.

**Scope:** The registered cases of the four files; the per-file verdict scenario in `tests/execution-recording.scenario.l1.test.ts` keeps its `describe`, `it`, and `expect` in the executed file and is unaffected. This changeset leaves the register calls and the harness modules unchanged.

**Resolution:** move each registered case's behavioral predicates into the executed test callbacks, keep fixtures and resource lifecycle in the harness, and retire the register calls as each file converts, then re-run this node's tests and its test-evidence audit.

## A test file whose tests were all skipped or pending receives a different verdict from each language adapter

The per-file verdict rule of [`spx/41-test.enabler/43-last-run-evidence.enabler/11-last-run-file.adr.md`](spx/41-test.enabler/43-last-run-evidence.enabler/11-last-run-file.adr.md) defines `passed` as every test in the file passing, `failed` as any test failing or the file failing to run, and `not-run` as the report omitting the path. A file in which every test was skipped or pending falls under none of the three. The adapters resolve it differently. The TypeScript adapter in `src/test/languages/typescript.ts` records `passed` and `failed` from Vitest's reported file status and `not-run` for any other status, so such a file is `not-run`. The Python adapter in `src/test/languages/python.ts` records `failed` when any JUnit test case failed and `passed` otherwise, so such a file is `passed`.

**Impact:** The same condition yields `passed` for a Python test reference and `not-run` for a TypeScript one, so a node's status reads differently by language for equivalent evidence. A Python reference whose tests all skipped reads as proven.

**Scope:** The verdict a skipped-only or pending-only file receives in `src/test/languages/typescript.ts` and `src/test/languages/python.ts`, and the per-file verdict rule of the record named above. The changeset that introduced per-path verdicts leaves both adapters unchanged for this case.

**Resolution:** outcomeeng/changes#422 decides the rule for such a file. Amend the record named above with that rule, align both adapters to it, and add a case per adapter for a file whose tests are all skipped or pending.

**Evidence:** `src/test/languages/typescript.ts` `reportedFileVerdicts` and `verdictForPath`; `src/test/languages/python.ts` `pathVerdictsFromReport`.
