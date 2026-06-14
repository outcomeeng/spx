# Worktree Topology

PROVIDES repository main-checkout designation (`isMainCheckout`, `mainCheckoutPath`) and default-branch resolution over a `GitFacts` probe, per [`spx/18-state.enabler/32-worktree-topology.enabler/21-main-checkout-classifier.adr.md`](21-main-checkout-classifier.adr.md) and [`spx/15-worktree-management.pdr.md`](../../15-worktree-management.pdr.md)
SO THAT session handoff's base gate and the precommit dist-rebuild gate
CAN gate main-checkout-only behaviour and resolve the `origin/<default>` tip without each re-deriving git topology

## Assertions

### Scenarios

- Given a non-bare repository whose only working tree is its root, when the main checkout is resolved, then that lone working tree is the main checkout whatever branch it holds ([test](tests/main-checkout.scenario.l1.test.ts))
- Given a real bare-repository pool with an `origin` remote, when the main checkout is resolved, then `detectMainCheckout` is true for the worktree named after the `origin` repository and false for a feature worktree ([test](tests/main-checkout.scenario.l1.test.ts))
- Given a checkout where `git rev-parse --show-toplevel` fails, when `gatherGitFacts` probes, then it returns null; and given `--git-common-dir` fails while `--show-toplevel` succeeds, then it falls back to a non-bare single-tree shape whose common dir is `<worktreeRoot>/.git`, designating that worktree the main checkout so detection agrees with `detectGitCommonDirProductRoot` ([test](tests/git-facts.scenario.l1.test.ts))

### Mappings

- In a bare-repository pool the main checkout maps from three signals together — a worktree is the main checkout when its directory basename equals the `origin` remote's repository name, its git-common-dir's parent equals the worktree's parent, and its worktree root appears in the observed git worktree list; any condition failing maps to not-the-main-checkout, a pool with no agreeing observed worktree maps to no main checkout, and the mapping is independent of the checked-out branch ([test](tests/main-checkout.mapping.l1.test.ts))
- In a non-bare repository the main working tree — the parent of the git-common-dir — is the main checkout and every linked worktree is not, even when a linked worktree's directory basename matches the bare-pool rule, because bareness (`git config --get core.bare`), not directory shape, selects the layout ([test](tests/main-checkout.mapping.l1.test.ts))
- The designated main-checkout path maps from the repository's layout: a non-bare repository — with or without linked worktrees — designates its main working tree, the parent of the git-common-dir, from any of its worktrees; a bare-repository pool designates the parent of the git-common-dir joined with the `origin` remote's repository name only when that path appears in git's worktree list, otherwise it designates no path; and whenever a checkout is the main checkout, its own worktree root equals the designated path ([test](tests/main-checkout-path.mapping.l1.test.ts))

### Compliance

- ALWAYS: resolve the repository default branch from `git symbolic-ref refs/remotes/origin/HEAD`, returning no branch when `origin/HEAD` is unset, rather than a hardcoded name ([test](tests/default-branch.compliance.l1.test.ts))
- NEVER: derive the main checkout or any worktree classification from a recorded tool path, a `.git` file-versus-directory test, or the checked-out branch — classification reads git plumbing only ([audit])
