# Plan: Hermetic Review Execution

## Purpose

Implement the isolated reviewer execution substrate shared by branch and PR review commands.

## Governing Specs

- `spx/46-reviewing.enabler/reviewing.md`
- `spx/46-reviewing.enabler/21-review-config.enabler/review-config.md`
- `spx/33-agent-environment.enabler/agent-environment.md`
- `spx/13-cli.enabler/cli.md`

## Implementation Notes

- Prepare execution directories and runtime config before launching reviewers.
- Use the shared process lifecycle runner for long-running reviewer processes.
- Keep target checkout or diff materialization separate from reviewer runtime state.
- Persist enough metadata for review state to identify target, reviewer, base, head, and config digest.

## Evidence Required

- Isolation tests prove reviewer runs cannot mutate invoking-agent state.
- Lifecycle tests prove SIGINT, SIGTERM, and pipe-close behavior reaps reviewer child processes.
- Failure tests cover reviewer non-zero exit and malformed review output.

## Parallelization

This can proceed after review config and agent environment APIs are sketched.

## Implementation Ownership

- Consume the existing `src/lib/process-lifecycle/` APIs for managed reviewer subprocesses.
- Own review-specific execution modules, adapters, and tests created for this node.
- Do not edit `src/lib/process-lifecycle/` or `testing/harnesses/process-lifecycle/` in this packet. If this packet discovers missing lifecycle-runner behavior, pause, wait two minutes for A3 to record a shared gap, re-read `spx/16-config.enabler/PLAN.md` Open Coordination, and inspect open process-lifecycle PRs and branches. Claim the existing shared CLI/process-lifecycle PR when one exists; if none exists, record a blocker in this PLAN instead of opening a shared branch from R2.

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/hermetic-review-execution after review config and spx/33-agent-environment.enabler/32-runtime-config.enabler/ are available. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/46-reviewing.enabler/32-hermetic-review-execution.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git cat-file -e origin/main:spx/46-reviewing.enabler/21-review-config.enabler/review-config.md` and `git cat-file -e origin/main:spx/33-agent-environment.enabler/32-runtime-config.enabler/runtime-config.md` succeed for the R1 and E2 artifacts. Implement the isolated reviewer execution substrate shared by branch and PR review commands. Prepare execution directories and runtime config before launch, use the shared process lifecycle runner, separate target materialization from reviewer runtime state, and emit metadata needed by review state. Prove invoking-agent state is not mutated, lifecycle signals reap reviewer children, and non-zero or malformed reviewer outputs produce terminal failure state. Open one PR and ask reviewers to audit hermetic boundaries.
```
