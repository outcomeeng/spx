# Record Run

PROVIDES the caller-driven `spx verification run` command paths that record a verification run the caller itself drives, together with the Change it serves, and list the runs recorded for one Change
SO THAT agents, CI jobs, and launchers driving a verification run, and the holders of a Change counting the runs its gates made
CAN start it, append its scope and finding evidence, and finish it through noun-grouped command paths without constructing journal events directly, and read a Change's runs by verification type without holding their run tokens

## Assertions

- Given `spx verification run start --change <owner/repo#N>`, when the run starts, then the run records that Change identity, and `spx verification run list --change <owner/repo#N>` reports that run in the Change's listing as JSON
- NEVER: `spx verification run list` appends a journal event or seals a run

### Mappings

- Caller-driven scope option grammar maps `--scope-type changeset --scope <base>..<head>` and `--scope-type file --scope <product-relative-path>` to the corresponding lifecycle selector, and `start` maps either selector to a result carrying `resolvedScope` without a changeset-specific report field ([test](tests/file-scope.mapping.l1.test.ts))

### Compliance

- ALWAYS: the caller-driven verification-run lifecycle is exposed under `spx verification run` ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: verification-run evidence resources use noun-local command paths, including `spx verification run scope add` and `spx verification run finding add` ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: `spx verification run scope add` and `spx verification run finding add` require a payload source and caller-supplied idempotency key ([test](tests/record-run.compliance.l1.test.ts))
