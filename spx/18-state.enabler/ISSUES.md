# Open Issues

## Scope-dir resolvers return inconsistent types

`worktreeScopeDir(productDir)` returns `Result<string>` while `sessionsScopeDir(productDir)` returns a bare `string`, so the two members of the same `resolve*ScopeDir` family carry different return types — callers unwrap `Result<string>` for worktree scope yet read a plain string for sessions scope. The bare `string` is the more correct type: composing a `.spx/` scope dir from a product root is infallible (validation happens on tokens, not on this composition), so `worktreeScopeDir`'s `Result` wrapper is unnecessary ceremony.

Observed in PR review of the state-module consolidation (PR #155).

Impact: the scope-resolver family reads inconsistently, and a caller must remember which member is fallible.

Resolution condition: normalize `worktreeScopeDir` (and its `resolveWorktreeScopeDir` wrapper) to return a bare `string`, updating the unwrap sites in `src/testing/run-state.ts`, `src/commands/compact/retrieve.ts`, and `src/commands/compact/store.ts`. Deferred from PR #155 because the caller updates reach beyond the consolidation's own diff.
