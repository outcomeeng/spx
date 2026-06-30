# Worktree Claim

PROVIDES worktree occupancy setup for the `session-start` hook event — writing a
live claim record and exporting the claim path only when the claim succeeds
SO THAT session-start dependents
CAN distinguish a held worktree from a hook run that lacked enough information
to claim it

## Assertions

### Scenarios

- Given the `session-start` hook receives a payload and env-file path with enough session identity and worktree information to claim the worktree, when the event runs, then SPX writes one worktree occupancy claim and appends `SPX_WORKTREE_CLAIM_PATH` with the absolute path to that claim file ([test](tests/worktree-claim.scenario.l1.test.ts))
- Given the `session-start` hook receives a payload and env-file path without a session identity, when the event runs, then SPX appends the project exports and clears any prior `SPX_WORKTREE_CLAIM_PATH` export ([test](tests/worktree-claim.scenario.l1.test.ts))
- Given the `session-start` hook receives a payload and env-file path with a session identity but cannot resolve a controlling holder process, when the event runs, then SPX records the claim diagnostic and clears any prior `SPX_WORKTREE_CLAIM_PATH` export ([test](tests/worktree-claim.scenario.l1.test.ts))
