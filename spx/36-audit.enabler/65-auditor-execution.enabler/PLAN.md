# Plan: Auditor Execution

## Purpose

Run configured auditor agents locally while preserving hermetic separation from the invoking agent.

## Governing Specs

- `spx/36-audit.enabler/audit.md`
- `spx/36-audit.enabler/43-audit-config.enabler/audit-config.md`
- `spx/36-audit.enabler/54-branch-run-state.enabler/branch-run-state.md`
- `spx/33-agent-environment.enabler/agent-environment.md`

## Implementation Notes

- Resolve auditors, targets, base ref, and storage policy before launching any auditor.
- Use managed subprocess lifecycle from the CLI boundary for long-running processes.
- Keep execution state, working directories, environment variables, and output artifacts separated from the invoking agent.
- Persist terminal run state even for failed or gracefully interrupted runs.

## Evidence Required

- Execution tests prove configured auditors receive the expected target set and isolated state path.
- Failure tests cover non-zero auditor exit, malformed verdict output, graceful interruption, and process kill before terminal state.
- Lifecycle tests prove child processes are reaped through the shared process lifecycle helper.

## Parallelization

This depends on audit config, branch-run-state, and agent environment primitives. It can proceed before status rendering if it writes the agreed state shape.
