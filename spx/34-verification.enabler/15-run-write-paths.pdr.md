# Verification Run Write Paths

Verification journals and their contexts remain repository-shared state resolved by SPX, and each run's staged payload sources live in a per-worktree payload directory resolved by SPX. Before a verification run starts, SPX reports, without writing, the canonical directories a run of one verification type and scope writes — the journal runs directory and the verification-context directory under the branch key at the Git common-dir product root, and the payload root `.spx/worktree/<verification-type>/payloads/` of that verification type at the local worktree root, per [`spx/15-worktree-management.pdr.md`](spx/15-worktree-management.pdr.md) — so a host that launches a session recording verification obtains the required write paths from SPX and supplies them through the harness's supported parent-session permission configuration. Agent definitions contain no installation-specific store paths; a host reads the write paths from SPX for each launch.

Each verification run owns one payload directory, `.spx/worktree/<verification-type>/payloads/run-<run-token>/` at the local worktree root, in the per-worktree state class of [`spx/15-worktree-management.pdr.md`](spx/15-worktree-management.pdr.md). It holds only the payload sources the caller stages for that run's commands, while the run's journal and verification context stay in the repository-shared store under the branch key. SPX removes a run's payload directory and everything in it when the run seals, because the run's evidence survives in its journal events and its input in the recorded-input sidecar, so no later read of the run needs a staged payload. Each `start` first removes the payload directory of every run of this worktree whose journal is closed, by a terminal-completion event or a seal, or that no branch scope of the repository holds a journal for, and then creates its own run's payload directory; the payload directory of a run whose journal is open stays until the run closes, whichever branch or head the worktree has checked out.

## Rationale

SPX is the one resolver of where verification state lives, so a host that composed the paths itself would drift from the state layout whenever branch slugging or root resolution changes; reporting them keeps one owner. A worktree-local journal is rejected because every worktree and every later round of a Change reads one run store, and granting a verification session unrestricted filesystem access is rejected because it widens the session beyond the directories it records into.

A run token and a context digest exist only once a run starts, so the report names the directories a run writes into, which a writable root admits, rather than the files a run will create. The report writes nothing, so a host plans permissions before any run exists and repeats the query for a changed scope without leaving state behind. The report names the payload root beside the journal and context directories so a host grants the staging directory before any run exists.

Payload sources are scratch input to one run's commands, so they belong to the working copy that stages them: the per-worktree class keeps one worktree's staging out of every other worktree's reach and out of the shared temp folder, where unremoved staging files accumulate. Removal at seal and the sweep at `start` bound the payload directories to the runs still open, and the sweep searches every branch scope so a run opened on another branch stays open to it. Naming a payload relative to the run's payload directory spares callers retyping absolute paths.

Directory access granted through writable roots is prompt-bounded operation within those roots and supplies no guarantee that only the caller's run can be changed.

## Product properties

1. For a verification type and a scope, SPX reports the canonical scope identity, the branch key, and each directory a run writes — the journal runs directory, the verification-context directory, and the payload root — with the directory's canonical path, whether it exists, and the missing directories its creation requires.
2. The report creates, changes, and removes no file or directory.
3. A run's payload directory exists from `start` until the run seals or a later `start` in the worktree finds the run closed, and a run's evidence and recorded input remain readable after it is removed.

## Verification

- ALWAYS: before `start` creates its run's payload directory, no payload directory remains in the worktree for a run whose journal is closed or absent from every branch scope, while the payload directory of a run whose journal is open remains, whichever branch the worktree has checked out
- ALWAYS: the payload directory `start` reports lies under `.spx/worktree/` at the local worktree root, inside the payload root the write-path report names for the same verification type and scope
- ALWAYS: once `finish` seals a run, its payload directory no longer exists, and `render` and `input` for that run succeed

### Testing

- ALWAYS: the reported journal runs directory and verification-context directory equal the directories into which a run started for the same verification type, scope, and branch key writes its journal and its context ([mapping])
- ALWAYS: a reported directory's path resolves the symbolic links of its nearest existing ancestor, and a directory that does not exist reports the missing directories from that ancestor down ([mapping])
- NEVER: the report creates, changes, or removes a file or directory ([compliance])
