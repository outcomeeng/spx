# Callback-Scoped Temp-Directory Lifecycle

## Purpose

This decision governs the callback-scoped temp-directory lifecycle shared by every test harness: a generic `withTempDir` primitive that owns temp-directory creation and cleanup, and the spec-tree test environment (`withTestEnv` / `withSpecTreeEnv` in `testing/harnesses/spec-tree/`) composed on it. The enabler's assertions specify observable behavior; this ADR specifies the shape that makes those assertions true and the reasoning behind the inversion-of-control pattern.

## Context

**Business impact:** Every test harness that touches the filesystem — spec-tree, config, session, validation, markdown, git, language runners — needs a fresh temp directory with guaranteed cleanup. A single callback-scoped primitive that cannot be opted out of for cleanup, isolates temp state per invocation, and refuses to remove any path outside the OS temp root eliminates the "my test leaked a temp directory" and "my cleanup deleted the wrong path" classes of bug across every harness at once. Harnesses share one shape; readers learn it once.

**Technical constraints:** spx is TypeScript ESM. Tests run under Vitest. Temp roots come from `os.tmpdir()`; directory creation via `fs/promises.mkdtemp`; removal via `fs/promises.rm`. The temp-directory primitive depends only on Node's `fs/promises`, `os`, and `path`. The spec-tree environment additionally depends on `src/config/` for the `Config` type (not the registry) and nothing else in production code.

## Decision

`testing/harnesses/with-temp-dir.ts` exposes `withTempDir<T>(prefix: string, callback: (dir: string) => Promise<T>): Promise<T>` as the base cleanup-owning temp-directory primitive. It creates a fresh directory under `os.tmpdir()` via `mkdtemp`, invokes the callback with the directory path, removes the directory in a `finally` block — refusing removal of any resolved path outside `os.tmpdir()` — and returns the callback's result, rethrowing the callback's error after cleanup. Callback-scoped harnesses compose on `withTempDir`.

The same module exposes `createTempDir(prefix: string): Promise<string>` and `removeTempDir(dir: string): Promise<void>` for harnesses whose lifecycle returns a handle rather than scoping to a callback: `createTempDir` performs the same `mkdtemp` under `os.tmpdir()` without the callback, and `removeTempDir` performs the same outside-`tmpdir` removal guard. `withTempDir` itself composes on `createTempDir` and `removeTempDir`. No harness calls `mkdtemp` or a temp-directory `rm` directly; every harness obtains its temp directory through this module.

`testing/harnesses/spec-tree/` exposes `withTestEnv(config: Config, callback: (env: SpecTreeEnv) => Promise<void>): Promise<void>` as the spec-tree test environment. It composes on `withTempDir` to obtain a temp product directory, materializes the config module's default product config file from the passed `Config`, builds an `env` object containing `{ productDir, writeNode, writeDecision, writeRaw, readFile }` and property-based generators (`arbitraryNodePath`, `arbitraryDecisionPath`, `arbitrarySpecTree`, and any additional generators derived from the Config), invokes the callback with that env, and inherits cleanup from `withTempDir`. Generators are included in the env for destructuring; they are also exported as free functions at the module level so property-based tests can compose them outside a `withTestEnv` callback when they produce pure data without needing a temp directory.

The same module exposes `withSpecTreeEnv(config, callback, options?)` as the current spec-tree fixture layer. It wraps `withTestEnv`, supplies a representative current-spec-tree fixture, materializes that fixture under `productDir/spx/`, and exposes filesystem and in-memory source/snapshot/projection helpers over the same fixture. `withSpecTreeEnv` inherits cleanup transitively from `withTempDir` through `withTestEnv`.

## Rationale

Callback-scoped lifecycle is the only shape that cannot leak. A returned cleanup handle depends on the test author to call it — manual cleanup is forgotten, especially on error paths. `finally` around the callback body is structural: the runtime guarantees cleanup on both return and throw without test-author cooperation.

A single base primitive concentrates the lifecycle in one place. When every harness composes on `withTempDir`, the refuse-outside-`os.tmpdir()` safety and the cleanup-on-both-paths guarantee hold for all of them by construction, and a harness change touches its own setup rather than the temp-directory mechanics. Per-harness `mkdtemp`/`rm` re-derivation duplicates the lifecycle and lets the safety check and cleanup contract drift between harnesses.

Inversion of control pairs with a rich env object for the spec-tree layer. Tests destructure the helpers they need; the env offers a uniform surface regardless of which helpers a specific test uses. The `withTestEnv` shape is an established pattern across related codebases, carrying familiarity for readers moving between products.

Passing an explicit `Config` (rather than reading from `src/config/registry.ts`) isolates the spec-tree environment from the production registry. Tests construct test-scoped Configs — with test-local descriptors or ad-hoc shapes — without perturbing production state. This mirrors the config enabler's single-owner principle: the environment consumes `Config`; it does not compose one.

Alternatives considered:

