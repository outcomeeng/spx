# Open Issues

## Test-owned constant debt

`eslint.test-owned-constant-debt-nodes.json` lists audit subtree entries for
`spx/no-test-owned-domain-constants`. `pnpm run validate` passes without
printing warning text; the shrink-only manifest remains the active debt record
for these audit tests.

Affected manifest entries:

- `spx/36-audit.enabler`
- `spx/36-audit.enabler/21-audit-test-harness.enabler`
- `spx/36-audit.enabler/76-audit-cli.enabler`

Resolution: replace each test-owned semantic constant with source-owned
constants, source-owned test-data APIs, or generated domain data, then remove
the corresponding entry from `eslint.test-owned-constant-debt-nodes.json`.
