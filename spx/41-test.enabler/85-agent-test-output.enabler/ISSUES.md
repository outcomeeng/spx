# Issues: Agent Test Output

## Linked tests delegate their predicates to harness functions

The linked test files call exported functions of `testing/harnesses/testing/agent-test-output.ts`; each function owns every `expect()` call and the pass or fail predicate for its claim, and the linked test body only calls it. This is the class [`spx/ISSUES.md`](spx/ISSUES.md) records under "Test assertion flow lives in harnesses instead of executed test files", which [`spx/12-test-infrastructure.adr.md`](spx/12-test-infrastructure.adr.md) rules out.

The functions in this shape, linked from `tests/agent-test-output.scenario.l1.test.ts`: `expectAgentSummaryReportsPassingCountsAndArtifacts`, `expectAgentSummaryReportsNoRunnerReportsAsFailure`, `expectAgentSummaryReportsUnreportedGroupWhenAnotherRunnerFails`, `expectAgentSummaryReportsUnreportedGroupWhenReportedRunnersPass`, `expectAgentModeNoRunnerReportsExitCode`, `expectAgentSummaryReportsUnmatchedPaths`, `expectAgentSummaryReportsUnresolvedTargets`, and `expectAgentSummaryReportsUnresolvedChangedSources`.

The functions in this shape, linked from `tests/agent-test-output.compliance.l1.test.ts`: `expectAgentOutputCapturesStreamsAndEnv`, `expectAgentOutputPreservesCommandAndArgs`, `expectAgentArtifactDirectoryCreationDeferred`, `expectAgentOutputArtifactWriteFailure`, and `expectAgentOutputKeepsChildStreamsOffTerminal`.

The failing-runner scenarios follow the settled shape: the harness exports the observation functions `observeFailingRunnerWithReportedFailingPath`, `observeFailingRunnerWithoutFailureMetadata`, and `observeFailingRunnerWithEmptyFailureMetadata`, and `tests/agent-test-output.scenario.l1.test.ts` owns the predicates over each observation.

No assertion checks that artifact directories exist after a runner command executes. The compliance claim that agent-output runner execution creates artifact directories only when a runner command executes is exercised for its negative half alone, through `expectAgentArtifactDirectoryCreationDeferred`.

**Evidence:** test-evidence audits of this node returned `REJECTED` twice on the changeset merged as PR 648. The first audit raised `f-001`, `f-003`, `f-004`, and `f-006` to `f-014`, and `f-012` states the missing directory-exists assertion. The second audit raised `f-001`, `f-003`, `f-004`, and `f-006` to `f-014`.

**Impact:** the node's `tests/` files carry no predicate for these claims, so a reader of a linked test sees none of what it proves, and the test-evidence audit judges predicate ownership in harness code.

**Scope:** the thirteen functions named above and the linked test callbacks that call them, together with the creation clause of the compliance assertions. The failing-runner scenarios and their observation functions are outside it.

**Settlement condition:** each listed function returns observations or a handle, the linked test callbacks own the predicates, the directory-exists half of the creation clause has an assertion, and a new test-evidence audit of the node raises no predicate-ownership finding.

## Harness checks copy summary label literals

`testing/harnesses/testing/agent-test-output.ts` asserts the string literals `"skippedTests"`, `"unmatched"`, `"unresolvedTargets"`, and `"unresolvedChangedSourceFiles"`, in `expectAgentSummaryReportsUnreportedGroupWhenAnotherRunnerFails`, `expectAgentSummaryReportsUnmatchedPaths`, `expectAgentSummaryReportsUnresolvedTargets`, and `expectAgentSummaryReportsUnresolvedChangedSources`. `AGENT_TEST_OUTPUT_TEXT` in `src/interfaces/cli/test-agent-output.ts` owns `SKIPPED_TESTS`, `UNMATCHED`, `UNRESOLVED_TARGETS`, and `UNRESOLVED_CHANGED_SOURCE_FILES`, and sibling checks in the same harness file import the constant.

The unmatched check asserts the bare label word with `toContain`, not that the path is listed under it.

**Evidence:** the second test-evidence audit's `f-005` and `f-006`; the first audit's `f-005` to `f-008`.

**Impact:** a label rename in production leaves these checks green or fails them for the wrong reason, and a path printed outside its label satisfies the unmatched check.

**Scope:** the four checks named above and any other literal copy of a summary label under `testing/`.

**Settlement condition:** the checks import `AGENT_TEST_OUTPUT_TEXT`, assert each path under its label, and no literal copy of a label remains in `testing/`.

## The summary does not distinguish a runner whose output capture failed

When artifact writing fails, `runCapturedCommand` in `src/interfaces/cli/test-runner-deps.ts` resolves a result with a non-zero exit code and no output field. `formatAgentTestOutput` in `src/interfaces/cli/test-agent-output.ts` then prints the runner, the exit code, the requested path count, and the line stating that no failed test paths were reported, with no stdout or stderr lines. It prints the same text for a runner that reported no failed paths and whose artifacts exist. A reader cannot tell "the runner reported no failed paths" from "capture failed and nothing is known".

[`spx/41-test.enabler/11-test-runner-environments.pdr.md`](spx/41-test.enabler/11-test-runner-environments.pdr.md) and `agent-test-output.md` do not state the case; their scenarios assume artifacts exist, and the compliance assertion says only that runner execution fails without artifact paths when artifact writing fails. The only test that builds a failing report without an output field asserts that the failing path is absent and never checks the text printed.

**Evidence:** the CI review of PR 648.

**Impact:** a failed capture reads as a clean runner report, so an agent reading the summary concludes that the runner named no failed paths when nothing about the run is known.

**Scope:** the summary text for a failing runner without an output field in `src/interfaces/cli/test-agent-output.ts`, the failing-runner scenarios of the decision and the node spec named above, and the tests of that text.

**Settlement condition:** the summary names a runner whose output capture failed distinctly from a runner that reported no failed paths, the decision and the node spec each state a scenario for both cases, and the tests assert each text.

## The node's evidence chain is not fully read by its audit

The second test-evidence audit could not read the production and shared modules the node's evidence chain imports: `src/lib/process-lifecycle`, `src/test/run-state.ts`, `src/test/languages`, `src/commands/test`, `src/domains/test`, `src/lib/test-targeting`, `src/lib/spec-tree`, `src/validation/steps/subprocess-output`, and `testing/generators/literal/snippets.ts`. The audit names no defect in these modules; the completeness of the chain is unjudged.

**Evidence:** the second test-evidence audit's `f-015`.

**Impact:** a green audit of this node does not cover the chain.

**Scope:** the modules named above as the node's evidence chain.

**Settlement condition:** a test-evidence audit of the node reads the whole chain and reports its completeness.
