---
type: Decision Rationale
description: Why each verification run stages its payloads in one run-scoped directory that its seal removes.
generated: { by: agent:spx-maintainer, at: 2026-11-15T17:00:00Z }
---

# Run payload directory

This entry holds the basis of [`spx/34-verification.enabler/32-verify.enabler/17-run-payload-directory.adr.md`](spx/34-verification.enabler/32-verify.enabler/17-run-payload-directory.adr.md).

Until November 2026, a caller staged each scope, finding, and terminal-metadata payload as a file in the shared temporary folder and passed its absolute path to the next command. Callers retyped those absolute paths between commands, and two verification launches were voided by a mistyped path. Nothing removed the staged files, and 1,539 of them had accumulated in the temporary folder.

One directory per run, addressed through the state module's branch scope under the run's opening namespace, gives every worktree that continues the run the same location, so a caller names a payload relative to it instead of retyping an absolute path. Resolving each name through symbolic links against that directory keeps a run-relative name from reading outside it. Removing the directory when `finish` seals the run, and sweeping the directories of closed runs at each `start`, keeps no sealed run's payloads on disk even when a removal fails.
