# Plan: add rich audit execution events

The branch run-state storage model is reconciled onto the agent-run journal: each audit
run is an append-only event journal under `.spx/branch/{branch-slug}/audit/runs/`, the
terminal state is folded from events, and sealing marks terminal evidence. The remaining
work belongs to `spx/36-audit.enabler/65-auditor-execution.enabler`: actual auditor
execution must append richer in-flight events as execution proceeds.

## Target Event Depth

Audit execution emits incremental events such as auditor-started, finding-reported, and
completed through the run journal. The `AuditRunState` envelope remains the terminal
projection used by status/list, while future PR-comment and check projections can render
from the richer history.

## Affected Files

- `spx/36-audit.enabler/65-auditor-execution.enabler/auditor-execution.md` declares the
  richer execution-event behavior.
- `src/commands/audit/` appends execution events during configured auditor execution.
- `src/domains/audit/run-state.ts` owns pure event vocabulary and projection support for
  new execution events.
- `spx/36-audit.enabler/65-auditor-execution.enabler/tests/` verifies the event sequence
  through the real journal store.

## Then: Review

Repeat the same event-depth model for `spx/46-reviewing.enabler/43-review-state.enabler`
and `spx/46-reviewing.enabler/15-review-directory.adr.md`, so review runs also carry
incremental journal history.

## Approach

Per node: `/understanding` -> `/contextualizing` -> `/applying` -> `/merge`. Keep the
run-state storage node passing while the execution node grows event depth.
