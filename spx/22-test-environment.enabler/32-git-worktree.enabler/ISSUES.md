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

## Temp-directory removal constraint has no test observation

**Evidence:** The test-evidence audit of `spx/22-test-environment.enabler/32-git-worktree.enabler/git-worktree.md` filed finding `spx/22-test-environment.enabler/32-git-worktree.enabler/tests/safety.compliance.l1.test.ts:misaligned` against the clause "ALWAYS: temp directories live under the run root and their removal is constrained to that root". The test `ALWAYS: productDir is rooted under os.tmpdir()` in `spx/22-test-environment.enabler/32-git-worktree.enabler/tests/safety.compliance.l1.test.ts` asserts only `env.productDir.startsWith(tmpdir())`. The removal-constraint clause, which `removeTempDir` enforces by refusing paths outside the run root, has no observation. Dropping that guard from `removeTempDir` in `testing/harnesses/with-temp-dir.ts` leaves the test passing.

**Impact:** The removal half of the clause is unverified. A regression that lets `removeTempDir` delete paths outside the run root passes the evidence for the clause.

**Settlement condition:** An observation exists that fails when `removeTempDir` accepts a path outside the run root.

**Surfaced by:** test-evidence audit finding f-001 (severity FILED, remediation target test-file); the Maintainer ruled that the finding is recorded in the changeset of https://github.com/outcomeeng/changes/issues/865.
