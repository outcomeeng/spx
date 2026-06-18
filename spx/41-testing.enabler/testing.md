# Testing

PROVIDES the `spx test` command and a registry-based per-node run surface — discovers test files by walking `spx/**/tests/`, groups them by file extension, dispatches each group to the supported runner adapter registered for that language, runs a single node's tests through the same registry on request, records last-run evidence for fast status reporting, and offers agent output capture without changing runner selection
SO THAT developers and agents running `spx test` or `spx test passing`, and status consumers that need one node's current outcome,
CAN run spec-tree tests with a single command, honor configured passing-scope exclusions declared in `spx.config.{toml,json,yaml}`, obtain a node's pass/fail outcome through the multi-language registry without naming a runner, read recent status without re-running every test, and inspect failures through compact agent summaries and captured output artifacts

## Assertions

### Scenarios

- Given a spec tree with tests in multiple languages, when `spx test` runs, then each language's testing enabler is invoked on the files matching its registered extension pattern ([test](tests/testing.scenario.l1.test.ts))
- Given `spx.config.{toml,json,yaml}` excludes a node path from the passing test scope, when `spx test passing` runs, then test files under that node are filtered out before any runner invocation ([test](tests/execution-recording.scenario.l1.test.ts))
- Given `spx.config.{toml,json,yaml}` excludes a node path from the passing test scope, when `spx test` runs without `passing`, then test files under that node are still invoked ([test](tests/execution-recording.scenario.l1.test.ts))
- Given a passing-scope exclusion that is not a full product-root path (a bare node path), when `spx test passing` runs, then it matches no discovered file and excludes nothing ([test](tests/execution-recording.scenario.l1.test.ts))
- Given a passing scope that excludes a node path, when the test dispatch applies that scope, then files under that node are filtered out before runner invocation while files outside it are dispatched, and with no scope supplied every discovered file is dispatched ([test](tests/testing.scenario.l1.test.ts))
- Given `spx test` runs, then it records last-run evidence covering the dispatched files for fast status reporting ([test](tests/execution-recording.scenario.l1.test.ts))
- Given a testing language descriptor declares a root product input path or a covered-path-derived product input path, when `spx test` records a run before and after that path appears or changes, then the recorded product input digest changes ([test](tests/execution-recording.scenario.l1.test.ts))
- Given `spx test` records a run before and after a covered test file's content changes, when staleness is checked against recomputed current inputs, then the first recorded run is stale and the second recorded run is fresh ([test](tests/execution-recording.scenario.l1.test.ts))
- Given `spx test` has recorded valid last-run evidence, when a status command reads that evidence, then the status output reports observed results and staleness without invoking a test runner ([review])
- Given a status consumer requests one node's outcome and the recorded evidence for that node is stale, failing, or absent, when it invokes the registry-based per-node run, then that node's tests execute through the registered runner for each matching extension and fresh last-run evidence is recorded ([test](../31-spec-domain.enabler/54-spec-cli-commands.enabler/tests/spec-cli-commands.scenario.l1.test.ts))
- Given test files whose extension does not match any registered testing enabler, when `spx test` runs, then those files are reported and skipped without error ([test](tests/testing.scenario.l1.test.ts))
- Given one dispatched runner exits non-zero while another exits zero, when `spx test` completes, then the command exits non-zero ([test](tests/testing.scenario.l1.test.ts))
- Given `spx test` runs with agent output capture, then the selected runner adapter and selected test files remain the same and only output handling changes according to `spx/41-testing.enabler/11-test-runner-environments.pdr.md` ([test](85-agent-test-output.enabler/tests/agent-test-output.compliance.l1.test.ts))

### Mappings

- Each language provides its supported test runner adapter via a leaf enabler child registered per `../19-language-registration.adr.md` and `spx/41-testing.enabler/11-test-runner-environments.pdr.md` ([test](tests/testing.mapping.l1.test.ts))
- Extension-based dispatch: test files route to the testing enabler whose registered extension pattern matches ([test](tests/testing.mapping.l1.test.ts))

### Properties

- Test discovery is deterministic: the same spec tree structure always produces the same set of test files grouped by runner ([test](tests/testing.property.l1.test.ts))
- Exit code aggregation: `spx test` exits non-zero if any dispatched runner exits non-zero, zero otherwise ([test](tests/testing.property.l1.test.ts))
- Last-run state is evidence, not product truth: deleting the state never changes which tests are in passing scope, only whether fast status has cached observations available ([review])
- Last-run state is stale when the resolved testing config digest, discovered test file path set, discovered test file content digest, or testing-language product input digest differs from the values recorded with the cached observation ([test](43-last-run-evidence.enabler/tests/staleness.property.l1.test.ts))

### Compliance

- ALWAYS: `spx test passing` reads passing-scope exclusions through the config descriptor system for `spx.config.{toml,json,yaml}` — no duplicate parsing logic ([review])
- ALWAYS: persisted testing state records observed runner results, timestamps, input path sets, input content digests, and staleness metadata; config remains the source for passing-scope policy ([review])
- ALWAYS: the testing config digest is computed from config-owned canonical descriptor JSON for the resolved testing config descriptor section after defaults are applied; unrelated descriptor sections and raw file formatting do not affect testing state staleness ([review](../16-config.enabler/21-descriptor-registration.adr.md))
- ALWAYS: runner invocation is gated on language presence per `../19-language-registration.adr.md` ([review])
- ALWAYS: the registry-based per-node run reaches each language only through the testing registry per `../19-language-registration.adr.md`, and records fresh last-run evidence when it executes ([review])
- ALWAYS: supported runners are declared explicitly per language, and unsupported language or runner selections fail with a diagnostic naming the unsupported selection per `spx/41-testing.enabler/11-test-runner-environments.pdr.md` ([review])
- NEVER: write to product configuration files (`pyproject.toml`, `package.json`, `tsconfig.json`, `vitest.config.ts`) — exclusion applies via runner flags at invocation time ([review])
- NEVER: infer runner identity from the selected output environment; environment selection changes output handling and reporting only per `spx/41-testing.enabler/11-test-runner-environments.pdr.md` ([review])
- NEVER: infer passing scope from persisted last-run state — state accelerates reporting but does not decide policy ([review])
