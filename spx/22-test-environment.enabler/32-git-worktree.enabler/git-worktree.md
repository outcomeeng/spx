---
id: 01a22003-90fa-7113-9f13-95734062d266
---

# Git Worktree

PROVIDES the callback-scoped git-worktree test environment of `testing/harnesses/git-worktree/git-worktree.ts` — a temp `productDir` initialized as a real git repository with isolated identity, helpers that write tracked and untracked files, write every git ignore source, add submodules, commit, and run git, and `GIT_*` variables except `GIT_CEILING_DIRECTORIES` stripped from `process.env` for the callback's duration with cleanup on return or throw — together with the `withProcessEnv` harness of `testing/harnesses/process-env/process-env.ts` and the generators of `testing/generators/git-worktree/git-worktree.ts` and `testing/generators/git-name/git-name.ts`, which draw the paths, patterns, contents, git names, and environment values those tests use
SO THAT every test that observes git's tracked-file listing and native ignore resolution
CAN run against a real worktree without hand-rolled `git init` scaffolding, leaked `GIT_DIR` or `GIT_WORK_TREE` context, or `process.env` mutations escaping their owning test

## Assertions

### Test.Scenario: lifecycle

- [callback-start](tests/lifecycle.scenario.l1.test.ts):
  - Given no `GIT_*` override beyond the caller's environment
  - When `withGitWorktreeEnv` delivers its env to the callback
  - Then `productDir` exists under `os.tmpdir()`, is a git repository with `user.email` and `user.name` configured, and `process.env` holds no `GIT_*` variable except `GIT_CEILING_DIRECTORIES` for the callback's duration
- [ceiling-held](tests/lifecycle.scenario.l1.test.ts):
  - Given `GIT_CEILING_DIRECTORIES` is set in the caller's `process.env`
  - When the callback runs and then returns or throws
  - Then `GIT_CEILING_DIRECTORIES` holds the caller's value during the callback and again after it
- [return-removes-product-dir](tests/lifecycle.scenario.l1.test.ts):
  - Given the callback returns normally
  - When the harness completes
  - Then `productDir` and its contents no longer exist
- [throw-removes-and-rethrows](tests/lifecycle.scenario.l1.test.ts):
  - Given the callback throws an error
  - When the harness completes
  - Then `productDir` no longer exists and the caller receives that same error unchanged

### Test.Scenario: file helpers

- [tracked-after-commit](tests/helpers.scenario.l1.test.ts):
  - Given the callback calls `writeTracked(path, content)` and then `commit(message)`
  - When `git ls-files --cached` runs against `productDir`
  - Then its output lists `path`
- [untracked-listed](tests/helpers.scenario.l1.test.ts):
  - Given the callback calls `writeUntracked(path, content)`
  - When `git ls-files --others --exclude-standard --full-name` runs against `productDir`
  - Then its output lists `path`
- [submodule-single-entry](tests/helpers.scenario.l1.test.ts):
  - Given the callback calls `addSubmodule(relativePath)`
  - When `git ls-files --cached --full-name` runs against `productDir`
  - Then its output lists `relativePath` exactly once and lists no file inside the submodule
- [run-git-stdout](tests/helpers.scenario.l1.test.ts):
  - Given an env from `withGitWorktreeEnv`
  - When the callback calls `runGit(["rev-parse", "--is-inside-work-tree"])`
  - Then it returns `true` with no surrounding whitespace

### Test.Scenario: process environment

- [env-restored-on-return](tests/process-env.scenario.l1.test.ts):
  - Given `process.env` holds a value for one key and no entry for another
  - When the callback passed to `withProcessEnv` sets both keys and returns
  - Then the first key holds its prior value and the second key has no entry
- [env-restored-on-reject](tests/process-env.scenario.l1.test.ts):
  - Given `process.env` holds a value for one key and no entry for another
  - When the callback passed to `withProcessEnv` sets both keys and rejects
  - Then the first key holds its prior value, the second key has no entry, and the caller receives the rejection unchanged

### Test.Mapping: [ignore-sources](tests/ignore-sources.mapping.l1.test.ts)

Each git ignore source, configured through its harness helper with a generated pattern, maps to an untracked path matching that pattern that `git ls-files --cached --others --exclude-standard --full-name` against `productDir` omits.

| Case                | Helper                               | Ignored path        | Listed |
| ------------------- | ------------------------------------ | ------------------- | ------ |
| top-level-gitignore | `writeGitignore(".", pattern)`       | `pattern`           | no     |
| nested-gitignore    | `writeGitignore(directory, pattern)` | `directory/pattern` | no     |
| info-exclude        | `writeInfoExclude(pattern)`          | `pattern`           | no     |
| global-excludes     | `configureGlobalExcludes(pattern)`   | `pattern`           | no     |

### Test.Compliance: isolation

- [temp-under-tmpdir](tests/safety.compliance.l1.test.ts): ALWAYS: every temp directory the harness creates lies under `os.tmpdir()`, and its removal refuses a path outside `os.tmpdir()`, removing nothing
- [git-env-stripped](tests/safety.compliance.l1.test.ts): ALWAYS: every `GIT_*` variable the caller's `process.env` holds, except `GIT_CEILING_DIRECTORIES`, is absent from `process.env` for the callback's duration, so git invoked inside the callback, by the harness or by consumer code that inherits `process.env`, resolves `productDir` and never a repository a caller's `GIT_DIR` names
- [git-env-restored](tests/safety.compliance.l1.test.ts): ALWAYS: after the callback returns or throws, every `GIT_*` variable the caller's `process.env` held holds its prior value again, and every `GIT_*` variable absent before is absent again

### Audit: harness design

- shared-git-helpers: ALWAYS: the harness's git invocations consume `runGit`, `readGit`, and `buildGitTestEnvironment` from `testing/harnesses/git-test-constants.ts`; git subprocess invocation logic duplicated inside the harness module fails
- cleaned-subprocess-environment: ALWAYS: every git subprocess the harness spawns through `runGit` and `readGit` inherits the cleaned environment `buildGitTestEnvironment` builds, with `GIT_*` stripped except `GIT_CEILING_DIRECTORIES`, `GIT_CONFIG_GLOBAL` set to `/dev/null`, and `GITHUB_ACTIONS` removed; a subprocess that inherits the caller's ambient git or GitHub Actions context fails
- finally-cleanup: ALWAYS: temp-directory removal and `GIT_*` restoration run in a `finally` block around the callback, so no caller opts out of cleanup and no test of this Node or of its consumers calls a cleanup function itself
- no-filesystem-mocks: NEVER: the harness or a test of this Node uses `vi.mock()`, `jest.mock()`, `memfs`, or any other filesystem-mocking mechanism; the harness constructs a real git repository under a real temp root
- async-only: NEVER: the harness exports a synchronous variant of `withGitWorktreeEnv` or of a helper; every helper returns a promise, matching Node's `fs/promises`
- no-config-parameter: NEVER: `withGitWorktreeEnv` accepts a `Config` parameter; its substrate is a git working tree, not a product directory
- no-concurrent-callers: NEVER: a test invokes `withGitWorktreeEnv` from a `.concurrent` vitest test, since `process.env` is process-global and concurrent callbacks interleave each other's `GIT_*` strip and restore
- generated-values: ALWAYS: the tests of this Node draw every path, ignore pattern, file content, git name, and environment value from `testing/generators/git-worktree/git-worktree.ts` or `testing/generators/git-name/git-name.ts`; a value written as a literal in a test of this Node fails
