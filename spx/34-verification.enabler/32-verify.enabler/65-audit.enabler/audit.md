# Audit

PROVIDES the audit verification-type boundary for nestable audit coverage and unit-scoped findings
SO THAT audit orchestrators, leaf auditor producers, merge workflows, and renderers
CAN record audit evidence under `--verification-type audit` without adding audit subtype commands

## Assertions

### Compliance

- ALWAYS: `audit` is the public verification type for every audit run; audit class and audit kind stay inside payloads ([test](tests/audit-command-surface.compliance.l1.test.ts))
- NEVER: audit payload handling introduces `spx audit` or audit subtype commands under `spx verification run` ([test](tests/audit-command-surface.compliance.l1.test.ts))
