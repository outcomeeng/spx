# Open Issues

## End-to-end audit-command test coverage

`spx/36-audit.enabler/audit.md` and `spx/36-audit.enabler/76-audit-cli.enabler/audit-cli.md`
carry only `[audit]` assertions: the parent aggregates the domain and the CLI
domain is unregistered until a subcommand exists. Their end-to-end `[test]`
evidence — running auditors, recording a run journal, and routing `spx audit`
list/status through the Commander tree — arrives with the implementation of
`spx/36-audit.enabler/65-auditor-execution.enabler` and
`spx/36-audit.enabler/87-audit-status.enabler`, which are Declared. The
`spx/36-audit.enabler/54-branch-run-state.enabler` storage layer they depend on
carries its own `[test]` coverage now.
