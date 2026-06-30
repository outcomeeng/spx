# Verify

PROVIDES the `spx verify --verification-type <type> --scope-type changeset --scope <base>..<head> [--input <input-source>] [--run <run-token>] [--payload <payload-source>] [--idempotency-key <key>] [--terminal-status <status>] <verb>` command lifecycle for typed changeset verification runs over the verification-context and journal substrate
SO THAT agents, CI jobs, and launchers that run review, audit, and other scoped verification workflows
CAN start one scoped run, read the exact verification input, append inspected scope and validated findings, finish the run, inspect resumable status, and render the journal projection without constructing journal events directly

## Assertions

### Mappings

- The `spx verify` verbs map to lifecycle operations: `start` creates context and journal, `input` returns recorded input, `append-scope` records the inspected scope from `--payload <payload-source>` with `--idempotency-key <key>`, `append-finding` records a validated finding from `--payload <payload-source>` with `--idempotency-key <key>`, `finish` records terminal completion with `--terminal-status <status>` and seals, `status` reports resumable state, and `render` projects the journal ([test](tests/verify-verbs.mapping.l1.test.ts))

### Compliance

- NEVER: a caller hand-formats the journal event envelope for `spx verify`; verify commands construct journal events from typed lifecycle inputs ([test](tests/verify-journal-boundary.compliance.l1.test.ts))
- ALWAYS: existing-run verbs `input`, `append-scope`, `append-finding`, `finish`, `status`, and `render` require `--run <run-token>` and reject ambiguous type/scope-only selection ([test](tests/verify-run-token.compliance.l1.test.ts))
- NEVER: existing-run verbs `input`, `append-scope`, `append-finding`, `finish`, `status`, and `render` read a fresh `--input <input-source>` value after `start` records the run input ([test](tests/verify-no-fresh-input.compliance.l1.test.ts))
- NEVER: `spx verify` launches, configures, or selects the verifier agent; it records and renders the run that the caller drives ([audit])
