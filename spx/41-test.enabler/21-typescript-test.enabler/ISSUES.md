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

## The test file selects the property run-count class

`tests/typescript-test.compliance.l1.test.ts` passes `{ level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL }` to `assertProperty` in three properties: `maps a TypeScript path to passed from the Vitest report despite a non-zero process exit` (line 34), `reports not-run for a supplied path whose only matching report entry is a file whose path ends with it` (line 68), and `reports the verdict of the entry for the supplied path when a file whose path ends with it is reported first` (line 87). `PROPERTY_CLASSIFICATION.SMALL_L1` in `testing/harnesses/property/property.ts` names that exact pair, so the test file selects the run-count class where the property harness owns the classification. A test-evidence audit reported this as a warning (test-owned configuration), not a rejection. The call sites are text the Change that added the exact-path compliance case and the per-path verdict assertions wrote.

**Impact:** A change to the run-count class of linked property evidence requires editing each call site in the test file, and the file can drift from the classification the harness defines.

**Scope:** The three `assertProperty` calls in `tests/typescript-test.compliance.l1.test.ts`.

**Settlement condition:** the property calls in `tests/typescript-test.compliance.l1.test.ts` take their classification from `PROPERTY_CLASSIFICATION`, and this node's tests and its test-evidence audit pass.

## The exclusion-flag mapping draws one sampled node-path pair

The mapping "Config-driven exclusion flag generation: an excluded node path `{segment}` maps to vitest flag `--exclude=spx/{segment}/**`" links `tests/typescript-test.mapping.l1.test.ts`. Its case `maps excluded node %s to the independent CLI flag oracle` in `registerTypescriptRunnerMappingTests` (`testing/harnesses/testing/typescript-runner.ts`) exercises the node paths of one pair sampled from `TYPESCRIPT_RUNNER_TEST_GENERATOR.nodePathPair()`, an open generated domain. A mapping declares a correspondence over a complete finite source-owned domain; a correspondence over an open node-segment domain is a property-type quantifier. A test-evidence audit reported this as a warning (mapping domain not finite). The expected flag is built independently by `oracleTypescriptExcludeFlag`, so oracle independence holds for this case. This is older text.

**Impact:** The evidence samples a few members of an open domain under an assertion type whose quantifier is a finite set, so the assertion type does not match the quantifier the mapping states.

**Scope:** The exclusion-flag mapping and its case in `registerTypescriptRunnerMappingTests`; the file-pattern mappings in the same file are unaffected.

**Settlement condition:** the correspondence is held by evidence of the assertion type its quantifier names, and this node's tests and its test-evidence audit pass.
