# Open Issues

## Test-owned constant warning debt

`pnpm run validate` passed on May 12, 2026 and reported 11 warning-level `spx/no-test-owned-domain-constants` findings in this node. These warnings are existing test-quality debt and should be resolved with `spec-tree:testing`, `typescript:testing-typescript`, and `typescript:auditing-typescript-tests`.

Affected files:

- `spx/36-session.enabler/32-session-identity.enabler/tests/session-identity.scenario.l1.test.ts`
- `spx/36-session.enabler/43-session-store.enabler/tests/session-store.compliance.l1.test.ts`
- `spx/36-session.enabler/43-session-store.enabler/tests/session-store.scenario.l1.test.ts`
- `spx/36-session.enabler/43-session-store.enabler/tests/session-store.scenario.l2.test.ts`
- `spx/36-session.enabler/65-session-claim.enabler/tests/session-claim.scenario.l2.test.ts`
- `spx/36-session.enabler/tests/session.scenario.l1.test.ts`

Resolution: replace each test-owned semantic constant with source-owned constants, source-owned test-data APIs, or generated domain data, then remove the corresponding warning entry from the validation debt manifest.

## Formatter baseline outside session rollout

`pnpm run format:check` failed on May 20, 2026 after `pnpm run validate` and `pnpm test` passed. The failure is a formatter baseline outside the session frontmatter rollout, not a validation-gate failure.

Observed command:

```bash
pnpm run format:check
```

Reported files outside this rollout included:

- `pnpm-lock.yaml`
- `spx/15-worktree-management.pdr.md`
- `spx/16-config.enabler/PLAN.md`
- `spx/46-reviewing.enabler/15-review-directory.adr.md`

Resolution condition: run the repository formatter in a dedicated formatting cleanup, keep the resulting diff isolated from behavior changes, and then remove this entry.

## Handoff re-derives git state in two places

`handoffCommand` resolves the same git state twice for one `cwd`: `resolveSessionConfig` calls `detectGitCommonDirProductRoot` (`rev-parse --show-toplevel` + `--git-common-dir`) to locate the sessions directory, and `resolveSessionGitRef` also calls `detectGitCommonDirProductRoot` (the same `--show-toplevel` + `--git-common-dir` reads) to derive the worktree roots for the handoff-base gate.

Observed in PR review of the session-frontmatter implementation.

Impact: every `spx session handoff` issues two redundant git subprocess pairs on a hot path.

Resolution condition: gather the toplevel and common-dir once and share the result between session-directory resolution and the handoff-base gate.

## Cross-product session injection mechanics are underspecified

Root product guidance now directs agents to inject an SPX session for the plugin repository when a product workflow observes a plugin-skill follow-up. The session command model defines `.spx/sessions/` as repository-local shared state under that repository's Git common-dir, and `spx session handoff` carries git-context gates for the repository it runs in. The current guidance does not yet specify the operator-facing mechanics for writing a session into a different product's queue: which command form to use, which working directory owns the write, how to select an unoccupied worktree in the target repository, or how to satisfy that repository's handoff gate without relocating product work.

Resolution condition: define a governed cross-product session-injection workflow that names the target repository working directory, derives its shared session store through the target repository's own `spx session handoff`, verifies worktree occupancy before mutation, and records the limits imposed by `spx/15-worktree-management.pdr.md`.
