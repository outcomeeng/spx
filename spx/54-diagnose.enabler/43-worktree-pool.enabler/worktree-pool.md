# Worktree Pool Check

PROVIDES the worktree-pool diagnose behavior — classifies the git worktree layout from the shared worktree pool snapshot, reporting how many worktrees are `running` versus `free` as information, and pairing the verdict with a remediation hint for both the whole-product diagnose report and the focused worktree-pool diagnosis
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold worktree-pool health into the overall environment verdict

## Assertions

### Mappings

- The check classifies the worktree layout reading as compliant (a lone working tree or a bare-repository pool; bucket healthy), non-compliant (linked worktrees attached to a non-bare repository; bucket broken), or unknown (bucket unknown) when gathering errors, pairing each verdict with a remediation hint ([test](tests/worktree-pool.mapping.l1.test.ts))
- The shared worktree pool snapshot maps git facts and occupancy claims into the worktree layout reading fields, then classifies the derived reading with the same verdict and bucket mapping ([test](tests/worktree-pool-snapshot.mapping.l1.test.ts))
- Occupancy never degrades the verdict: the check reports the count of `running` and `free` worktrees as information, since a `free` worktree — never claimed, or holding a dead holder's residual claim — is a healthy resting state and not a fault ([test](tests/worktree-pool.mapping.l1.test.ts))
