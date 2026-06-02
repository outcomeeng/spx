# Open Issues

## Dist-rebuild-on-pull hook has no governing decision record

The `post-merge` and `post-rewrite` `rebuild-dist` hooks in `lefthook.yml` rebuild `dist/` after a pull in the main worktree, so a published or pnpm-linked `spx` (which resolves to `./dist`) reflects the merged code. This is a distinct lifecycle from pre-commit enforcement — different triggers, side effects (`pnpm install` plus a full build), and worktree-gating semantics — but `lefthook.yml` cites only the lefthook pre-commit ADR (ADR-021), which scopes to pre-commit test enforcement.

Observed in PR review of `build/dist-rebuild-hook` (PR #84).

Impact: the rebuild-on-pull policy is unspecified; its triggers, the `rebase`-only post-rewrite guard, and the main-worktree gate live only in `lefthook.yml` comments.

Resolution condition: extend the lefthook ADR (or author a new decision record) to govern the dist-rebuild-on-pull policy, then cite it from `lefthook.yml`.
