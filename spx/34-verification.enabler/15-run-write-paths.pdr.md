# Verification Run Write Paths

DEFINES payload root AS the directory `.spx/branch/<branch-slug>/<verification-type>/payloads/` that holds the payload directories of one verification type under one branch key
DEFINES payload directory AS the directory `run-<run-token>/` one run owns inside the payload root of the branch key its journal opened in, holding only the payload sources a caller stages for that run's commands

GOVERNS the repository-shared directories a verification run writes: its journal runs directory, its verification-context directory, and its payload directory
SO THAT a host that launches a session recording verification, and every caller that continues a run from any worktree
CAN RELY ON SPX reporting those directories without writing before a run starts, and on each run owning one payload directory from `start` until the run seals

## Verification

### Test.Compliance: write paths

- shared-root: ALWAYS: verification journals, verification contexts, and payload roots resolve under the branch key at the Git common-dir product root, per [`spx/15-worktree-management.pdr.md`](spx/15-worktree-management.pdr.md), as [run write paths](knowledge/run-write-paths.md) records.
- report-contents: ALWAYS: for a verification type and a scope, SPX reports the canonical scope identity, the branch key, and each directory a run writes, the journal runs directory, the verification-context directory, and the payload root, with the directory's canonical path, whether it exists, and the missing directories its creation requires.

### Test.Compliance: payload directory

- payload-directory-in-run-scope: ALWAYS: the payload directory `start` reports is `.spx/branch/<branch-slug>/<verification-type>/payloads/run-<run-token>/` under the branch key the run's journal opened in, inside the payload root the write-path report names for the same verification type and scope.
- payload-directory-swept: ALWAYS: before `start` creates its run's payload directory, no payload directory remains for a run whose journal carries a terminal-completion event or a seal.
- payload-directory-kept-while-open: NEVER: the sweep removes the payload directory of a run whose journal is absent or carries neither a terminal-completion event nor a seal.
- payload-directory-removed: ALWAYS: `finish` removes the run's payload directory when it seals the run, a directory whose removal fails remains until the next `start` sweep removes it, and `render` and `input` for that run succeed.

### Test.Mapping: reported-directories

Each reported directory equals the directory into which a run started for the same verification type, scope, and branch key writes.

| Case                 | Reported directory                                   |
| -------------------- | ---------------------------------------------------- |
| journal-runs         | the directory into which that run writes its journal |
| verification-context | the directory into which that run writes its context |

### Test.Mapping: reported-path-resolution

A reported directory's path follows from whether the directory exists.

| Case              | Reported path                                                                     |
| ----------------- | --------------------------------------------------------------------------------- |
| existing-ancestor | the path resolves the symbolic links of the directory's nearest existing ancestor |
| missing-directory | the report names the missing directories from that ancestor down                  |

### Test.Compliance: report

- report-writes-nothing: NEVER: the report creates, changes, or removes a file or directory.

### Audit: hosts

- host-reads-write-paths: ALWAYS: a host that launches a session recording verification obtains the write paths from SPX for each launch and supplies them through the harness's supported parent-session permission configuration, and no agent definition contains an installation-specific store path.
- writable-root-boundary: NEVER: a writable root granted over the reported directories is treated as a guarantee that only the caller's run can be changed.
- payload-working-input: NEVER: a payload source staged in a payload directory is committed.
