# Verify

PROVIDES the `spx verify --verification-type <type> --scope-type <scope-type> --scope <scope> --input <input-source> [--run <run-token>] <verb>` command lifecycle for typed verification runs over the verification-context and journal substrate
SO THAT agents, CI jobs, and launchers that run review, audit, and other scoped verification workflows
CAN start one scoped run, read the exact verification input, append inspected scope and validated findings, finish the run, inspect resumable status, and render the journal projection without constructing journal events directly

## Assertions

### Scenarios

- Given `spx verify --verification-type review --scope-type changeset --scope <base>..<head> --input stdin start`, when standard input supplies the run input, then spx creates a canonical verification context, opens a run journal, and reports the run token, context digest, changed-file scope, and exact input descriptor ([test](tests/verify-start.scenario.l1.test.ts))
- Given a started run, when `spx verify --verification-type review --scope-type changeset --scope <base>..<head> --input stdin --run <run-token> input` runs, then it returns the exact verification input whose digest was recorded at start ([test](tests/verify-input.scenario.l1.test.ts))
- Given a started run with appended scope and findings, when `spx verify --verification-type review --scope-type changeset --scope <base>..<head> --input stdin --run <run-token> finish` runs, then it seals the journal and renders a terminal projection from the event history ([test](tests/verify-lifecycle.scenario.l1.test.ts))

### Mappings

- The `spx verify` verbs map to lifecycle operations: `start` creates context and journal, `input` returns recorded input, `append-scope` records inspected scope, `append-finding` records a validated finding, `finish` records terminal completion and seals, `status` reports resumable state, and `render` projects the journal ([test](tests/verify-verbs.mapping.l1.test.ts))
- Scope type maps to reconstruction fields: `changeset` resolves a ref range and changed product paths, while `working-tree` resolves tracked and untracked product paths from the effective invocation directory ([test](tests/verify-scope.mapping.l1.test.ts))

### Compliance

- ALWAYS: `append-finding` validates the finding payload against the selected verification type before it appends a journal event ([test](tests/verify-finding.compliance.l1.test.ts))
- ALWAYS: `input`, `append-scope`, `append-finding`, `finish`, `status`, and `render` require `--run <run-token>` and reject ambiguous type/scope-only selection ([test](tests/verify-run-token.compliance.l1.test.ts))
- ALWAYS: repeated append commands with the same caller-supplied idempotency key return the existing journal sequence instead of duplicating scope or finding evidence ([test](tests/verify-idempotency.compliance.l1.test.ts))
- ALWAYS: `status` reports the run token, verification type, scope type, sealed state, last journal sequence, terminal status when present, and next legal lifecycle actions ([test](tests/verify-status.compliance.l1.test.ts))
- NEVER: a caller hand-formats the journal event envelope for `spx verify`; verify commands construct journal events from typed lifecycle inputs ([test](tests/verify-journal-boundary.compliance.l1.test.ts))
- NEVER: `spx verify` launches, configures, or selects the verifier agent; it records and renders the run that the caller drives ([audit])
