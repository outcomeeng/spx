# Config CLI

PROVIDES three `spx config` subcommands — `show`, `validate`, `defaults` — each a thin CLI wrapper over `resolveConfig`
SO THAT operators, agents, and CI pipelines
CAN inspect the resolved configuration, verify that the project `spx.config.*` file parses and passes every descriptor's validator, and list the defaults each descriptor ships with, without importing the library or authoring ad-hoc scripts

## Assertions

### Scenarios

- Given a project root with no `spx.config.*`, when `spx config show` runs, then stdout carries a default-format dump of the resolved Config (every registered descriptor's section resolved to its defaults) and the exit code is 0 ([test](tests/show.scenario.l1.test.ts))
- Given a project root with `spx.config.*` declaring a subset of sections, when `spx config show` runs, then stdout carries the resolved Config reflecting config overrides merged with defaults and the exit code is 0 ([test](tests/show.scenario.l1.test.ts))
- Given any project root, when `spx config show --json` runs, then stdout is a JSON document equivalent to the default-format output and the exit code is 0 ([test](tests/show.scenario.l1.test.ts))
- Given a project root whose `spx.config.*` passes every descriptor's validator, when `spx config validate` runs, then the exit code is 0 and stdout carries a success line naming the validated file ([test](tests/validate.scenario.l1.test.ts))
- Given a project root whose `spx.config.*` contains a section a descriptor rejects, when `spx config validate` runs, then the exit code is non-zero and stderr carries a descriptor-qualified error naming the offending section and the validator's message ([test](tests/validate.scenario.l1.test.ts))
- Given any project root, when `spx config defaults` runs, then stdout carries a default-format dump of each registered descriptor's `defaults` field, ignoring any `spx.config.*` present at the root, and the exit code is 0 ([test](tests/defaults.scenario.l1.test.ts))

### Mappings

- `--json` flag on `show` and `defaults` maps to JSON stdout; absent flag maps to the config module's default output format ([test](tests/show.scenario.l1.test.ts))
- `spx config validate` exit code: 0 when resolution succeeds; 1 when resolution returns an error ([test](tests/validate.scenario.l1.test.ts))

### Properties

- Commands are read-only with respect to the process: invoking `show`, `validate`, or `defaults` never calls `process.exit`, `process.chdir`, or writes to `process.stdout`/`process.stderr` — process-effect observation via runtime sentinel trapping confirms no forbidden call occurs ([test](tests/invariants.compliance.l1.test.ts))
- Commands are deterministic: invoking the same handler with the same `CliDeps` twice produces identical `CliResult` values ([test](tests/invariants.compliance.l1.test.ts))

### Compliance

- ALWAYS: `projectRoot` passed to `resolveConfig` is derived from `git rev-parse --show-toplevel` when the current working directory is inside a git worktree, falling back to `process.cwd()` with a stderr warning otherwise — matches PDR-15 for tracked-file reads ([test](tests/root-resolution.compliance.l1.test.ts))
- ALWAYS: command output to stdout is reserved for the resolved Config (or validation success line); errors and diagnostics route to stderr ([test](tests/invariants.compliance.l1.test.ts))
- NEVER: handlers write to the filesystem, spawn subprocesses, mutate `process.env`, or call `process.exit` — handlers return a `CliResult` and the registration layer owns process effects ([test](tests/invariants.compliance.l1.test.ts))
- NEVER: hardcode descriptor section names or vocabulary outside descriptor modules — the CLI iterates the registry and uses `descriptor.section` / `descriptor.defaults` exclusively ([review])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — handler tests supply controlled `CliDeps`; the integration test for git rooting spawns a real git process under a real temp worktree ([review])
