# Issues: Audit CLI

## Status and List JSON Payload Divergence

`auditStatusCommand` and `auditListCommand` currently share `AuditStatusPayload` for JSON output:
`branchName`, `branchSlug`, `latest`, `terminalRuns`, and `incompleteRuns`.
Only the text label differs between `audit status` and `audit list`.

This is acceptable for the first lifecycle slice, where `list` exposes the same branch run-state
snapshot under a list-oriented command name. Revisit before expanding `spx audit list` to enumerate
individual terminal runs or expose richer per-run detail. At that point, split the JSON payload and
renderer so `status` returns latest-state shape and `list` returns list-shaped run detail.

Source: [PR #200 review follow-up](https://github.com/outcomeeng/spx/pull/200#issuecomment-4753092148).
