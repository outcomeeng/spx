# Verification Command Surface

spx exposes every verification activity through the noun-grouped `spx verification` command family, in two command-path shapes distinguished by who drives the run. A caller driving its own run uses the verification-run resource `spx verification run`, whose command paths are `start`, `input`, `scope add`, `finding add`, `finish`, `status`, and `render`. A caller asking spx to execute a verification uses `spx verification <type> run`, where the verification type is a noun carrying the `run` verb and product path operands narrow the work. Whichever path produces a run, that run is read back through the run-inspection command paths of `spx verification run`.

## Rationale

Verification runs share lifecycle, scope, finding, idempotency, status, and rendering behavior even when their judgment and their driver differ, so one noun-grouped family exposes the managed run resource while keeping caller actions separate from journal implementation mechanics. Naming the verification type as a noun that carries `run` keeps the two drive modes expressible for every type — the same slot serves a type spx executes directly and a type spx drives through an agent harness — where a verb-shaped type path would both violate the command-surface vocabulary and strand the drive mode in the verb.

## Product properties

1. `spx verification run <command-path> --verification-type <type> --scope-type <scope-type> --scope <scope> [--input <input-source>] [--run <run-token>] [--payload <payload-source>] [--idempotency-key <key>] [--terminal-status <status>] [--terminal-metadata <payload-source>]` is the public lifecycle a caller drives for a scoped verification run. The supported scope types are `changeset`, whose scope is `<base>..<head>`, and `file`, whose scope is one safe normalized product-relative file path; file selection does not require the path to exist or be tracked. `start` reports `resolvedScope` and the run locator a caller persists, `finish` accepts optional terminal metadata for verification-type terminal projection, and every existing-run command path either resolves that same run identity or returns a diagnostic naming the requested run token, verification type, scope type, scope identity, backend identity, storage namespace, and searched target.
2. `spx verification <type> run [<path>...]` is the public command path for a verification spx executes, naming the verification type as a noun and narrowing the work through positional product path operands; the type slot admits every verification type, whether spx executes the runner directly or drives an agent harness.
3. The command family validates type, scope, payload, finding, terminal status, and terminal metadata inputs before it records durable evidence, and reports every run — whichever command path produced it — through the run-inspection command paths.

## Verification

### Testing

- ALWAYS: `spx verification run` exposes one lifecycle vocabulary whose command paths are `start`, `input`, `scope add`, `finding add`, `finish`, `status`, and `render` ([mapping])
- ALWAYS: `spx verification <type> run` names the verification type as a noun carrying the `run` verb ([compliance])
- ALWAYS: `spx verification <type> run` narrows execution through positional product path operands, per `spx/29-verification-path-scope.pdr.md` ([compliance])
- NEVER: a verification type is exposed as a verb command path such as `spx verification validate` or `spx verification eval` ([compliance])
- ALWAYS: `spx verification run` validates the caller's verification type, scope type, scope identity, evidence payload, idempotency key, and finding payload before recording durable run evidence ([compliance])
- ALWAYS: the caller-driven run lifecycle maps `changeset` scopes from `<base>..<head>` and `file` scopes from one normalized product-relative path into reconstructable verification-context subjects ([mapping])
- ALWAYS: file-scope validation rejects absolute paths, empty identities, and parent-directory escapes while accepting nonexistent and untracked product-relative paths ([property])
- ALWAYS: `start` requires `--input <input-source>` and records that verification input for later replay ([compliance])
- ALWAYS: `start` reports `resolvedScope` for both `changeset` and `file` selectors rather than a scope-type-specific report field ([mapping])
- ALWAYS: `start` reports a run locator containing the run token, verification type, scope type, scope identity, backend identity, storage namespace, and journal run path or backend target ([compliance])
- ALWAYS: every `spx verification run` command path that operates on an existing run requires an explicit `--run <run-token>` selector, while `start` creates and reports that token with its run locator ([compliance])
- NEVER: an existing-run command path reads a fresh `--input <input-source>` value instead of replaying the input recorded at `start` ([compliance])
- ALWAYS: `scope add` and `finding add` require `--payload <payload-source>` and `--idempotency-key <key>`, keeping verification input replay separate from evidence payloads ([compliance])
- ALWAYS: `finish` requires `--terminal-status <status>`, accepts optional `--terminal-metadata <payload-source>`, and records the terminal status plus accepted terminal metadata in the terminal completion event before sealing the journal ([compliance])
- ALWAYS: an existing-run lookup failure names the run token, verification type, scope type, scope identity, backend identity, storage namespace, searched target, and the selector inputs that would address the run ([compliance])
- ALWAYS: a sealed review run reports the run token and authoritative finding count from the journal projection, with rendered finding details as an optional projection ([compliance])
- NEVER: expose a `spx verification run` scope type whose subject cannot be reconstructed from the selector values reported by the command ([compliance])
- NEVER: expose public verification-run command paths named `append-scope` or `append-finding` ([compliance])

### Audit

- ALWAYS: a verification activity is exposed under the `spx verification` command family rather than as a type-specific top-level command ([audit])
- ALWAYS: `spx verification` presents typed command paths whose recorded input, evidence payloads, status, and rendered output remain replayable through the reported run token ([audit])
- NEVER: the verification-type noun slot admits only the types spx executes directly — a verification spx drives through an agent harness occupies the same slot ([audit])
- NEVER: a top-level verb command such as `spx verify` manages verification runs ([audit])
