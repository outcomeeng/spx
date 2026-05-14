# Plan: Audit Status

## Purpose

Expose audit state through CLI list, status, and latest-run reporting.

## Governing Specs

- `spx/36-audit.enabler/audit.md`
- `spx/36-audit.enabler/15-audit-directory.adr.md`
- `spx/36-audit.enabler/54-branch-run-state.enabler/branch-run-state.md`

## Implementation Notes

- Implement status after branch-run-state produces the terminal state shape.
- Render `approved` as `APPROVED`, `rejected` as `REJECT`, `failed` as `FAILED`, and `interrupted` as `INTERRUPTED`.
- Include incomplete directories in list/status output without treating them as terminal evidence.
- Keep `spx audit verify <file>` behavior in the existing verify node.

## Evidence Required

- Scenario tests cover no runs, terminal runs, incomplete runs, parse-invalid state, and mixed latest-run ordering.
- Mapping tests cover persisted status to display token rendering.
- Regression tests prove node-first `.spx/nodes/` artifacts are not indexed by branch list/status.

## Parallelization

This depends on branch-run-state. It can proceed independently from auditor execution by constructing state fixtures directly.
