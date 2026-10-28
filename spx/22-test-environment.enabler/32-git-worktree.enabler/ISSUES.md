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

## The Compliance assertion on callback cleanup rests on scenario-typed evidence

**Evidence:** the spec audit of head `10ff4056eecbe36281a04ac06e68f75f02cf45df` filed finding `evidence-type-mismatch` on unchanged text of `git-worktree.md`. The Compliance assertion "ALWAYS: cleanup runs on both the return and throw paths of the callback" is a universal claim, and the file `tests/lifecycle.scenario.l1.test.ts` that verifies it is scenario-typed. A universal claim takes mapping, conformance, property or compliance evidence.

**Impact:** a universal cleanup rule is proven by existential examples, so the evidence type does not match the quantifier of the claim.

**Settlement condition:** the assertion's verifying evidence is a mapping, conformance, property or compliance test, or the assertion is reworded as an existential claim that a scenario proves.

## Six routed Compliance assertions carry a non-canonical audit tag

**Evidence:** the spec audit of head `10ff4056eecbe36281a04ac06e68f75f02cf45df` filed finding `invalid-tag` on unchanged text of `git-worktree.md`. Six routed Compliance assertions carry `([review](21-git-worktree-shape.adr.md))`, which is not a canonical audit tag form; a routed audit assertion carries `([audit:{rule-slug}])` or the pathless `([audit])`. The six begin: "ALWAYS: the harness's git invocations consume runGit, readGit, and buildGitTestEnvironment", "ALWAYS: every git subprocess the harness spawns through runGit and readGit inherits the cleaned environment", "NEVER: vi.mock(), jest.mock(), memfs", "NEVER: synchronous variants of withGitWorktreeEnv", "NEVER: accept a Config parameter", "NEVER: invoke withGitWorktreeEnv from a .concurrent vitest test".

**Impact:** the six assertions route to no recognized verification mechanism, so no audit result keys to them.

**Settlement condition:** each of the six carries a canonical audit tag with a slug unique within the spec.
