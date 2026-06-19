# Open Issues

## Worktree scope resolver does not surface the not-in-git diagnostic

`resolveWorktreeScopeDir` resolves the local worktree root through `detectWorktreeProductRoot`, which carries a `warning` on its non-git fallback path (resolution falls back to the working directory outside a git repository). `resolveWorktreeScopeDir` returns a bare scope-directory string and drops that warning, so its only consumers — the compact store and retrieve commands — have no channel to surface the not-in-git diagnostic. The sibling resolvers `resolveSessionsScopeDir` and `resolveWorktreesScopeDir` return result structs (`ResolveSessionsScopeResult` / `ResolveWorktreesScopeResult`) that carry `warning?: string`, and the session commands that consume them surface it.

Observed in PR review of the scope-dir return-type normalization (PR #212).

Impact: the compact commands silently fall back to a `.spx/worktree` directory under the working directory when run outside a git repository, with no diagnostic, while the session and worktree commands warn in the same situation. This is a pre-existing asymmetry — the bare `string` return does not regress behaviour, because the prior `Result<string>` shape never carried the warning either.

Resolution condition: decide whether the compact commands should surface a not-in-git diagnostic, and if so, give `resolveWorktreeScopeDir` a result struct carrying `warning?: string` (matching its sibling resolvers) and a compact-command assertion for the warning output. Deferred from PR #212 because the resolution requires a product decision on compact-command diagnostics with its own spec assertion, outside that PR's return-type normalization.
