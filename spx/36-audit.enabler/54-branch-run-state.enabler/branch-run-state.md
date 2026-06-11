# Branch Run State

PROVIDES branch-scoped audit run files and terminal JSONL records
SO THAT audit list, status, and latest-run lookup
CAN inspect local audit evidence without parsing verdict XML

## Assertions

### Compliance

- ALWAYS: audit run state is stored under `.spx/branch/{branch-slug}/audit/runs/run-{run-token}.jsonl` at the Git common-dir product root ([test](tests/run-file.scenario.l1.test.ts))
- ALWAYS: branch slugs, run ids, retry limits, terminal JSONL records, and latest-run ordering follow `spx/36-audit.enabler/15-audit-directory.adr.md` ([test](tests/branch-slug.property.l1.test.ts), [test](tests/run-file.scenario.l1.test.ts), [test](tests/run-state.scenario.l1.test.ts))
- ALWAYS: branch run lookup ignores entries whose file names do not match the audit run-file format before constructing run-file paths ([test](tests/run-state.scenario.l1.test.ts))
- ALWAYS: node-first `.spx/nodes/` artifacts remain explicit-file verification inputs only ([test](tests/run-state.scenario.l1.test.ts))
- NEVER: treat missing, unreadable, empty, or parse-invalid JSONL records as approved or rejected audit evidence ([test](tests/run-state.scenario.l1.test.ts))
