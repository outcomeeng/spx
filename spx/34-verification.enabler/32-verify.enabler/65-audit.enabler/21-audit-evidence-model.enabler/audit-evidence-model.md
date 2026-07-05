# Audit Evidence Model

PROVIDES audit evidence validation over nestable audit units, producer metadata, coverage statuses, and unit-scoped findings
SO THAT audit orchestrators, leaf auditor producers, merge workflows, and renderers
CAN record complete audit coverage and findings under `--verification-type audit`

## Assertions

### Scenarios

- Given an audit changeset unit with child spec and implementation units, when audit scope evidence is recorded, then the run projection preserves the unit nesting and producer metadata ([test](tests/audit-scope.scenario.l1.test.ts))
- Given an audit unit with no finding, when audit scope evidence records `audited`, then the run projection represents clean coverage without adding a finding ([test](tests/audit-scope.scenario.l1.test.ts))

### Conformance

- Audit scope payloads conform to the audit unit schema: unit identity, optional parent unit identity, audit class, audit kind, subject, coverage status, and producer metadata containing producer kind, agent name, agent owning plugin name and version, skill name, skill owning plugin name and version, invocation role, and optional tool version ([test](tests/audit-scope.conformance.l1.test.ts))
- Audit finding payloads conform to the audit finding schema: unit identity, producer metadata, rule, severity `blocking` or `debt`, location, message, and observed-versus-expected evidence ([test](tests/audit-finding.conformance.l1.test.ts))

### Compliance

- ALWAYS: audit finding payloads validate through the shared verification-type finding-validator registry before journal events append ([audit])
