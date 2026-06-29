# Verify

PROVIDES the `spx verify --verification-type <type> --scope-type changeset --scope <base>..<head> --input <input-source> [--run <run-token>] [--payload <payload-source>] [--idempotency-key <key>] [--terminal-status <status>] <verb>` command lifecycle for typed changeset verification runs over the verification-context and journal substrate
SO THAT agents, CI jobs, and launchers that run review, audit, and other scoped verification workflows
CAN start one scoped run, read the exact verification input, append inspected scope and validated findings, finish the run, inspect resumable status, and render the journal projection without constructing journal events directly

## Assertions

### Scenarios

- Given `spx verify --verification-type review --scope-type changeset --scope <base>..<head> --input stdin start`, when standard input supplies the run input, then spx creates a canonical verification context, opens a run journal, and reports the run token, context digest, resolved changed-file scope, and exact input descriptor ([test](tests/verify-start.scenario.l1.test.ts))
- Given a started run, when `spx verify --verification-type review --scope-type changeset --scope <base>..<head> --input stdin --run <run-token> input` runs, then it returns the exact verification input whose digest was recorded at start ([test](tests/verify-input.scenario.l1.test.ts))
- Given a started run with appended scope and findings, when `spx verify --verification-type review --scope-type changeset --scope <base>..<head> --input stdin --run <run-token> --terminal-status approved finish` runs, then it records terminal completion, seals the journal, and renders a terminal projection from the event history ([test](tests/verify-lifecycle.scenario.l1.test.ts))

### Mappings

- The `spx verify` verbs map to lifecycle operations: `start` creates context and journal, `input` returns recorded input, `append-scope` records the inspected scope from `--payload <payload-source>` with `--idempotency-key <key>`, `append-finding` records a validated finding from `--payload <payload-source>` with `--idempotency-key <key>`, `finish` records terminal completion with `--terminal-status <status>` and seals, `status` reports resumable state, and `render` projects the journal ([test](tests/verify-verbs.mapping.l1.test.ts))
- The `changeset` scope type resolves `base` and `head` into verification-context reconstruction fields and derives changed product paths as run scope metadata outside the canonical verification context ([test](tests/verify-scope.mapping.l1.test.ts))

### Compliance

- ALWAYS: `append-finding` validates the finding payload against the selected verification type before it appends a journal event ([test](tests/verify-finding.compliance.l1.test.ts))
- ALWAYS: `input`, `append-scope`, `append-finding`, `finish`, `status`, and `render` require `--run <run-token>` and reject ambiguous type/scope-only selection ([test](tests/verify-run-token.compliance.l1.test.ts))
- ALWAYS: `append-scope` and `append-finding` require `--payload <payload-source>` for appended evidence and reject reuse of the run input as an append payload channel ([test](tests/verify-payload.compliance.l1.test.ts))
- ALWAYS: repeated append commands with the same caller-supplied idempotency key return the existing journal sequence instead of duplicating scope or finding evidence ([test](tests/verify-idempotency.compliance.l1.test.ts))
- ALWAYS: `append-scope` and `append-finding` require a caller-supplied idempotency key for every append payload ([test](tests/verify-idempotency.compliance.l1.test.ts))
- ALWAYS: `finish` requires a terminal status in the journal terminal-status vocabulary before it records terminal completion or seals the journal ([test](tests/verify-lifecycle.scenario.l1.test.ts))
- ALWAYS: `status` reports the run token, verification type, scope type, sealed state, last journal sequence, terminal status when present, and next legal lifecycle actions ([test](tests/verify-status.compliance.l1.test.ts))
- NEVER: `spx verify` exposes `--scope-type working-tree` without verification-context substrate representation for a working-tree subject kind and reconstruction fields ([test](tests/verify-scope.mapping.l1.test.ts))
- NEVER: a caller hand-formats the journal event envelope for `spx verify`; verify commands construct journal events from typed lifecycle inputs ([test](tests/verify-journal-boundary.compliance.l1.test.ts))
- NEVER: `spx verify` launches, configures, or selects the verifier agent; it records and renders the run that the caller drives ([audit])
