# Occupancy Store

PROVIDES serialized claim acquisition, atomic claim-record I/O at `.spx/worktrees/<name>.claim`, and an on-demand process-liveness check that classifies a worktree as the two-state `free` or `running`
SO THAT the worktree-cli enabler
CAN answer `spx worktree status`, acquire a claim for `spx worktree claim`, and remove it for `spx worktree release` without re-deriving `.spx/worktrees/` layout or the liveness rule

## Assertions

### Scenarios

- Given an unclaimed worktree, when a claim is written, then `.spx/worktrees/<name>.claim` holds the session id, host, controlling-process id, and start time ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given a worktree whose existing claim holder is live on the same host, when another claimant attempts acquisition, then the acquisition is refused and the existing claim remains unchanged ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given a worktree whose existing claim already belongs to the same live holder, when that holder attempts acquisition again, then acquisition succeeds and the existing claim remains unchanged ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given a worktree whose existing claim holder is dead, when another claimant attempts acquisition, then the claim file holds the new claim ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given a worktree with a claim-acquisition marker whose owner process is dead, when another claimant attempts acquisition, then the marker is recovered and the claim file holds the new claim ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given a worktree with a claim-lock recovery marker whose owner process is dead, when another claimant attempts acquisition, then the recovery marker is recovered and the claim file holds the new claim ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given a worktree with a claim-lock recovery marker whose owner matches the same live holder retrying acquisition, when that holder attempts acquisition again, then the recovery marker is reclaimed and the claim file holds that holder's claim ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given a worktree whose claim-acquisition marker and claim-lock recovery marker both name the same live holder retrying acquisition, when that holder attempts acquisition again, then the recovery marker is reclaimed and the claim file remains unchanged ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given a worktree with a claim-acquisition marker whose owner is alive on the same host with an unreadable start time, when another claimant attempts acquisition, then acquisition reports an in-progress claim and leaves the marker unchanged ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given a worktree with a claim-acquisition marker whose owner is recorded on another host, when another claimant attempts acquisition, then acquisition reports an in-progress claim and leaves the marker unchanged ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given the running worktree holds a claim, when the claim is released, then `.spx/worktrees/<name>.claim` is absent ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given a worktree claim belongs to another holder, when a different holder releases, then the current claim remains unchanged and release reports an ownership failure ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given a claim-acquisition marker changes owners while a release cleans up, when the old owner releases, then the new owner's marker remains unchanged ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given a live holder's release removes the claim but leaves a claim-acquisition marker that names the same holder, when that holder attempts acquisition again, then acquisition succeeds and writes the claim ([test](tests/occupancy-store.scenario.l1.test.ts))
- Given a process-probe boundary throws while acquisition classifies an existing holder, when another claimant attempts acquisition afterward, then the later claimant is not blocked by the failed acquisition marker ([test](tests/occupancy-store.scenario.l1.test.ts))

### Mappings

- Occupancy classification maps from the claim signals to a two-state truth: a claim whose host matches and whose process is alive maps to `running` when the live start time matches or cannot be read; every other case maps to `free` — no claim file, a dead process, a host that differs, or a live start time that is readable and differs ([test](tests/occupancy-store.mapping.l1.test.ts))
- Claim-name validity maps to the claim path: a safe scope-token name maps to a `<name>.claim` path under the worktrees directory; an empty name or a name carrying any character outside the safe scope-token set — letters, digits, hyphen, and underscore — maps to the INVALID_NAME rejection ([test](tests/occupancy-store.mapping.l1.test.ts))

### Properties

- A claim record round-trips: writing the session id, host, controlling-process id, and start time then reading the claim returns the same four fields ([test](tests/occupancy-store.property.l1.test.ts))
- A claim write is atomic: a concurrent read observes either no claim or the complete four-field record, never a partial record ([test](tests/occupancy-store.property.l1.test.ts))
- Claim admission is atomic: an overlapping claimant cannot overwrite a worktree claim while the first acquisition is in progress or while the current holder's release is in progress ([test](tests/occupancy-store.property.l1.test.ts))

### Compliance

- ALWAYS: `.spx/worktrees/` resolves to the Git common-dir product root through the state scope-addressing API, so every worktree of the repository reads the same claims, per [`spx/15-worktree-management.pdr.md`](../../15-worktree-management.pdr.md) ([test](tests/occupancy-store.compliance.l1.test.ts))
- ALWAYS: a claim with an arbitrarily old start time whose process is alive on the same host reads `running` — occupancy never ages out, per [`spx/38-worktree.enabler/21-occupancy-claim.adr.md`](../21-occupancy-claim.adr.md) ([test](tests/occupancy-store.compliance.l1.test.ts))
- NEVER: occupancy I/O composes `.spx/worktrees/` paths itself — addressing comes from the state scope-addressing API, per [`spx/17-state.adr.md`](../../17-state.adr.md) ([audit])
