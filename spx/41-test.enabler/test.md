# Test

PROVIDES the `spx test` command and a registry-based per-node run surface — discovers test files by walking `spx/**/tests/`, groups them by file extension, dispatches each group to the supported runner adapter registered for that language, runs a single node's tests through the same registry on request, records last-run evidence for fast status reporting, offers agent output capture without changing runner selection, and selects a focused subset of the suite from explicit caller operands
SO THAT developers and agents running `spx test` or `spx test passing`, and status consumers that need one node's observed outcome,
CAN run spec-tree tests with a single command, honor configured passing-scope exclusions declared in `spx.config.{toml,json,yaml}`, obtain a node's pass/fail outcome through the multi-language registry without naming a runner, read recorded status without re-running every test, run only the tests for a named node or file through the same dispatch pipeline, and inspect failures through compact agent summaries and captured output artifacts

## Assertions

### Scenarios

- Given a spec tree with tests in multiple languages, when `spx test` runs, then each language's testing enabler is invoked on the files matching its registered extension pattern ([test](tests/test.scenario.l1.test.ts))
- Given `spx.config.{toml,json,yaml}` excludes a node path from the passing test scope, when `spx test passing` runs, then test files under that node are filtered out before any runner invocation ([test](tests/execution-recording.scenario.l1.test.ts))
- Given `spx.config.{toml,json,yaml}` excludes a node path from the passing test scope, when `spx test` runs without `passing`, then test files under that node are still invoked ([test](tests/execution-recording.scenario.l1.test.ts))
- Given a passing-scope exclusion that is not a full product-root path (a bare node path), when `spx test passing` runs, then it matches no discovered file and excludes nothing ([test](tests/execution-recording.scenario.l1.test.ts))
- Given a passing scope that excludes a node path, when the test dispatch applies that scope, then files under that node are filtered out before runner invocation while files outside it are dispatched, and with no scope supplied every discovered file is dispatched ([test](tests/test.scenario.l1.test.ts))
- Given `spx test` runs, then it records last-run evidence covering the dispatched files for fast status reporting ([test](tests/execution-recording.scenario.l1.test.ts))
- Given a testing language descriptor declares a root product input path or a covered-path-derived product input path, when `spx test` records a run before and after that path appears or changes, then the recorded product input digest changes ([test](tests/execution-recording.scenario.l1.test.ts))
- Given `spx test --changed --staged` records a run while the worktree product input differs from the staged product input, then the recorded product input digest reflects the staged snapshot ([test](tests/execution-recording.scenario.l1.test.ts))
- Given `spx test` records a run before and after a covered test file's content changes, when staleness is checked against recomputed current inputs, then the first recorded run is stale and the second recorded run is fresh ([test](tests/execution-recording.scenario.l1.test.ts))
- Given `spx test` has recorded valid last-run evidence, when a status command reads that evidence, then the status output reports observed results and staleness without invoking a test runner ([audit])
- Given a status consumer requests one node's outcome and the recorded evidence for that node is stale, failing, or absent, when it invokes the registry-based per-node run, then that node's tests execute through the registered runner for each matching extension and fresh last-run evidence is recorded ([test](../31-spec-domain.enabler/54-spec-cli-commands.enabler/tests/spec-cli-commands.scenario.l1.test.ts))
- Given test files whose extension does not match any registered testing enabler, when `spx test` runs, then those files are reported, skipped, and make the command fail ([test](tests/test.scenario.l1.test.ts))
- Given a file co-located under a node's `tests/` directory whose extension a registered language owns but whose name does not match that language's test-file pattern, when `spx test` runs, then the file is reported as unmatched and makes the command fail while the directory's matching test files still dispatch to their runner ([test](tests/test.scenario.l1.test.ts))
- Given one dispatched runner exits non-zero while another exits zero, when `spx test` completes, then the command exits non-zero ([test](tests/test.scenario.l1.test.ts))
- Given every selected test file matches a registered language whose runner is gated out by language detection, when `spx test` runs, then no runner is invoked and the command exits non-zero ([test](tests/test.scenario.l1.test.ts))
- Given an unresolved changed-source report accompanies an otherwise passing targeted run, when `spx test` aggregates dispatch results, then the report remains available and the command exits zero ([test](tests/test.scenario.l1.test.ts))
- Given an unresolved changed-source report accompanies an otherwise passing CLI run, when `spx test` reports the result, then stderr names the unresolved source and the command exits zero ([test](tests/test.scenario.l1.test.ts))
- Given product input changes select the recursive full tree and changed source files remain unresolved, when `spx test` reports the result, then unresolved changed-source diagnostics are suppressed because every spec-tree test is already selected ([test](tests/test.scenario.l1.test.ts))
- Given `spx test --changed --staged` runs while the worktree config differs from the index, then it resolves testing config from the staged snapshot ([test](tests/test.scenario.l1.test.ts))
- Given `spx test --changed --staged` runs while a staged changed path has additional worktree edits, an unstaged/untracked test file falls under an explicit selected target, or a product-input change selects the recursive root while a spec-tree test file is dirty, then it rejects before runner execution; unrelated dirty files outside the selected execution scope do not prevent runner execution ([test](tests/test.scenario.l1.test.ts))
- Given `spx test --changed` runs through the command entrypoint, when related-test dependencies are absent, then the command rejects before changed-set planning runs ([test](tests/test.scenario.l1.test.ts))
- Given selected registered-language test groups include a runner gated out by language detection, when `spx test` runs in operator mode, then the command reports the skipped runner group and selected files even when another selected runner makes the aggregate exit code zero ([test](tests/test.scenario.l1.test.ts))
- Given `spx test` runs with agent output capture, then the selected runner adapter and selected test files remain the same and only output handling changes according to `spx/41-test.enabler/11-test-runner-environments.pdr.md` ([test](85-agent-test-output.enabler/tests/agent-test-output.compliance.l1.test.ts))

