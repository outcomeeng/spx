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

## Agent Pickup Prompt

```text
Start from fresh origin/main on work/auditor-execution after audit config, branch-run-state, and spx/33-agent-environment.enabler/32-runtime-config.enabler/ are available. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/36-audit.enabler/65-auditor-execution.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git ls-tree origin/main -- spx/36-audit.enabler/43-audit-config.enabler/`, `git ls-tree origin/main -- spx/36-audit.enabler/54-branch-run-state.enabler/`, and `git ls-tree origin/main -- spx/33-agent-environment.enabler/32-runtime-config.enabler/` report the A1, A2, and E2 artifacts. Resolve auditors, targets, base ref, storage, and isolated agent environment before launching any auditor. Use the shared process lifecycle runner for long-running subprocesses. Persist terminal run state for approval, rejection, failure, and graceful interruption. Prove expected target sets, isolated state paths, non-zero exits, malformed verdict output, interruptions, and child-process cleanup. Open one PR and ask reviewers to audit hermetic separation and state writes under failure.
```
