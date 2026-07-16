# Record Run

PROVIDES the caller-driven `spx verification run` command paths that record a verification run the caller itself drives
SO THAT agents, CI jobs, and launchers driving a verification run
CAN start it, append its scope and finding evidence, and finish it through noun-grouped command paths without constructing journal events directly

## Assertions

### Mappings

- Caller-driven scope option grammar maps `--scope-type changeset --scope <base>..<head>` and `--scope-type file --scope <product-relative-path>` to the corresponding lifecycle selector, and `start` maps either selector to a result carrying `resolvedScope` without a changeset-specific report field ([test](tests/file-scope.mapping.l1.test.ts))

### Compliance

- ALWAYS: the caller-driven verification-run lifecycle is exposed under `spx verification run` ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: verification-run evidence resources use noun-local command paths, including `spx verification run scope add` and `spx verification run finding add` ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: `spx verification run scope add` and `spx verification run finding add` require a payload source and caller-supplied idempotency key ([test](tests/record-run.compliance.l1.test.ts))
