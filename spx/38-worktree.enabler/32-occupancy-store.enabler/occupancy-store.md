# Occupancy Store

PROVIDES atomic claim-record I/O at `.spx/worktrees/<name>.claim` and an on-demand process-liveness check that classifies a worktree as unclaimed, occupied, or stale
SO THAT the worktree-cli enabler
CAN answer `spx worktree status`, write a claim for `spx worktree claim`, and remove it for `spx worktree release` without re-deriving `.spx/worktrees/` layout or the liveness rule

The claim record carries the holding agent's session id, host, controlling-process id, and start time, governed by [`spx/38-worktree.enabler/21-occupancy-claim.adr.md`](../21-occupancy-claim.adr.md).

## Assertions

### Scenarios

- Given an unclaimed worktree, when a claim is written, then `.spx/worktrees/<name>.claim` holds the session id, host, controlling-process id, and start time ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given the running worktree holds a claim, when the claim is released, then `.spx/worktrees/<name>.claim` is absent ([test](tests/occupancy-store.scenario.l1.test.ts))

### Mappings

- Occupancy classification maps from the claim signals: no claim file maps to unclaimed; a claim whose host matches and whose process is alive with a matching start time maps to occupied; a claim whose process is dead, whose host differs, or whose start time no longer matches the live process maps to stale ([test](tests/occupancy-store.mapping.l1.test.ts))
- Claim-name validity maps to the claim path: a safe scope-token name maps to a `<name>.claim` path under the worktrees directory; an empty name or a name containing a path separator or relative segment maps to the INVALID_NAME rejection ([test](tests/occupancy-store.mapping.l1.test.ts))

### Properties

- A claim record round-trips: writing the session id, host, controlling-process id, and start time then reading the claim returns the same four fields ([test](tests/occupancy-store.property.l1.test.ts))
- A claim write is atomic: a concurrent read observes either no claim or the complete four-field record, never a partial record ([test](tests/occupancy-store.property.l1.test.ts))

### Compliance

- ALWAYS: `.spx/worktrees/` resolves to the Git common-dir product root through the state scope-addressing API, so every worktree of the repository reads the same claims, per [`spx/15-worktree-management.pdr.md`](../../15-worktree-management.pdr.md) ([test](tests/occupancy-store.compliance.l1.test.ts))
- ALWAYS: a claim with an arbitrarily old start time whose process is alive on the same host reads occupied — occupancy never ages out, per [`spx/38-worktree.enabler/21-occupancy-claim.adr.md`](../21-occupancy-claim.adr.md) ([test](tests/occupancy-store.compliance.l1.test.ts))
- NEVER: occupancy I/O composes `.spx/worktrees/` paths itself — addressing comes from the state scope-addressing API, per [`spx/17-state.adr.md`](../../17-state.adr.md) ([audit])
