# Literal Fixture Harness

PROVIDES a callback-scoped fixture environment for literal-reuse tests — wraps [22-test-environment.enabler](../../../../22-test-environment.enabler/test-environment.md) with primitives that write the `tsconfig.json` discovery marker, TypeScript source files (`export const NAME = "value";`), TypeScript test files (`expect(v).toBe("value");`), and an orchestrated reuse-and-duplication fixture driven by [`LITERAL_TEST_GENERATOR.reuseFixtureInputs()`](../../../../../testing/generators/literal/literal.ts)
SO THAT every test under [literal-reuse](../literal-reuse.md) — covering detection, fixture classification, value allowlist, path filter, and CLI output modes
CAN exercise `literalCommand` against real temp-project fixtures while keeping every TypeScript fixture template outside the file-pattern blind spot the validator exempts from cross-file reuse detection — fixture templates live in production code under `testing/harnesses/literal/`, never in spec-tree `tests/` directories

## Assertions

### Scenarios

- Given a Config and a callback, when `withLiteralFixtureEnv` starts, then a temp project is materialized via `withTestEnv` and the callback receives an env exposing `projectDir` plus the literal-specific writers ([test](tests/literal-fixture-harness.scenario.l1.test.ts))
- Given the harness env, when `writeTsConfigMarker()` is called, then a file at `projectDir/${TYPESCRIPT_MARKER}` exists and `detectTypeScript(projectDir)` reports present ([test](tests/literal-fixture-harness.scenario.l1.test.ts))
- Given the harness env and a string value sampled from `LITERAL_TEST_GENERATOR.domainLiteral()`, when `writeSourceFile(relativePath, value)` is called, then the file at `projectDir/relativePath` declares an `export const` binding whose initializer is the supplied value, and reading the file back returns content containing the value ([test](tests/literal-fixture-harness.scenario.l1.test.ts))
- Given the harness env and a string value sampled from `LITERAL_TEST_GENERATOR.domainLiteral()`, when `writeTestFile(relativePath, value)` is called, then the file at `projectDir/relativePath` contains an `expect(...).toBe(...)` matcher invocation whose argument is the supplied value, and reading the file back returns content containing the value ([test](tests/literal-fixture-harness.scenario.l1.test.ts))
- Given a `LiteralReuseFixtureInputs` sample, when `writeReuseFixture(inputs)` is called, then the project state contains the `tsconfig.json` marker, one source file binding the reuse literal, one test file asserting the reuse literal, and two test files each asserting the dupe literal — sufficient input for `literalCommand` invoked against `projectDir` to emit one src↔test reuse finding and two test↔test duplication findings (one per test-side occurrence of the dupe literal) ([test](tests/literal-fixture-harness.scenario.l1.test.ts))
- Given the callback returns normally, when the harness completes, then the temp directory is removed before the outer test continues ([test](tests/literal-fixture-harness.scenario.l1.test.ts))
- Given the callback throws, when the harness completes, then the temp directory is removed and the original error is rethrown unchanged ([test](tests/literal-fixture-harness.scenario.l1.test.ts))
- Given two harness invocations running concurrently, when both callbacks execute and one writes a sentinel file, then each callback receives a distinct `projectDir` and the sentinel never appears in the other invocation's project ([test](tests/literal-fixture-harness.scenario.l1.test.ts))

### Properties

- For every `LiteralReuseFixtureInputs` sample, two harness invocations applying `writeReuseFixture` to that sample produce identical project file sets with byte-equal contents ([test](tests/literal-fixture-harness.property.l1.test.ts))

### Compliance

- ALWAYS: the harness writes the discovery marker at the path bound to `TYPESCRIPT_MARKER` from `@/validation/discovery/index` so `detectTypeScript` reports present without any string literal of the marker filename appearing in the harness or its tests ([test](tests/literal-fixture-harness.compliance.l1.test.ts))
- ALWAYS: the public API is callback-scoped — `withLiteralFixtureEnv(config, callback) → Promise<T>` exposes no caller-owned cleanup handle, matching the test-environment callback pattern ([review](../../../../22-test-environment.enabler/21-callback-scoped-environment.adr.md))
- ALWAYS: every TypeScript fixture template — source-file shape, test-file shape, reuse-fixture orchestration — lives in `testing/harnesses/literal/`; no spec-tree `tests/` file under [literal-reuse](../literal-reuse.md) authors a TypeScript fixture template that interpolates a literal value into TS source or test code ([review])
- NEVER: declare test-owned semantic constants in the harness — variable inputs come from `LITERAL_TEST_GENERATOR` per [21-typescript-conventions.adr.md](../../21-typescript-conventions.adr.md) ([review](../../21-typescript-conventions.adr.md))
- NEVER: use `vi.mock`, `jest.mock`, `memfs`, or any filesystem-mocking mechanism — fixtures are written to a real OS temp directory under `os.tmpdir()` ([review](../../../../22-test-environment.enabler/21-callback-scoped-environment.adr.md))
