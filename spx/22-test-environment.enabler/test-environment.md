# Test Environment

PROVIDES a callback-scoped spec-tree test environment — a temp project directory pre-materialized from an explicit Config, with helpers for writing nodes, decision records, and raw fixture files, plus guaranteed cleanup on return or throw
SO THAT every spec-tree test (config, spec-tree descriptor, session, validation, language) across the harness
CAN construct real filesystem fixtures without hand-written directory trees, manual cleanup, or filesystem mocking

## Assertions

### Scenarios

- Given a test passes a Config and a callback, when the environment starts, then a fresh temp directory is created, the config module's default project config file is materialized from the Config, and the callback receives an env object with the project path and write helpers ([test](tests/lifecycle.unit.test.ts))
- Given the callback returns normally, when the environment completes, then the temp directory and all contents are removed before the outer test continues ([test](tests/lifecycle.unit.test.ts))
- Given the callback throws, when the environment completes, then the temp directory is removed and the original error is rethrown unchanged ([test](tests/lifecycle.unit.test.ts))
- Given nested environments (a withTestEnv call inside another), when the inner callback returns, then only the inner temp directory is removed; the outer environment remains intact for the outer callback ([test](tests/nesting.unit.test.ts))
- Given a callback destructures a helper (e.g., `writeNode`), when the helper is invoked, then the corresponding file is written under the temp project directory and subsequent reads see the change ([test](tests/helpers.unit.test.ts))
- Given a property-based test composes generators (e.g., valid node paths for a Config's hierarchy levels), when the property runs, then each generated fixture produces a valid temp-project state that the property can exercise ([test](tests/generators.unit.test.ts))

### Properties

- Temp directories created by the environment are always removed: cleanup runs exactly once per callback invocation, on both the return and throw paths ([test](tests/lifecycle.unit.test.ts))
- Concurrent environments are independent: two callbacks running in parallel receive distinct temp directories and one's writes do not appear in the other ([test](tests/isolation.unit.test.ts))
- Generator output is valid by construction: every path, tree, or config produced by the environment's generators parses cleanly through the corresponding spec-tree read operation ([test](tests/generators.unit.test.ts))

### Compliance

- ALWAYS: cleanup runs on both the return and throw paths of the callback — no test can opt out, no cleanup call appears in user test code ([test](tests/lifecycle.unit.test.ts))
- ALWAYS: temp directories live under the OS temp directory (`os.tmpdir()`) and their removal is constrained to that root — no path outside the OS temp root is ever deleted ([test](tests/safety.unit.test.ts))
- ALWAYS: every public API accepts `projectRoot` or a `Config` object from the caller — the environment does not resolve roots or compose configs from the production registry ([review](21-callback-scoped-environment.adr.md))
- NEVER: return a handle to the caller that requires manual cleanup — the callback pattern is the only supported shape ([review](21-callback-scoped-environment.adr.md))
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — the environment constructs real directories on the real filesystem under a temp root ([review](21-callback-scoped-environment.adr.md))
- NEVER: read from the production `src/config/registry.ts` — the environment operates on Configs supplied by the test, isolating it from production descriptor changes ([review](21-callback-scoped-environment.adr.md))
