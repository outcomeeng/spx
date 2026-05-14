# Branch Run State

PROVIDES branch-scoped audit run directories and terminal state files
SO THAT audit list, status, and latest-run lookup
CAN inspect local audit evidence without parsing verdict XML

## Assertions

### Compliance

- ALWAYS: audit run state is stored under `.spx/audit/{branch-slug}/runs/{run-directory}` at the main product directory root ([review])
- ALWAYS: branch slugs, run ids, retry limits, terminal `state.json`, and latest-run ordering follow `spx/36-audit.enabler/15-audit-directory.adr.md` ([review])
- ALWAYS: node-first `.spx/nodes/` artifacts remain explicit-file verification inputs only ([review])
- NEVER: treat missing, partial, or parse-invalid `state.json` as approved or rejected audit evidence ([review])
