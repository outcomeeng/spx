# Config CLI Composition

The `spx config` CLI follows the domain composition pattern of `spx/14-cli-composition.adr.md` with one refinement: config resolution and config-file discovery are dependency-injected into the handlers so they unit-test without spawning a process. `src/interfaces/cli/config.ts` exports the `configDomain` descriptor and registers `show`, `validate`, and `defaults`; each handler has the signature `(options: Options, deps: CliDeps) => Promise<CliResult>` where `CliResult` is `{ stdout, stderr, exitCode }`, never touches `process.*`, and delegates serialization to `src/config/`; the registration layer builds the default `CliDeps` from the real `resolveConfig`, `readProductConfigFile`, `resolveConfigFromReadResult`, descriptor registry, and git-rooted resolver, then owns every stream write and the `process.exit`.

## Rationale

Handlers-with-dependency-injection keep the CLI testable at level 1: a unit test constructs a `CliDeps` with controlled resolution functions returning generated values, exercises the handler, and asserts on the returned `CliResult` — no process spawn, no config file parsed from disk, no git call. Returning `{ stdout, stderr, exitCode }` rather than writing to the process streams inside the handler isolates side effects to the registration layer, which owns the runtime contract while handlers own only the logic of producing correct output from a resolved `Config`. The config module's default format matches operator ergonomics with JSON opt-in via `--json` for scripting, and both paths use `src/config/` serialization so handlers never own raw format logic — mirroring the registry-iterates-the-enumeration shape of `spx/19-language-registration.adr.md`.

Rejected: handlers that read config files and call `resolveConfig` themselves (couples every handler to the filesystem and the registry, reproducing the parent enabler's concerns); a shared `configCommand(subcommand, …)` dispatcher (the three subcommands diverge in output shape and exit semantics, so a dispatcher accumulates branches the per-subcommand handlers already express structurally); table/text-first output (the configuration is a nested mapping that table rendering flattens and loses fidelity); and per-descriptor pretty-printing (leaks CLI presentation concerns into descriptor modules that have no reason to know them).

## Invariants

- Every config subcommand handler has the signature `(options, deps) => Promise<CliResult>`; no handler touches `process.*` directly.
- `CliResult.exitCode === 0` if and only if the command succeeded in its declared contract (`show` and `defaults` succeed when `resolveConfig` succeeds; `validate` succeeds only when one config-file read result resolves through every descriptor).
- `CliResult.stdout` holds only the resolved `Config` (default format or JSON) or a single `validate` success line — never diagnostic text.
- `CliResult.stderr` holds only diagnostic or error text — never the resolved `Config`.
- The registration layer in `src/interfaces/cli/config.ts` is the sole caller of `process.stdout.write`, `process.stderr.write`, and `process.exit` for this domain.

## Verification

### Testing

- ALWAYS: `resolveProductDir` uses `git rev-parse --show-toplevel` inside a worktree and falls back to `process.cwd()` with a diagnostic warning outside one, per `spx/15-worktree-resolution.pdr.md` ([compliance])

### Audit

- ALWAYS: every handler in `src/commands/config/` accepts `(options: Options, deps: CliDeps): Promise<CliResult>` and returns a `CliResult` — never writes to `process.stdout` / `process.stderr` / `process.exit` itself ([audit])
- ALWAYS: the domain registration layer builds the default `CliDeps` from real implementations and is the sole owner of process-stream writes and `process.exit` for this domain ([audit])
- ALWAYS: output format selection between the default format and JSON lives in a single place per output handler and delegates serialization to `src/config/`; `validate` does not emit serialized config ([audit])
- ALWAYS: handler tests construct `CliDeps` with controlled implementations of `resolveConfig`, `readProductConfigFile`, `resolveConfigFromReadResult`, `resolveProductDir`, and a test-scoped `descriptors` array — the production registry is not intercepted ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism in handler tests — controlled dependencies are supplied through the `deps` parameter ([audit])
- NEVER: import config resolution or config-file discovery functions from `@/config` inside a handler module — the handler receives them via `deps` ([audit])
- NEVER: call `process.exit`, `process.chdir`, or mutate `process.env` from inside a handler — handlers are pure with respect to the process ([audit])
- NEVER: hardcode descriptor section names inside CLI output paths — the CLI iterates the resolved `Config`'s keys or the supplied descriptor list ([audit])
- NEVER: render descriptor values through per-descriptor pretty-printers or local raw-format serializers — the CLI uses `src/config/` serialization uniformly across all sections ([audit])
