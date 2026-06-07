# Callback-Scoped Temp-Directory Lifecycle

Every test harness that needs a temp directory obtains it through `testing/harnesses/with-temp-dir.ts`: `withTempDir<T>(prefix, callback)` creates a fresh directory under `os.tmpdir()` via `mkdtemp`, invokes the callback, removes the directory in a `finally` block — refusing removal of any resolved path outside `os.tmpdir()` — and returns the callback's result, rethrowing its error after cleanup; `createTempDir(prefix)` and `removeTempDir(dir)` expose the same create and guarded-remove for harnesses whose lifecycle returns a handle, and `withTempDir` itself composes on them. The spec-tree test environment `withTestEnv(config, callback)` in `testing/harnesses/spec-tree/` composes on `withTempDir`, materializes the config module's default product config file from the passed `Config`, and invokes the callback with a plain `env` record of `productDir`, write helpers (`writeNode`, `writeDecision`, `writeRaw`, `readFile`), and `Config`-derived generators (also exported as free functions for pure-data property tests); `withSpecTreeEnv(config, callback, options?)` wraps it with a representative current-spec-tree fixture materialized under `productDir/spx/`. No harness calls `mkdtemp` or a temp-directory `rm` directly, and the spec-tree environment never reads `src/config/registry.ts` — only the `Config` type.

## Rationale

Callback-scoped lifecycle is the only shape that cannot leak: a returned cleanup handle depends on the test author to call it and is forgotten on error paths, whereas `finally` around the callback body is structural — the runtime guarantees cleanup on both return and throw without test-author cooperation. A single base primitive concentrates the refuse-outside-`os.tmpdir()` safety and the cleanup contract in one place, so they hold for every harness by construction and a harness change touches its own setup rather than the temp-directory mechanics. Inversion of control pairs with a rich env object so tests destructure only the helpers they need against a uniform surface, following the established `withTestEnv` shape readers know from related codebases. Passing an explicit `Config` rather than reading `src/config/registry.ts` isolates the environment from production state — mirroring the config enabler's single-owner principle: the environment consumes a `Config`, it does not compose one.

Rejected: per-harness hand-rolled `mkdtemp`/`rm` (duplicates the lifecycle and lets the safety and cleanup contracts drift between harnesses); a factory-shaped environment with a manual `cleanup()` handle (opt-in cleanup makes every author responsible for error-path correctness); a registry-aware environment composing `Config` from the live registry (couples to production state and defeats per-test isolation); and a class-based `TestEnvironment` (state lives on disk, so a class wrapping a factory adds noise without benefit).

## Invariants

- `withTempDir` creates a fresh directory under `os.tmpdir()` on every invocation and removes it before returning to its caller.
- Cleanup runs exactly once per invocation, in a `finally` block, on both the return and throw paths.
- Removal is refused for any resolved path outside `os.tmpdir()`.
- Every test harness that needs a temp directory obtains it through this module — `withTempDir` for callback-scoped harnesses, `createTempDir` + `removeTempDir` for handle-returning harnesses; no harness calls `mkdtemp` or a temp-directory `rm` directly.
- The spec-tree env object passed to the callback contains only the public helpers and generators defined by this ADR — no internal state, no private cleanup handles.
- `withTestEnv` never imports from `src/config/registry.ts` or any production registry source — only the `Config` type.

## Verification

### Audit

- ALWAYS: `withTempDir<T>(prefix, callback)` is the cleanup-owning temp-directory primitive for callback-scoped harnesses; a handle-returning harness composes on `createTempDir(prefix)` and `removeTempDir(dir)` from the same module — every harness obtains its temp directory through this module ([audit])
- ALWAYS: `withTestEnv(config, callback)` is the spec-tree test environment and `withSpecTreeEnv(config, callback, options?)` wraps it for current spec-tree-shaped fixtures; both inherit cleanup from `withTempDir` ([audit])
- ALWAYS: cleanup runs in a `finally` block around the callback invocation — guaranteed on both return and throw paths ([audit])
- ALWAYS: the spec-tree env object is a plain record of helpers and generators — no mutable state, no private handles, no class instances ([audit])
- ALWAYS: generators read exclusively from the `Config` supplied to the environment — generator output varies with `Config` input, not with production registry state ([audit])
- NEVER: hand-roll `mkdtemp` or a temp-directory `rm` in a harness or test body — obtain the temp directory through `testing/harnesses/with-temp-dir.ts` (`withTempDir` for callback-scoped harnesses, `createTempDir` + `removeTempDir` for handle-returning harnesses) ([audit])
- NEVER: make `withTestEnv` or `withSpecTreeEnv` a factory that returns a handle with a manual `cleanup()` method — the spec-tree environment is callback-scoped ([audit])
- NEVER: import from `src/config/registry.ts` or any production registry source ([audit])
- NEVER: remove a path that falls outside `os.tmpdir()` — the resolved path is validated before removal ([audit])
- NEVER: expose internal state (temp-path bookkeeping, cleanup flags) through the env object ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism within the primitive, the environment, or their tests ([audit])
- NEVER: provide synchronous variants of `withTempDir`, `withTestEnv`, or their helpers — async-only, to match Node's `fs/promises` and preserve stack-trace fidelity through `finally` ([audit])
