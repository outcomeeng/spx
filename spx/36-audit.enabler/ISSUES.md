# Open Issues

## End-to-end audit-command test coverage

`spx/36-audit.enabler/audit.md` and `spx/36-audit.enabler/76-audit-cli.enabler/audit-cli.md`
carry only `[audit]` assertions: the parent aggregates the domain and the CLI
domain is unregistered until a subcommand exists. Their end-to-end `[test]`
evidence — running auditors and recording a run journal — arrives with the
implementation of `spx/36-audit.enabler/65-auditor-execution.enabler` and
`spx/36-audit.enabler/87-audit-status.enabler`, which are Declared.

`spx/36-audit.enabler/76-audit-cli.enabler/audit-cli.md` specifically moves from
Passing to Declared: it loses its prior `### Scenarios` coverage when the
`spx audit verify` subcommand is removed, and the scenario asserting `spx audit`
routes through the Commander tree returns when the audit domain re-registers in
`CLI_DOMAINS` with an implemented `run`/`list`/`status` subcommand, not before.
The `spx/36-audit.enabler/54-branch-run-state.enabler` storage layer these nodes
depend on carries its own `[test]` coverage now.
