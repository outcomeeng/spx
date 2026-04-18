# Testing

PROVIDES the `spx test` command — discovers test files by walking `spx/**/tests/`, groups them by file extension, and dispatches each group to the language-specific testing enabler registered for that extension
SO THAT developers and agents running `spx test` or `spx test passing`
CAN run all spec-tree tests with a single command, honoring the specified-state distinction declared in `spx/EXCLUDE`

## Assertions

### Scenarios

- Given a spec tree with tests in multiple languages, when `spx test` runs, then each language's testing enabler is invoked on the files matching its registered extension pattern ([test](tests/testing.integration.test.ts))
- Given `spx/EXCLUDE` lists a node path, when `spx test passing` runs, then test files under that node are filtered out before any runner invocation ([test](tests/testing.integration.test.ts))
- Given `spx/EXCLUDE` lists a node path, when `spx test` runs (without `passing`), then test files under that node are still invoked ([test](tests/testing.integration.test.ts))
- Given test files whose extension does not match any registered testing enabler, when `spx test` runs, then those files are reported and skipped without error ([test](tests/testing.integration.test.ts))
- Given one dispatched runner exits non-zero while another exits zero, when `spx test` completes, then the command exits non-zero ([test](tests/testing.integration.test.ts))

### Mappings

- Each language provides its test runner via a leaf enabler child registered per `../19-language-registration.adr.md` ([test](tests/testing.integration.test.ts))
- Extension-based dispatch: test files route to the testing enabler whose registered extension pattern matches ([test](tests/testing.integration.test.ts))

### Properties

- Test discovery is deterministic: the same spec tree structure always produces the same set of test files grouped by runner ([test](tests/testing.unit.test.ts))
- Exit code aggregation: `spx test` exits non-zero if any dispatched runner exits non-zero, zero otherwise ([test](tests/testing.integration.test.ts))

### Compliance

- ALWAYS: `spx test passing` reads `spx/EXCLUDE` via the exclude-scoping enabler — no duplicate parsing logic ([review])
- ALWAYS: runner invocation is gated on language presence per `../19-language-registration.adr.md` ([review])
- NEVER: write to project configuration files (`pyproject.toml`, `package.json`, `tsconfig.json`, `vitest.config.ts`) — exclusion applies via runner flags at invocation time ([review])
