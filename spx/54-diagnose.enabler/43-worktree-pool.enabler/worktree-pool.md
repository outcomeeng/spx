# Worktree Pool Check

PROVIDES the worktree-pool diagnose check — classifies the git worktree layout from `git worktree list` and the `spx worktree status` occupancy of each worktree, pairing the verdict with a remediation hint
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold worktree-pool health into the overall environment verdict

## Assertions

### Mappings

- The check classifies the worktree layout as compliant (a lone working tree or a bare-repository pool, in either case with no stale claims; bucket healthy), stale-claims (a worktree's occupancy is stale; bucket degraded), or non-compliant (linked worktrees attached to a non-bare repository; bucket broken) from `git worktree list` and the per-worktree `spx worktree status` occupancy, and as unknown (bucket unknown) when a command errors, pairing each verdict with a remediation hint ([test](tests/worktree-pool.mapping.l1.test.ts))
