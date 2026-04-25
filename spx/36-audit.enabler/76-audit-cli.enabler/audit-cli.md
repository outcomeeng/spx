# Audit CLI

PROVIDES the `spx audit` Commander.js domain — registration of the `audit` command group in the CLI and routing to child subcommands
SO THAT `32-verify.enabler` and any sibling subcommand enablers
CAN be invoked from the `spx` root command without the root command containing domain logic

## Assertions

### Scenarios

- Given `spx audit --help` is run, when the command is invoked, then help text lists `verify` as an available subcommand ([test](tests/audit-cli.scenario.l1.test.ts))
- Given `spx audit verify <file>` is invoked with a valid verdict XML, when the `audit` domain routes the call, then stdout contains `APPROVED` or `REJECT` — the output produced by the verify pipeline ([test](tests/audit-cli.scenario.l1.test.ts))

### Compliance

- NEVER: implement audit business logic in the CLI domain — routing only; logic lives in child enablers ([review])
