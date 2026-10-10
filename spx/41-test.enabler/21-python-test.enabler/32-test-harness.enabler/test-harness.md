# Python Runner Test Harness

PROVIDES the Python test-runner fixtures — a recording command runner that captures constructed commands and returns a configured outcome, a real product-rooted pytest command runner over a temporary product materialized from committed fixture suites, a fast-check generator for Python test paths and runner inputs, and the expected pytest product-input path enumeration held independently of the descriptor
SO THAT the `spx/41-test.enabler/21-python-test.enabler` tests
CAN verify command construction, the detection gate, and exclusion-flag generation at `l1`, drive real pytest at `l2` without inheriting repository configuration, and catch a descriptor-versus-spec divergence in the python test pattern and tracked product inputs — without hand-written fixtures or filesystem mocking

## Assertions

- ALWAYS: the harness names the simulated runner exit codes beside `SIMULATED_REPORT`, with the production `SUCCESS_EXIT_CODE` as the success value and one distinct failure value, and supplies the scenario construction the Python verdict tests repeat — a simulated runner invocation over supplied test paths and their reported statuses at level 1, and a real pytest run over the supplied fixture suites with the product-rooted runner at level 2 — so those tests declare no exit-code literal

### Scenarios

- Given a committed pytest fixture suite, when `withTempPytestProduct` runs a callback, then the suite is copied into a fresh temporary product under the OS temp root rather than the repository, the suite path resolves inside that product, and the product directory is removed after the callback settles ([test](tests/test-harness.scenario.l1.test.ts))

### Properties

- A recording command runner reports its configured language presence, appends every `runCommand` invocation to its `calls` in order, and returns its configured exit code for each call ([test](tests/test-harness.property.l1.test.ts))
- `PYTHON_RUNNER_TEST_GENERATOR.nonEmptyTestPaths()` yields a non-empty list of distinct python test paths, the guarantee a consuming runner test relies on to avoid a vacuous path assertion ([test](tests/test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: the recording command runner is a pure in-memory test double — it records the constructed command and arguments and returns a configured outcome without spawning a process or standing in a mock, so `l1` command-construction and detection-gate tests observe inputs directly ([audit])
- ALWAYS: the real pytest command runner routes through `uv run` from the temporary product's working directory and relies on the environment to provide the toolchain, per [`spx/41-test.enabler/15-ci-runner-toolchain.adr.md`](spx/41-test.enabler/15-ci-runner-toolchain.adr.md) ([audit])
- ALWAYS: the generator's `test_*.py` target shape and the harness's `EXPECTED_PYTEST_PRODUCT_INPUT_PATHS` are held independently of the python descriptor, so a divergence between descriptor and spec fails a consuming test ([audit])
- ALWAYS: the recording-command-runner property test drives the python runner's recording runner through the shared `observeRecordingCommandRunner` governed by `spx/41-test.enabler/26-test-harness.enabler` and asserts the observation itself, so both language runners share one recording-runner observation while each linked test owns its predicates ([audit])
