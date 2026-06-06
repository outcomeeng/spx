# Open Issues

## `worktreeRoot` return field is not enumerated in the spec

`detectGitCommonDirProductRoot` returns a `worktreeRoot` field on `GitProductDirResult` (the local worktree root it already reads via `git rev-parse --show-toplevel`), so a caller that needs both the worktree root and the Git common-dir product root reads `--show-toplevel` once. [`product-directory-api.md`](product-directory-api.md) governs `productDir` and the tracked / worktree / common-dir root distinction but does not enumerate `worktreeRoot` as a returned field.

**Evidence:** `src/git/root.ts` populates `worktreeRoot` on every `detectGitCommonDirProductRoot` return path; `src/commands/session/handoff.ts` consumes it to avoid a second `--show-toplevel`. The field violates no existing spec rule — it is a qualified worktree root, not the forbidden unqualified `root` alias — but it is undeclared.

**Impact:** A reader of the spec cannot tell that `detectGitCommonDirProductRoot` exposes the worktree root, and the spec-to-code contract is incomplete for that return field.

**Resolution:** Amend [`product-directory-api.md`](product-directory-api.md) through `/authoring` to declare the `worktreeRoot` return field on the Git common-dir product-root resolver, and add or extend a co-located assertion that the field carries the `--show-toplevel` value.
