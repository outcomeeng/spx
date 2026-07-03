# Verification Run Command Surface

spx exposes typed verification runs through the noun-grouped `spx verification run` command family. The lifecycle command paths are `start`, `input`, `scope add`, `finding add`, `finish`, `status`, and `render`; `start` reports a stable run token and resolved run locator so existing-run lifecycle verbs and diagnostics operate from the same run identity. Existing deterministic `spx validation` and `spx test` surfaces remain top-level commands, while every verification run type that records scoped run evidence uses `spx verification run`.

## Rationale

Verification runs share lifecycle, scope, finding, idempotency, status, and rendering behavior even when their judgment differs. A noun-grouped typed namespace exposes the managed run resource and keeps caller actions separate from journal implementation mechanics, while preserving separate deterministic `validation` and `test` commands for work spx executes directly.

## Product properties

1. `spx verification run <command-path> --verification-type <type> --scope-type changeset --scope <base>..<head> [--input <input-source>] [--run <run-token>] [--payload <payload-source>] [--idempotency-key <key>] [--terminal-status <status>]` is the public lifecycle for changeset-scoped verification runs such as review, audit, and any verification type that records durable run evidence; `start` reports the run locator a caller persists, and every existing-run command path either resolves that same run identity or returns a diagnostic naming the requested run token, verification type, scope type, scope identity, backend identity, storage namespace, and searched target.
2. `spx validation` and `spx test` remain the top-level deterministic execution surfaces that run their own work directly.
3. The public verification-run lifecycle validates type, scope, payload, and finding inputs before it records durable evidence.

## Verification

### Testing

- ALWAYS: `spx verification run` exposes one lifecycle vocabulary whose command paths are `start`, `input`, `scope add`, `finding add`, `finish`, `status`, and `render` ([mapping])
- ALWAYS: `spx verification run` validates the caller's verification type, scope type, scope identity, evidence payload, idempotency key, and finding payload before recording durable run evidence ([compliance])
- ALWAYS: `start` requires `--input <input-source>` and records that verification input for later replay ([compliance])
- ALWAYS: `start` reports a run locator containing the run token, verification type, scope type, scope identity, backend identity, storage namespace, and journal run path or backend target ([compliance])
- ALWAYS: every `spx verification run` command path that operates on an existing run requires an explicit `--run <run-token>` selector, while `start` creates and reports that token with its run locator ([compliance])
- NEVER: an existing-run command path reads a fresh `--input <input-source>` value instead of replaying the input recorded at `start` ([compliance])
- ALWAYS: `scope add` and `finding add` require `--payload <payload-source>` and `--idempotency-key <key>`, keeping verification input replay separate from evidence payloads ([compliance])
- ALWAYS: `finish` requires `--terminal-status <status>` and records that status in the terminal completion event before sealing the journal ([compliance])
- ALWAYS: an existing-run lookup failure names the run token, verification type, scope type, scope identity, backend identity, storage namespace, searched target, and the selector inputs that would address the run ([compliance])
- ALWAYS: a sealed review run reports the run token and authoritative finding count from the journal projection, with rendered finding details as an optional projection ([compliance])
- NEVER: expose a `spx verification run` scope type whose subject cannot be reconstructed from the selector values reported by the command ([compliance])
- NEVER: expose public verification-run command paths named `append-scope` or `append-finding` ([compliance])
- NEVER: move existing `spx validation` or `spx test` execution surfaces under `spx verification run` solely because they are verification activities ([compliance])

### Audit

- ALWAYS: every verification run type exposes its public CLI lifecycle under `spx verification run` rather than as a type-specific top-level command ([audit])
- ALWAYS: `spx verification run` presents typed lifecycle command paths whose recorded input, evidence payloads, status, and rendered output remain replayable through the reported run token ([audit])
- NEVER: a top-level verb command such as `spx verify` manages verification runs ([audit])
