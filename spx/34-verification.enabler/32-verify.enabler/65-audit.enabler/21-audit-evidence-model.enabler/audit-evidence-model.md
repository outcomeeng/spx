# Audit Evidence Model

PROVIDES audit evidence validation over nestable audit units, stable producer identity, producer provenance, coverage statuses, and unit-scoped findings
SO THAT audit run drivers, leaf skill producers, merge workflows, and renderers
CAN record complete audit coverage and findings under `--verification-type audit`

## Assertions

### Conformance

- Audit scope payloads conform to the audit unit schema: unit identity, optional parent unit identity, audit class `instructions`, `spec`, or `implementation`, audit kind `skill`, `subagent`, `prompt`, `guide-template`, `spec`, `adr`, `pdr`, `code`, `tests`, `architecture`, `eval-evidence`, or `coverage-gap`, subject, coverage requirement `required` or `optional`, coverage status `audited`, `not-applicable`, `unsupported`, `missing-skill`, `skipped`, or `incomplete`, prior-context partitions, stable producer identity, and producer provenance ([test](tests/audit-scope.conformance.l1.test.ts))
- Audit finding payloads conform to the audit finding schema: unit identity, stable producer identity, producer provenance, rule, severity `blocking` or `debt`, location, message, and observed-versus-expected evidence ([test](tests/audit-finding.conformance.l1.test.ts))

### Compliance

- ALWAYS: audit finding payloads validate through the shared verification-type finding-validator registry before journal events append ([audit])
- ALWAYS: stable producer identity excludes plugin and tool versions so run-set and finding identity stay stable across producer releases; producer provenance records those versions for inspection and rendering ([audit])
