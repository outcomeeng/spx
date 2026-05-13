# Open Issues

## Test-owned constant warning debt

`pnpm run validate` passed on May 12, 2026 and reported 37 warning-level `spx/no-test-owned-domain-constants` findings in this node. These warnings are existing test-quality debt and should be resolved with `spec-tree:testing`, `typescript:testing-typescript`, and `typescript:auditing-typescript-tests`.

Affected files:

- `spx/36-audit.enabler/21-audit-test-harness.enabler/tests/audit-test-harness.unit.test.ts`
- `spx/36-audit.enabler/32-verify.enabler/32-structural.enabler/tests/structural.scenario.l1.test.ts`
- `spx/36-audit.enabler/32-verify.enabler/43-semantic.enabler/tests/semantic.mapping.l1.test.ts`
- `spx/36-audit.enabler/32-verify.enabler/43-semantic.enabler/tests/semantic.scenario.l1.test.ts`
- `spx/36-audit.enabler/32-verify.enabler/54-paths.enabler/tests/paths.mapping.l1.test.ts`
- `spx/36-audit.enabler/32-verify.enabler/54-paths.enabler/tests/paths.scenario.l1.test.ts`
- `spx/36-audit.enabler/32-verify.enabler/tests/verify.scenario.l1.test.ts`
- `spx/36-audit.enabler/76-audit-cli.enabler/tests/audit-cli.scenario.l1.test.ts`
- `spx/36-audit.enabler/tests/audit.scenario.l1.test.ts`

Resolution: replace each test-owned semantic constant with source-owned constants, source-owned test-data APIs, or generated domain data, then remove the corresponding warning entry from the validation debt manifest.
