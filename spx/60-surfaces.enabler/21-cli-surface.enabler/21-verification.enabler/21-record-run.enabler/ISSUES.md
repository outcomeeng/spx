# Issues: record run

## Record-run evidence takes its rejection oracle and assertion code from the shared verification harness

**Evidence:** test-evidence audit run 1 of this node at
`65e35d2b15b8ca92dd8afdc0ee5f4b95bf67d272` returned `REJECTED`. Two of its
findings fall on `testing/harnesses/verify/harness.ts`, at lines outside the
`origin/main..HEAD` diff of that head:

- Class: harness-owned expected diagnostic token. Lines 344, 618, 627, 642 —
  `observeRejectedVerificationArgs` takes an `expectedDiagnosticToken`
  parameter, and `observeVerificationLifecycleOutsideRunRejection`,
  `observeNonNounLocalEvidenceRejection`, and
  `observeMissingEvidenceRequiredOptionRejection` each choose the token. The
  observation returns the token beside `stderr`, so the three rejection cases of
  `tests/record-run.compliance.l1.test.ts` (lines 23–30, 58–67, 69–78) assert
  `stderr` against an expected value the harness supplies rather than one the
  test derives.
- Class: assertion code in test infrastructure. Line 146 — the module imports
  `expect` from `vitest`. Every test file of this node except
  `tests/change-identity.scenario.l2.test.ts` imports from this module.

The subtree-wide form of the class, covering the same module, is recorded in
[`spx/34-verification.enabler/32-verify.enabler/ISSUES.md`](spx/34-verification.enabler/32-verify.enabler/ISSUES.md)
under "Shared verification harness owns test predicates and unclassified Git
doubles". The facts above are the record-run instance: the token-supplying
observations and the test cases that consume them.

**Impact:** a rejection case passes whenever `stderr` contains whatever token
the harness chose, so the test file does not show which diagnostic the command
path owes its caller, and a harness change to the token changes the evidence
without touching the test. This node's test-evidence audit rejects while either
pattern holds.

**Settlement condition:** each rejection case of
`tests/record-run.compliance.l1.test.ts` derives its expected diagnostic token
in the test from source-owned vocabulary, the observations no longer return an
expected value, `testing/harnesses/verify/harness.ts` imports no `expect`, and a
test-evidence audit of this node raises neither finding.

## The verification-run descriptor carries test-only vocabulary

**Evidence:** test-evidence audit run 1 of this node at
`65e35d2b15b8ca92dd8afdc0ee5f4b95bf67d272`, class source-ownership, on
`src/interfaces/cli/verify.ts` lines 49–51, outside the `origin/main..HEAD` diff
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

## The scope-mapping generator orders its expected resolved scope by host locale

**Evidence:** test-evidence audit run 1 of this node at
`65e35d2b15b8ca92dd8afdc0ee5f4b95bf67d272`, `WARNING`, host-locale sort, on lines
outside the `origin/main..HEAD` diff of that head.
`testing/generators/verify/verify.ts` line 768 builds `changesetScopeScenario`'s
`resolvedPaths` with `localeCompare`; `verifyScopeMappingCases` (line 649) turns
it into `expectedResolvedScope`, which `tests/file-scope.mapping.l1.test.ts`
compares with `toStrictEqual`. The same module's `changedPathsPair` (line 819)
also orders through `localeCompare`. The product-wide class is recorded in
[`spx/ISSUES.md`](spx/ISSUES.md) under "Locale-dependent ordering remains in
projection and listing paths", whose site list names neither line.

**Impact:** the expected order follows the host's collation, so the mapping
case can pass on one host and fail on another wherever locale collation and
code-unit order disagree for the generated paths.

**Settlement condition:** the generator orders `resolvedPaths` by code unit, and
a test-evidence audit of this node raises no host-locale sort warning.

## A scope-grammar test compares help strings to the constants that produce them

**Evidence:** test-evidence audit run 1 of this node at
`65e35d2b15b8ca92dd8afdc0ee5f4b95bf67d272`, `WARNING`, help-string test, on lines
outside the `origin/main..HEAD` diff of that head. The case "describes both
public scope grammar forms" in `tests/file-scope.mapping.l1.test.ts`, lines
38–46, asserts that the registered `start` command and scope options carry
`VERIFY_CLI.startCommandDescription`, `scopeTypeOptionDescription`, and
`scopeOptionDescription` — the source constants the descriptor registers. It is
the only case of this node whose subject is help text alone.

**Impact:** the case restates the descriptor's wiring and passes for any
description text, so it cannot detect help that misstates the `changeset` and
`file` scope grammar the mapping assertion declares.

**Settlement condition:** the case asserts a help property the scope-grammar
mapping requires, or is removed from the mapping evidence, and a test-evidence
audit of this node raises no help-string warning.
