# Verification Run Write Paths

Verification journals and their contexts remain repository-shared state resolved by SPX. Before a verification run starts, SPX reports, without writing, the canonical directories a run of one verification type and scope writes — the journal runs directory and the verification-context directory under the branch key at the Git common-dir product root, per [`spx/15-worktree-management.pdr.md`](spx/15-worktree-management.pdr.md) — so a host that launches a session recording verification obtains the required write paths from SPX and supplies them through the harness's supported parent-session permission configuration. Agent definitions contain no installation-specific store paths; a host reads the write paths from SPX for each launch.

## Rationale

SPX is the one resolver of where verification state lives, so a host that composed the paths itself would drift from the state layout whenever branch slugging or root resolution changes; reporting them keeps one owner. A worktree-local journal is rejected because every worktree and every later round of a Change reads one run store, and granting a verification session unrestricted filesystem access is rejected because it widens the session beyond the directories it records into.

A run token and a context digest exist only once a run starts, so the report names the directories a run writes into, which a writable root admits, rather than the files a run will create. The report writes nothing, so a host plans permissions before any run exists and repeats the query for a changed scope without leaving state behind.

Directory access granted through writable roots is prompt-bounded operation within those roots and supplies no guarantee that only the caller's run can be changed.

## Product properties

1. For a verification type and a scope, SPX reports the canonical scope identity, the branch key, and each directory a run writes, with the directory's canonical path, whether it exists, and the missing directories its creation requires.
2. The report creates, changes, and removes no file or directory.

## Verification

### Testing

- ALWAYS: the reported journal runs directory and verification-context directory equal the directories into which a run started for the same verification type, scope, and branch key writes its journal and its context ([mapping])
- ALWAYS: a reported directory's path resolves the symbolic links of its nearest existing ancestor, and a directory that does not exist reports the missing directories from that ancestor down ([mapping])
- NEVER: the report creates, changes, or removes a file or directory ([compliance])
