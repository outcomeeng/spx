# Audit Evidence Model

PROVIDES audit evidence validation over nestable audit units, stable producer identity, producer provenance, coverage statuses, and unit-scoped findings
SO THAT audit run drivers, leaf skill producers, merge workflows, and renderers
CAN record complete audit coverage and findings under `--verification-type audit`

## Assertions

### Conformance

- Audit scope payloads conform to the audit unit schema: unit identity, optional parent unit identity, audit class `instructions`, `spec`, `implementation`, `coordination`, or `changeset`, compatible audit kind `skill`, `subagent`, `prompt`, `guide-template`, `spec`, `adr`, `pdr`, `code`, `tests`, `architecture`, `eval-evidence`, `change`, `coherence`, `review-unit`, or `coverage-gap`, subject, coverage requirement `required` or `optional`, coverage status `audited`, `not-applicable`, `unsupported`, `missing-skill`, `skipped`, or `incomplete`, prior-context partitions, expected producer identity, recorded-by run-driver identity, and optional producer provenance when a leaf skill producer executed; `coordination` accepts `change` or `coverage-gap`, `change` is incompatible with every other class, and coverage-gap units use uncovered coverage statuses rather than `audited` or `not-applicable` ([test](tests/audit-scope.conformance.l1.test.ts))
- In a file-scoped audit run, the first audit scope payload conforms only when it records a required root unit with no parent and a subject path equal to the run's normalized file selector; each later child payload conforms only when its parent unit is already recorded, while the child subject may identify a related file ([test](tests/audit-file-root.conformance.l1.test.ts))
- A first audit scope payload carrying audit class `changeset` conforms only when the run is changeset-scoped and the payload records a required root unit with no parent, audit kind `coherence` or `coverage-gap`, and a subject equal to the run's changeset scope identity; a later `changeset`/`review-unit` payload conforms only when it names a recorded `coherence` root as its parent, so a coverage-gap root carries no review units ([test](tests/audit-changeset-root.conformance.l1.test.ts))
- Audit finding payloads conform to the audit finding schema: unit identity already recorded as audit scope evidence in the run, stable producer identity, producer provenance, rule, severity `blocking`, `debt`, `filed`, or `stale`, location, message, and observed-versus-expected evidence; a `filed` or `stale` finding additionally carries the `ISSUES.md` entry reference — the note's path and the entry's heading — and a `filed` finding additionally carries base-ref evidence, a location observable at the scope's base ref ([test](tests/audit-finding.conformance.l1.test.ts))

### Mappings

- Every registered audit kind maps to accepted or rejected under audit class `changeset`: `coherence`, `review-unit`, and the class-independent `coverage-gap` are accepted and every other registered kind is rejected ([test](tests/audit-changeset-class.mapping.l1.test.ts))

### Compliance

- ALWAYS: audit scope and finding payloads validate through the shared verification-type evidence-validator registry before journal events append ([audit])
- ALWAYS: stable producer identity excludes plugin and tool versions so run-set and finding identity stay stable across producer releases; producer provenance records those versions for inspection and rendering ([audit])
- ALWAYS: invalid audit scope and finding payloads are rejected before journal events append ([test](tests/audit-evidence-validation.compliance.l1.test.ts))
- ALWAYS: an audit scope or finding payload rejection reason names the failing payload field path or the unmet structural requirement ([test](tests/audit-evidence-validation.compliance.l1.test.ts))
- ALWAYS: a `filed` or `stale` audit finding without its entry reference, or a `filed` finding without base-ref evidence, is rejected before any journal event appends, naming the missing field path ([test](tests/audit-evidence-validation.compliance.l1.test.ts))
- ALWAYS: audit scope validation preserves root-first and parent-before-child append order across the recorded scope evidence prefix ([test](tests/audit-order.compliance.l1.test.ts))