- **Per-harness hand-rolled `mkdtemp`/`rm`.** Rejected because it duplicates the lifecycle across every harness and lets the refuse-outside-`tmpdir` safety and the cleanup contract drift between harnesses; the safety guarantee belongs in one primitive, not re-derived per harness.
- **A factory-shaped spec-tree environment with manual cleanup** (a `createTestEnv` that returns a handle with a `cleanup()` method the caller must invoke). Rejected for the spec-tree environment because manual cleanup is opt-in; every test author becomes responsible for error-path correctness. The spec-tree environment is callback-scoped; a handle-returning harness instead composes on `createTempDir` and `removeTempDir` so the lifecycle still routes through this module.
- **Registry-aware environment that composes Config from the live registry.** Rejected because tight coupling to production state defeats the per-test isolation that tests exist to achieve. Tests wanting live-registry coverage construct the live Config themselves and pass it in.
- **Class-based `TestEnvironment` with lifecycle methods.** Rejected because state lives on disk, not in memory. A class wrapping a factory adds noise without benefit.

## Trade-offs accepted

| Trade-off                                                                          | Mitigation / reasoning                                                                                                                                |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Callback body adds a level of indentation to harnesses and tests                   | Modern editors collapse it; the guarantee against leaked temp directories outweighs a single `await withTempDir(prefix, async (dir) => { ... })` line |
| `withTempDir` is generic over the callback's return type                           | A single type parameter `T` lets value-returning harnesses and void harnesses share one primitive without overloads                                   |
| Generators exist in two forms (env-scoped destructure and free export)             | Same underlying functions exposed twice; the env-scoped view is convenient inside callbacks, the free export is needed for pure-data property tests   |
| Every spec-tree test constructs its own `Config` rather than inheriting production | Tests gain isolation; migration tooling or test-scoped descriptor builders fill the ergonomics gap                                                    |
| No direct access to the temp directory after the callback returns                  | Tests that need post-callback observation must observe inside the callback before it returns; matches the lifecycle contract                          |

## Invariants

- `withTempDir` creates a fresh directory under `os.tmpdir()` on every invocation and removes it before returning to its caller
- Cleanup runs exactly once per invocation, in a `finally` block, on both the return and throw paths
- Removal is refused for any resolved path outside `os.tmpdir()`
- Every test harness that needs a temp directory obtains it through this module — `withTempDir` for callback-scoped harnesses, `createTempDir` + `removeTempDir` for handle-returning harnesses; no harness calls `mkdtemp` or a temp-directory `rm` directly
- The spec-tree env object passed to the callback contains only the public helpers and generators defined by this ADR — no internal state, no private cleanup handles
- `withTestEnv` never imports from `src/config/registry.ts` or any production registry source — only the `Config` type

## Compliance

### Recognized by

`testing/harnesses/with-temp-dir.ts` contains `withTempDir`, `createTempDir`, and the `removeTempDir` removal-safety guard. Files under `testing/harnesses/spec-tree/` contain `withTestEnv`, `withSpecTreeEnv`, their env types, helper implementations, and generators, and obtain their temp directory through `withTempDir`. Every other harness that needs a temp directory imports `withTempDir` (callback-scoped) or `createTempDir`/`removeTempDir` (handle-returning); no harness body contains an `fs/promises.mkdtemp` call or a temp-directory `rm`.

### MUST

- `withTempDir<T>(prefix, callback)` is the cleanup-owning temp-directory primitive for callback-scoped harnesses; a handle-returning harness composes on `createTempDir(prefix)` and `removeTempDir(dir)` from the same module — every harness obtains its temp directory through this module ([review])
- `withTestEnv(config, callback)` is the spec-tree test environment and `withSpecTreeEnv(config, callback, options?)` wraps it for current spec-tree-shaped fixtures; both inherit cleanup from `withTempDir` ([review])
- Cleanup runs in a `finally` block around the callback invocation — guaranteed on both return and throw paths ([review])
- The spec-tree env object is a plain record of helpers and generators — no mutable state, no private handles, no class instances ([review])
- Generators read exclusively from the `Config` supplied to the environment — generator output varies with Config input, not with production registry state ([review])

### NEVER

- Hand-roll `mkdtemp` or a temp-directory `rm` in a harness or test body — compose on `withTempDir` ([review])
- Make `withTestEnv` or `withSpecTreeEnv` a factory that returns a handle with a manual `cleanup()` method — the spec-tree environment is callback-scoped ([review])
- Import from `src/config/registry.ts` or any production registry source ([review])
- Remove a path that falls outside `os.tmpdir()` — the resolved path is validated before removal ([review])
- Expose internal state (temp-path bookkeeping, cleanup flags) through the env object ([review])
- Use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism within the primitive, the environment, or their tests ([review])
- Provide synchronous variants of `withTempDir`, `withTestEnv`, or their helpers — async-only, to match Node's `fs/promises` and preserve stack-trace fidelity through `finally` ([review])
