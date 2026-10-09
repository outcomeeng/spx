# Issues: Python Test Runner

## Linked tests delegate their assertion flow to harness suites

`tests/python-test.scenario.l1.test.ts`, `tests/python-test.scenario.l2.test.ts`, and `tests/python-test.compliance.l1.test.ts` each call one `register*` function from `testing/harnesses/testing/python-runner.ts`, so the `describe`/`it`/`expect` flow for the registered cases (excluded node path, Python absent, detection gating, and the exits-zero and missing-import cases) lives in the harness; the per-path verdict cases carry their predicates in the executed test files. A test-evidence audit of this node rejects every one of those assertions on predicate ownership. The mapping test and the child node `32-test-harness.enabler` already own their predicates over harness observations.

**Scope:** one instance of the product-wide shape recorded in [`spx/ISSUES.md`](spx/ISSUES.md) under "Test assertion flow lives in harnesses instead of executed test files"; unwinding it is that entry's work, one owning subtree at a time, and does not belong to a changeset that leaves this node's tests untouched.

**Resolution:** move each registered suite's body into the linked test file, leaving `withTempPytestProduct`, the recording and product-rooted command runners, and the fixture writers in the harness as setup and observation, then re-run this node's tests and its test-evidence audit.

## The missing-import case observes only the exit code

The scenario "Given a Python test imports a module that does not exist, when pytest runs against that file without exclusion, then pytest exits non-zero with an ImportError" links `tests/python-test.scenario.l2.test.ts`, whose suite in `registerPythonRunnerScenarioL2Evidence` (`testing/harnesses/testing/python-runner.ts`) asserts that the exit code is neither `OK` nor `NO_TESTS_COLLECTED`. No assertion observes an ImportError, the collection error pytest reports for the missing module, or the path verdict the run now records for the file.

**Impact:** A non-zero exit from any other cause, such as a syntax error, an assertion failure, or a usage error, satisfies the same assertion, so the evidence does not distinguish the claimed ImportError.

**Scope:** One scenario of this node; the per-path verdict scenario added beside it observes the run's report and leaves this case unchanged.

**Resolution:** observe the ImportError through the run's report or output and the recorded verdict for the file, so the case fails when the exit code is non-zero for another reason, then re-run this node's tests and its test-evidence audit.

## The mapping property draws cases outside the property harness's seed policy

`tests/python-test.mapping.l1.test.ts` runs its three generator-driven checks through `fc.assert(fc.property(...))` directly. The harness `assertProperty` in `testing/harnesses/property/property.ts`, which the compliance suites of this node already use, owns the run count, the seed, and its replay through `SPX_PROPERTY_SEED`.

**Impact:** A failing case drawn by the mapping tests names no seed to replay, so the failure cannot be reproduced exactly, and the run count follows the fast-check default rather than the product's property policy.

**Scope:** The three property checks of the mapping test file; the finite product-inputs check in the same file is unaffected.

**Resolution:** route each check through the property harness, keeping the predicate in the executed test callback, then re-run this node's tests and its test-evidence audit.

## The excluded-node-path scenario takes its expected flag from the production `excludeFlag`

The scenario "Given an excluded node path in `spx.config.{toml,json,yaml}`, when `spx test passing` runs, then pytest is invoked with `--ignore=spx/{node}/` for that node" links `tests/python-test.scenario.l1.test.ts`, whose suite in `registerPythonRunnerScenarioL1Evidence` (`testing/harnesses/testing/python-runner.ts`) asserts that the invoked arguments contain `pythonTestingLanguage.excludeFlag(nodePath)`. The expected value is computed by the function under test.

**Impact:** A defect in `excludeFlag` changes the expected value and the invoked flag together, so the assertion passes while the flag differs from `--ignore=spx/{node}/`; the case does not observe the flag the scenario names. The mapping test of this node owns the correspondence from an excluded node path to its flag.

**Scope:** One scenario of this node, untouched by the per-path verdict changes.

**Resolution:** derive the expected `--ignore=spx/{node}/` argument from the scenario's declared form independently of `excludeFlag`, then re-run this node's tests and its test-evidence audit.

## The exclusion-flag mapping builds its expected flag from the production flag prefix and suffix

The mapping "Config-driven exclusion flag generation: an excluded node path `{segment}` maps to pytest flag `--ignore=spx/{segment}/`" links `tests/python-test.mapping.l1.test.ts`, whose "maps an excluded node path to the pytest ignore flag" case asserts that `pythonTestingLanguage.excludeFlag(nodePath)` equals `${PYTHON_PYTEST_IGNORE_FLAG_PREFIX}${nodePath}${PYTHON_PYTEST_IGNORE_FLAG_SUFFIX}`. Both constants come from `src/test/languages/python-pytest-contract.ts`, the module the descriptor builds the flag from, so the expected value derives from the same production constants as the value under test.

**Impact:** A wrong prefix or suffix changes the expected value and the produced flag together, so the case passes while the flag differs from `--ignore=spx/{segment}/`; the mapping does not observe the correspondence it declares.

**Scope:** One case of this node's mapping test, untouched by the per-path verdict changes.

**Resolution:** state the expected `--ignore=spx/{segment}/` form independently of the production prefix and suffix constants, then re-run this node's tests and its test-evidence audit.

## The level-1 verdict scenarios choose simulated exit codes inline

`tests/python-test.scenario.l1.test.ts` sets the simulated pytest process exit codes as literals in the executed test file: `exitCode: 1` at lines 18 and 30 and `exitCode: 0` at lines 43 and 64. [`spx/12-test-infrastructure.adr.md`](spx/12-test-infrastructure.adr.md) assigns variable input domains to generators and harnesses, and leaves executed test files only the assertion flow.

**Impact:** The exit codes the cases hand the adapter are test-owned data, so the scenarios restate runner vocabulary that source-owned test infrastructure owns, and the file mirrors `spx/41-test.enabler/21-typescript-test.enabler/tests/typescript-test.scenario.l1.test.ts` line for line.

**Scope:** The four simulated-report cases of `tests/python-test.scenario.l1.test.ts`.

**Resolution:** outcomeeng/changes#427 draws the simulated exit codes from the runner generators or harnesses that own them; then re-run this node's tests and its test-evidence audit.
