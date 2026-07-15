# Audit Run Projection

PROVIDES audit scope projection, terminal rollup, and prior-context selector projection over validated audit evidence from `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/21-audit-evidence-model.enabler`
SO THAT audit run drivers, leaf skill producers, merge workflows, and renderers
CAN finish individual audit runs from coverage evidence and produce selector inputs for run-set context

## Assertions

### Scenarios

- Given an audit changeset unit with child spec and implementation units, when audit scope evidence is recorded, then the run projection preserves the unit nesting, stable producer identity, and producer provenance ([test](tests/audit-scope.scenario.l1.test.ts))
- Given an audit unit with no finding, when audit scope evidence records `audited`, then the run projection represents clean coverage without adding a finding ([test](tests/audit-scope.scenario.l1.test.ts))

### Mappings

- Audit terminal rollup maps every required non-gap unit covered by `audited` or `not-applicable`, a matching required file root for a file-scoped run, and no findings to `approved`; zero valid scope units, a missing or mismatched file root, any required coverage-gap unit, any required unit covered by `unsupported`, `missing-skill`, `skipped`, or `incomplete`, or any finding with severity `blocking` or `debt` maps to `rejected`; optional uncovered units remain coverage gaps without determining the terminal status ([test](tests/audit-rollup.mapping.l1.test.ts))
- Prior audit context selectors map audit class, audit kind, expected producer identity, stable producer identity, subject path, changed-file partition, language partition, and concern partition to selector input consumed by run-set context filtering ([test](tests/audit-context-selectors.mapping.l1.test.ts))

### Compliance

- ALWAYS: audit finish rejects supplied terminal metadata because audit terminal status derives from coverage and finding evidence only ([test](tests/audit-terminal-metadata.compliance.l1.test.ts))
- ALWAYS: audit finish rechecks that a file-scoped run contains exactly one required root unit anchored to its normalized file selector before approving the terminal projection ([test](tests/audit-terminal-metadata.compliance.l1.test.ts))
- ALWAYS: audit payload projection preserves prior-context selector fields rather than parsing rendered audit output or raw journal-event envelopes for run-set context ([audit])
