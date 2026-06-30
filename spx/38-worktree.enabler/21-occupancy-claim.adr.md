# Worktree Occupancy Claim

Worktree occupancy is a stateless two-state truth — `running` or `free` — decided on demand from the process table over a write-once holder-session claim file at `.spx/worktrees/<name>.claim` that carries the holder agent session id, host, controlling-process id, and start time. Claim acquisition and release serialize claim mutation through a recoverable per-worktree admission marker that records the acting process, refuses live-holder replacement, lets absent or `free` holders be replaced, and removes only the acting holder's own claim. A worktree is `running` when a same-host claim names a live process whose recorded start time matches or cannot be read; it is `free` in every other case, with no heartbeat, TTL, refresh, or git-state signal participating.

## Rationale

This is the UNIX `/var/run/*.pid` pidfile pattern. `claim` acquires the pidfile admission point, reads any existing pidfile, and writes only when the existing holder is absent or classifies as `free`; the holder removes its own pidfile on clean exit; a reader never trusts the file's presence but resolves liveness from the process table (`kill(pid, 0)`). The two states are exhaustive: there is no "stale" third condition. A claim whose process is dead is not a state to be managed — it is simply `free`, indistinguishable in effect from a worktree that was never claimed, because the next reader's liveness check returns the same answer for both. The admission marker is stricter than occupancy: it records the claimant process, blocks competing claimants while that process may still be active, and is cleared only when a same-host process-table read proves that owner absent or recycled, so a crashed claimant cannot strand the worktree and another host cannot clear a live owner's marker.

Process liveness is the authoritative held-or-free signal the operating system already maintains, and `kill(pid, 0)` reads it in constant time. A claim refreshed every turn and aged out by a TTL is `O(turns)` of token and I/O cost and reinvents that signal; it is rejected for that reason. Git working-tree state is rejected as an occupancy signal because a worktree that is clean and detached at the default-branch tip can still be actively held by an active agent session between commits or while waiting for the next instruction — reading "clean implies free" lets one agent operate inside another agent session's worktree. A recycled process id is guarded by comparing the claim's recorded start time against the live process, so a reused pid does not read as the original holder. A crashed holder needs no cleanup: its claim file is harmless residue that reads as `free` at the next check and is overwritten by the next `claim` for that worktree, which is why release is best-effort and acts only on the holder's own claim — a worktree's claim is freed by its holder exiting, never by another worktree reaching in to reap it.

The claim's filesystem I/O, per-worktree acquisition lock, atomic-write random-bytes source, process-liveness probe, and process-table read are dependency-injected, so occupancy classification and acquisition verify over controlled filesystem, random-bytes, process-probe, and process-table inputs. The shared root for `.spx/worktrees/` is governed by [`spx/15-worktree-management.pdr.md`](../15-worktree-management.pdr.md) and addressed through the state scope-addressing API per [`spx/17-state.adr.md`](../17-state.adr.md); SPX-owned CLI and hook interfaces provide the process-boundary defaults and follow the domain triple of [`spx/14-cli-composition.adr.md`](../14-cli-composition.adr.md).

## Invariants

- Occupancy classification is a total, two-valued (`running` or `free`) pure function of claim presence, host match, process liveness, and start-time match for fixed inputs.
- Claim acquisition and release are serialized claim-mutation operations for one worktree claim name.
- A claim-acquisition admission marker carries the claimant's process identity and is recoverable only when a same-host process-table read proves the recorded process absent or recycled.
- A never-written or released claim reads as `free`, as does a claim whose process is dead, whose host differs, or whose readable start time differs — every non-`running` case is `free`, with no third state.
- Claim release removes only the holder's own claim identity.
- Occupancy never depends on elapsed time: a live, same-host holder reads `running` however old its recorded start time.
- A live same-host holder is never reported `free` on the strength of an unreadable start time: only a readable start time that differs marks a recycled pid `free`.

## Verification

### Audit

- ALWAYS: the filesystem, atomic-write random-bytes source, process-liveness probe, and process-table read are dependency-injected parameters, so occupancy classification, concurrent write behavior, and the PID-reuse guard verify over controlled inputs ([audit])
- ALWAYS: claim acquisition holds a per-worktree admission lock while it reads the existing claim, classifies holder liveness, and publishes the replacement claim ([audit])
- ALWAYS: claim release holds a per-worktree admission lock while it reads the existing claim, verifies holder ownership, and removes the claim ([audit])
- ALWAYS: the per-worktree admission lock records the claimant process identity and can be cleared only when a same-host process-table read proves the recorded process absent or recycled ([audit])
- ALWAYS: a live same-host holder prevents a replacement claim, so a second claimant cannot overwrite an occupied worktree ([audit])
- ALWAYS: a claim is written atomically — to a writer-unique temporary file then `rename()`d into place — so overlapping writes cannot remove another writer's temp file and concurrent reads observe either no claim or the complete record ([audit])
- ALWAYS: a claim is written once at claim time and removed at release; occupancy reads never rewrite, refresh, or re-stamp it ([audit])
- ALWAYS: release removes only a claim whose session id, host, controlling-process id, and start time match the releasing holder ([audit])
- ALWAYS: `.spx/worktrees/` is addressed through the state scope-addressing API and resolves to the shared Git common-dir product root, per [`spx/15-worktree-management.pdr.md`](../15-worktree-management.pdr.md) and [`spx/17-state.adr.md`](../17-state.adr.md) ([audit])
- ALWAYS: SPX-owned interfaces are the single owner of every `.spx/worktrees/` read, write, and removal; plugin hooks invoke them through `spx hook run ...`, never through plugin-side filesystem mutation ([audit])
- NEVER: a heartbeat, TTL, or refresh timer participates in the occupancy decision — process liveness is the only signal ([audit])
- NEVER: `claim` overwrites a claim whose holder classifies as `running` ([audit])
- NEVER: a live same-host process is classified `free` because its start time could not be read — a readable, differing start time is the only signal that marks a recycled pid `free`, so an unreadable start time leaves a live holder `running` ([audit])
- NEVER: git working-tree state — cleanliness, detached HEAD, or branch tip — is read as an occupancy signal ([audit])
- NEVER: tests substitute module-level behavior for filesystem, process, or git boundaries; tests inject controlled filesystem, process-probe, process-table, and git implementations and exercise the real classification code paths ([audit])
