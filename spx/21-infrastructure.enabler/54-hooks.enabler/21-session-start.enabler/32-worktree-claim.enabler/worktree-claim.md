# Worktree Claim

PROVIDES worktree occupancy setup for the `session-start` hook event — writing a
live claim record naming the holder agent and its agent session
SO THAT session-start dependents
CAN distinguish a held worktree from a hook run that lacked enough information
to claim it

## Assertions

### Scenarios

- Given the `session-start` hook receives a payload carrying enough holder identity and worktree information to claim the worktree, when the event runs, then SPX writes one worktree occupancy claim naming the holder agent, agent session id, host, controlling-process id, and start time ([test](tests/worktree-claim.scenario.l1.test.ts))
- Given the `session-start` hook receives a payload without a session id, when the event runs, then SPX writes no worktree claim and the hook invocation completes successfully ([test](tests/worktree-claim.scenario.l1.test.ts))
- Given the `session-start` hook receives a payload whose transcript path classifies no agent, when the event runs, then SPX writes no worktree claim and the hook invocation completes successfully ([test](tests/worktree-claim.scenario.l1.test.ts))
- Given the `session-start` hook receives a payload with a session id but cannot resolve a controlling holder process, when the event runs, then SPX records the claim diagnostic and writes no worktree claim ([test](tests/worktree-claim.scenario.l1.test.ts))
