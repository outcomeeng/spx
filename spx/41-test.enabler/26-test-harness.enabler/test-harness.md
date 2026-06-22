# Testing Dispatch Test Harness

PROVIDES the shared test-infrastructure for the testing enabler's dispatch, discovery, and CLI evidence — a temp-product-directory harness with test-file, config, and run-state fixture writers; a testing CLI harness that runs the real command through Commander with recording dependencies and captured streams; and a fast-check generator for node paths, co-located test and support files, invocations, and exit codes
SO THAT the `spx/41-test.enabler` dispatch, discovery, last-run-evidence, agent-output, and CLI tests, and the spec-domain status consumers
CAN stage real product directories, drive the real `spx test` parse-and-dispatch path, and generate spec-tree-shaped fixtures whose paths track the production vocabulary — without hand-written trees, an injected config value, or a stubbed CLI

## Assertions

### Properties

- `TEST_DISPATCH_GENERATOR.distinctNodePaths()` yields two distinct node paths where neither is a path-prefix of the other, the precondition a passing-scope independence test relies on ([test](tests/test-harness.property.l1.test.ts))
- For each registered language descriptor, `TEST_DISPATCH_GENERATOR.testFileUnder` yields a co-located path the descriptor matches as a test file while `supportFileUnder` yields a co-located path it does not, so dispatch coverage and non-coverage tests rest on the real descriptor matchers ([test](tests/test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: the testing fixture writers (`withTestingTempProductDir`, `writeTestFileFixture`, `writeTestingConfig`, `writeTestingStateFile`) compose on the shared temp-directory primitive and stage config and run-state through the real production config and run-state paths rather than an injected value or a mock ([audit])
- ALWAYS: `runTestingCli` registers and runs the real testing CLI Commander program and captures stdout, stderr, and exit codes, so command tests exercise the real parse-and-dispatch path rather than a stubbed CLI ([audit])
- ALWAYS: the dispatch generator derives node, test-file, support-file, and operand shapes from the source-owned spec-tree vocabulary and the registered language descriptors, so a divergence from the production vocabulary fails a consuming test ([audit])
- NEVER: this node restates the targeted-operand selection semantics governed by `spx/41-test.enabler/90-targeted-execution.enabler` — it governs the generator and harness contracts the operand tests build on, not the operand behavior itself ([audit])
