# Issues: Branch Run State

## Tracked Follow-Ups

- `src/lib/state-store/index.ts`: `truncateNormalizedSlugPrefix` uses `String.prototype.slice` under a `maxBytes` parameter. This is correct while normalized slug prefixes are ASCII-only. Revisit if slug normalization ever permits non-ASCII output.
- `src/commands/audit/run-state.ts`: `writeTerminalAuditRunState` rejects sequential duplicate terminal-state writes, while concurrent duplicate writers are outside the run-state contract and prevented by the one-owner run-file invariant. Revisit if audit execution ever permits more than one terminal writer for the same run file.
- `src/commands/audit/run-state.ts`: `readAuditBranchRuns` currently reads run files sequentially. Consider parallel reads if branch run history retention grows beyond low local counts.