### Mappings

- Each language provides its supported test runner adapter via a leaf enabler child registered per `../19-language-registration.adr.md` and `spx/41-test.enabler/11-test-runner-environments.pdr.md` ([test](tests/test.mapping.l1.test.ts))
- Extension-based dispatch: test files route to the testing enabler whose registered extension pattern matches ([test](tests/test.mapping.l1.test.ts))

### Properties

- Test discovery is deterministic: the same spec tree structure always produces the same set of test files grouped by runner ([test](tests/test.property.l1.test.ts))
- Exit code aggregation: `spx test` exits non-zero if any dispatched runner exits non-zero, any selected test file matches no registered runner, any target operand resolves to no discovered test file, or every selected registered-language runner is gated out by language detection, zero otherwise ([test](tests/test.property.l1.test.ts))
- Last-run state is evidence, not product truth: deleting the state never changes which tests are in passing scope, only whether fast status has cached observations available ([audit])
- Last-run state is stale when the resolved testing config digest, discovered test file path set, discovered test file content digest, or testing-language product input digest differs from the values recorded with the cached observation ([test](43-last-run-evidence.enabler/tests/staleness.property.l1.test.ts))

### Compliance

- ALWAYS: `spx test passing` reads passing-scope exclusions through the config descriptor system for `spx.config.{toml,json,yaml}` — no duplicate parsing logic ([audit])
- ALWAYS: persisted testing state records observed runner results, timestamps, input path sets, input content digests, and staleness metadata; config remains the source for passing-scope policy ([audit])
- ALWAYS: the testing config digest is computed from config-owned canonical descriptor JSON for the resolved testing config descriptor section after defaults are applied per `spx/16-config.enabler/21-descriptor-registration.adr.md`; unrelated descriptor sections and raw file formatting do not affect testing state staleness ([audit])
- ALWAYS: runner invocation is gated on language presence per `../19-language-registration.adr.md` ([audit])
- ALWAYS: the registry-based per-node run reaches each language only through the testing registry per `../19-language-registration.adr.md`, and records fresh last-run evidence when it executes ([audit])
- ALWAYS: supported runners are declared explicitly per language, and unsupported language or runner selections fail with a diagnostic naming the unsupported selection per `spx/41-test.enabler/11-test-runner-environments.pdr.md` ([audit])
- NEVER: write to product configuration files (`pyproject.toml`, `package.json`, `tsconfig.json`, `vitest.config.ts`) — exclusion applies via runner flags at invocation time ([audit])
- NEVER: infer runner identity from the selected output environment; environment selection changes output handling and reporting only per `spx/41-test.enabler/11-test-runner-environments.pdr.md` ([audit])
- NEVER: infer passing scope from persisted last-run state — state accelerates reporting but does not decide policy ([audit])
