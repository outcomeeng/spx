# Issues: TypeScript Test Runner

## Linked tests delegate their assertion flow to harness suites

`tests/typescript-test.scenario.l1.test.ts`, `tests/typescript-test.scenario.l2.test.ts`, `tests/typescript-test.mapping.l1.test.ts`, `tests/typescript-test.compliance.l1.test.ts`, and `tests/typescript-test.compliance.l2.test.ts` each call `registerHarnessTestCases` over cases collected from `testing/harnesses/testing/typescript-runner.ts`, so the `describe`/`it`/`expect` flow for the assertions those cases cover lives in the harness. A test-evidence audit of this node rejects each of those assertions on predicate ownership. The per-path verdict cases in `tests/typescript-test.scenario.l1.test.ts`, `tests/typescript-test.compliance.l1.test.ts`, and `tests/typescript-test-verdicts.scenario.l2.test.ts` own their predicates in the executed test file.

**Scope:** one instance of the product-wide shape recorded in [`spx/ISSUES.md`](spx/ISSUES.md) under "Test assertion flow lives in harnesses instead of executed test files"; unwinding it is that entry's work, one owning subtree at a time, and does not belong to a changeset that leaves the delegating cases untouched.

**Resolution:** move each registered suite's body into the linked test file, leaving the temporary-product and recording-runner setup and the fixture writers in the harness as setup and observation, then re-run this node's tests and its test-evidence audit.

## The missing-import scenario is backed by a test-failure fixture

The scenario "Given a TypeScript test imports a module that does not exist, when vitest runs against that file without exclusion, then vitest exits non-zero" links `tests/typescript-test.scenario.l2.test.ts`. The case that runs real Vitest against a failing product in `registerTypescriptRunnerScenarioL2Tests` (`testing/harnesses/testing/typescript-runner.ts`) writes `VITEST_FIXTURE.FAILING`, a test file whose assertion fails, and asserts a non-zero exit code. No fixture imports a module that does not exist.

**Impact:** The assertion fixture exercises a failing test, not an unresolvable import, so the evidence does not distinguish the claimed missing-import condition from any other cause of a non-zero exit.

**Scope:** One scenario of this node; the per-path verdict scenarios added beside it observe the Vitest report and leave this case unchanged.

**Resolution:** add a fixture whose test file imports a nonexistent module, run it through the same real-Vitest path, and observe the failure the import produces beyond the exit code, so the case fails when the exit code is non-zero for another reason, then re-run this node's tests and its test-evidence audit.

## The file-pattern mapping compares the descriptor against the production constant

The mapping "TypeScript test file patterns: `*.test.ts` and `*.test.tsx`" links `tests/typescript-test.mapping.l1.test.ts`. Its case `declares every spec-defined TypeScript test-file pattern` in `registerTypescriptRunnerMappingTests` (`testing/harnesses/testing/typescript-runner.ts`) asserts that `typescriptTestingLanguage.testFilePatterns` equals `TYPESCRIPT_TEST_FILE_PATTERNS`, the constant the descriptor is built from, and the parameterized cases iterate that same constant.

**Impact:** The expected values come from the implementation under test, so a change to the constant changes the descriptor and the expectation together and the mapping cannot fail when the patterns drift from the spec's `*.test.ts` and `*.test.tsx`.

**Scope:** The two mapping cases that read `TYPESCRIPT_TEST_FILE_PATTERNS`; the exclusion-flag mapping in the same file is unaffected.

**Resolution:** state the two spec-declared patterns as the test's independent expected values and assert the descriptor and the routing against them, then re-run this node's tests and its test-evidence audit.

## A supplied test path takes its verdict from a report entry matched by suffix

`verdictForPath` in `src/test/languages/typescript.ts` resolves each supplied test path against the file names in the Vitest JSON report by equality or by `reportedName.endsWith(`/${testPath}`)`, and returns the first match in report order. [`spx/41-test.enabler/21-typescript-test.enabler/21-typescript-test-runner.adr.md`](21-typescript-test-runner.adr.md) states that a path verdict derives from the Vitest JSON report for that test file.

**Impact:** When another reported file's path ends with a supplied test path, the supplied path can take that other file's verdict, so a neighbouring file decides the verdict of a reference it does not cover.

**Scope:** The report matching in `verdictForPath`. The Python adapter's report matching in `src/test/languages/python.ts` belongs to the same class and is checked with it.

**Resolution:** outcomeeng/changes#427 resolves each supplied path to the reported file whose path is the product root joined to that path, adds a case in which one reported path ends with another supplied path, and checks the Python adapter for the same class; then re-run this node's tests and its test-evidence audit.

## The level-1 verdict scenarios choose simulated exit codes inline

`tests/typescript-test.scenario.l1.test.ts` sets the simulated Vitest process exit codes as literals in the executed test file: `exitCode: 1` at lines 19 and 31 and `exitCode: 0` at lines 44 and 65. [`spx/12-test-infrastructure.adr.md`](spx/12-test-infrastructure.adr.md) assigns variable input domains to generators and harnesses, and leaves executed test files only the assertion flow.

**Impact:** The exit codes the cases hand the adapter are test-owned data, so the scenarios restate runner vocabulary that source-owned test infrastructure owns, and the file mirrors `spx/41-test.enabler/21-python-test.enabler/tests/python-test.scenario.l1.test.ts` line for line.

**Scope:** The four simulated-report cases of `tests/typescript-test.scenario.l1.test.ts`.

**Resolution:** outcomeeng/changes#427 draws the simulated exit codes from the runner generators or harnesses that own them; then re-run this node's tests and its test-evidence audit.
