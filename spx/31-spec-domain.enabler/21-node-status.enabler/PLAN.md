# Plan: 21-node-status.enabler

## Deferred: status projection staleness reporting

Before implementing stale-projection reporting for plain `spx spec status`,
decide the read-time behavior in the governing node-status ADR/PDR and reconcile
it with `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`
and
`spx/41-test.enabler/43-last-run-evidence.enabler/43-staleness-comparison.adr.md`.
