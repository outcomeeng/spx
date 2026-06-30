# Worktree Occupancy Claim

Worktree occupancy is a stateless two-state truth — `running` or `free` — decided on demand from the process table over a write-once per-agent claim file at `.spx/worktrees/<name>.claim` that carries the holding agent's session id, host, controlling-process id, and start time. A worktree is `running` when a same-host claim names a live process whose recorded start time matches or cannot be read; it is `free` in every other case — no claim file, a dead process, a different host, or a readable start time that differs. No heartbeat, no TTL, and no refresh participate; the operating system's process table is the only liveness signal.

## Rationale

This is the UNIX `/var/run/*.pid` pidfile pattern. `claim` writes the pidfile; the holder removes its own pidfile on clean exit; a reader never trusts the file's presence but resolves liveness from the process table (`kill(pid, 0)`). The two states are exhaustive: there is no "stale" third condition. A claim whose process is dead is not a state to be managed — it is simply `free`, indistinguishable in effect from a worktree that was never claimed, because the next reader's liveness check returns the same answer for both.

Process liveness is the authoritative held-or-free signal the operating system already maintains, and `kill(pid, 0)` reads it in constant time. A claim refreshed every turn and aged out by a TTL is `O(turns)` of token and I/O cost and reinvents that signal; it is rejected for that reason. Git working-tree state is rejected as an occupancy signal because a worktree that is clean and detached at the default-branch tip can still be actively held by a live agent between commits or mid-think — reading "clean implies free" lets one agent operate inside another live agent's worktree. A recycled process id is guarded by comparing the claim's recorded start time against the live process, so a reused pid does not read as the original holder. A crashed holder needs no cleanup: its claim file is harmless residue that reads as `free` at the next check and is overwritten by the next `claim` for that worktree, which is why release is best-effort and acts only on the holder's own claim — a worktree's claim is freed by its holder exiting, never by another worktree reaching in to reap it.

The claim's filesystem I/O, random-bytes source for atomic temporary siblings, process-liveness probe, and process-table read are dependency-injected, so occupancy classification verifies over controlled inputs without a real process, a real clock, or a real repository, and without mocking. The shared root for `.spx/worktrees/` is governed by [`spx/15-worktree-management.pdr.md`](../15-worktree-management.pdr.md) and addressed through the state scope-addressing API per [`spx/17-state.adr.md`](../17-state.adr.md); SPX-owned CLI and hook interfaces provide the process-boundary defaults and follow the domain triple of [`spx/14-cli-composition.adr.md`](../14-cli-composition.adr.md).

## Invariants

- Occupancy classification is a total, two-valued (`running` or `free`) pure function of claim presence, host match, process liveness, and start-time match for fixed inputs.
- A never-written or released claim reads as `free`, as does a claim whose process is dead, whose host differs, or whose readable start time differs — every non-`running` case is `free`, with no third state.
- Occupancy never depends on elapsed time: a live, same-host holder reads `running` however old its recorded start time.
- A live same-host holder is never reported `free` on the strength of an unreadable start time: only a readable start time that differs marks a recycled pid `free`.

## Verification

### Audit

- ALWAYS: the filesystem, random-bytes source, process-liveness probe, and process-table read are dependency-injected parameters, so occupancy classification, concurrent write behavior, and the PID-reuse guard verify over controlled inputs ([audit])
- ALWAYS: a claim is written through the shared atomic file-write primitive — to a random-suffixed temporary sibling then `rename()`d into place — so overlapping writes cannot remove another writer's temp file and concurrent reads observe either no claim or the complete record ([audit])
- ALWAYS: a claim is written once at claim time and removed at release; occupancy reads never rewrite, refresh, or re-stamp it ([audit])
- ALWAYS: `.spx/worktrees/` is addressed through the state scope-addressing API and resolves to the shared Git common-dir product root, per [`spx/15-worktree-management.pdr.md`](../15-worktree-management.pdr.md) and [`spx/17-state.adr.md`](../17-state.adr.md) ([audit])
- ALWAYS: SPX-owned interfaces are the single owner of every `.spx/worktrees/` read, write, and removal; plugin hooks invoke them through `spx hook run ...`, never through plugin-side filesystem mutation ([audit])
- NEVER: a heartbeat, TTL, or refresh timer participates in the occupancy decision — process liveness is the only signal ([audit])
- NEVER: a live same-host process is classified `free` because its start time could not be read — a readable, differing start time is the only signal that marks a recycled pid `free`, so an unreadable start time leaves a live holder `running` ([audit])
- NEVER: git working-tree state — cleanliness, detached HEAD, or branch tip — is read as an occupancy signal ([audit])
- NEVER: framework-level module replacement substitutes for the filesystem, process, or git boundary — tests inject controlled implementations and exercise the real classification code paths ([audit])
