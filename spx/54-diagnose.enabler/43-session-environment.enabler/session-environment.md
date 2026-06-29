# Session Environment Check

PROVIDES the session-environment diagnose behavior — classifies the agent session the spec-tree `SessionStart` hook establishes, from the agent session identity, hook marker, and the shared worktree pool snapshot's occupancy of the current worktree, pairing the verdict with a remediation hint for both the whole-product diagnose report and the domain-owned session-environment diagnostic provider
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold session-environment health into the overall environment verdict

## Assertions

### Mappings

- The check classifies the session as working (identity present and the current worktree reads `running`, regardless of hook-marker presence; bucket healthy), identity-only (identity present while the current worktree does not read `running`, regardless of hook-marker presence; bucket degraded), silent no-op (the hook marker is present but establishes neither identity nor a `running` worktree; bucket broken), not-applicable (no hook marker, no identity, and no `running` worktree; bucket not-applicable), or unknown (a command errors, or the current worktree reads `running` while identity is absent, regardless of hook-marker presence; bucket unknown), pairing each verdict with a remediation hint ([test](tests/session-environment.mapping.l1.test.ts))
- The session-environment reading derives the current worktree's claimed state from the shared worktree pool snapshot, then classifies the derived reading with the same verdict and bucket mapping ([test](tests/session-environment-snapshot.mapping.l1.test.ts))
