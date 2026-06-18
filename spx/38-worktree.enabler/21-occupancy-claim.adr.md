# Worktree Occupancy Claim

Worktree occupancy is a write-once per-agent claim file at `.spx/worktrees/<name>.claim` carrying the holding agent's session id, host, controlling-process id, and start time, and occupancy is decided on demand from the process table: a same-host claim whose process is alive with a matching start time is occupied, and every other claim — dead process, different host, or mismatched start time — is stale and therefore free. No heartbeat, no TTL, and no refresh participate; the operating system's process table is the only liveness signal.

## Rationale

Process liveness is the authoritative held-or-free signal the operating system already maintains, and `kill(pid, 0)` reads it in constant time. A claim refreshed every turn and aged out by a TTL is `O(turns)` of token and I/O cost and reinvents that signal; it is rejected for that reason. Git working-tree state is rejected as an occupancy signal because a worktree that is clean and detached at the default-branch tip can still be actively held by a live agent between commits or mid-think — reading "clean implies free" lets one agent operate inside another live agent's worktree. A recycled process id is guarded by comparing the claim's recorded start time against the live process, so a reused pid does not read as the original holder. A crashed holder needs no cleanup: its claim reads as stale at the next check, which is why release is best-effort.

The claim's filesystem I/O, writer-unique temp token, process-liveness probe, and process-table read are dependency-injected, so occupancy classification verifies over controlled inputs without a real process, a real clock, or a real repository, and without mocking. The shared root for `.spx/worktrees/` is governed by [`spx/15-worktree-management.pdr.md`](../15-worktree-management.pdr.md) and addressed through the state scope-addressing API per [`spx/17-state.adr.md`](../17-state.adr.md); SPX-owned CLI and hook interfaces provide the process-boundary defaults and follow the domain triple of [`spx/14-cli-composition.adr.md`](../14-cli-composition.adr.md).

## Invariants

- Occupancy classification is a pure function of claim presence, host match, process liveness, and start-time match for fixed inputs.
- A never-written or released claim reads as free.
- Occupancy never depends on elapsed time: a live, same-host holder reads occupied however old its recorded start time.
- A live same-host holder is never reported free on the strength of an unreadable start time: only a readable start time that differs marks a recycled pid stale.

## Verification

### Audit

- ALWAYS: the filesystem, writer-unique temp token, process-liveness probe, and process-table read are dependency-injected parameters, so occupancy classification, concurrent write behavior, and the PID-reuse guard verify over controlled inputs ([audit])
- ALWAYS: a claim is written atomically — to a writer-unique temporary file then `rename()`d into place — so overlapping writes cannot remove another writer's temp file and concurrent reads observe either no claim or the complete record ([audit])
- ALWAYS: a claim is written once at claim time and removed at release; occupancy reads never rewrite, refresh, or re-stamp it ([audit])
- ALWAYS: `.spx/worktrees/` is addressed through the state scope-addressing API and resolves to the shared Git common-dir product root, per [`spx/15-worktree-management.pdr.md`](../15-worktree-management.pdr.md) and [`spx/17-state.adr.md`](../17-state.adr.md) ([audit])
- ALWAYS: SPX-owned interfaces are the single owner of every `.spx/worktrees/` read, write, and removal; plugin hooks invoke them through `spx hook run ...`, never through plugin-side filesystem mutation ([audit])
- NEVER: a heartbeat, TTL, or refresh timer participates in the occupancy decision — process liveness is the only signal ([audit])
- NEVER: a live same-host process is classified stale because its start time could not be read — a readable, differing start time is the only signal that marks a recycled pid stale, so an unreadable start time leaves a live holder occupied ([audit])
- NEVER: git working-tree state — cleanliness, detached HEAD, or branch tip — is read as an occupancy signal ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or `memfs` substitutes for the filesystem, process, or git boundary — tests inject controlled implementations and exercise the real classification code paths ([audit])
