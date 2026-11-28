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
- Given `spx verification run start --verifier <kind>:<id>`, when the run starts, then the run records that Verifier ([test](tests/verifier.scenario.l1.test.ts))

### Test.Scenario: run payload reporting

- [run-paths-report](tests/run-paths.scenario.l2.test.ts):
  - Given a Git repository whose HEAD commit holds `src/index.ts` and whose Git common-dir product root holds no `.spx/` directory
  - When `spx verification run paths --verification-type audit --scope-type file --scope src/index.ts` runs
  - Then it writes one JSON document on standard output carrying `resolvedScope`, `branchSlug`, and `writeDirectories`, `writeDirectories` holds exactly three entries, with `role` `journal-runs`, `verification-context`, and `payloads`, each with `exists` `false` and carrying `path` and `missingDirectories`, the command exits zero, and the repository holds no new file or directory
- [start-reports-payload-directory](tests/run-paths.scenario.l2.test.ts):
  - Given the same repository and the run input `{"subject": "write paths"}` on standard input
  - When `spx verification run start --verification-type audit --scope-type file --scope src/index.ts --input stdin` runs
  - Then its one JSON result carries `runToken`, `contextDigest`, `resolvedScope`, `input`, `locator`, and `payloadDirectory`, and `payloadDirectory` names the existing directory `run-<runToken>` inside the `payloads` directory that `paths` reports for the same verification type and scope

### Mappings

- Caller-driven scope option grammar maps `--scope-type changeset --scope <base>..<head>` and `--scope-type file --scope <product-relative-path>` to the corresponding lifecycle selector, and `start` maps either selector to a result carrying `resolvedScope` without a changeset-specific report field ([test](tests/file-scope.mapping.l1.test.ts))

### Compliance

- ALWAYS: the caller-driven verification-run lifecycle is exposed under `spx verification run` ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: `spx verification run start` accepts `--verifier <kind>:<id>` only with kind `person` or `agent` and an id holding at least one non-whitespace character, and rejects an empty or whitespace-only id before a run exists ([test](tests/verifier.compliance.l1.test.ts))
- ALWAYS: verification-run evidence resources use noun-local command paths, including `spx verification run scope add` and `spx verification run finding add` ([test](tests/record-run.compliance.l1.test.ts))
- ALWAYS: `spx verification run paths` rejects an invocation missing `--verification-type`, `--scope-type`, or `--scope`, or carrying `--run` or `--input`, before any path resolves ([test](tests/run-paths.compliance.l2.test.ts))
- ALWAYS: `spx verification run start` accepts `--expectations <expectations-source>`, and `reconcile` and `finish` reject it ([test](tests/run-expectations-option.compliance.l2.test.ts))
- ALWAYS: `spx verification run reconcile` requires `--run <run-token>`, rejects `--input`, and exits zero exactly when the run reconciles ([test](tests/run-reconcile.compliance.l2.test.ts))
- ALWAYS: `spx verification run start` accepts `--expect-content-sha256 <digest>` and `--content-normalization <none|utf8-universal-newlines>`, and on a rejected expectation exits 1 with its diagnostic on standard error, naming both digests for a difference, and empty standard output ([test](tests/content-identity-start.compliance.l1.test.ts))
- ALWAYS: `spx verification run input --check-file <file>` writes one JSON result to standard output and exits 0 for `equal`, 1 for `different`, and 2 for `content-identity-unavailable`, `normalization-failed`, or `check-file-unreadable`, while a run it cannot locate writes the run-lookup diagnostic to standard error, nothing to standard output, and exits 2 ([test](tests/content-identity-input-check.compliance.l1.test.ts))

### Test.Compliance: run payloads

- [evidence-add-payload-source](tests/run-payload.compliance.l2.test.ts): ALWAYS: `spx verification run scope add` and `spx verification run finding add` require a caller-supplied idempotency key and exactly one payload source, `--payload` or `--run-payload`
- [run-payload-option-grammar](tests/run-payload.compliance.l2.test.ts): ALWAYS: `scope add`, `finding add`, and `finish` accept `--run-payload <name>` naming a file in the run's payload directory, reject an invocation that names `--run-payload` with `--payload` on `scope add` or `finding add` or with `--terminal-metadata` on `finish`, and `--payload` reads standard input for `stdin` and otherwise a file path from the effective invocation directory
- [payload-removal-diagnostic](tests/run-payload.compliance.l2.test.ts): ALWAYS: when the result of `spx verification run finish` carries a payload-removal failure, the command writes a diagnostic naming the directory to standard error and writes its structured JSON result to standard output and exits as it would without the failure

### Test.Compliance: run payload containment

- [run-relative-payload-contained](tests/run-payload.compliance.l2.test.ts): NEVER: `spx verification run scope add`, `finding add`, or `finish` reads a `--run-payload` name whose path, resolved through symbolic links, lies outside the run's payload directory: a name that climbs out of it, an absolute path outside it, and a symbolic link inside it to a file outside it are each rejected before any read.

### Test.Compliance: run evidence help

- [evidence-help-names-fields](tests/run-evidence-help.compliance.l2.test.ts): ALWAYS: `spx verification run scope add --help` and `spx verification run finding add --help` name, for each verification type whose validators the run lifecycle registers, every payload field its validator requires, each field nested inside it, and the allowed values of each enumerated field, so the help a session reads states the payload the validator then accepts
- [run-help-options-per-command](tests/run-evidence-help.compliance.l2.test.ts): ALWAYS: the `--help` of each `spx verification run` subcommand lists every option that subcommand accepts and no other, so `--change`, which `start`, `list` and `compare` accept, appears in the help of those three subcommands and of no other
- [finish-help-accounting](tests/run-evidence-help.compliance.l2.test.ts): ALWAYS: `spx verification run finish --help` states that a scope unit's `judgedPaths` accounts for a changed path the head holds and its `judgedDeletions` for a path the changeset deletes

### Test.Scenario: unaccounted path names its accounting field

- [finish-names-accounting-field](tests/run-finish-accounting.scenario.l2.test.ts):
  - Given a changeset run started through `spx verification run start --expectations <file>` whose scope evidence accounts for every changed path except one the head holds and one the changeset deletes
  - When `spx verification run finish` runs
  - Then its one JSON result names the held path with `judgedPaths` and the deleted path with `judgedDeletions` as the field that would account for it, the command exits non-zero, and a later `spx verification run status` reports the run unsealed
