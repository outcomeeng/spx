# Issues: record run

## Record-run evidence takes its rejection oracle and assertion code from the shared verification harness

**Evidence:** test-evidence audit run 1 of this node at
`65e35d2b15b8ca92dd8afdc0ee5f4b95bf67d272` returned `REJECTED`. Two of its
findings fall on `testing/harnesses/verify/harness.ts`, at lines outside the
`origin/main..HEAD` diff of that head:

- Class: harness-owned expected diagnostic token. `observeRejectedVerificationArgs`
  takes an `expectedDiagnosticToken` parameter, and
  `observeVerificationLifecycleOutsideRunRejection` and
  `observeNonNounLocalEvidenceRejection` each choose the token. The observation
  returns the token beside `stderr`, so the two rejection cases of
  `tests/record-run.compliance.l1.test.ts` — "rejects a caller-driven lifecycle
  verb outside the verification run noun group" and "rejects every
  non-noun-local evidence command" — assert `stderr` against an expected value
  the harness supplies rather than one the test derives.
- Class: assertion code in test infrastructure. The module imports `expect`
  from `vitest`, and five test files of this node import it directly:
  `tests/file-scope.mapping.l1.test.ts`, `tests/record-run.compliance.l1.test.ts`,
  `tests/verifier.scenario.l1.test.ts`, `tests/verifier.compliance.l1.test.ts`,
  and `tests/change-identity.scenario.l1.test.ts`.

The subtree-wide form of the class, covering the same module, is recorded in
[`spx/34-verification.enabler/32-verify.enabler/ISSUES.md`](spx/34-verification.enabler/32-verify.enabler/ISSUES.md)
under "Shared verification harness owns test predicates and unclassified Git
doubles". The facts above are the record-run instance: the token-supplying
observations and the test cases that consumed them.

The rejection cases of `tests/record-run.compliance.l1.test.ts` no longer
consume those observations. Each builds its own invocation, parses it through
`observeVerificationInvocation` in `testing/harnesses/verify/rejected-invocation.ts`,
which returns no expected value, and derives the token its `stderr` must name
from the command name it wrote. The token-supplying observations stay in
`testing/harnesses/verify/harness.ts`, consumed by no test of this node, and the
module still imports `expect`.

**Impact:** while the shared module keeps its `expect` import and its
token-supplying observations, any test that imports it reaches assertion code
in test infrastructure, and this node's test-evidence audit can raise the
assertion-code finding against the five importing test files.

**Settlement condition:** `testing/harnesses/verify/harness.ts` no longer
declares observations that return an expected value and imports no `expect`,
and a test-evidence audit of this node raises neither finding.

## The verification-run descriptor carries test-only vocabulary

**Evidence:** test-evidence audit run 1 of this node at
`65e35d2b15b8ca92dd8afdc0ee5f4b95bf67d272`, class source-ownership, on
`src/interfaces/cli/verify.ts` lines 51–53, outside the `origin/main..HEAD` diff
of that head. The descriptor defect — `VERIFICATION_RUN_CLI_SURFACE` declaring
`forbiddenRootCommandName`, `forbiddenRunHelpTerms`, and
`forbiddenRunCommandNames`, read by no module under `src/` — is recorded in
[`spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/ISSUES.md`](spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/ISSUES.md)
under "The production descriptor declares names that exist only for evidence to
assert absent". The facts that differ for this node: the same rule was raised
by this node's own audit run, and this node reads all three fields — the
noun-local case of `tests/record-run.compliance.l1.test.ts` (lines 46–55) reads
them directly, and its non-noun-local rejection case draws its commands from
`verifyNonNounLocalEvidenceCases` in `testing/generators/verify/verify.ts` (lines
601 and 678), which maps `forbiddenRunCommandNames`.

**Impact:** this node's rejection cases and its absence checks both take their
command names from the module whose command surface they verify, so neither
can catch a forbidden command path that the descriptor's own list omits.

**Settlement condition:** the parent entry settles, and a test-evidence audit
of this node raises no source-ownership finding on the descriptor.
