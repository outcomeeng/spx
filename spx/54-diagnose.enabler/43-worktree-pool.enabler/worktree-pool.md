# Worktree Pool Check

PROVIDES the worktree-pool diagnose check — classifies the git worktree layout from `git worktree list` and `git config --get core.bare`, reporting how many worktrees are `running` versus `free` as information, and pairing the verdict with a remediation hint
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold worktree-pool health into the overall environment verdict

## Assertions

### Mappings

- The check classifies the worktree layout as compliant (a lone working tree or a bare-repository pool; bucket healthy) or non-compliant (linked worktrees attached to a non-bare repository; bucket broken) from `git worktree list` and `git config --get core.bare`, and as unknown (bucket unknown) when a command errors, pairing each verdict with a remediation hint ([test](tests/worktree-pool.mapping.l1.test.ts))
- Occupancy never degrades the verdict: the check reports the count of `running` and `free` worktrees from the per-worktree `spx worktree status` occupancy as information, since a `free` worktree — never claimed, or holding a dead holder's residual claim — is a healthy resting state and not a fault ([test](tests/worktree-pool.mapping.l1.test.ts))
