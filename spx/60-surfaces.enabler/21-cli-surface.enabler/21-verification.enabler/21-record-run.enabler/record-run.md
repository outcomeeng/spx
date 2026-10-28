---
id: 01a118d3-6835-7429-9743-dcc3d089a848
---

# Record Run

PROVIDES the caller-driven `spx verification run` command paths that report the directories a run writes and record a verification run the caller itself drives, together with the Change it serves and the Verifier that judges it
SO THAT agents, CI jobs, and launchers driving a verification run
CAN obtain its write directories before launch, start it for the Change it serves and the Verifier that judges it, append its scope and finding evidence, reconcile that evidence against the changes the run must judge, and finish it through noun-grouped command paths without constructing journal events directly

## Assertions

### Scenarios

- Given a run started through `spx verification run start --expectations <file>` whose scope evidence judges every changed path but one, when `spx verification run reconcile --run <run-token>` runs, then it reports that path as unaccounted in one JSON result on standard output and exits non-zero ([test](tests/run-reconcile.scenario.l2.test.ts))
- Given the same run, when `spx verification run finish` runs, then it reports that path as unaccounted in one JSON result on standard output, exits non-zero, and a later `spx verification run status` reports the run unsealed ([test](tests/run-finish-unaccounted.scenario.l2.test.ts))
- Given `spx verification run start --change <owner/repo#N>`, when the run starts, then the run records that Change identity ([test](tests/change-identity.scenario.l1.test.ts), [test](tests/change-identity.scenario.l2.test.ts))
- Given `spx verification run paths --verification-type <type> --scope-type <scope-type> --scope <scope>`, when it runs, then it writes the write-path report as one JSON document on standard output carrying `resolvedScope`, `branchSlug`, and `writeDirectories`, whose entries carry `role` (`journal-runs`, `verification-context`, or `payloads`), `path`, `exists`, and `missingDirectories`, exits zero, and creates no file or directory ([test](tests/run-paths.scenario.l2.test.ts))
- Given `spx verification run start --verifier <kind>:<id>`, when the run starts, then the run records that Verifier ([test](tests/verifier.scenario.l1.test.ts))
- Given `spx verification run start`, when the run starts, then its JSON result carries `payloadDirectory` beside `runToken`, `contextDigest`, `resolvedScope`, `input`, and `locator` ([test](tests/run-payload.scenario.l2.test.ts))

### Mappings

- Caller-driven scope option grammar maps `--scope-type changeset --scope <base>..<head>` and `--scope-type file --scope <product-relative-path>` to the corresponding lifecycle selector, and `start` maps either selector to a result carrying `resolvedScope` without a changeset-specific report field ([test](tests/file-scope.mapping.l1.test.ts))

### Compliance

- ALWAYS: the caller-driven verification-run lifecycle is exposed under `spx verification run` ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: `spx verification run start` accepts `--verifier <kind>:<id>` only with kind `person` or `agent` and an id holding at least one non-whitespace character, and rejects an empty or whitespace-only id before a run exists ([test](tests/verifier.compliance.l1.test.ts))
- ALWAYS: verification-run evidence resources use noun-local command paths, including `spx verification run scope add` and `spx verification run finding add` ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: `spx verification run scope add` and `spx verification run finding add` require a caller-supplied idempotency key and exactly one payload source, `--payload` or `--run-payload` ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: `spx verification run paths` rejects an invocation missing `--verification-type`, `--scope-type`, or `--scope`, or carrying `--run` or `--input`, before any path resolves ([test](tests/run-paths.compliance.l2.test.ts))
- ALWAYS: `spx verification run start` accepts `--expectations <expectations-source>`, and `reconcile` and `finish` reject it ([test](tests/run-expectations-option.compliance.l2.test.ts))
- ALWAYS: `spx verification run reconcile` requires `--run <run-token>`, rejects `--input`, and exits zero exactly when the run reconciles ([test](tests/run-reconcile.compliance.l2.test.ts))
- ALWAYS: `spx verification run start` accepts `--expect-content-sha256 <digest>` and `--content-normalization <none|utf8-universal-newlines>`, and on a rejected expectation exits 1 with its diagnostic on standard error, naming both digests for a difference, and empty standard output ([test](tests/content-identity-start.compliance.l1.test.ts))
- ALWAYS: `spx verification run input --check-file <file>` writes one JSON result to standard output and exits 0 for `equal`, 1 for `different`, and 2 for `content-identity-unavailable`, `normalization-failed`, or `check-file-unreadable`, while a run it cannot locate writes the run-lookup diagnostic to standard error, nothing to standard output, and exits 2 ([test](tests/content-identity-input-check.compliance.l1.test.ts))
- ALWAYS: `scope add`, `finding add`, and `finish` accept `--run-payload <name>` naming a file in the run's payload directory, reject an invocation that names `--run-payload` with `--payload` on `scope add` or `finding add` or with `--terminal-metadata` on `finish`, and `--payload` keeps reading its path from the invocation directory ([test](tests/run-payload-option.compliance.l2.test.ts))
