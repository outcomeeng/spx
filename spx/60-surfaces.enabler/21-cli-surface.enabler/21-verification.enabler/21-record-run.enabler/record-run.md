---
id: 01a118d3-6835-7429-9743-dcc3d089a848
---

# Record Run

PROVIDES the caller-driven `spx verification run` command paths that report the directories a run writes and record a verification run the caller itself drives, together with the Change it serves
SO THAT agents, CI jobs, and launchers driving a verification run
CAN obtain its write directories before launch, start it for the Change it serves, append its scope and finding evidence, and finish it through noun-grouped command paths without constructing journal events directly

## Assertions

### Scenarios

- Given `spx verification run start --change <owner/repo#N>`, when the run starts, then the run records that Change identity ([test](tests/change-identity.scenario.l1.test.ts), [test](tests/change-identity.scenario.l2.test.ts))
- Given `spx verification run paths --verification-type <type> --scope-type <scope-type> --scope <scope>`, when it runs, then it writes the write-path report as one JSON document on standard output carrying `resolvedScope`, `branchSlug`, and `writeDirectories`, whose entries carry `role` (`journal-runs` or `verification-context`), `path`, `exists`, and `missingDirectories`, exits zero, and creates no file or directory

### Mappings

- Caller-driven scope option grammar maps `--scope-type changeset --scope <base>..<head>` and `--scope-type file --scope <product-relative-path>` to the corresponding lifecycle selector, and `start` maps either selector to a result carrying `resolvedScope` without a changeset-specific report field ([test](tests/file-scope.mapping.l1.test.ts))

### Compliance

- ALWAYS: the caller-driven verification-run lifecycle is exposed under `spx verification run` ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: verification-run evidence resources use noun-local command paths, including `spx verification run scope add` and `spx verification run finding add` ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: `spx verification run scope add` and `spx verification run finding add` require a payload source and caller-supplied idempotency key ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: `spx verification run paths` rejects an invocation missing `--verification-type`, `--scope-type`, or `--scope`, or carrying `--run` or `--input`, before any path resolves
