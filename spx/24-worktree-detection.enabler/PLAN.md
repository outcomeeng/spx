# Plan: Worktree Detection implementation

The governing decision and this node's spec are committed on branch
`fix/main-checkout-detection` (off `origin/main`). Remaining: rework the detector
to the redesigned rule and wire its two consumers through `/spec-tree:applying`.

**Policy redesign (implemented).** The bare-pool main checkout is named after the `origin`
**repository** (`<pool>/<repo-name>`, e.g. `spx/spx`), not the default branch
(`<pool>/main`) — every project naming its main checkout `main` gives developers
identically-named directories and editor windows. The default-branch signal is dropped so a
main checkout briefly off the default branch still anchors session writes.
`spx/15-worktree-management.pdr.md`, the classifier ADR, the node spec, the
`src/git/root.ts` detector, and the co-located tests all carry the redesigned rule, and the
node has left `spx/EXCLUDE`. The remaining work below is consumer wiring, not the detector.

## Committed so far (this branch)

- `spec(worktree): govern main-checkout designation` — `spx/15-worktree-management.pdr.md`
  (renamed from `15-worktree-resolution.pdr.md`, broadened with the two-layout
  main-checkout definition; all citations updated).
- `spec(worktree-detection): own the git detection module in a top-level enabler`
  — this node's spec + `spx/EXCLUDE` entry.
- `spec(worktree-detection): designate the main checkout and its path` — the
  classifier ADR + the path-designation and non-bare-linked assertions.
- `feat(worktree-detection): detect the main checkout and resolve its path` —
  `isMainCheckout` / `mainCheckoutPath` (pure) + the probe in `src/git/root.ts`,
  reading common-dir bareness from `git config --get core.bare` so a non-bare
  repository with linked worktrees is never mistaken for a bare pool; co-located
  mapping/scenario tests + the `testing/generators/main-checkout/` generator.
- `docs(worktree-detection): track the unnamed non-bare-with-linked layout` —
  `ISSUES.md`.

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
  relationship alone cannot tell a non-bare repo's linked worktree from a pool member.
- **`GitFacts` shape**: `{ worktreeRoot, commonDir, commonDirIsBare, originUrl }`. No branch
  field. The repository name is parsed from `originUrl` inside the pure functions (strip a
  trailing `.git`, take the final path segment, across `https://…/owner/repo.git` and
  `git@host:owner/repo.git` forms).
- **One detector, both consumers**: session handoff and the precommit dist-rebuild gate
  both call `isMainCheckout`.
- **Detector home**: this enabler (`spx/24-worktree-detection.enabler`, index 24).
- **`resolveDefaultBranch` stays** in the module for the handoff base gate's
  `origin/<default>` detached-tip rule — it is no longer a main-checkout signal.

## Remaining work (in order)

1. ~~Rework the detector + tests to the redesigned rule through the `/applying` gates, land
   the bare-pool harness (F-003) and the co-located resolver tests (F-001), and leave
   `spx/EXCLUDE`.~~ **Done** — `GitFacts` is `{ worktreeRoot, commonDir, commonDirIsBare,
   originUrl }`; `repositoryName`/`isMainCheckout`/`mainCheckoutPath` + the probe carry the
   branch-agnostic repository-name rule; `@testing/harnesses/bare-pool` provisions a real
   bare pool; the architecture, test-evidence, and code audit gates all returned APPROVED;
   `spx validation all` and the full test suite are green; node 24 is out of `spx/EXCLUDE`.
   The notes below record what the original two evidence items were:
   - **Bare-pool probe coverage** (F-003): provision a real bare-repository pool (clone
     `--bare` + `worktree add` + an `origin` remote so the repo name resolves) and assert
     `detectMainCheckout` returns `true` for the `<pool>/<repo-name>` checkout and `false`
     for a feature worktree — exercising the real `git config --get core.bare == true` path.
     Provision through a co-located `@testing/harnesses/` module, not inline in the `tests/`
     file. This harness is the deliverable that lets the rule be tested independently of the
     live spx pool (the live `spx/main` → `spx/spx` rename cannot happen until this lands).
   - **Resolver assertions** (F-001): `worktree-detection.md` declares root-resolution
     (`tests/root-resolution.scenario.l1.test.ts`) and default-branch
     (`tests/default-branch.scenario.l1.test.ts`) assertions whose tests are not
     yet co-located — they verify `detectWorktreeProductRoot`,
     `detectGitCommonDirProductRoot`, and `resolveDefaultBranch`, currently tested
     under `spx/16-config.enabler/65-product-directory-api.enabler` and the session
     nodes. Co-locating them is part of step 5 (resolver ownership). Until both
     items land, this node stays in `spx/EXCLUDE`.

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
   main` commands — that path is now the bare-pool container; the main checkout will be
   `…/spx/spx` after the rename). Update path + ff/rebuild commands to the bare-pool layout.
   The live `spx/main` → `spx/spx` rename + global-`spx` relink happens only after this
   change merges, since it breaks every other agent's `.spx/` resolution the moment it runs.

7. `spx validation all` + `pnpm test` green; commit per concern; open the PR when
   `REVIEW_READINESS` holds.

## Cross-repo follow-ups (plugins repo `outcomeeng/plugins/main`, separate)

These are follow-ups to author in the plugins repo — described here, not yet filed there:

- Author an `ISSUES.md` entry at `spx/21-spec-tree.enabler/35-evidence.enabler/` recording
  the evidence vocabulary drift and the evidence-type selection guidance living outside
  `/testing`.
- Author an `ISSUES.md` entry at `spx/21-spec-tree.enabler/12-worktree-provisioning.enabler/`
  recording that `init_worktrees.py` hardcodes a `main` working-tree directory and must
  provision the main checkout as `<pool>/<repo-name>` (the `origin` repository name) per the
  redesigned `spx/15-worktree-management.pdr.md`.

## Review findings deferred (this PR's changes-reviewer, all DEBT, none merge-blocking)

- **Session terminology + ADR reconciliation** (reviewer F-002/F-003/F-004): the session
  specs still say "root worktree"; swapping them to "main checkout" cascades into the
  session handoff code's output strings and tests — that is the consumer wiring already
  scheduled as steps 2, 3, and 5 above, not an isolated spec edit. Deferred there.
- **Non-bare-with-linked real scenario** (reviewer F-005): `detectMainCheckout` over a
  non-bare repository *with* a linked worktree is covered at mapping grade
  (`arbitraryNonBareLinkedFacts`) and the `core.bare == false` probe path is exercised by
  the single-tree scenario, but no scenario provisions a real non-bare repo with a linked
  worktree and asserts `false` from the linked worktree through `gatherGitFacts`. Add that
  scenario (a co-located `@testing/harnesses/` non-bare-linked provisioner) to lift the
  third layout from mapping-grade to scenario-grade evidence.
