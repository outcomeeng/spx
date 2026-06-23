# Session Store Check

PROVIDES the session-store diagnose check — classifies the `.spx/` session store from `spx session list` joined to the `spx worktree status` occupancy backing each doing claim, pairing the verdict with a remediation hint
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold session-store health into the overall environment verdict

## Assertions

### Mappings

- The check classifies the session store as consistent (the store reads and every doing session's backing worktree reads `running`; bucket healthy) or orphaned-claims (a doing session whose backing worktree reads `free` or is absent; bucket degraded) from `spx session list` joined to the worktree occupancy of each doing claim, and as unknown (bucket unknown) when a command errors, pairing each verdict with a remediation hint ([test](tests/session-store.mapping.l1.test.ts))
