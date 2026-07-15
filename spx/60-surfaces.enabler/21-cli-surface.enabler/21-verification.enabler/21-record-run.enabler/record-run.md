# Record Run

PROVIDES the caller-driven `spx verification run` command paths that record a verification run the caller itself drives
SO THAT agents, CI jobs, and launchers driving a verification run
CAN start it, append its scope and finding evidence, and finish it through noun-grouped command paths without constructing journal events directly

## Assertions

### Compliance

- ALWAYS: the caller-driven verification-run lifecycle is exposed under `spx verification run` ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: caller-driven run command paths accept `changeset` and `file` scope types, with a changeset range or one safe normalized product-relative file path supplied through `--scope` ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: `spx verification run start` reports `resolvedScope` for either supported scope type and exposes no changeset-specific report field ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: verification-run evidence resources use noun-local command paths, including `spx verification run scope add` and `spx verification run finding add` ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: `spx verification run scope add` and `spx verification run finding add` require a payload source and caller-supplied idempotency key ([test](tests/record-run.compliance.l1.test.ts))
