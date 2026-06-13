# Open Issues

## Rebuild-dist main-checkout gate misfires in a bare-repository pool

The `post-merge`/`post-rewrite` `rebuild-dist` hooks in `lefthook.yml` gate on a bash heuristic — `dirname(common-dir) == --show-toplevel` — that designates the main worktree in a non-bare repository but misfires in a bare-repository pool, where the main checkout is the `origin`-repository-named worktree beside the bare repo, not the one whose common-dir parent matches its toplevel.

The corrected gate over the tested `isMainCheckout` classifier (`src/git/root.ts`, governed by [`spx/18-state.enabler/32-worktree-topology.enabler/21-main-checkout-classifier.adr.md`](../18-state.enabler/32-worktree-topology.enabler/21-main-checkout-classifier.adr.md)) is drafted on the `wip/precommit-main-checkout-gate` branch (the `src/lib/precommit/main-checkout-gate.ts` module plus the lefthook wiring).

Two things to settle before re-landing it:

- **Ordering tension**: the gate runs TypeScript via `tsx` (a devDependency), so install-before-gate runs install in feature worktrees while gate-before-install cannot run without `tsx`. Resolve with a `tsx`-free gate (POSIX-sh re-derivation, accepting divergence from the tested classifier) or by accepting one trade-off — decide with the governing decision.
- **Governance**: author the dist-rebuild-on-pull decision under this node citing `spx/15-worktree-management.pdr.md`, resolving the entry below in the same pass.

## Dist-rebuild-on-pull hook has no governing decision record

The `post-merge` and `post-rewrite` `rebuild-dist` hooks in `lefthook.yml` rebuild `dist/` after a pull in the main worktree, so a published or pnpm-linked `spx` (which resolves to `./dist`) reflects the merged code. This is a distinct lifecycle from pre-commit enforcement — different triggers, side effects (`pnpm install` plus a full build), and worktree-gating semantics — but `lefthook.yml` cites only the lefthook pre-commit ADR (ADR-021), which scopes to pre-commit test enforcement.

Observed in PR review of `build/dist-rebuild-hook` (PR #84).

Impact: the rebuild-on-pull policy is unspecified; its triggers, the `rebase`-only post-rewrite guard, and the main-worktree gate live only in `lefthook.yml` comments.

Resolution condition: extend the lefthook ADR (or author a new decision record) to govern the dist-rebuild-on-pull policy, then cite it from `lefthook.yml`.
