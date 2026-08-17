# Session Environment Check

PROVIDES the session-environment diagnose behavior — classifies the agent session the spec-tree `SessionStart` hook establishes, from the agent session identity the invoking agent's environment carries and the shared worktree pool snapshot's occupancy of the current worktree, pairing the verdict with a remediation hint for both the whole-product diagnose report and the domain-owned session-environment diagnostic provider
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold session-environment health into the overall environment verdict

## Assertions

### Mappings

- The check classifies the session as working (identity is present through the invoking agent's environment or the current worktree's live claim session id, and the current worktree reads `running`; bucket healthy), identity-only (identity present while the current worktree does not read `running`; bucket degraded), unclaimed (identity absent and the current worktree does not read `running`; bucket broken), or unknown (a command errors, or the current worktree reads `running` while identity is absent from both the invoking agent's environment and the live claim; bucket unknown), pairing each verdict with a remediation hint ([test](tests/session-environment.mapping.l1.test.ts))
- The session-environment reading derives the current worktree's claimed state, claim-carried holder agent, and claim-carried session identity from the shared worktree pool snapshot, then classifies the derived reading with the same verdict and bucket mapping ([test](tests/session-environment-snapshot.mapping.l1.test.ts))
- The current worktree's own claim under `.spx/worktrees/` is read directly from the resolved worktree root and merged into the session-environment reading before classification, so the check needs no value the hook exported ([test](tests/session-environment-probe.mapping.l1.test.ts))
