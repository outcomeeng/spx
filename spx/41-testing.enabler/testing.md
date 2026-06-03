# Testing

PROVIDES the `spx test` command and a registry-based per-node run surface — discovers test files by walking `spx/**/tests/`, groups them by file extension, dispatches each group to the language-specific testing enabler registered for that extension, runs a single node's tests through the same registry on request, and records last-run evidence for fast status reporting
SO THAT developers and agents running `spx test` or `spx test passing`, and status consumers that need one node's current outcome,
CAN run all spec-tree tests with a single command, honor configured passing-scope exclusions declared in `spx.config.{toml,json,yaml}`, obtain a node's pass/fail outcome through the multi-language registry without naming a runner, and read recent status without re-running every test

## Assertions

### Scenarios

- Given a spec tree with tests in multiple languages, when `spx test` runs, then each language's testing enabler is invoked on the files matching its registered extension pattern ([test](tests/testing.scenario.l1.test.ts))
- Given `spx.config.{toml,json,yaml}` excludes a node path from the passing test scope, when `spx test passing` runs, then test files under that node are filtered out before any runner invocation ([test](tests/testing.integration.test.ts))
- Given `spx.config.{toml,json,yaml}` excludes a node path from the passing test scope, when `spx test` runs without `passing`, then test files under that node are still invoked ([test](tests/testing.integration.test.ts))
- Given a passing scope that excludes a node path, when the test dispatch applies that scope, then files under that node are filtered out before runner invocation while files outside it are dispatched, and with no scope supplied every discovered file is dispatched ([test](tests/testing.scenario.l1.test.ts))
- Given `spx test` has recorded valid last-run evidence, when a status command reads that evidence, then the status output reports observed results and staleness without invoking a test runner ([review])
- Given a status consumer requests one node's outcome and the recorded evidence for that node is stale, failing, or absent, when it invokes the registry-based per-node run, then that node's tests execute through the registered runner for each matching extension and fresh last-run evidence is recorded ([test](tests/testing.integration.test.ts))
- Given test files whose extension does not match any registered testing enabler, when `spx test` runs, then those files are reported and skipped without error ([test](tests/testing.scenario.l1.test.ts))
- Given one dispatched runner exits non-zero while another exits zero, when `spx test` completes, then the command exits non-zero ([test](tests/testing.scenario.l1.test.ts))

### Mappings

- Each language provides its test runner via a leaf enabler child registered per `../19-language-registration.adr.md` ([test](tests/testing.mapping.l1.test.ts))
- Extension-based dispatch: test files route to the testing enabler whose registered extension pattern matches ([test](tests/testing.mapping.l1.test.ts))

### Properties

- Test discovery is deterministic: the same spec tree structure always produces the same set of test files grouped by runner ([test](tests/testing.property.l1.test.ts))
- Exit code aggregation: `spx test` exits non-zero if any dispatched runner exits non-zero, zero otherwise ([test](tests/testing.property.l1.test.ts))
- Last-run state is evidence, not product truth: deleting the state never changes which tests are in passing scope, only whether fast status has cached observations available ([review])
- Last-run state is stale when the resolved testing config digest, discovered test file path set, discovered test file content digest, or descriptor-declared product input digest differs from the values recorded with the cached observation ([review])

### Compliance

- ALWAYS: `spx test passing` reads passing-scope exclusions through the config descriptor system for `spx.config.{toml,json,yaml}` — no duplicate parsing logic ([review])
- ALWAYS: persisted testing state records observed runner results, timestamps, input path sets, input content digests, and staleness metadata; config remains the source for passing-scope policy ([review])
- ALWAYS: the testing config digest is computed from config-owned canonical descriptor JSON for the resolved testing config descriptor section after defaults are applied; unrelated descriptor sections and raw file formatting do not affect testing state staleness ([review](../16-config.enabler/21-descriptor-registration.adr.md))
- ALWAYS: runner invocation is gated on language presence per `../19-language-registration.adr.md` ([review])
- ALWAYS: the registry-based per-node run reaches each language only through the testing registry per `../19-language-registration.adr.md`, and records fresh last-run evidence when it executes ([review])
- NEVER: write to product configuration files (`pyproject.toml`, `package.json`, `tsconfig.json`, `vitest.config.ts`) — exclusion applies via runner flags at invocation time ([review])
- NEVER: infer passing scope from persisted last-run state — state accelerates reporting but does not decide policy ([review])
