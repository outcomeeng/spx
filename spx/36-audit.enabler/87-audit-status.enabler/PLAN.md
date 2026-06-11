# Plan: Audit Status

## Purpose

Expose audit state through CLI list, status, and latest-run reporting.

## Governing Specs

- `spx/36-audit.enabler/audit.md`
- `spx/36-audit.enabler/15-audit-directory.adr.md`
- `spx/36-audit.enabler/54-branch-run-state.enabler/branch-run-state.md`

## Implementation Notes

- Implement status after branch-run-state produces the terminal state shape.
- Render persisted status values through the display mapping in `spx/36-audit.enabler/15-audit-directory.adr.md`: `approved` as `APPROVED`, `rejected` as `REJECT`, `failed` as `FAILED`, and `interrupted` as `INTERRUPTED`.
- Include incomplete run files in list/status output without treating them as terminal evidence.
- Keep `spx audit verify <file>` behavior in `spx/36-audit.enabler/32-verify.enabler/`.

## Evidence Required

- Scenario tests cover no runs, terminal runs, incomplete runs, parse-invalid state, and mixed latest-run ordering.
- Mapping tests cover persisted status to display token rendering.
- Regression tests prove node-first `.spx/nodes/` artifacts are not indexed by branch list/status.

## Parallelization

This depends on branch-run-state. It can proceed independently from auditor execution by constructing state fixtures directly.

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/audit-status after branch-run-state is available. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/36-audit.enabler/87-audit-status.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git cat-file -e origin/main:spx/36-audit.enabler/54-branch-run-state.enabler/branch-run-state.md` succeeds for the A2 state-shape artifact.

Implement audit list, status, and latest-run reporting from persisted branch state. This packet may proceed before auditor execution by constructing branch-run-state fixtures directly, but it must consume the A2 state shape rather than defining a second shape. Render persisted lowercase statuses through the explicit display-token mapping. Show incomplete and parse-invalid run files without treating them as terminal evidence. Prove no-runs, terminal runs, incomplete runs, parse-invalid state, mixed latest-run ordering, and node-first `.spx/nodes/` exclusion from branch status. Open one PR and ask reviewers to audit status semantics and display mapping.
```
