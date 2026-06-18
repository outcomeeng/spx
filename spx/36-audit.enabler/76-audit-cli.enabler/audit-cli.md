# Audit CLI

PROVIDES the `spx audit` Commander.js domain — registration of the `audit` command group in the CLI and routing to its subcommands
SO THAT audit subcommand enablers
CAN be invoked from the `spx` root command without the root command containing domain logic

## Assertions

### Scenario

- Given built CLI artifacts exist, when `node bin/spx.js audit` runs an init, progress, closure, and status lifecycle for `typescript-test-auditor`, then the command routes through the root Commander registry, persists the audit run journal, and reports one approved terminal run ([test](tests/audit-cli.scenario.l1.test.ts))

### Properties

- For every generated step outside the audit progress vocabulary, `node bin/spx.js audit progress` rejects the step and leaves the journal unchanged ([test](tests/audit-cli.property.l1.test.ts))

### Compliance

- ALWAYS: the audit domain is enumerated in the CLI descriptor registry only when it exposes an implemented subcommand per `spx/36-audit.enabler/76-audit-cli.enabler/21-audit-cli.adr.md` ([audit])
- NEVER: implement audit business logic in the CLI domain — routing only; logic lives in child enablers ([audit])
