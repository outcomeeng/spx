# Audit Run Projection

PROVIDES audit scope projection, terminal rollup, and prior-context selector projection over validated audit evidence from `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/21-audit-evidence-model.enabler`
SO THAT audit orchestrators, merge workflows, and renderers
CAN finish audit runs from coverage evidence and restore relevant prior audit context from run sets

## Assertions

### Scenarios

- Given an audit changeset unit with child spec and implementation units, when audit scope evidence is recorded, then the run projection preserves the unit nesting and producer metadata ([test](tests/audit-scope.scenario.l1.test.ts))
- Given an audit unit with no finding, when audit scope evidence records `audited`, then the run projection represents clean coverage without adding a finding ([test](tests/audit-scope.scenario.l1.test.ts))

### Mappings

- Audit terminal rollup maps every required unit covered by `audited` or `not-applicable` and no findings to `approved`; any required unit covered by `unsupported`, `missing-skill`, `skipped`, or `incomplete`, or any finding with severity `blocking` or `debt`, maps to `rejected` ([test](tests/audit-rollup.mapping.l1.test.ts))
- Prior audit context selectors map audit class, audit kind, producer identity, subject path, and changed-file partition to run-set context filtering ([test](tests/audit-context-selectors.mapping.l1.test.ts))

### Compliance

- ALWAYS: audit payload projection consumes merge-period identity, finding identity, and prior-run context selectors from `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler` rather than redefining run-set identity locally ([audit])
