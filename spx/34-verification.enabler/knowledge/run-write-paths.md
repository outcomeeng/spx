---
type: Decision Rationale
description: Why SPX reports the directories a verification run writes, moved from the rationale of the run write-paths PDR.
generated: { by: agent:spx-maintainer, at: 2026-11-15T17:00:00Z }
---

# Run write paths

This entry holds the basis of [`spx/34-verification.enabler/15-run-write-paths.pdr.md`](spx/34-verification.enabler/15-run-write-paths.pdr.md).

SPX is the one resolver of where verification state lives, so a host that composed the paths itself would drift from the state layout whenever branch slugging or root resolution changes; reporting them keeps one owner. A worktree-local journal was rejected because every worktree and every later round of a Change reads one run store, and granting a verification session unrestricted filesystem access was rejected because it widens the session beyond the directories it records into.

A run token and a context digest exist only once a run starts, so the report names the directories a run writes into, which a writable root admits, rather than the files a run will create. The report writes nothing, so a host plans permissions before any run exists and repeats the query for a changed scope without leaving state behind.

Directory access granted through writable roots is prompt-bounded operation within those roots and supplies no guarantee that only the caller's run can be changed.
