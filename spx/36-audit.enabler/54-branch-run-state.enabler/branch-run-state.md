# Branch Run State

PROVIDES branch-scoped audit run directories and terminal state files
SO THAT audit list, status, and latest-run lookup
CAN inspect local audit evidence without parsing verdict XML

## Assertions

### Compliance

- ALWAYS: audit run state is stored under `.spx/audit/{branch-slug}/runs/{run-directory}` at the Git common-dir product root ([test](tests/run-directory.scenario.l1.test.ts))
- ALWAYS: branch slugs, run ids, retry limits, terminal `state.json`, and latest-run ordering follow `spx/36-audit.enabler/15-audit-directory.adr.md` ([test](tests/branch-slug.property.l1.test.ts), [test](tests/run-directory.scenario.l1.test.ts), [test](tests/run-state.scenario.l1.test.ts))
- ALWAYS: branch run lookup ignores entries whose directory names do not match the audit run-directory format before constructing state-file paths ([test](tests/run-state.scenario.l1.test.ts))
- ALWAYS: node-first `.spx/nodes/` artifacts remain explicit-file verification inputs only ([test](tests/run-state.scenario.l1.test.ts))
- NEVER: treat missing, unreadable, partial, or parse-invalid `state.json` as approved or rejected audit evidence ([test](tests/run-state.scenario.l1.test.ts))
