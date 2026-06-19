# Issues: Branch Run State

## Tracked Follow-Ups

- `src/lib/state-store/index.ts`: `truncateNormalizedSlugPrefix` uses `String.prototype.slice` under a `maxBytes` parameter. This is correct while normalized slug prefixes are ASCII-only. Revisit if slug normalization ever permits non-ASCII output.
- `src/commands/audit/run-state.ts`: `writeTerminalAuditRunState` rejects sequential duplicate terminal-state writes, while concurrent duplicate writers are outside the run-state contract and prevented by the one-owner run-file invariant. Revisit if audit execution ever permits more than one terminal writer for the same run file.
- `src/commands/audit/run-state.ts`: `readAuditBranchRuns` validates the branch audit runs directory once before enumeration, then `validateAuditStateFilePath` repeats the same parent-chain validation for every matching run-file entry. Security still rests on per-entry run-file `lstat` plus `O_NOFOLLOW` reads, but the repeated parent walk adds redundant `lstat` calls as branch run history grows. Revisit when branch run lookup performance becomes a bottleneck and split parent-chain validation from per-file validation without weakening symlink rejection.
