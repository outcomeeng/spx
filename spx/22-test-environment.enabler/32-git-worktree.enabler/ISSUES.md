# Open Issues

## configureGlobalExcludes leaves `.git-global-excludes` as untracked residue under productDir

`configureGlobalExcludes(content)` writes the excludes content to `productDir/.git-global-excludes` and points local `core.excludesFile` at that path. The excludes file is neither tracked nor gitignored. Any consumer that combines `configureGlobalExcludes` with `git ls-files --others --exclude-standard --full-name` (without filtering) will observe `.git-global-excludes` as an unexpected untracked entry.

**Impact:** Today's ignore-sources mapping test asserts `not.toContain(ignoredPath)`, which is unaffected by extra entries. Future consumers in `spx/17-file-inclusion.enabler/21-ignore-source.enabler/` that assert a complete untracked-set shape after invoking `configureGlobalExcludes` will see the residue.

**Resolution options:**

- Write the excludes file outside `productDir` (a sibling temp file tracked for cleanup in the same `finally`). Symmetric with the submodule fix already shipped.
- Have `configureGlobalExcludes` also append `.git-global-excludes` to `.git/info/exclude` so git ignores it. Conflicts with `writeInfoExclude` — consumer writes would overwrite the harness preamble.
- Document as a callsite constraint: callers exercising `ls-files --others` after `configureGlobalExcludes` must filter `.git-global-excludes`.

**Skills:** `typescript:coding-typescript`, `typescript:testing-typescript`, `spec-tree:testing`.

**Surfaced by:** [PR #55](https://github.com/outcomeeng/spx/pull/55) automated review cycle 2 (FOLLOW-UP class).

## Harness environment strip drops GIT_CEILING_DIRECTORIES — `testing/harnesses/git-worktree/git-worktree.ts`, `captureAndStripProcessGitEnv`, `consistency`

`captureAndStripProcessGitEnv` in `testing/harnesses/git-worktree/git-worktree.ts`, called by `withGitWorktreeEnv`, deletes every `process.env` key that starts with the local `GIT_ENV_PREFIX = "GIT_"`. The check has no exception for `GIT_CEILING_DIRECTORIES`, so the callback runs without the ceiling variable. A second `captureAndStripProcessGitEnv` in `testing/harnesses/worktree-layout/worktree-layout.ts` applies the same unconditional prefix strip. `withoutGitEnvironment` in `src/lib/git/environment.ts` removes every `GIT_*` variable except `GIT_CEILING_DIRECTORIES`, which it keeps so repository discovery stays bounded. The harness `runGit` and `readGit` build their subprocess environment through `buildGitTestEnvironment` from `process.env`, which is already stripped inside the callback, so those invocations carry no ceiling either. Three independent derivations of "strip `GIT_*`" disagree on the ceiling variable.

The harness conforms to the node's text. `spx/22-test-environment.enabler/32-git-worktree.enabler/git-worktree.md` and [`spx/22-test-environment.enabler/32-git-worktree.enabler/21-git-worktree-shape.adr.md`](spx/22-test-environment.enabler/32-git-worktree.enabler/21-git-worktree-shape.adr.md) state that every `GIT_*` variable is stripped for the callback's duration, and `spx/22-test-environment.enabler/32-git-worktree.enabler/tests/safety.compliance.l1.test.ts` asserts that strip over the set variables. `spx/22-test-environment.enabler/32-worktree-layout.enabler/worktree-layout.md` states the same for the second harness. Neither text names a retained variable, so the defect lies in the declarations as well as in the code: the declared strip contradicts the behavior of `withoutGitEnvironment`.

**Impact:** In a sandbox that bounds git discovery with `GIT_CEILING_DIRECTORIES`, git invoked inside either callback can search above the sandbox for a repository.

**Settlement condition:** Both harnesses keep `GIT_CEILING_DIRECTORIES` through the callback, by routing through `withoutGitEnvironment` or by an equal exception, and restore it afterward. The spec and decision text of `spx/22-test-environment.enabler/32-git-worktree.enabler/` and `spx/22-test-environment.enabler/32-worktree-layout.enabler/` state the retained variable, and this entry is removed.
