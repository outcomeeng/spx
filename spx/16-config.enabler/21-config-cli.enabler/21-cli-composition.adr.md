# Config CLI Composition

## Purpose

This decision governs the shape of the `spx config` CLI surface — subcommand registration, handler signature, output format selection, root resolution, and the dependency-injection seam that keeps CLI handlers testable without mocking.

## Context

**Business impact:** `spx config show`, `spx config validate`, and `spx config defaults` are the first user-facing windows onto the descriptor-registry configuration system. Their usefulness depends on correct config rendering, deterministic output, clean separation of diagnostic text from resolved config, and exit codes CI pipelines can depend on. Handlers that import `resolveConfig` directly are impossible to unit-test without process spawning; handlers that accept it as a parameter compose cleanly with the `withTestEnv` harness.

**Technical constraints:** spx is TypeScript ESM with Commander.js at the CLI layer. Domain subcommands register through a `registerDomainCommands(cmd: Command)` seam that wires subcommands to handlers under `src/commands/{domain}/`. Handlers return a result; the domain layer translates the result into stream writes and an exit code. The config module owns serialization for every supported config format.

## Decision

The config CLI follows the existing domain composition pattern with one refinement — explicit dependency injection of `resolveConfig` and of a minimal writer interface, enabling handler-level unit tests.

- `src/domains/config/index.ts` exports a `configDomain: Domain` value and registers three subcommands (`show`, `validate`, `defaults`) through `program.command("config").command("show")…` call chains.
- Each subcommand imports its handler from `src/commands/config/{show,validate,defaults}.ts`.
- Handlers have the signature `async function handler(options: Options, deps: CliDeps): Promise<CliResult>` where `CliDeps` bundles `{ resolveConfig: (projectRoot: string) => Promise<Result<Config>>, resolveProjectRoot: () => string, descriptors: readonly ConfigDescriptor<unknown>[] }` and `CliResult` is `{ stdout: string; stderr: string; exitCode: number }`. The `show` and `validate` handlers call `deps.resolveProjectRoot()` first and pass the returned root to `deps.resolveConfig(root)`, honoring the parent ADR's `resolveConfig(projectRoot)` contract. The `defaults` handler iterates `deps.descriptors` directly, skipping config-file resolution entirely; its output reflects what each descriptor ships with, independent of any `spx.config.*` present at the root.
- The domain registration layer builds a default `CliDeps` (pointing at the real `resolveConfig` and a real git-rooted resolver), invokes the handler, writes `stdout`/`stderr` to the process streams, and calls `process.exit(result.exitCode)`.
- Output format: `show` and `defaults` emit the config module's default format by default; a `--json` flag routes through the config module's JSON serializer. `validate` emits a single success line on the ok path and a descriptor-qualified error on the reject path.
- Root resolution: `resolveProjectRoot()` invokes `git rev-parse --show-toplevel` (tracked-file read per PDR-15, applicable because `spx.config.*` files are tracked files at the repo root) when inside a worktree. Outside a worktree it falls back to `process.cwd()` and emits a diagnostic warning per PDR-15's Compliance rule. Handlers never call git themselves.

## Rationale

Handlers-with-DI keep the CLI module testable at Level 1. A unit test constructs a `CliDeps` with a controlled `resolveConfig` implementation returning a fixture `Result<Config>` and a controlled `resolveProjectRoot` implementation returning a fixture path, exercises the handler, and asserts on the `CliResult`. No process is spawned, no config file is parsed from disk, no git call happens. This mirrors the language-registration descriptor pattern (ADR-19) in the architectural sense — the registry enumerates, the CLI iterates.

Returning `{ stdout, stderr, exitCode }` instead of writing to `process.stdout` / `process.stderr` inside the handler isolates side effects to the registration layer. The registration layer owns the contract with the runtime; handlers own only the logic of producing correct output from a resolved Config.

The config module's default format matches operator ergonomics. JSON is opt-in via `--json` for scripting. Both paths use `src/config/` serialization so CLI handlers never own raw format logic.

Alternatives considered:

