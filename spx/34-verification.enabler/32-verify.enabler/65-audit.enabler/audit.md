# Audit

PROVIDES audit verification-type payload validation and projection over nestable audit units, producer metadata, coverage statuses, and unit-scoped findings
SO THAT audit orchestrators, leaf auditor producers, merge workflows, and renderers
CAN record complete audit coverage and findings under `--verification-type audit` without adding audit subtype commands

## Assertions

### Scenarios

- Given an audit changeset unit with child spec and implementation units, when audit scope evidence is recorded, then the run projection preserves the unit nesting and producer metadata ([test](tests/audit-scope.scenario.l1.test.ts))
- Given an audit unit with no finding, when audit scope evidence records `audited`, then the run projection represents clean coverage without adding a finding ([test](tests/audit-scope.scenario.l1.test.ts))

### Mappings

- Audit terminal rollup maps `audited`, `not-applicable`, `unsupported`, `missing-skill`, `skipped`, and `incomplete` coverage statuses plus finding severities into the journal terminal-status vocabulary ([test](tests/audit-rollup.mapping.l1.test.ts))

### Conformance

- Audit scope payloads conform to the audit unit schema: unit identity, optional parent unit identity, audit class, audit kind, subject, coverage status, and producer metadata ([test](tests/audit-scope.conformance.l1.test.ts))
- Audit finding payloads conform to the audit finding schema: unit identity, audit class, audit kind, producer metadata, rule, severity, location, message, and observed-versus-expected evidence ([test](tests/audit-finding.conformance.l1.test.ts))

### Compliance

- ALWAYS: `audit` is the public verification type for every audit run; audit class and audit kind stay inside payloads ([test](tests/audit-command-surface.compliance.l1.test.ts))
- NEVER: audit payload handling introduces `spx audit` or audit subtype commands under `spx verification run` ([test](tests/audit-command-surface.compliance.l1.test.ts))
