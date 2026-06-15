# Audit CLI

PROVIDES the `spx audit` Commander.js domain — registration of the `audit` command group in the CLI and routing to its subcommands
SO THAT audit subcommand enablers
CAN be invoked from the `spx` root command without the root command containing domain logic

## Assertions

### Compliance

- ALWAYS: the audit domain is enumerated in the CLI descriptor registry only when it exposes an implemented subcommand per `spx/36-audit.enabler/76-audit-cli.enabler/21-audit-cli.adr.md` ([audit])
- NEVER: implement audit business logic in the CLI domain — routing only; logic lives in child enablers ([audit])
