# TypeScript Runner Test Harness

PROVIDES the TypeScript Vitest-runner fixtures — a recording command runner that captures constructed commands and returns a configured outcome, a real product-rooted command runner over a temporary product materialized from committed fixture suites, and a fast-check generator for TypeScript test paths and runner inputs
SO THAT the `spx/41-test.enabler/21-typescript-test.enabler` tests
CAN verify command construction, the detection gate, and exclusion-flag generation at `l1`, drive real Vitest at `l2` without inheriting repository configuration, and rely on distinct excluded-node generation — without hand-written fixtures or filesystem mocking

## Assertions

### Scenarios

- Given a committed Vitest fixture suite, when `withTempVitestProduct` runs a callback, then the suite is copied into a fresh temporary product under the OS temp root rather than the repository, the product holds exactly the copied suite, and the product directory is removed after the callback settles ([test](tests/test-harness.scenario.l1.test.ts))

### Properties

- A recording command runner reports its configured language presence, appends every `runCommand` invocation to its `calls` in order, and returns its configured exit code for each call ([test](tests/test-harness.property.l1.test.ts))
- `TYPESCRIPT_RUNNER_TEST_GENERATOR.nodePaths()` yields a non-empty list of distinct node paths, the guarantee a consuming exclusion-flag test relies on to map each excluded node to a distinct flag ([test](tests/test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: the recording command runner is a pure in-memory test double — it records the constructed command and arguments and returns a configured outcome without spawning a process or standing in a mock, so `l1` command-construction and detection-gate tests observe inputs directly ([audit])
- ALWAYS: the real Vitest command runner executes from the product root with the temporary product isolated by the adapter's `--root` flag, relying on the environment to provide the toolchain ([audit])
- ALWAYS: the generator's typescript test-file extensions are held independently of the typescript descriptor, so a divergence between descriptor and spec fails a consuming test ([audit])
- ALWAYS: the recording-command-runner property test verifies the typescript runner's recording runner through the shared `assertRecordingCommandRunnerContract` governed by `spx/41-test.enabler/26-test-harness.enabler`, so both language runners share one recording-runner contract ([audit])
