# Test Environment

PROVIDES a generic callback-scoped temp-directory primitive with guaranteed cleanup, and a spec-tree test environment composed on it — a temp product directory pre-materialized from an explicit Config, with helpers for writing nodes, decision records, and raw fixture files
SO THAT every test harness that needs a temp directory, and every spec-tree test (config, spec-tree descriptor, session, validation, language) across the harness
CAN construct real filesystem fixtures without hand-written directory trees, manual temp-directory lifecycle, or filesystem mocking

## Assertions

### Scenarios

- Given the temp-directory primitive is invoked with a callback, when the callback returns or throws, then a fresh directory under `os.tmpdir()` is created for the callback and removed before the primitive returns, and the callback's result is returned unchanged ([test](tests/temp-dir.scenario.l1.test.ts))
- Given a test passes a Config and a callback, when the environment starts, then a fresh temp directory is created, the config module's default product config file is materialized from the Config, and the callback receives an env object with `productDir` and write helpers ([test](tests/lifecycle.scenario.l1.test.ts))
- Given the callback returns normally, when the environment completes, then the temp directory and all contents are removed before the outer test continues ([test](tests/lifecycle.scenario.l1.test.ts))
- Given the callback throws, when the environment completes, then the temp directory is removed and the original error is rethrown unchanged ([test](tests/lifecycle.scenario.l1.test.ts))
- Given nested environments (a withTestEnv call inside another), when the inner callback returns, then only the inner temp directory is removed; the outer environment remains intact for the outer callback ([test](tests/nesting.scenario.l1.test.ts))
- Given a callback destructures a helper (e.g., `writeNode`), when the helper is invoked, then the corresponding file is written under the temp product directory and subsequent reads see the change ([test](tests/helpers.scenario.l1.test.ts))
- Given a property-based test composes generators (e.g., valid node paths for a Config's hierarchy levels), when the property runs, then each generated fixture produces a valid temp product state that the property can exercise ([test](tests/generators.scenario.l1.test.ts))

### Properties

- Temp directories created by the environment are always removed: cleanup runs exactly once per callback invocation, on both the return and throw paths ([test](tests/lifecycle.property.l1.test.ts))
- Concurrent environments are independent: two callbacks running in parallel receive distinct temp directories and one's writes do not appear in the other ([test](tests/isolation.property.l1.test.ts))
- Generator output is valid by construction: every path or tree produced by the environment's generators parses cleanly through the corresponding spec-tree read operation ([test](tests/generators.property.l1.test.ts))

### Compliance

- ALWAYS: cleanup runs on both the return and throw paths of the callback — no test can opt out, no cleanup call appears in user test code ([test](tests/lifecycle.scenario.l1.test.ts))
- ALWAYS: temp directories live under the OS temp directory (`os.tmpdir()`) and their removal is constrained to that root — no path outside the OS temp root is ever deleted ([test](tests/safety.compliance.l1.test.ts))
- ALWAYS: every test harness that needs a temp directory composes on the shared temp-directory primitive, which owns directory creation under `os.tmpdir()` and validated removal — no harness creates or removes a temp directory directly, per [`spx/22-test-environment.enabler/21-callback-scoped-environment.adr.md`](21-callback-scoped-environment.adr.md) ([audit])
- ALWAYS: every public API accepts `productDir` or a `Config` object from the caller — the environment does not compose configs from the production registry, per [`spx/22-test-environment.enabler/21-callback-scoped-environment.adr.md`](21-callback-scoped-environment.adr.md) ([audit])
- NEVER: return a handle to the caller that requires manual cleanup — the callback pattern is the only supported shape, per [`spx/22-test-environment.enabler/21-callback-scoped-environment.adr.md`](21-callback-scoped-environment.adr.md) ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — the environment constructs real directories on the real filesystem under a temp root, per [`spx/22-test-environment.enabler/21-callback-scoped-environment.adr.md`](21-callback-scoped-environment.adr.md) ([audit])
- NEVER: read from the production `src/config/registry.ts` — the environment operates on Configs supplied by the test, isolating it from production descriptor changes, per [`spx/22-test-environment.enabler/21-callback-scoped-environment.adr.md`](21-callback-scoped-environment.adr.md) ([audit])
