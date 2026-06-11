# Plan: Worktree Detection implementation

The governing decision, this node's spec, the detector, and both consumers are
implemented on branch `fix/main-checkout-detection` (off `origin/main`). What
remains is governance/cleanup that is separable from the detector + consumer
wiring this branch carries.

**Policy redesign (implemented).** The bare-pool main checkout is named after the `origin`
**repository** (`<pool>/<repo-name>`, e.g. `spx/spx`), not the default branch
(`<pool>/main`) — every project naming its main checkout `main` gives developers
identically-named directories and editor windows. The default-branch signal is dropped so a
main checkout briefly off the default branch still anchors session writes.
`spx/15-worktree-management.pdr.md`, the classifier ADR, the node spec, the
`src/git/root.ts` detector, and the co-located tests all carry the redesigned rule, and the
node has left `spx/EXCLUDE`.

## Settled design decisions — do NOT re-ask

- **Non-bare repository** (single-tree OR with linked worktrees): the main checkout is the
  main working tree — the parent of the git-common-dir — reached from any worktree, on any
  branch / any directory name.
- **Bare pool**: a worktree is the main checkout when two signals agree — its directory
  basename `==` the `origin` remote's repository name, and it is a sibling of the bare repo
  (`dirname(git-common-dir) == worktree-root's parent`). The path is therefore
  `<pool>/<repo-name>` — typically `project/project` — never `<pool>/main`.
- **Branch-agnostic** (the default-branch signal is dropped): designation never reads the
  checked-out or default branch. A main checkout briefly off the default branch (e.g. while
  repairing it) must still anchor session writes; requiring the branch would fail those
  writes for no benefit.
- **`core.bare` discriminates** non-bare from bare-pool; the common-dir-vs-worktree path
  relationship alone cannot tell a non-bare repo's linked worktree from a pool member. The
  probe is `git config --get --type=bool core.bare` — the flag precedes the key, so git
  reads it as an option, not a value-match regex.
- **`GitFacts` shape**: `{ worktreeRoot, commonDir, commonDirIsBare, originUrl }`. No branch
  field. The repository name is parsed from `originUrl` inside the pure functions (strip a
  trailing `.git`, take the final path segment, across `https://…/owner/repo.git` and
  `git@host:owner/repo.git` forms).
- **One detector, both consumers**: session handoff and the precommit dist-rebuild gate
  both call `isMainCheckout`.
- **Detector home**: this enabler (`spx/24-worktree-detection.enabler`, index 24).
- **`resolveDefaultBranch` stays** in the module for the handoff base gate's
  `origin/<default>` detached-tip rule — it is no longer a main-checkout signal.

## Done on this branch

- Detector reworked to the redesigned rule: `repositoryName` / `isMainCheckout` /
  `mainCheckoutPath` (pure) + `gatherGitFacts` probe in `src/git/root.ts`; the dead
  `isRootWorktree` / `computeRelativeWorktreePath` removed with their tests.
- Unified real-git harness `@testing/harnesses/worktree-layout/` (`withWorktreeLayoutEnv`)
  provisions all three layouts — single-tree, non-bare-with-linked, bare-pool — subsuming
  the interim bare-pool harness. Co-located mapping + scenario tests over it, including the
  real non-bare-with-linked scenario asserting `false` from the linked worktree through
  `gatherGitFacts` (the F-005 follow-up, now at scenario grade).
- **Consumer 1 — session handoff**: `src/commands/session/handoff.ts` +
  `src/domains/session/handoff-base*.ts` switched to `isMainCheckout` / `mainCheckoutPath`;
  terminology "root worktree" → "main checkout", "linked worktree" → "non-main checkout"
  across the session specs (`11-session-frontmatter.pdr.md`, `session-cli.md`,
  `session-store.md`, the rendering ADR, the session-cli `ISSUES.md`) and tests. The
  touched `[review]` on `session-store.md` migrated to `[test]`.
- **Consumer 2 — precommit dist-rebuild gate**: `lefthook.yml` `post-merge` / `post-rewrite`
  call `src/lib/precommit/main-checkout-gate.ts`, a thin boundary over the tested
  `isMainCheckout`, replacing the inline `dirname(common-dir) == toplevel` bash that
  misfires in a bare pool.

## Remaining (separable from this branch's consumer wiring)

1. **Precommit dist-rebuild governance.** The gate is wired as a thin boundary over the
   tested `isMainCheckout`; the dist-rebuild-on-pull behavior itself is still unspecified.
   Author the decision under `spx/43-precommit.enabler` citing
   `spx/15-worktree-management.pdr.md`, closing the open item in
   `spx/43-precommit.enabler/ISSUES.md` (PR #84).
2. **Reconcile `spx/36-session.enabler/26-worktree-detection.adr.md`**: the two general
   resolvers are now owned by this node; `resolveSessionConfig` stays session-specific.
   Rescope/rename that ADR and reference this node. Decide whether config's
   `65-product-directory-api.enabler/21-git-root-result-shape.adr.md` moves up here.
3. **Co-locate the resolver tests** (`tests/root-resolution.scenario.l1.test.ts`,
   `tests/default-branch.scenario.l1.test.ts`): they verify `detectWorktreeProductRoot`,
   `detectGitCommonDirProductRoot`, and `resolveDefaultBranch`, currently exercised under
   `spx/16-config.enabler/65-product-directory-api.enabler` and the session nodes.
4. **Fix stale `spx/PLAN.md` operating-constraint**: its "Operating constraints" section
   names the off-limits checkout as `/Users/shz/Code/outcomeeng/spx` with `git -C …/spx
   switch main` commands — that path is now the bare-pool container; the main checkout will
   be `…/spx/spx` after the rename. Update path + ff/rebuild commands to the bare-pool
   layout. The live `spx/main` → `spx/spx` rename + global-`spx` relink happens only after
   this change merges, since it breaks every other agent's `.spx/` resolution the moment it
   runs.

## Cross-repo follow-ups (plugins repo `outcomeeng/plugins/main`, separate)

These are follow-ups to author in the plugins repo — described here, not yet filed there:

- Author an `ISSUES.md` entry at `spx/21-spec-tree.enabler/35-evidence.enabler/` recording
  the evidence vocabulary drift and the evidence-type selection guidance living outside
  `/testing`.
- Author an `ISSUES.md` entry at `spx/21-spec-tree.enabler/12-worktree-provisioning.enabler/`
  recording that `init_worktrees.py` hardcodes a `main` working-tree directory and must
  provision the main checkout as `<pool>/<repo-name>` (the `origin` repository name) per the
  redesigned `spx/15-worktree-management.pdr.md`.
