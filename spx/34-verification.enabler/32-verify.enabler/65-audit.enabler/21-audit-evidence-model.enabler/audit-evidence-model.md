# Audit Evidence Model

PROVIDES audit evidence validation over nestable audit units, producer metadata, coverage statuses, and unit-scoped findings
SO THAT audit orchestrators, leaf auditor producers, merge workflows, and renderers
CAN record complete audit coverage and findings under `--verification-type audit`

## Assertions

### Conformance

- Audit scope payloads conform to the audit unit schema: unit identity, optional parent unit identity, audit class `instructions`, `spec`, or `implementation`, audit kind `skill`, `subagent`, `prompt`, `guide-template`, `spec`, `adr`, `pdr`, `code`, `tests`, `architecture`, `eval-evidence`, or `coverage-gap`, subject, coverage status `audited`, `not-applicable`, `unsupported`, `missing-skill`, `skipped`, or `incomplete`, and producer metadata containing producer kind, agent name, agent owning plugin name and version, skill name, skill owning plugin name and version, invocation role, and optional tool version ([test](tests/audit-scope.conformance.l1.test.ts))
- Audit finding payloads conform to the audit finding schema: unit identity, producer metadata, rule, severity `blocking` or `debt`, location, message, and observed-versus-expected evidence ([test](tests/audit-finding.conformance.l1.test.ts))

### Compliance

- ALWAYS: audit scope and finding payloads validate through the shared verification-type evidence-validator registry before journal events append ([audit])
