# Git Worktree Harness Shape

## Purpose

This decision governs the API shape of the git-worktree test harness in `testing/harnesses/git-worktree/`. The enabler's assertions specify observable behavior; this ADR specifies the shape that makes those assertions true, the substrate the harness operates on, and the reasoning behind the no-config entry point, the callback-scoped `GIT_*` strip-and-restore, and the choice to set `core.excludesFile` through local git config rather than mutating `process.env.GIT_CONFIG_GLOBAL`.

## Context

**Business impact:** File-inclusion tests exercise git's native ignore-resolution behavior against four ignore sources — top-level `.gitignore`, nested `.gitignore`, `.git/info/exclude`, and the file referenced by `core.excludesFile` — plus submodules. Without a harness, every test re-implements `git init`, identity configuration, gitconfig isolation, and submodule scaffolding. Consumer production code inside the file-inclusion subtree invokes git through `execa` with `extendEnv: true` defaults; without strip-and-restore of `GIT_*` on `process.env`, the caller's `GIT_DIR` / `GIT_WORK_TREE` would leak into the consumer's git invocations.

**Technical constraints:** spx is TypeScript ESM. Tests run under Vitest. Temp roots come from `os.tmpdir()`; directory creation via `fs/promises.mkdtemp`; removal via `fs/promises.rm`. Git-subprocess primitives — `runGit`, `readGit`, `buildGitTestEnvironment`, `cleanGitTestEnvironment`, `GIT_TEST_CONFIG`, `GIT_TEST_SUBCOMMANDS` — live in `testing/harnesses/git-test-constants.ts` and strip `GIT_*` inheritance via `withoutGitEnvironment` from `src/git/environment.ts`. Git rejects `file://` submodule URLs by default per CVE-2022-39253; local-repo submodule creation requires `-c protocol.file.allow=always`. Git honors `core.excludesFile` from every config level — system, global, local, or worktree — when resolving `--exclude-standard`.

## Decision

`testing/harnesses/git-worktree/` exposes `withGitWorktreeEnv(callback: (env: GitWorktreeEnv) => Promise<void>): Promise<void>` as the lifecycle primitive. The function:

1. Creates a fresh temp directory under `os.tmpdir()` and uses it as `productDir`.
2. Captures every `GIT_*` variable from `process.env` and strips them for the callback's duration.
3. Initializes `productDir` as a git repository via `git init`, then configures `user.email` and `user.name` from `GIT_TEST_CONFIG`.
4. Builds an `env` object containing `{ productDir, writeTracked, writeUntracked, writeGitignore, writeInfoExclude, configureGlobalExcludes, addSubmodule, commit, runGit }` and invokes `callback(env)`.
5. In a `finally` block, restores every captured `GIT_*` value (including unsetting variables that were absent before invocation), removes the temp `productDir`, and rethrows any caller error unchanged.

Every git invocation made by the harness flows through `runGit` and `readGit` from `git-test-constants.ts`. Those primitives pass `extendEnv: false` together with `buildGitTestEnvironment()`, which routes through `cleanGitTestEnvironment` and `withoutGitEnvironment`.

Helpers operate as follows:

- `writeTracked(relativePath, content)` writes the file under `productDir` and stages it with `git add`. It does not commit.
- `writeUntracked(relativePath, content)` writes the file under `productDir` and performs no git operation.
- `writeGitignore(directory, content)` writes `<directory>/.gitignore` under `productDir`; `"."` or `""` resolves to the top level.
- `writeInfoExclude(content)` writes `productDir/.git/info/exclude`.
- `configureGlobalExcludes(content)` writes the excludes content to a stable path inside the temp tree (for example `productDir/.git-global-excludes`) and runs `git config core.excludesFile <that path>` against `productDir`. Local-level config is sufficient because git's `--exclude-standard` and `git config --get core.excludesFile` honor `core.excludesFile` at any config level.
- `addSubmodule(relativePath)` creates an inner local git repository under a sibling temp directory, makes one commit so it has a HEAD, and runs `git submodule add` against `productDir` with `-c protocol.file.allow=always` and the inner repo's path as the source.
- `commit(message)` runs `git commit -m message` against the staged state.
- `runGit(args)` runs `git <args>` against `productDir` through the harness's clean environment and returns trimmed stdout.

