# Audit Payload

Audit verification runs use one public verification type, `audit`. Audit class, audit kind, stable producer identity, producer provenance, unit nesting, coverage requirement, coverage status, prior-context partitions, and audit finding details live in structured payloads rather than in command paths or verification-type subcommands.

## Rationale

Audit workflows inspect many subjects: instructions, specs, implementation code, tests, architecture, and coverage gaps. A single verification type with structured audit units lets SPX render complete audit coverage and findings across those subjects without multiplying public CLI vocabulary.

## Product properties

1. Every audit run uses `--verification-type audit`; audit class and audit kind are payload fields. Audit class values are `instructions`, `spec`, and `implementation`; audit kind values are `skill`, `subagent`, `prompt`, `guide-template`, `spec`, `adr`, `pdr`, `code`, `tests`, `architecture`, `eval-evidence`, and `coverage-gap`. Compatibility is constrained by class: `instructions` units use `skill`, `subagent`, `prompt`, or `guide-template`; `spec` units use `spec`, `adr`, or `pdr`; `implementation` units use `code`, `tests`, `architecture`, or `eval-evidence`; `coverage-gap` is valid for any class when no executed producer supplies coverage, and coverage-gap units use uncovered coverage statuses rather than `audited` or `not-applicable`.
2. Audit scope evidence records an ordered coverage inventory of nestable units with `unitId`, optional `parentUnitId`, audit class, audit kind, subject, coverage requirement (`required` or `optional`), coverage status, prior-context partitions, expected producer identity, recorded-by run-driver identity, and optional producer provenance when a leaf skill producer executed. Coverage status values are `audited`, `not-applicable`, `unsupported`, `missing-skill`, `skipped`, and `incomplete`; prior-context partitions include changed-file partition, optional language partition, and concern partition. In a file-scoped audit run, the first unit is a required root with no parent whose subject path equals the run's normalized file scope; later units may cover related files and name only a parent unit already recorded in the run.
3. Audit finding evidence records the inspected unit already recorded as audit scope evidence in the run, stable producer identity, producer provenance, rule, severity (`blocking` or `debt`), location, message, and observed-versus-expected evidence. Stable producer identity contains producer kind, agent name, agent owning plugin name, skill name, skill owning plugin name, and invocation role; producer provenance contains agent owning plugin version, skill owning plugin version, and optional tool version. Scope units use expected producer identity for planned coverage and prior-context selection; finding and run-set identity use stable producer identity without versions, while producer provenance remains display metadata. Terminal rollup approves only complete clean required coverage rooted at the selected file and rejects a missing or mismatched file root, any required uncovered unit, or any finding.

## Verification

### Testing

- ALWAYS: audit verification-type registration accepts `audit` as a supported verification type without adding audit subtype commands ([compliance])
- ALWAYS: audit scope payload validation accepts nestable units with unit identity, audit class `instructions`, `spec`, or `implementation`, compatible audit kind `skill`, `subagent`, `prompt`, `guide-template`, `spec`, `adr`, `pdr`, `code`, `tests`, `architecture`, `eval-evidence`, or `coverage-gap`, subject, coverage requirement `required` or `optional`, coverage status `audited`, `not-applicable`, `unsupported`, `missing-skill`, `skipped`, or `incomplete`, prior-context partitions, expected producer identity, recorded-by run-driver identity, and optional producer provenance when a leaf skill producer executed; coverage-gap units reject `audited` and `not-applicable` coverage statuses ([conformance])
- ALWAYS: a file-scoped audit run accepts its first scope unit only when it is required, has no parent, and its subject path equals the normalized file selector; each later child unit names a parent already recorded in the run, while its own subject may identify a related file ([compliance])
- ALWAYS: audit finding validation requires a referenced audit unit already recorded as scope evidence in the run, stable producer identity, producer provenance, rule, severity `blocking` or `debt`, message, and evidence payload ([conformance])
- ALWAYS: audit terminal rollup maps every required non-gap unit covered by `audited` or `not-applicable`, a matching required file root for a file-scoped run, and no findings to `approved`; zero valid scope units, a missing or mismatched file root, any required coverage-gap unit, any required unit with coverage status `unsupported`, `missing-skill`, `skipped`, or `incomplete`, or any finding severity `blocking` or `debt` maps to `rejected`, and an optional uncovered unit alone does not determine rejection ([mapping])
- ALWAYS: audit finish rejects any supplied terminal metadata because audit terminal state derives only from audit coverage and finding evidence ([compliance])
- ALWAYS: prior audit context selectors filter by audit class, audit kind, expected producer identity, stable producer identity when evidence was produced, subject path, changed-file partition, language partition, and concern partition ([mapping])
- NEVER: audit class or audit kind appears as a public command path segment under `spx verification run` ([compliance])

### Audit

- ALWAYS: audit payload specifications preserve the distinction between audit coverage evidence and audit finding evidence ([audit])
