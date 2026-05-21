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