## Rationale

The harness takes no parameters because its substrate is a git working tree, not a product directory. The spec-tree harness at `spx/22-test-environment.enabler/21-callback-scoped-environment.adr.md` accepts `Config` because it materializes a product config file; this harness materializes a git repository whose shape is fixed by git itself. A `Config` parameter would be ceremony with no value.

Setting `core.excludesFile` through local git config — rather than mutating `process.env.GIT_CONFIG_GLOBAL` to point at a harness-owned gitconfig — keeps the harness orthogonal to `git-test-constants.ts`'s isolation contract. The shared primitive `cleanGitTestEnvironment` strips `GIT_*` and force-sets `GIT_CONFIG_GLOBAL=/dev/null`; that contract is exercised by other harnesses (notably the lint-policy harness at `testing/harnesses/validation/lint-policy.ts`) to prove that polluted `GIT_*` env from a caller is ignored. A patch to `buildGitTestEnvironment` that lets `envOverrides` win after cleaning would break that isolation guarantee, since the lint-policy harness deliberately passes a polluted `{ GIT_DIR, GIT_WORK_TREE }` map as `envOverrides` and relies on the strip. Local-config `core.excludesFile` sidesteps the contract entirely — git resolves the setting from `productDir`'s `.git/config`, no `GIT_CONFIG_GLOBAL` mutation is required, and the harness's clean-env contract holds for every helper.

Stripping `GIT_*` from `process.env` for the callback's duration is necessary because production consumer code in `spx/17-file-inclusion.enabler/21-ignore-source.enabler/` invokes git through `execa` with `extendEnv: true` defaults. Without the strip, a caller's `GIT_DIR` would leak into the consumer's git invocations and the consumer would resolve from the wrong worktree. The strip is bounded by a `finally` block; concurrent callbacks within the same Node process trip on each other because `process.env` is process-global — the spec declares the limitation as a `NEVER` rule.

Routing every git invocation through `runGit`/`readGit`/`buildGitTestEnvironment` keeps subprocess semantics consistent with the precommit-environment harness at `testing/harnesses/with-git-env.ts`. Both harnesses rely on the same isolation guarantees from `withoutGitEnvironment` in `src/git/environment.ts`. Duplicating subprocess logic in the harness module would invite drift; consuming the shared primitives keeps one truth source.

Submodule creation requires `-c protocol.file.allow=always` because git's CVE-2022-39253 mitigation rejects `file://` submodule URLs by default. The flag is scoped to the one `git submodule add` invocation rather than set globally in the gitconfig so unrelated invocations retain default protocol restrictions.

The helper surface is intentionally narrow. Tests that need extra git operations call `runGit` directly. Adding a named helper for every git verb the harness might host produces a surface that drifts apart from what consumers actually exercise; `runGit` covers the long tail.

Alternatives considered:

- **Wrap the spec-tree `withTestEnv` and add git initialization on top.** Rejected because `withTestEnv` materializes a product config file as part of its lifecycle. The git-worktree fixture has no config dependency, and forcing one in would couple two unrelated harness lifecycles.
- **Mutate `process.env.GIT_CONFIG_GLOBAL` to point at a harness-owned temp gitconfig file.** Rejected because it requires either patching `buildGitTestEnvironment`'s strip semantics (breaking the lint-policy harness's isolation contract) or bypassing the shared `runGit`/`readGit` primitives. Local-level `core.excludesFile` achieves the same observable git behavior without either compromise.
- **Class-based `GitWorktreeHarness` with `setup()` / `teardown()` methods.** Rejected for the same reason the parent ADR rejects it: state lives on disk and in `process.env`; a class wrapping a factory adds noise without benefit, and the parent ADR's `[review]` rule against "class instances" in env objects applies here too.
- **Combine with `testing/harnesses/with-git-env.ts` into one harness exposing L1 and L2 entry points.** Rejected because the L2 harness owns lefthook installation, symlinked `node_modules`/`package.json`/`vitest.config.ts`/`tsconfig.json`/`lefthook.yml`, and `exec`-based command execution — concerns with their own assertions and their own future spec node under `spx/43-precommit.enabler/`. The L1 git-worktree primitive is the substrate; the L2 precommit fixture is an independent layer.
- **Concurrent-safe variant that isolates `process.env` per callback.** Not feasible — `process.env` is process-global in Node. The compromise is documenting sequential-only use as a hard rule.

