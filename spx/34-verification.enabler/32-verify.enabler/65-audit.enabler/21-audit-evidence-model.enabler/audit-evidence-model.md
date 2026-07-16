# Audit Evidence Model

PROVIDES audit evidence validation over nestable audit units, stable producer identity, producer provenance, coverage statuses, and unit-scoped findings
SO THAT audit run drivers, leaf skill producers, merge workflows, and renderers
CAN record complete audit coverage and findings under `--verification-type audit`

## Assertions

### Conformance

- Audit scope payloads conform to the audit unit schema: unit identity, optional parent unit identity, audit class `instructions`, `spec`, or `implementation`, compatible audit kind `skill`, `subagent`, `prompt`, `guide-template`, `spec`, `adr`, `pdr`, `code`, `tests`, `architecture`, `eval-evidence`, or `coverage-gap`, subject, coverage requirement `required` or `optional`, coverage status `audited`, `not-applicable`, `unsupported`, `missing-skill`, `skipped`, or `incomplete`, prior-context partitions, expected producer identity, recorded-by run-driver identity, and optional producer provenance when a leaf skill producer executed; coverage-gap units use uncovered coverage statuses rather than `audited` or `not-applicable` ([test](tests/audit-scope.conformance.l1.test.ts))
- In a file-scoped audit run, the first audit scope payload conforms only when it records a required root unit with no parent and a subject path equal to the run's normalized file selector; each later child payload conforms only when its parent unit is already recorded, while the child subject may identify a related file ([test](tests/audit-file-root.conformance.l1.test.ts))
- Audit finding payloads conform to the audit finding schema: unit identity already recorded as audit scope evidence in the run, stable producer identity, producer provenance, rule, severity `blocking` or `debt`, location, message, and observed-versus-expected evidence ([test](tests/audit-finding.conformance.l1.test.ts))

### Compliance

- ALWAYS: audit scope and finding payloads validate through the shared verification-type evidence-validator registry before journal events append ([audit])
- ALWAYS: stable producer identity excludes plugin and tool versions so run-set and finding identity stay stable across producer releases; producer provenance records those versions for inspection and rendering ([audit])
- ALWAYS: invalid audit scope and finding payloads are rejected before journal events append ([test](tests/audit-evidence-validation.compliance.l1.test.ts))
- ALWAYS: audit scope validation preserves root-first and parent-before-child append order across the recorded scope evidence prefix ([test](tests/audit-order.compliance.l1.test.ts))
