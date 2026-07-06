# Audit Evidence Model

PROVIDES audit evidence validation over nestable audit units, deterministic unit identity, normalized subjects, recorded-by identity, expected producer identity, producer provenance, coverage statuses, and unit-scoped findings
SO THAT audit run drivers, leaf skill producers, merge workflows, and renderers
CAN record complete audit coverage and findings under `--verification-type audit`

## Assertions

### Conformance

- Audit scope payloads conform to the audit unit schema: deterministic unit identity, optional parent unit identity, audit class, audit-kind-compatible audit kind, normalized subject, coverage requirement `required` or `optional`, coverage status `audited`, `not-applicable`, `unsupported`, `missing-skill`, `skipped`, or `incomplete`, prior-context partitions, recorded-by identity, optional recorded-by provenance, optional expected producer identity, and optional producer provenance ([test](tests/audit-scope.conformance.l1.test.ts))
- Audit finding payloads conform to the audit finding schema: unit identity, stable producer identity, producer provenance, rule, severity `blocking` or `debt`, location, message, and observed-versus-expected evidence ([test](tests/audit-finding.conformance.l1.test.ts))

### Compliance

- ALWAYS: audit scope and finding payloads validate through the shared verification-type evidence-validator registry before journal events append ([audit])
- ALWAYS: stable producer identity excludes plugin and tool versions so run-set and finding identity stay stable across producer releases; producer provenance records those versions for inspection and rendering ([audit])
