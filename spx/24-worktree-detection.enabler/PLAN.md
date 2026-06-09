# Plan: Worktree Detection implementation

The governing decision and this node's spec are committed on branch
`fix/main-checkout-detection` (off `origin/main`). Remaining: implement the
detector and wire its two consumers through `/spec-tree:applying`.

## Committed so far (this branch)

- `spec(worktree): govern main-checkout designation` — `spx/15-worktree-management.pdr.md`
  (renamed from `15-worktree-resolution.pdr.md`, broadened with the two-layout
  main-checkout definition; all citations updated).
- `spec(worktree-detection): own the git detection module in a top-level enabler`
  — this node's spec + `spx/EXCLUDE` entry.

## Settled design decisions — do NOT re-ask

- **Default branch is git-resolved** from `origin/HEAD` (supports `trunk`), never a
  hardcoded `main`.
- **Single-tree** (non-bare, no linked worktrees): the lone working tree is the main
  checkout on any branch / any directory name.
- **Bare pool**: a worktree is the main checkout only when all three agree — checked-out
  branch `== origin/HEAD` target, directory basename `==` that branch name, and it is a
  sibling of the bare repo (`dirname(git-common-dir) == worktree-root's parent`).
- **One detector, both consumers**: session handoff and the precommit dist-rebuild gate
  both call `isMainCheckout`.
- **Detector home**: this enabler (`spx/24-worktree-detection.enabler`, index 24).

## Remaining work (in order)

1. `/spec-tree:applying spx/24-worktree-detection.enabler` — implement `isMainCheckout`
   in `src/git/root.ts` + co-located tests in this node's `tests/`. Mirror
   `init_worktrees.py`'s facts/classify split: a pure `isMainCheckout(facts)` over
   observed `GitFacts`, plus a probe reading them through the existing `GitDependencies`
   DI (inject a fake `execa` — NO filesystem mocking, per the config/test-environment
   no-mock rule). `resolveDefaultBranch` (origin/HEAD) already exists. Run the three
   `/applying` audit gates. Remove this node from `spx/EXCLUDE` once tests pass.

2. Wire the consumers, replacing `isRootWorktree` with `isMainCheckout`:
   - `src/domains/session/handoff-base.ts`, `src/commands/session/handoff.ts`.
   - `lefthook.yml` `post-merge` + `post-rewrite` `rebuild-dist` gate: call a tested `tsx`
     entry over `isMainCheckout` (mirror the pre-commit `src/lib/precommit/run.ts`
     pattern), replacing the inline `dirname(common-dir) == toplevel` bash that misfires
     in the bare pool.

3. Session specs — terminology only (the base rule is correct and unchanged: the main
   checkout hands off permissively recording its branch; a non-main worktree must hand off
   from a clean checkout detached at `origin/<default>` — that is persist-then-detach, by
   design). Swap `root worktree` -> `main checkout` in
   `spx/36-session.enabler/11-session-frontmatter.pdr.md`,
   `.../76-session-cli.enabler/session-cli.md`,
   `.../43-session-store.enabler/session-store.md`, and the session `ISSUES.md`; update the
   session tests' wording. Switch handoff detection to `isMainCheckout`.

4. Precommit dist-rebuild governance: author the dist-rebuild-on-pull decision under
   `spx/43-precommit.enabler` citing `spx/15-worktree-management.pdr.md`, closing the open
   item in `spx/43-precommit.enabler/ISSUES.md` (PR #84). Repoint `lefthook.yml`.

5. Reconcile `spx/36-session.enabler/26-worktree-detection.adr.md`: the two general
   resolvers are now owned by this node; `resolveSessionConfig` stays session-specific.
   Rescope/rename that ADR and reference this node. Decide whether config's
   `65-product-directory-api.enabler/21-git-root-result-shape.adr.md` moves up here.

6. Fix stale `spx/PLAN.md` operating-constraint (its "Operating constraints" section names
   the off-limits checkout as `/Users/shz/Code/outcomeeng/spx` with `git -C …/spx switch
   main` commands — that path is now the bare-pool container; the main checkout is
   `…/spx/main`). Update path + ff/rebuild commands to the bare-pool layout.

7. `spx validation all` + `pnpm test` green; commit per concern; open the PR when
   `REVIEW_READINESS` holds.

## Cross-repo follow-ups (plugins repo `outcomeeng/plugins/main`, separate, written uncommitted)

- `spx/21-spec-tree.enabler/35-evidence.enabler/ISSUES.md` — evidence vocabulary drift +
  evidence-type selection guidance living outside `/testing`.
- `spx/21-spec-tree.enabler/12-worktree-provisioning.enabler/ISSUES.md` —
  `init_worktrees.py` hardcodes `main`; reconcile to the git-resolved default branch.
