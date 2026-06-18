# Open Issues

## Remaining audit-command execution coverage

`spx/36-audit.enabler/76-audit-cli.enabler/audit-cli.md` carries scenario
coverage for the observable init/progress/close/status lifecycle through the
root Commander registry and packaged CLI. The remaining end-to-end gap is actual
auditor execution: resolving configured auditor agents, running them
hermetically, appending their verdict events, and reporting the latest run. That
evidence arrives with `spx/36-audit.enabler/65-auditor-execution.enabler` and
`spx/36-audit.enabler/87-audit-status.enabler`.

## Incomplete-reason set for `spx audit status`

`AUDIT_RUN_STATE_INCOMPLETE_REASON` is `MISSING_STATE`, `IO_ERROR`, and
`SHAPE_INVALID_STATE`. The journal store silently drops malformed lines, so a
corrupt or unsealed run folds to `MISSING_STATE` — there is no separate
parse-invalid reason. When `spx/36-audit.enabler/87-audit-status.enabler` is
implemented, its display mapping must cover exactly this collapsed set, per
`spx/36-audit.enabler/15-audit-directory.adr.md` and `src/domains/audit/run-state.ts`.
