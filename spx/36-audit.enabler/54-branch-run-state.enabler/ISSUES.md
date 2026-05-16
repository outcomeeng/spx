# Issues: Branch Run State

## Tracked Follow-Ups

- `src/domains/audit/run-state.ts`: `truncateNormalizedSlugPrefix` uses `String.prototype.slice` under a `maxBytes` parameter. This is correct while normalized slug prefixes are ASCII-only. Revisit if slug normalization ever permits non-ASCII output.
- `src/domains/audit/run-state.ts`: if `writeTerminalAuditRunState` writes the temporary state file and final rename fails, the same-directory `.state-{id}.tmp` file remains as interrupted-run debris. Decide whether to remove it or document the debris explicitly before expanding terminal-state cleanup semantics.
- `src/domains/audit/run-state.ts`: `writeTerminalAuditRunState` rejects sequential duplicate terminal-state writes, while concurrent duplicate writers are outside the run-state contract and prevented by the one-owner run-directory invariant. Revisit if audit execution ever permits more than one terminal writer for the same run directory.
- `spx/36-audit.enabler/54-branch-run-state.enabler/tests/branch-slug.property.l1.test.ts`: detached HEAD expectations duplicate the production detached prefix and short-SHA length. Export a source-owned formatter or constants if another test needs this shape.
- `src/domains/audit/run-state.ts`: `readAuditBranchRuns` currently reads run state directories sequentially. Consider parallel reads if branch run history retention grows beyond low local counts.