- **Handlers that read config files directly and call `resolveConfig` themselves.** Rejected because it couples every handler to the filesystem and to the descriptor registry, reproducing in each handler the concerns the parent enabler owns. The DI seam is one line in the registration layer and buys full isolation for tests.
- **Shared `configCommand(subcommand, options, deps)` dispatcher.** Rejected because the three subcommands diverge in output shape and exit semantics (`validate` has a distinct exit-code contract). A dispatcher would accumulate if/else branches that per-subcommand handlers already express structurally.
- **Table/text-first output, default config format opt-in.** Rejected because the configuration is a nested mapping; table rendering requires custom flattening and loses fidelity.
- **Per-descriptor pretty-printing owned by each descriptor module.** Rejected because it leaks CLI concerns (columns, colors, wrap) into descriptor modules that have no reason to know them. The CLI owns presentation; descriptors own content.

## Trade-offs accepted

| Trade-off                                                 | Mitigation / reasoning                                                                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Three handler files instead of one                        | Each file is small (~40 lines) and reads independently; the alternative (dispatcher) scales worse as the subcommand surface grows         |
| DI plumbing for every handler (options + deps parameters) | The registration layer constructs the defaults once; handler call sites are one line; the benefit is Level 1 testability across the board |
| CLI delegates format serialization to `src/config/`       | The config module is the format owner; CLI handlers only choose default output or JSON                                                    |
| `resolveProjectRoot` is a thin wrapper over git           | Matches PDR-15's invariant; encapsulating the rev-parse invocation in one place avoids duplication and keeps the fallback consistent      |

## Invariants

- Every config subcommand handler has the signature `(options, deps) => Promise<CliResult>`; no handler touches `process.*` directly
- `CliResult.exitCode === 0` if and only if the command succeeded in its declared contract (`show` and `defaults` always succeed when `resolveConfig` succeeds; `validate` succeeds only when `resolveConfig.ok === true`)
- `CliResult.stdout` holds only the resolved Config (default format or json) or a single success line from `validate` — never diagnostic text
- `CliResult.stderr` holds only diagnostic or error text — never the resolved Config
- The registration layer in `src/domains/config/index.ts` is the sole caller of `process.stdout.write`, `process.stderr.write`, and `process.exit` for this domain

## Compliance

### Recognized by

Files under `src/domains/config/` and `src/commands/config/` contain the domain registration, handler implementations, a shared `CliDeps` / `CliResult` type module, and the `resolveProjectRoot` helper. No handler imports `resolveConfig` from `@/config` directly — all handlers receive it through the `deps` parameter.

### MUST

- Every handler in `src/commands/config/` accepts `(options: Options, deps: CliDeps): Promise<CliResult>` and returns a `CliResult` — never writes to `process.stdout` / `process.stderr` / `process.exit` itself ([review])
- The domain registration layer builds the default `CliDeps` from real implementations and is the sole owner of process-stream writes and `process.exit` for this domain ([review])
- `resolveProjectRoot` uses `git rev-parse --show-toplevel` inside a worktree; outside a worktree it falls back to `process.cwd()` and emits a diagnostic warning on stderr per PDR-15's Compliance rule ([test](tests/root-resolution.compliance.l1.test.ts))
- Output format selection between default format and json lives in a single place per output handler and delegates serialization to `src/config/`; `validate` does not emit serialized config ([review])
- Handler tests construct `CliDeps` with controlled implementations of `resolveConfig`, `resolveProjectRoot`, and a test-scoped `descriptors` array — the production registry is not intercepted ([review])

### NEVER

- `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism in handler tests — controlled dependencies are supplied through the `deps` parameter ([review])
- Import `resolveConfig` from `@/config` inside a handler module — the handler receives it via `deps` ([review])
- Call `process.exit`, `process.chdir`, or mutate `process.env` from inside a handler — handlers are pure with respect to the process ([review])
- Hardcode descriptor section names inside CLI output paths — the CLI iterates the resolved Config's keys or the supplied descriptor list ([review])
- Render descriptor values through per-descriptor pretty-printers or local raw-format serializers — the CLI uses `src/config/` serialization uniformly across all sections ([review])
