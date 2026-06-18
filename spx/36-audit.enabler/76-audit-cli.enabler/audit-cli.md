# Audit CLI

PROVIDES the `spx audit` Commander.js domain — registration of the `audit` command group in the CLI and routing to its subcommands
SO THAT audit subcommand enablers
CAN be invoked from the `spx` root command without the root command containing domain logic

## Assertions

### Scenarios

- Given the root CLI registry is constructed, when the audit domain is registered, then `init`, `progress`, `close`, `status`, and `list` are available as `spx audit` subcommands ([test](tests/audit-cli.scenario.l1.test.ts))
- Given built CLI artifacts exist, when `node bin/spx.js audit` runs an init, progress, close, status, and list lifecycle for a configured auditor, then the command routes through the root Commander registry, persists the audit run journal, and reports one approved terminal run ([test](tests/audit-cli.scenario.l1.test.ts))
- Given audit config supplies the base ref, auditor list, and target include/exclude filters, when `spx audit init` omits matching CLI overrides, then the init payload uses the configured values ([test](tests/audit-cli.scenario.l1.test.ts))
- Given Git is detached with no branch name available, when `spx audit init` runs without an explicit branch, then the run identity uses a detached-HEAD branch name derived from the current commit ([test](tests/audit-cli.scenario.l1.test.ts))
- Given `spx audit init` runs from a linked worktree, when audit config exists in the linked worktree, then config is read from that worktree and run state is written under the shared Git common-dir product root ([test](tests/audit-cli.scenario.l1.test.ts))
- Given audit config validation fails, when `spx audit init` is invoked, then no audit run journal is created for the requested branch ([test](tests/audit-cli.scenario.l1.test.ts))
- Given an initialized run has no terminal state, when `spx audit status` renders text output, then it prints the incomplete run file name and missing-state reason ([test](tests/audit-cli.scenario.l1.test.ts))
- Given an initialized run contains an invalid terminal event shape, when `spx audit status` renders text output, then it prints the incomplete run file name, invalid-shape reason, and diagnostic details ([test](tests/audit-cli.scenario.l1.test.ts))
- Given a branch-scoped run-file path names no initialized run journal, when `spx audit progress` is invoked, then the command rejects the run and does not create the missing file ([test](tests/audit-cli.scenario.l1.test.ts))
- Given an audit run already contains an unsealed terminal completion event, when `spx audit progress` is invoked, then the command rejects the progress update and leaves the journal unchanged ([test](tests/audit-cli.scenario.l1.test.ts))
- Given `spx audit init` reserves a run file but cannot append the started event, when initialization fails, then the reserved run file is removed from branch run state ([test](tests/audit-cli.scenario.l1.test.ts))
- Given `spx audit init` prints text output for an overlong branch identity, when it reports the run file path, then the full path is printed without CLI argument truncation and can be used by `spx audit progress` ([test](tests/audit-cli.scenario.l1.test.ts))

### Properties

- For every generated step outside the audit progress vocabulary, `node bin/spx.js audit progress` rejects the step and leaves the journal unchanged ([test](tests/audit-cli.property.l1.test.ts))

### Compliance

- ALWAYS: the audit domain is enumerated in the CLI descriptor registry only when it exposes an implemented subcommand per `spx/36-audit.enabler/76-audit-cli.enabler/21-audit-cli.adr.md` ([audit])
- NEVER: implement audit business logic in the CLI domain — routing only; logic lives in child enablers ([audit])
- NEVER: accept `--run-file` paths outside branch-scoped audit run storage for progress or close operations ([test](tests/audit-cli.scenario.l1.test.ts))
- NEVER: read from or write through branch-scoped run files that have been replaced by symlinks ([test](tests/audit-cli.scenario.l1.test.ts))
- NEVER: write terminal state through a symlinked seal marker path ([test](tests/audit-cli.scenario.l1.test.ts))
- NEVER: read from or write through symlinked audit run directories ([test](tests/audit-cli.scenario.l1.test.ts))
- NEVER: read branch run state through symlinked branch-scope directories ([test](tests/audit-cli.scenario.l1.test.ts))
- NEVER: create audit run state through symlinked branch-scope directories during initialization ([test](tests/audit-cli.scenario.l1.test.ts))
