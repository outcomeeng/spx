# Open Issues

## Handoff re-derives git state in two places

`handoffCommand` still resolves repository state through two independent paths for one `cwd`: `resolveSessionConfig` calls `resolveSessionsScopeDir`, which calls `detectGitCommonDirProductRoot` (`git rev-parse --show-toplevel` + `--git-common-dir`) to locate `.spx/sessions`, while `resolveSessionGitRef` separately calls `gatherGitFacts` plus branch/head probes to evaluate the handoff-base gate.

Observed while reconciling coordination notes on June 25, 2026.

Impact: every `spx session handoff` repeats repository-root discovery work before it writes the session file. The handoff-base resolver now gathers its own facts in one path, but the session-store location and handoff-base gate still do not share a single repository fact packet.

Resolution condition: gather the worktree root, common git directory, branch, and head facts once for `handoffCommand`, then feed that packet to both session-directory resolution and the handoff-base gate.

## Cross-product session injection mechanics are underspecified

Root product guidance now directs agents to inject an SPX session for the plugin repository when a product workflow observes a plugin-skill follow-up. The session command model defines `.spx/sessions/` as repository-local shared state under that repository's Git common-dir, and `spx session handoff` carries git-context gates for the repository it runs in. The current guidance does not yet specify the operator-facing mechanics for writing a session into a different product's queue: which command form to use, which working directory owns the write, how to select an unoccupied worktree in the target repository, or how to satisfy that repository's handoff gate without relocating product work.

Resolution condition: define a governed cross-product session-injection workflow that names the target repository working directory, derives its shared session store through the target repository's own `spx session handoff`, verifies worktree occupancy before mutation, and records the limits imposed by [`spx/15-worktree-management.pdr.md`](spx/15-worktree-management.pdr.md).

## The session scenarios leave the worktree-directory rule and skipped git detection unobserved

**Evidence:** `tests/session.scenario.l1.test.ts` observes no filesystem, so the NEVER rule against creating `.spx/` in a linked worktree has no violating case. Its explicit `--sessions-dir` case never observes that git detection is skipped.

**Impact:** an implementation that creates `.spx/` in a linked worktree, or that runs git detection under an explicit `--sessions-dir`, passes every linked test.

**Settlement condition:** a case observes that no `.spx/` directory appears in a linked worktree, and a recording git dependency shows no call under an explicit `--sessions-dir`.

## The session scenarios hand-pick their paths

**Evidence:** `tests/session.scenario.l1.test.ts` names five literal paths at its call sites: `/custom-session-root`, `/product-root`, `/not/a/repo`, `/common-product-root` and `/linked-worktree-root`.

**Impact:** the scenarios exercise only the paths their author chose, so path resolution that holds for those five and fails for another path passes every linked test.

**Settlement condition:** the scenarios take their paths from a generator.
