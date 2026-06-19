# Branch Run State

PROVIDES branch-scoped audit run journals and the `AuditRunState` projection folded from a run's event history
SO THAT audit list, status, and latest-run lookup
CAN inspect local audit evidence without re-running the auditors

## Assertions

### Compliance

- ALWAYS: an audit run is an append-only event journal stored under `.spx/branch/{branch-slug}/audit/runs/run-{run-token}.jsonl` at the Git common-dir product root ([test](tests/run-file.compliance.l1.test.ts))
- ALWAYS: branch slugs, run-file naming, run journals, the `AuditRunState` projection, and latest-run ordering follow `spx/36-audit.enabler/15-audit-directory.adr.md` ([test](tests/branch-slug.property.l1.test.ts), [test](tests/run-file.compliance.l1.test.ts), [test](tests/run-state.compliance.l1.test.ts))
- ALWAYS: the `AuditRunState` envelope is folded as a projection of a run's event history, and a run is sealed at terminal completion ([test](tests/run-state.compliance.l1.test.ts))
- ALWAYS: branch run lookup ignores entries whose file names do not match the run-file format before constructing run-file paths ([test](tests/run-state.compliance.l1.test.ts))
- NEVER: treat a run as approved or rejected audit evidence unless its journal is sealed and holds a readable terminal-completion event — an unsealed run is incomplete whatever events it holds ([test](tests/run-state.compliance.l1.test.ts))
- NEVER: read from or write to a branch run file path that resolves to a symbolic link or non-regular file ([test](tests/run-file.compliance.l1.test.ts))
- NEVER: read from or write through a branch audit storage directory that resolves to a symbolic link or non-directory ([test](tests/run-file.compliance.l1.test.ts))
