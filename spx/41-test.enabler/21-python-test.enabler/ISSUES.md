# Issues: Python Test Runner

## Linked tests delegate their assertion flow to harness suites

`tests/python-test.scenario.l1.test.ts`, `tests/python-test.scenario.l2.test.ts`, and `tests/python-test.compliance.l1.test.ts` each call one `register*` function from `testing/harnesses/testing/python-runner.ts`, so the `describe`/`it`/`expect` flow for five `[test]` assertions lives in the harness. A test-evidence audit of this node rejects every one of those assertions on predicate ownership. The mapping test and the child node `32-test-harness.enabler` already own their predicates over harness observations.

**Scope:** one instance of the product-wide shape recorded in [`spx/ISSUES.md`](spx/ISSUES.md) under "Test assertion flow lives in harnesses instead of executed test files"; unwinding it is that entry's work, one owning subtree at a time, and does not belong to a changeset that leaves this node's tests untouched.

**Resolution:** move each registered suite's body into the linked test file, leaving `withTempPytestProduct`, the recording and product-rooted command runners, and the fixture writers in the harness as setup and observation, then re-run this node's tests and its test-evidence audit.

## The runner decision record states that the working directory derives pytest's rootdir

[`21-python-test-runner.adr.md`](21-python-test-runner.adr.md) states that "pytest derives its rootdir and configuration discovery from the command runner's working directory". Pytest derives its rootdir from the common ancestor of the supplied test paths and the ini-file it finds above them, and consults the working directory only when neither names one. The harness function `withTempPytestSuites` in `testing/harnesses/testing/python-runner.ts` writes an empty `pytest.ini` into the temporary product so pytest anchors its rootdir at the product, which a working-directory derivation would not need.

**Impact:** The statement describes a mechanism the evidence does not exercise and the harness works around, so a reader takes the working directory as the rootdir contract when the supplied paths and the ini-file marker decide it.

**Scope:** One sentence of the decision record's opening paragraph, untouched by the per-path verdict changes to the same paragraph.

**Resolution:** restate the sentence to name the rootdir derivation pytest applies, or remove the rootdir claim, then re-run the decision-record audit of this node.

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
