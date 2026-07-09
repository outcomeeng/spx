# Git Worktree Harness Shape

`testing/harnesses/git-worktree/` exposes `withGitWorktreeEnv(callback)` as the lifecycle primitive: it creates a fresh temp directory under `os.tmpdir()` as `productDir`, captures and strips every `GIT_*` variable from `process.env` for the callback's duration, runs `git init` and configures `user.email` / `user.name` from `GIT_TEST_CONFIG`, invokes the callback with a plain `env` record of `productDir` and helpers (`writeTracked`, `writeUntracked`, `writeGitignore`, `writeInfoExclude`, `configureGlobalExcludes`, `addSubmodule`, `commit`, `runGit`), and in a `finally` block restores every captured `GIT_*` value (unsetting those absent before invocation), removes the temp directory, and rethrows the caller's error unchanged. Every git invocation flows through `runGit` / `readGit` from `testing/harnesses/git-test-constants.ts`, which call `buildGitTestEnvironment()` with `extendEnv: false` — routing through `cleanGitTestEnvironment` and `withoutGitEnvironment` from `src/lib/git/environment.ts`; `configureGlobalExcludes` sets `core.excludesFile` through local `git config` against `productDir` rather than mutating `process.env.GIT_CONFIG_GLOBAL`; and `addSubmodule` scopes `-c protocol.file.allow=always` to its one `git submodule add` invocation.

## Rationale

The harness takes no `Config` parameter because its substrate is a git working tree, not a product directory — the spec-tree harness at `spx/22-test-environment.enabler/21-callback-scoped-environment.adr.md` accepts `Config` because it materializes a product config file, while this harness materializes a git repository whose shape git itself fixes. Setting `core.excludesFile` through local git config — rather than mutating `process.env.GIT_CONFIG_GLOBAL` — keeps the harness orthogonal to the isolation contract of `testing/harnesses/git-test-constants.ts`: `cleanGitTestEnvironment` strips `GIT_*`, forces `GIT_CONFIG_GLOBAL=/dev/null`, and removes `GITHUB_ACTIONS` (so a subprocess never activates a nested vitest GitHub-Actions reporter against the parent CI run), and the lint-policy harness at `testing/harnesses/validation/lint-policy.ts` relies on that strip by passing a polluted `GIT_*` map as `envOverrides`; local-config `core.excludesFile` sidesteps the contract entirely. Stripping `GIT_*` for the callback's duration is necessary because consumer production code in `spx/17-file-inclusion.enabler/21-ignore-source.enabler/` invokes git through `execa` with `extendEnv: true`, so an unstripped `GIT_DIR` would leak into the consumer's git resolution. Routing every git invocation through the shared `runGit` / `readGit` / `buildGitTestEnvironment` primitives keeps subprocess semantics consistent with `testing/harnesses/with-git-env.ts` and avoids drift; `-c protocol.file.allow=always` is required for local-repo submodules because git's CVE-2022-39253 mitigation rejects `file://` submodule URLs by default; and the helper surface stays narrow with `runGit` as the escape hatch for the long tail.

Rejected: wrapping the spec-tree `withTestEnv` and adding git init on top (it materializes a product config file, coupling two unrelated harness lifecycles); mutating `process.env.GIT_CONFIG_GLOBAL` to point at a harness-owned gitconfig (requires breaking the shared strip contract or bypassing the shared primitives); a class-based `GitWorktreeHarness` (state lives on disk and in `process.env`); combining with the L2 precommit fixture in `testing/harnesses/with-git-env.ts` (that layer owns lefthook and symlinked product files, an independent concern under `spx/21-infrastructure.enabler/43-precommit.enabler/`); and a concurrent-safe variant (`process.env` is process-global, so per-callback isolation is infeasible — sequential-only is a hard rule).

## Invariants

- Every `withGitWorktreeEnv` invocation creates a fresh temp directory and removes it before returning to its caller.
- Every captured `process.env` variable is restored — variables unset before invocation are unset again after `finally`; variables that held a value hold the same value again.
- Every git invocation made by the harness inherits the environment `buildGitTestEnvironment` cleans — no `GIT_*` variable, `GIT_CONFIG_GLOBAL` neutralized to `/dev/null`, and no `GITHUB_ACTIONS` — regardless of the calling environment.
- Every git invocation made by consumer code inside the callback inherits no `GIT_*` variable from the caller's `process.env`.

## Verification

### Audit

- ALWAYS: `withGitWorktreeEnv(callback)` is the sole entry point — a single async factory function, not a class, not a method on another module ([audit])
- ALWAYS: the harness consumes `runGit` and `readGit` (which internally invoke `buildGitTestEnvironment`) and the `GIT_TEST_CONFIG` / `GIT_TEST_SUBCOMMANDS` constants from `testing/harnesses/git-test-constants.ts` — git subprocess invocation logic is not duplicated inside the harness module ([audit])
- ALWAYS: cleanup runs in a `finally` block around the callback invocation — guaranteed on both return and throw paths ([audit])
- ALWAYS: every `GIT_*` variable is stripped from `process.env` for the duration of the callback; every captured value is restored in the `finally` block, including unsetting variables that were absent before invocation ([audit])
- ALWAYS: the env object is a plain record of helpers — no mutable state, no private handles, no class instances ([audit])
- ALWAYS: `configureGlobalExcludes` writes `core.excludesFile` through `git config <key> <path>` against `productDir` (local-level config) — `process.env.GIT_CONFIG_GLOBAL` is never set ([audit])
- ALWAYS: `addSubmodule` invokes `git submodule add` with `-c protocol.file.allow=always` scoped to that one invocation ([audit])
- NEVER: synchronous variants of `withGitWorktreeEnv` or its helpers ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism within the harness's own implementation or within its tests ([audit])
- NEVER: accept a `Config` parameter — the harness substrate is a git working tree, not a product directory ([audit])
- NEVER: mutate `process.env.GIT_CONFIG_GLOBAL` to point at a harness-owned gitconfig — `core.excludesFile` is configured through local git config instead ([audit])
- NEVER: invoke `withGitWorktreeEnv` from a `.concurrent` vitest test — `process.env` is process-global, and concurrent callbacks within the same Node process trip on each other's `GIT_*` strip-and-restore window ([audit])
