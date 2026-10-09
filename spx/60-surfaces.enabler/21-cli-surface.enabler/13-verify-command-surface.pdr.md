# Verification Command Surface

SPX exposes every verification activity through the noun-grouped `spx verification` command family, in two command-path shapes distinguished by who drives the run. A caller driving its own run uses the verification-run resource `spx verification run`, whose command paths are `start`, `input`, `scope add`, `finding add`, `finish`, `status`, `render`, `list`, and `compare`, and `start --change <owner/repo#N>` records the Change the run serves. A caller asking SPX to execute a verification uses `spx verification <type> run`, where the verification type is a noun carrying the `run` verb and product path operands narrow the work. Whichever path produces a run, that run is read back through the run-inspection command paths of `spx verification run`: `status` and `render` address one run by its run token, `list --change <owner/repo#N>` lists the runs recorded for one Change, and `compare --change <owner/repo#N>` addresses two runs of that Change by two run tokens and compares them.

## Rationale

Verification runs share one CLI vocabulary even when their judgment and driver differ. The noun-grouped family keeps caller actions separate from journal mechanics, while the verification-type noun slot remains available whether SPX executes a runner directly or drives an agent harness.

## Product properties

1. `spx verification run <command-path>` exposes caller-driven lifecycle options for verification type, scope type, scope identity, input, Change identity, run token, evidence payload, idempotency key, terminal status, and terminal metadata. Scope option grammar is `--scope-type changeset --scope <base>..<head>` or `--scope-type file --scope <product-relative-path>`; Change identity option grammar is `--change <owner/repo#N>`, which `start` accepts and `list` and `compare` require; run token option grammar is `--run <run-token>`, which each existing-run command path requires once and `compare` requires twice, each value naming a run of the Change `--change` names; `start` reports `runToken`, `contextDigest`, `resolvedScope`, `input`, and `locator`.
2. `spx verification <type> run [<path>...]` names the verification type as a noun and narrows SPX-driven work through positional product path operands.
3. `spx verification run status` and `spx verification run render` inspect a run produced through either drive mode.

## Verification

### Testing

- ALWAYS: `spx verification run` exposes the command paths `start`, `input`, `scope add`, `finding add`, `finish`, `status`, `render`, `list`, and `compare` ([mapping])
- ALWAYS: `spx verification <type> run` names the verification type as a noun carrying the `run` verb ([compliance])
- ALWAYS: `spx verification <type> run` narrows execution through positional product path operands, per [`spx/29-verification-path-scope.pdr.md`](spx/29-verification-path-scope.pdr.md) ([compliance])
- NEVER: a verification type is exposed as a verb command path such as `spx verification validate` or `spx verification eval` ([compliance])
- ALWAYS: caller-driven scope options map `changeset` to `<base>..<head>` and `file` to one product-relative path supplied through `--scope` ([mapping])
- ALWAYS: `start` requires `--input <input-source>` and reports `runToken`, `contextDigest`, `resolvedScope`, `input`, and `locator` ([conformance])
- ALWAYS: every existing-run command path — `input`, `scope add`, `finding add`, `finish`, `status`, `render`, and `compare` of `spx verification run` — requires `--run <run-token>`, once on every path but `compare` and twice on `compare` ([compliance])
- ALWAYS: `compare` rejects an invocation whose two `--run <run-token>` values are not both runs of the Change `--change <owner/repo#N>` names ([compliance])
- NEVER: an existing-run command path — `input`, `scope add`, `finding add`, `finish`, `status`, `render`, or `compare` — accepts a fresh `--input <input-source>` value ([compliance])
- ALWAYS: `scope add` and `finding add` require `--payload <payload-source>` and `--idempotency-key <key>` ([compliance])
- ALWAYS: `finish` requires `--terminal-status <status>` and accepts optional `--terminal-metadata <payload-source>` ([compliance])
- ALWAYS: a run-lookup failure on an existing-run command path — `input`, `scope add`, `finding add`, `finish`, `status`, `render`, or `compare` — names the requested run selectors and searched target ([conformance])
- NEVER: expose public verification-run command paths named `append-scope` or `append-finding` ([compliance])

### Audit

- ALWAYS: a verification activity is exposed under the `spx verification` command family rather than as a type-specific top-level command ([audit])
- ALWAYS: `spx verification` presents replayable command paths and agent-readable structured results ([audit])
- NEVER: the verification-type noun slot admits only the types SPX executes directly — a verification SPX drives through an agent harness occupies the same slot ([audit])
- NEVER: a top-level verb command such as `spx verify` manages verification runs ([audit])
