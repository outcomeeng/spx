---
id: 01a2034e-dbcc-7098-ad39-1af989f31f93
---

# Test Environment

PROVIDES a generic callback-scoped temp-directory primitive with guaranteed cleanup, and a spec-tree test environment composed on it — a temp product directory pre-materialized from an explicit Config, with helpers for writing nodes, decision records, and raw fixture files
SO THAT every test harness that needs a temp directory, and every test that needs a spec-tree fixture,
CAN construct real filesystem fixtures without hand-written directory trees, manual temp-directory lifecycle, or filesystem mocking

## Test.Scenario: environment lifecycle

- [temp-dir-callback](tests/temp-dir.scenario.l1.test.ts):
  - Given the temp-directory primitive is invoked with a callback
  - When the callback returns or throws
  - Then a fresh directory under `os.tmpdir()` is created for the callback and removed before the primitive returns, and the callback's result is returned unchanged
- [config-materialized](tests/lifecycle.scenario.l1.test.ts):
  - Given a test passes a Config and a callback
  - When the environment starts
  - Then a fresh temp directory is created, the config module's default product config file is materialized from the Config, and the callback receives an env object with `productDir` and write helpers
- [removed-on-return](tests/lifecycle.scenario.l1.test.ts):
  - Given the callback returns normally
  - When the environment completes
  - Then the temp directory and all its contents are removed before the outer test continues
- [removed-on-throw](tests/lifecycle.scenario.l1.test.ts):
  - Given the callback throws
  - When the environment completes
  - Then the temp directory is removed and the original error is rethrown unchanged
- [nested-environments](tests/nesting.scenario.l1.test.ts):
  - Given a `withTestEnv` call nested inside another
  - When the inner callback returns
  - Then only the inner temp directory is removed, and the outer environment remains intact for the outer callback
- [helper-writes](tests/helpers.scenario.l1.test.ts):
  - Given a callback destructures a helper, such as `writeNode`
  - When the helper is invoked
  - Then the corresponding file is written under the temp product directory, and subsequent reads see the change

## Test.Property: environment invariants

- [always-removed](tests/lifecycle.property.l1.test.ts): temp directories the environment creates are always removed: whether the callback returns or throws, and however many times it suspends, the directory is gone once the environment completes
- [independent-environments](tests/isolation.property.l1.test.ts): concurrent environments are independent: two callbacks running in parallel receive distinct temp directories, and the writes of one do not appear in the other
- [generators-valid](tests/generators.property.l1.test.ts): generator output is valid by construction: every path or tree the environment's generators produce parses cleanly through the corresponding spec-tree read operation
- [generated-trees-materialize](tests/env-generators.property.l1.test.ts): every generated node and tree materializes inside a callback into a temp product state the spec-tree read operation recognizes, resolving each node's spec file to the directory that holds it

## Test.Compliance: temp root

- [removal-under-temp-root](tests/safety.compliance.l1.test.ts): ALWAYS: temp directories live under the OS temp directory (`os.tmpdir()`), and their removal is constrained to that root, so no path outside the OS temp root is ever deleted

## Audit: environment construction

- cleanup-in-finally: ALWAYS: cleanup runs exactly once per invocation, from a `finally` block wrapping the callback, so no caller can opt out and no cleanup call appears in user test code
- shared-temp-primitive: ALWAYS: every test harness that needs a temp directory composes on the shared temp-directory primitive, which owns directory creation under `os.tmpdir()` and validated removal — no harness creates or removes a temp directory directly
- caller-config: ALWAYS: `withTestEnv` and `withSpecTreeEnv` accept a `Config` from the caller and expose `productDir` through the callback environment — neither composes configs from the production registry
- callback-scoped-only: NEVER: `withTestEnv` or `withSpecTreeEnv` returns a handle that requires manual cleanup — both entrypoints are callback-scoped
- no-filesystem-mocking: NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — the environment constructs real directories on the real filesystem under a temp root
- no-production-registry: NEVER: read from the production `src/config/registry.ts` — the environment operates on Configs supplied by the test, isolating it from production descriptor changes
