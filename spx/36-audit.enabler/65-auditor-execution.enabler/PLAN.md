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

## Implementation Ownership

- Consume the existing `src/lib/process-lifecycle/` APIs for managed subprocesses.
- Own audit-specific execution modules, adapters, and tests created for this node.
- Do not edit `src/lib/process-lifecycle/` or `testing/harnesses/process-lifecycle/` in this packet. If this packet discovers missing lifecycle-runner behavior, pause, record the shared gap in `spx/16-config.enabler/PLAN.md` Open Coordination as the A3-designated recorder, inspect open process-lifecycle PRs and branches, and open or claim one shared CLI/process-lifecycle PR before resuming this packet.

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/auditor-execution after audit config, branch-run-state, and spx/33-agent-environment.enabler/32-runtime-config.enabler/ are available. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/36-audit.enabler/65-auditor-execution.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git cat-file -e origin/main:spx/36-audit.enabler/43-audit-config.enabler/audit-config.md`, `git cat-file -e origin/main:spx/36-audit.enabler/54-branch-run-state.enabler/branch-run-state.md`, `git cat-file -e origin/main:spx/33-agent-environment.enabler/agent-environment.md`, and `git cat-file -e origin/main:spx/33-agent-environment.enabler/32-runtime-config.enabler/runtime-config.md` succeed for the A1, A2, E0, and E2 artifacts. Resolve auditors, targets, base ref, storage, and isolated agent environment before launching any auditor. Use the shared process lifecycle runner for long-running subprocesses. Persist terminal run state for approval, rejection, failure, and graceful interruption. Prove expected target sets, isolated state paths, non-zero exits, malformed verdict output, interruptions, and child-process cleanup. Open one PR and ask reviewers to audit hermetic separation and state writes under failure.
```
