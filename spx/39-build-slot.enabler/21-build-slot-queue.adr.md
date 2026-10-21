# Build Slot Queue

The host-wide build slot is a file-backed queue under the host rendezvous root: one holder record, one waiter record per request, and one arrival counter, all serialized by a recoverable directory lock and decided by process liveness alone. Requests are admitted in arrival order, a hold lasts while the wrapper or the command process it spawned is alive, and no lease, heartbeat, or timeout releases anything. The slot reads no host-capacity signal and requires no agent identity, so agents, CI jobs, git hooks, and operators queue alike.

## Rationale

The slot is the UNIX pidfile pattern extended to a queue, following the occupancy claim of [`spx/38-worktree.enabler/21-occupancy-claim.adr.md`](spx/38-worktree.enabler/21-occupancy-claim.adr.md): process identity and the process table decide held or free, and a dead process is residue that the next reader removes. A lease either frees the slot under a long run or strands it after a crash, so liveness replaces it. Elapsed time never decides, so the one-second re-read only wakes a waiter and never admits or releases.

The slot lives under the host rendezvous root of [`spx/15-worktree-management.pdr.md`](spx/15-worktree-management.pdr.md), addressed through the state module of [`spx/17-state.adr.md`](spx/17-state.adr.md), so sessions that differ in `HOME`, `XDG_STATE_HOME`, or repository still reach one queue.

A process id alone is not an identity, because the operating system reuses ids; the process start time read from the process table separates a recycled id from the recorded process. The command runs as a foreground exec-handoff per [`spx/13-cli.enabler/15-cli-architecture.adr.md`](spx/13-cli.enabler/15-cli-architecture.adr.md) and has no process group of its own, so the hold records the wrapper and the command process and lasts while either lives; killing the wrapper alone leaves the slot held while the command runs.

A request nested inside a hold would wait on its own holder forever. A token alone can be copied into an unrelated environment, and an ancestry check alone admits every descendant of a long-lived process, so a nested request runs under the hold only when it carries the holder's token and its ancestry reaches a recorded holder process.

Admission by a load or memory threshold is rejected: the threshold is a readiness predicate that the slot's waits exist to remove from commands, and it would make admission depend on a signal the slot cannot order. The agent-mail build slots are rejected as the queue because they keep no arrival order, release only when a lease expires, and require an agent identity that CI jobs and git hooks lack.

The queue, admission, and release logic is a shared capability that the `spx slot` descriptor and handlers consume, per [`spx/14-cli-composition.adr.md`](spx/14-cli-composition.adr.md), and every boundary it touches is injected so admission verifies over controlled inputs.

## Invariants

- At most one live holder record exists across all processes of one OS account on one host.
- The next admitted request is the live waiter with the lowest arrival ticket, and a ticket is issued once, under the slot lock, in strictly increasing order.
- A holder or waiter is live exactly when its recorded process id exists in the process table with its recorded start time; a holder is live while either of its two recorded processes is live.
- Admission depends only on the slot records and process liveness, never on elapsed time, load, memory, or identity of the requester.
- A reader of the slot records sees either no record or a complete record.

## Verification

- ALWAYS: the build slot keeps its holder record and its waiter records under `slot/` beneath the host rendezvous root, addressed through the state module
- ALWAYS: under `slot/`, the holder record is `holder.json`, each waiter record is `waiters/<ticket>.json`, the next arrival ticket is `next-ticket`, and the slot lock is the directory `lock/`; every record is a JSON document written to a writer-unique temporary file and renamed into place, so a reader sees either no record or a complete one
- ALWAYS: a process takes the slot lock by creating `lock/` and recording its own identity in it, holds it only while it reads and writes slot records, and removes it afterwards
- ALWAYS: a lock whose recorded process a process-table read proves absent or recycled is removed by the next process that needs the lock, as the admission marker of [`spx/38-worktree.enabler/21-occupancy-claim.adr.md`](spx/38-worktree.enabler/21-occupancy-claim.adr.md) is
- ALWAYS: each request appends one waiter record carrying an arrival ticket that increases monotonically under the slot lock, and the slot admits the live waiter with the lowest ticket when no live holder exists
- ALWAYS: a holder or waiter is identified by its process id plus its process start time, read through the process-table probe of [`spx/38-worktree.enabler/21-occupancy-claim.adr.md`](spx/38-worktree.enabler/21-occupancy-claim.adr.md), so a process that reuses a recorded pid reads as absent
- ALWAYS: on admission the wrapper records its own identity and the identity of the command process it spawns in the holder record, and the hold lasts while either process is alive, so killing the wrapper alone leaves the slot held while its command runs
- ALWAYS: a reader that finds both recorded holder processes absent, or a waiter's process absent, removes that record and admits the next waiter
- ALWAYS: a waiting request re-reads the slot records once per second
- ALWAYS: the holder records a random 128-bit holder token in `holder.json` and places it in its command's environment as `SPX_SLOT_TOKEN`; a request that carries the live holder's token and whose parent-process chain, read through the injected process-table probe, reaches a recorded holder process runs at once under that hold without a waiter record, and every other request queues
- ALWAYS: `spx slot run` spawns its command through the non-registering foreground runner of [`spx/13-cli.enabler/15-cli-architecture.adr.md`](spx/13-cli.enabler/15-cli-architecture.adr.md), with inherited standard streams, ignoring SIGINT and SIGTERM while the command runs, and removes the holder record before it exits with the command's status
- ALWAYS: the slot's queue, admission, and release logic lives in one library under `src/lib/build-slot/` behind one public surface, and the `spx slot` descriptor at `src/interfaces/cli/slot.ts` and its handlers under `src/commands/slot/` consume that surface, per [`spx/14-cli-composition.adr.md`](spx/14-cli-composition.adr.md)
- ALWAYS: the filesystem, the slot lock, the process-table and process-liveness probes, the environment, and the clock reach the slot through injected dependencies
- NEVER: a lease, heartbeat, or timeout releases a hold or removes a waiter, and elapsed time admits, releases, or removes no record
- NEVER: admission reads a load average, a memory reading, or another host-capacity signal
- NEVER: a request carries or requires an agent identity
