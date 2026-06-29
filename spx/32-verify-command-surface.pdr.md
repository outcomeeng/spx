# Verify Command Surface

spx exposes typed verification runs through `spx verify --verification-type <type> --scope-type changeset --scope <base>..<head> [--input <input-source>] [--run <run-token>] [--payload <payload-source>] [--idempotency-key <key>] [--terminal-status <status>] <verb>`. Existing deterministic `spx validation` and `spx test` surfaces remain top-level commands, while every verification run type that records scoped run evidence uses `spx verify`.

## Rationale

Verification runs share lifecycle, scope, finding, idempotency, status, and rendering behavior even when their judgment differs. A single typed namespace keeps that behavior stable for agents and automation while the lower journal and verification-context surfaces remain reusable substrate.

## Product properties

1. `spx verify --verification-type <type> --scope-type changeset --scope <base>..<head> [--input <input-source>] [--run <run-token>] [--payload <payload-source>] [--idempotency-key <key>] [--terminal-status <status>] <verb>` is the public lifecycle for changeset-scoped verification runs such as review, audit, and any verification type that records durable run evidence.
2. `spx validation` and `spx test` remain the top-level deterministic execution surfaces that run their own work directly.
3. The public verify lifecycle validates type, scope, payload, and finding inputs before it appends evidence to the run journal.

## Verification

### Testing

- ALWAYS: `spx verify` exposes one lifecycle vocabulary whose verbs are `start`, `input`, `append-scope`, `append-finding`, `finish`, `status`, and `render` ([mapping])
- ALWAYS: `spx verify` validates the caller's verification type, scope type, scope identity, append payload, idempotency key, and finding payload before appending durable run evidence ([compliance])
- ALWAYS: `start` requires `--input <input-source>` and records that verification input for later replay ([compliance])
- ALWAYS: every `spx verify` verb that operates on an existing run requires an explicit `--run <run-token>` selector, while `start` creates and reports that token ([compliance])
- NEVER: an existing-run verb reads a fresh `--input <input-source>` value instead of replaying the input recorded at `start` ([compliance])
- ALWAYS: `append-scope` and `append-finding` require `--payload <payload-source>` and `--idempotency-key <key>`, keeping verification input replay separate from appended evidence payloads ([compliance])
- ALWAYS: `finish` requires `--terminal-status <status>` and records that status in the terminal completion event before sealing the journal ([compliance])
- NEVER: expose a `spx verify` scope type whose subject cannot be represented by the verification-context substrate's reconstruction fields ([compliance])
- NEVER: move existing `spx validation` or `spx test` execution surfaces under `spx verify` solely because they are verification activities ([compliance])

### Audit

- ALWAYS: every verification run type exposes its public CLI lifecycle under `spx verify` rather than as a type-specific top-level command ([audit])
- ALWAYS: `spx verify` uses the journal and verification-context substrate for persistence and replay while presenting typed lifecycle verbs to callers ([audit])
