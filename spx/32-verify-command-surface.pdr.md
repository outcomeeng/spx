# Verify Command Surface

spx exposes typed verification runs through `spx verify --verification-type <type> --scope-type <scope-type> --scope <scope> --input <input-source> [--run <run-token>] <verb>`. Existing deterministic `spx validation` and `spx test` surfaces remain top-level commands, while every verification run type that records scoped run evidence uses `spx verify`.

## Rationale

Verification runs share lifecycle, scope, finding, idempotency, status, and rendering behavior even when their judgment differs. A single typed namespace keeps that behavior stable for agents and automation while the lower journal and verification-context surfaces remain reusable substrate.

## Product properties

1. `spx verify --verification-type <type> --scope-type <scope-type> --scope <scope> --input <input-source> [--run <run-token>] <verb>` is the public lifecycle for scoped verification runs such as review, audit, and any verification type that records durable run evidence.
2. `spx validation` and `spx test` remain the top-level deterministic execution surfaces that run their own work directly.
3. The public verify lifecycle validates type, scope, and finding inputs before it appends evidence to the run journal.

## Verification

### Testing

- ALWAYS: `spx verify` exposes one lifecycle vocabulary whose verbs are `start`, `input`, `append-scope`, `append-finding`, `finish`, `status`, and `render` ([mapping])
- ALWAYS: `spx verify` validates the caller's verification type, scope type, scope identity, and finding payload before appending durable run evidence ([compliance])
- ALWAYS: every `spx verify` verb that operates on an existing run requires an explicit `--run <run-token>` selector, while `start` creates and reports that token ([compliance])
- NEVER: move existing `spx validation` or `spx test` execution surfaces under `spx verify` solely because they are verification activities ([compliance])

### Audit

- ALWAYS: every verification run type exposes its public CLI lifecycle under `spx verify` rather than as a type-specific top-level command ([audit])
- ALWAYS: `spx verify` uses the journal and verification-context substrate for persistence and replay while presenting typed lifecycle verbs to callers ([audit])
