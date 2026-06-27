# Issues: Precommit

Coordination notes for the lefthook-managed local hook machinery.

## FOLLOW-UP: a fresh worktree without a reachable lefthook installs through `pnpm exec` before the hook is evaluated

`renderPortableLefthookHook` (`src/lib/precommit/install-hooks.ts`) resolves the
hook runner at fire time: `$LEFTHOOK_BIN`, then a `lefthook` on `PATH`, then the
worktree's `node_modules/.bin/lefthook`, then `pnpm exec lefthook`. A worktree
created by `git worktree add` with no `node_modules` yet and no `lefthook` on
`PATH` reaches the final fallback, so `pnpm exec lefthook run post-checkout` runs
— and `pnpm exec` provisions the package set before lefthook evaluates
`lefthook.yml`, so the `post-checkout` `install-deps` gate the worktree would
otherwise drive never decides the first install.

**Impact:** bounded. A brand-new worktree has no installed dependencies, so an
initial `pnpm` provisioning is required regardless of which command triggers it;
the dependencies end up installed either way. This is distinct from the
stale-but-present `node_modules` repair the post-checkout gate
(`spx/21-infrastructure.enabler/43-precommit.enabler/60-deps-install-on-checkout.adr.md`)
eliminates for an existing worktree advanced to a new commit — that path runs the
gate through the direct `tsx` binary and does not reintroduce in-band repair.

**Resolution:** decide whether a fresh worktree should provision its dependencies
before the portable hook fires — in the worktree-bootstrap flow or in the
portable-hook shim's empty-`node_modules` fallback — so the first install is not
routed through `pnpm exec lefthook`. The fix lives in the portable-hook
installation (`src/lib/precommit/install-hooks.ts`) or the worktree-provisioning
flow, not in the `post-checkout` gate this node adds; it is a separate concern
from the gate and does not block it.

**Evidence:** spec-tree-review (Codex P2) on PR #294;
`src/lib/precommit/install-hooks.ts` `renderPortableLefthookHook` runner fallback
chain; `lefthook.yml` `post-checkout` command.
