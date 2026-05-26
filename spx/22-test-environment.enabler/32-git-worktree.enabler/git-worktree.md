# Git Worktree

PROVIDES a callback-scoped git-worktree test environment — a temp `productDir` initialized as a real git repository with isolated identity, helpers for writing tracked and untracked files, every git ignore source (top-level `.gitignore`, nested `.gitignore`, `.git/info/exclude`, the `core.excludesFile`-referenced excludes file), submodules, and direct `runGit` access — with `GIT_*` variables stripped from `process.env` for the callback's duration and guaranteed cleanup on return or throw
SO THAT every file-inclusion test under `spx/17-file-inclusion.enabler/` — the git-tracking reader at `spx/17-file-inclusion.enabler/21-ignore-source.enabler/`, the path-predicates at `spx/17-file-inclusion.enabler/32-path-predicates.enabler/`, the scope-resolver at `spx/17-file-inclusion.enabler/43-scope-resolver.enabler/`, and any downstream consumer
CAN exercise git's native ignore-resolution behavior against real worktrees, without hand-rolled `git init` scaffolding, leaked user `GIT_DIR` / `GIT_WORK_TREE` context, or `process.env` mutations escaping their owning test

## Assertions

### Scenarios

- Given the callback starts, when the env is delivered, then `productDir` exists under `os.tmpdir()`, is initialized as a git repository, has `user.email` and `user.name` configured, and every `GIT_*` variable is stripped from `process.env` for the callback's duration ([test](tests/lifecycle.scenario.l1.test.ts))
- Given the callback returns normally, when the harness completes, then the temp `productDir` and its contents are removed ([test](tests/lifecycle.scenario.l1.test.ts)) and every prior `process.env.GIT_*` value is restored ([test](tests/safety.compliance.l1.test.ts))
- Given the callback throws, when the harness completes, then the temp `productDir` is removed and the original error is rethrown unchanged ([test](tests/lifecycle.scenario.l1.test.ts)) and every prior `process.env.GIT_*` value is restored ([test](tests/safety.compliance.l1.test.ts))
- Given the callback invokes `writeTracked(path, content)` then `commit(message)`, when `git ls-files --cached` runs against `productDir`, then the path appears in the output ([test](tests/helpers.scenario.l1.test.ts))
- Given the callback invokes `writeUntracked(path, content)`, when `git ls-files --others --exclude-standard --full-name` runs against `productDir`, then the path appears in the output ([test](tests/helpers.scenario.l1.test.ts))
- Given the callback invokes `addSubmodule(relativePath)`, when `git ls-files --cached --full-name` runs against `productDir`, then the submodule path appears once as a single entry and the submodule's contained files do not appear ([test](tests/helpers.scenario.l1.test.ts))

### Mappings

- For each git ignore source — top-level `.gitignore` via `writeGitignore(".", pattern)`, nested `.gitignore` via `writeGitignore(directory, pattern)`, repo-local exclude via `writeInfoExclude(pattern)`, and the `core.excludesFile`-referenced excludes file via `configureGlobalExcludes(pattern)` — a path matching the pattern is excluded from `git ls-files --cached --others --exclude-standard --full-name` ([test](tests/ignore-sources.mapping.l1.test.ts))

### Compliance

- ALWAYS: temp directories live under `os.tmpdir()` and their removal is constrained to that root ([test](tests/safety.compliance.l1.test.ts))
- ALWAYS: every `GIT_*` variable is stripped from `process.env` for the callback's duration so consumer git invocations that inherit `process.env` resolve from `productDir` rather than the caller's environment ([test](tests/safety.compliance.l1.test.ts))
- ALWAYS: cleanup runs on both the return and throw paths of the callback — no caller can opt out, no cleanup call appears in user test code ([test](tests/lifecycle.scenario.l1.test.ts))
- ALWAYS: the harness's git invocations consume `runGit`, `readGit`, and `buildGitTestEnvironment` from `testing/harnesses/git-test-constants.ts` — git subprocess invocation logic is not duplicated inside the harness module ([review](21-git-worktree-shape.adr.md))
- ALWAYS: every git subprocess the harness spawns through `runGit` and `readGit` inherits the cleaned environment that `buildGitTestEnvironment` builds — `GIT_*` stripped, `GIT_CONFIG_GLOBAL` neutralized to `/dev/null`, and `GITHUB_ACTIONS` removed — so none of the caller's ambient git or GitHub-Actions context leaks into the subprocess ([review](21-git-worktree-shape.adr.md))
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — the harness constructs a real git repository under a real temp root ([review](21-git-worktree-shape.adr.md))
- NEVER: synchronous variants of `withGitWorktreeEnv` or its helpers — async-only, matching Node's `fs/promises` and preserving stack-trace fidelity through `finally` ([review](21-git-worktree-shape.adr.md))
- NEVER: accept a `Config` parameter — the harness substrate is a git working tree, not a product directory ([review](21-git-worktree-shape.adr.md))
- NEVER: invoke `withGitWorktreeEnv` from a `.concurrent` vitest test — `process.env` is process-global, and concurrent callbacks within the same Node process trip on each other's `GIT_*` strip-and-restore window ([review](21-git-worktree-shape.adr.md))
