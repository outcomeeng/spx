# Issues: Python Test Runner

## Linked tests delegate their assertion flow to harness suites

`tests/python-test.scenario.l1.test.ts`, `tests/python-test.scenario.l2.test.ts`, and `tests/python-test.compliance.l1.test.ts` each call one `register*` function from `testing/harnesses/testing/python-runner.ts`, so the `describe`/`it`/`expect` flow for five `[test]` assertions lives in the harness. A test-evidence audit of this node rejects every one of those assertions on predicate ownership. The mapping test and the child node `32-test-harness.enabler` already own their predicates over harness observations.

**Scope:** one instance of the product-wide shape recorded in [`spx/ISSUES.md`](../../ISSUES.md) under "Test assertion flow lives in harnesses instead of executed test files"; unwinding it is that entry's work, one owning subtree at a time, and does not belong to a changeset that leaves this node's tests untouched.

**Resolution:** move each registered suite's body into the linked test file, leaving `withTempPytestProduct`, the recording and product-rooted command runners, and the fixture writers in the harness as setup and observation, then re-run this node's tests and its test-evidence audit.
