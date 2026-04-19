# Callback-Scoped Test Environment

## Purpose

This decision governs the API shape of the spec-tree test environment in `src/spec/testing/`. The enabler's assertions specify observable behavior; this ADR specifies the shape that makes those assertions true and the reasoning behind the inversion-of-control pattern.

## Context

**Business impact:** Every spec-tree-touching test — config, spec-tree descriptor, session, validation, language — needs a real filesystem fixture. A library-provided pattern that cannot be opted out of for cleanup, that isolates temp state per test, and that generates valid fixtures from typed inputs eliminates the entire class of "my test leaked a temp directory" and "my test ran against a stale fixture" bugs. Tests across the codebase share one shape; readers learn it once.

**Technical constraints:** spx is TypeScript ESM. Tests run under Vitest. Temp roots come from `os.tmpdir()`; directory creation via `fs/promises.mkdtemp`; removal via `fs/promises.rm`. The environment module depends on `src/config/` for the `Config` type (not the registry) and nothing else in production code.

## Decision

`src/spec/testing/` exposes `withTestEnv(config: Config, callback: (env: SpecTreeEnv) => Promise<void>): Promise<void>` as its primary entry point. The function creates a fresh temp directory under `os.tmpdir()`, materializes `spx.config.yaml` from the passed `Config`, builds an `env` object containing `{ projectDir, writeNode, writeDecision, writeRaw, readFile }` and property-based generators (`arbitraryNodePath`, `arbitraryDecisionPath`, `arbitrarySpecTree`, and any additional generators derived from the Config), invokes the callback with that env, and removes the temp directory in a `finally` block. The callback's return value is awaited; its error, if any, is rethrown after cleanup. No handle, cleanup function, or disposable is ever returned to the caller. Generators are included in the env for destructuring; they are also exported as free functions at the module level so property-based tests can compose them outside a `withTestEnv` callback when they produce pure data without needing a temp directory.

## Rationale

Callback-scoped lifecycle is the only shape that cannot leak. A returned cleanup handle depends on the test author to call it — manual cleanup is forgotten, especially on error paths. `finally` around the callback body is structural: the runtime guarantees cleanup on both return and throw without test-author cooperation.

Inversion of control pairs with a rich env object. Tests destructure the helpers they need; the env offers a uniform surface regardless of which helpers a specific test uses. The `withTestEnv` shape is an established pattern across related codebases, carrying familiarity for readers moving between projects.

Passing an explicit `Config` (rather than reading from `src/config/registry.ts`) isolates the environment from the production registry. Tests construct test-scoped Configs — with test-local descriptors or ad-hoc shapes — without perturbing production state. This mirrors the config enabler's single-owner principle: the environment consumes `Config`; it does not compose one.

Alternatives considered:

- **Factory + method-object with manual cleanup** (a factory that returns a handle with a `cleanup()` method the caller must invoke). Rejected because manual cleanup is opt-in; every test author becomes responsible for error-path correctness. A callback-scoped environment removes the opt-in entirely.
- **Registry-aware environment that composes Config from the live registry.** Rejected because tight coupling to production state defeats the per-test isolation that tests exist to achieve. Tests wanting live-registry coverage construct the live Config themselves and pass it in.
- **Class-based `TestEnvironment` with lifecycle methods.** Rejected for the same reasons cited in `src/spec-tree/` ADR-style decisions: state lives on disk, not in memory. A class wrapping a factory adds noise without benefit.
- **Separate `withConfigEnv` and `withTreeEnv` entry points.** Rejected because the asymmetry is not observable from the test author's perspective — both need a temp project root and cleanup, differing only in which env helpers are useful. One entry point with destructurable helpers serves both cases without duplicating lifecycle code.

## Trade-offs accepted

| Trade-off                                                                     | Mitigation / reasoning                                                                                                                              |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Callback body adds a level of indentation to tests                            | Modern editors collapse it; the guarantee against leaked temp directories outweighs a single `await withTestEnv(async ({ ... }) => { ... });` line  |
| Generators exist in two forms (env-scoped destructure and free export)        | Same underlying functions exposed twice; the env-scoped view is convenient inside callbacks, the free export is needed for pure-data property tests |
| Every test constructs its own `Config` rather than inheriting from production | Tests gain isolation; migration tooling or test-scoped descriptor builders fill the ergonomics gap                                                  |
| No direct access to temp directory after the callback returns                 | Tests that need post-callback observation must observe inside the callback before it returns; matches the lifecycle contract                        |

## Invariants

- Every `withTestEnv` invocation creates a fresh temp directory and removes it before returning to its caller
- Cleanup runs exactly once per invocation, in a `finally` block
- Temp directory paths are always rooted at `os.tmpdir()`; removal is refused for any path outside that root
- The env object passed to the callback contains only the public helpers and generators defined by this ADR — no internal state, no private cleanup handles
- `withTestEnv` never imports from `src/config/registry.ts` or any production registry source — only the `Config` type

## Compliance

### Recognized by

Files under `src/spec/testing/` contain only `withTestEnv`, the `SpecTreeEnv` type, helper implementations, and generators. Tests across the codebase call `withTestEnv(config, async ({ ... }) => { ... })` — no `createHarness().cleanup()` pattern, no manual `mkdtemp`/`rm` in test bodies, no class instantiation with disposable methods.

### MUST

- `withTestEnv(config, callback)` is the sole public entry point for spec-tree test environments — all other exports are types or free-function generators ([review])
- Cleanup runs in a `finally` block around the callback invocation — guaranteed on both return and throw paths ([review])
- The env object is a plain record of helpers and generators — no mutable state, no private handles, no class instances ([review])
- Generators read exclusively from the `Config` supplied to the environment — generator output varies with Config input, not with production registry state ([review])
- Tests that need a fixture call `withTestEnv` — direct `fs/promises.mkdtemp` calls in test bodies are a violation ([review])

### NEVER

- Export a factory that returns a handle with a manual `cleanup()` method ([review])
- Import from `src/config/registry.ts` or any production registry source ([review])
- Accept a project root that falls outside `os.tmpdir()` — any root path is validated before use ([review])
- Expose internal state (temp-path bookkeeping, cleanup flags) through the env object ([review])
- Use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism within the environment's own implementation or within its tests ([review])
- Provide synchronous variants of `withTestEnv` or its helpers — async-only, to match Node's `fs/promises` and preserve stack-trace fidelity through `finally` ([review])
