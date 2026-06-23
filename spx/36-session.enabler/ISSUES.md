# Open Issues

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

Resolution condition: run the repository formatter in a dedicated formatting cleanup, keep the resulting diff isolated from behavior changes, and then remove this entry.

## Handoff re-derives git state in two places

`handoffCommand` resolves the same git state twice for one `cwd`: `resolveSessionConfig` calls `detectGitCommonDirProductRoot` (`rev-parse --show-toplevel` + `--git-common-dir`) to locate the sessions directory, and `resolveSessionGitRef` also calls `detectGitCommonDirProductRoot` (the same `--show-toplevel` + `--git-common-dir` reads) to derive the worktree roots for the handoff-base gate.

Observed in PR review of the session-frontmatter implementation.

Impact: every `spx session handoff` issues two redundant git subprocess pairs on a hot path.

Resolution condition: gather the toplevel and common-dir once and share the result between session-directory resolution and the handoff-base gate.

## Cross-product session injection mechanics are underspecified

Root product guidance now directs agents to inject an SPX session for the plugin repository when a product workflow observes a plugin-skill follow-up. The session command model defines `.spx/sessions/` as repository-local shared state under that repository's Git common-dir, and `spx session handoff` carries git-context gates for the repository it runs in. The current guidance does not yet specify the operator-facing mechanics for writing a session into a different product's queue: which command form to use, which working directory owns the write, how to select an unoccupied worktree in the target repository, or how to satisfy that repository's handoff gate without relocating product work.

Resolution condition: define a governed cross-product session-injection workflow that names the target repository working directory, derives its shared session store through the target repository's own `spx session handoff`, verifies worktree occupancy before mutation, and records the limits imposed by `spx/15-worktree-management.pdr.md`.

## Session pickup does not auto-inject listed files

`spx/36-session.enabler/21-auto-injection.adr.md` states that `spx session pickup` reads and prints every file listed in a session frontmatter's `specs` and `files` arrays, warning and continuing when a listed file is missing. The implementation in `src/commands/session/pickup.ts` only moves the session to `doing/`, reads the claimed session file, and renders that session content through `formatShowOutput`; `rg` over `src/commands/session` and `src/domains/session` found no implementation that reads the listed `specs` or `files` paths during pickup.

Impact: resumed agents do not receive the auto-injected product context promised by the ADR, and a future product-directory option such as `spx -C <product-dir> session pickup` must define and implement file injection relative to the targeted product directory rather than the caller's ambient directory.

Resolution condition: apply `spx/36-session.enabler/21-auto-injection.adr.md` through the session node's spec/test/code workflow, including tests proving listed files are read relative to the session command's resolved product directory and missing files warn without blocking the claim.