## Trade-offs accepted

| Trade-off                                                                                            | Mitigation / reasoning                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process.env.GIT_*` strip forbids concurrent callbacks inside the same Node process                  | Vitest defaults to sequential within a file; the constraint is declared as a `NEVER` rule in the spec rather than hidden                                                                                  |
| `configureGlobalExcludes` writes `core.excludesFile` at the local config level, not the global level | Git resolves `core.excludesFile` from every config level identically for `--exclude-standard` and `git config --get`; consumer production code observes the same behavior at any level                    |
| Helper surface excludes a named verb for every git operation                                         | `runGit` is exposed as the escape hatch; named helpers cover the operations the spec asserts                                                                                                              |
| Submodule helper opts in to `protocol.file.allow=always` for one invocation                          | The flag is scoped to the `git submodule add` call; consumer git invocations and harness invocations elsewhere keep default protocol restrictions                                                         |
| Harness duplicates the `productDir` vocabulary used by `withTestEnv` despite operating on a git repo | `productDir` is the project-wide root-directory vocabulary per `spx/CLAUDE.md` and `spx/15-worktree-resolution.pdr.md`; the git working tree at `productDir` is the same vocabulary, not a divergent term |

## Invariants

- Every `withGitWorktreeEnv` invocation creates a fresh temp directory and removes it before returning to its caller
- Every captured `process.env` variable is restored — variables that were unset before invocation are unset again after `finally`; variables that held a value before invocation hold the same value again
- Every git invocation made by the harness inherits no `GIT_*` variable from the calling environment
- Every git invocation made by consumer code inside the callback inherits no `GIT_*` variable from the caller's `process.env`

## Compliance

### Recognized by

One module under `testing/harnesses/git-worktree/` exports `withGitWorktreeEnv` and the `GitWorktreeEnv` type. Tests across `spx/17-file-inclusion.enabler/` call `withGitWorktreeEnv(async ({ ... }) => { ... })` for git-worktree fixtures and never re-implement `git init`, identity configuration, gitconfig isolation, or submodule scaffolding in their own bodies.

### MUST

- `withGitWorktreeEnv(callback)` is the sole entry point — a single async factory function, not a class, not a method on another module ([review])
- The harness consumes `runGit`, `readGit`, `buildGitTestEnvironment`, and the `GIT_TEST_CONFIG` / `GIT_TEST_SUBCOMMANDS` constants from `testing/harnesses/git-test-constants.ts` — git subprocess invocation logic is not duplicated inside the harness module ([review])
- Cleanup runs in a `finally` block around the callback invocation — guaranteed on both return and throw paths ([review])
- Every `GIT_*` variable is stripped from `process.env` for the duration of the callback; every captured value is restored in the `finally` block, including unsetting variables that were absent before invocation ([review])
- The env object is a plain record of helpers — no mutable state, no private handles, no class instances ([review])
- `configureGlobalExcludes` writes `core.excludesFile` through `git config <key> <path>` against `productDir` (local-level config) — `process.env.GIT_CONFIG_GLOBAL` is never set ([review])
- `addSubmodule` invokes `git submodule add` with `-c protocol.file.allow=always` scoped to that one invocation ([review])

### NEVER

- Synchronous variants of `withGitWorktreeEnv` or its helpers ([review])
- `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism within the harness's own implementation or within its tests ([review])
- Accept a `Config` parameter — the harness substrate is a git working tree, not a product directory ([review])
- Mutate `process.env.GIT_CONFIG_GLOBAL` to point at a harness-owned gitconfig — `core.excludesFile` is configured through local git config instead ([review])
- Invoke `withGitWorktreeEnv` from a `.concurrent` vitest test — `process.env` is process-global, and concurrent callbacks within the same Node process trip on each other's `GIT_*` strip-and-restore window ([review])
