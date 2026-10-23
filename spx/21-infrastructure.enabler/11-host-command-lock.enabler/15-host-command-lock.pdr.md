# Host Command Lock

`spx orchestration lock -- <command>` runs a command under one host-wide slot: one guarded command tree holds the slot at a time among the commands that resolve the same orchestration lock file, whichever repository, worktree, or session starts them. A command is admitted after it holds the slot and the host load has stayed quiet through a fresh sampling window, within a wait cap; it keeps the slot until the last process holding its inherited lock descriptor exits, whether or not its supervisor survives.

## Rationale

Heavy runs from every session on a host — test suites, builds, evals — compete for the same processors, memory, and disk. Serializing them host-wide lets each run finish on a quiet machine rather than all of them slowing one another. The slot belongs to the commands that run through the guard and to the process tree they launch, so the guarantee holds at the one place the product controls: admission. Holding the slot for the command's whole tree, and not for its supervisor alone, keeps a killed supervisor from releasing the slot while its workers still run. The slot bounds outer command trees and cannot bound what those trees do inside; the load gate judges admission only and cannot prevent a later rise.

## Product properties

1. Guarded command trees that resolve the same orchestration lock file never run at the same time, whichever repository or session starts them; a guarded command started inside a running guarded command belongs to that command's tree and runs under its slot.
2. An outermost guarded command starts only after a quiet load window and within its wait cap; otherwise it does not start and reports `not_ready`. A guarded command nested inside a running guarded command is admitted by the outer command's admission.
3. Every outermost invocation that reaches admission and whose supervisor survives to report ends with one terminal result line, and a missing result line reads as an interrupted run with an unknown outcome, never as success. A nested pass-through writes no result line, and invalid arguments and unsupported environments exit nonzero before admission with their own status.

## Verification

Authoring form: the rules below carry no verification tag until verification selection.

- ALWAYS: the slot admits one guarded command tree at a time among the commands run through `spx orchestration lock` that resolve the same orchestration lock file; it bounds outer command trees, not a runner's workers, memory, or I/O
- ALWAYS: work that does not run through the guard stays outside the slot — indexing, backups, other host work, and another tool's own waiter that does not run through the guard — and adopting the guard changes no setting of the adopting tool
- ALWAYS: a guarded command holds the slot from admission until the last process holding its inherited lock descriptor exits, whether or not the supervisor exits first
- ALWAYS: after admission and before it spawns the command, the supervisor writes an advisory holder record into the orchestration lock file through its locked descriptor, naming the run id, the supervisor's process id, the working directory, the start time, and the child's process group as unknown; immediately after the spawn it rewrites the record in place with the child's process group, so a supervisor that dies between the spawn and that rewrite leaves the group unknown
- NEVER: admission or release reads the holder record; it serves diagnosis only
- ALWAYS: after it holds the slot and before it starts the command, admission takes a fresh window of at least seven load samples at five-second intervals spanning at least 30 seconds, and admits only when every one-minute load in the window is at most 0.8 times the logical CPU count, every five-minute load is at most the logical CPU count, and the fitted rise of the one-minute samples over the window is at most 0.05 times the logical CPU count
- ALWAYS: a sample above a limit, an invalid sample, or a gap of more than ten seconds between samples discards the window and starts a fresh one
- NEVER: the fifteen-minute load gates admission; it is reported only
- ALWAYS: one monotonic wait cap bounds slot contention and the load window together, 14400 seconds by default and shortened by `--wait-seconds`; the supervisor checks the cap once more immediately before it spawns, and at the cap's expiry, whether in contention or within a window, the command does not start, the result reports `not_ready`, and nothing re-queues it
- NEVER: waiting commands are promised an admission order; a waiting command may reach its cap while later ones are admitted
- ALWAYS: a guarded command started inside a running guarded command, carrying an inherited descriptor of the same orchestration lock file that still holds the lock, starts at once under the outer slot with no second admission and no second load window, and runs in the process group it inherits, never in a group of its own, so a signal forwarded to the outer group reaches every nested process
- NEVER: a nested call whose descriptor is absent, changed, or no longer holds the lock starts its command; it fails `nested_context_invalid`, and a nested call that resolves a different orchestration lock file fails `nested_lock_mismatch`, each before its command starts
- ALWAYS: the outermost invocation writes, as its final standard-error line, one JSON object carrying `schema: "spx.orchestration.lock.result.v1"`, `runId`, `started`, `status`, and `childExitCode` or `signal`; it echoes a caller-supplied `--run-id` and generates one when the caller supplies none, and the child's standard streams pass through unchanged
- NEVER: a nested pass-through writes a result line; it keeps its inner command's exit code
- ALWAYS: the process exit code is the child's exit code for a started child that exits, 128 plus the signal number for a signaled child whose supervisor survives to report it, and 3 with `started: false` and `status: not_ready` at the wait cap, so a child that exits 3 reports `started: true`, `status: completed`, and `childExitCode: 3`
- ALWAYS: invalid arguments and unsupported environments exit nonzero before any start with their own status
- NEVER: a missing exit code reads as zero, and a run whose result line is missing reads as `not_ready` or success; it is interrupted with an unknown outcome
- ALWAYS: the slot protects foreground commands that keep their inherited lock descriptor open and wait for their workers; a process that closes the descriptor and outlives every holder runs outside the slot
- NEVER: a surviving wrapper process is the only process holding a guarded command tree's slot
- ALWAYS: the one supported platform is macOS on arm64 with local storage; any other platform fails before the command starts with its own status
- NEVER: the guard starts its command on Linux, macOS on x64, Windows, unsupported or network storage, through a lock path that is a symbolic link, with a lock file another account owns, or after any open or lock error; each fails before the command starts, and no alternate path is tried
